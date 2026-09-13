/**
 * Gemini (free tier) — proveedor principal de síntesis.
 *
 * REST `generateContent`, sin SDK. Explícitamente NO se envían `tools`
 * (ni Google Search grounding ni ejecución de código): el modelo solo recibe
 * el material y devuelve JSON conforme al esquema. La clave llega por
 * `GEMINI_API_KEY` (GitHub Actions Secrets) y nunca sale de este proceso.
 */
import { AIProviderError, type AIRequest } from '../../../lib/axis/ai/provider'
import { classifyHttpStatus, fetchWithTimeout, parseJSONOutput, type Completion, type MarketAIProvider } from './types'

export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash-lite'
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
  promptFeedback?: { blockReason?: string }
}

export function createGeminiProvider(opts: { apiKey: string; model?: string; timeoutMs?: number; fetchImpl?: typeof fetch }): MarketAIProvider {
  const model = opts.model ?? GEMINI_DEFAULT_MODEL
  const timeoutMs = opts.timeoutMs ?? 60_000
  const doFetch = opts.fetchImpl ?? fetch

  async function completeWithUsage(request: AIRequest, options: { maxOutputTokens: number; signal?: AbortSignal }): Promise<Completion> {
    const body = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: 'user', parts: [{ text: request.user }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: options.maxOutputTokens,
        responseMimeType: 'application/json',
        responseJsonSchema: request.schema,
      },
      // Sin `tools`: ni búsqueda, ni grounding, ni ejecución de código.
    }
    let res: Response
    try {
      res = await fetchWithTimeout(
        `${BASE}/${encodeURIComponent(model)}:generateContent`,
        { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey }, body: JSON.stringify(body) },
        timeoutMs,
        options.signal,
        doFetch,
      )
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new AIProviderError('timeout', 'Gemini: tiempo de espera agotado')
      throw new AIProviderError('http', 'Gemini: error de red')
    }
    if (!res.ok) throw new AIProviderError(classifyHttpStatus(res.status), `Gemini: HTTP ${res.status}`)
    const data = (await res.json()) as GeminiResponse
    if (data.promptFeedback?.blockReason) throw new AIProviderError('refusal', `Gemini: bloqueado (${data.promptFeedback.blockReason})`)
    const candidate = data.candidates?.[0]
    if (candidate?.finishReason === 'MAX_TOKENS') throw new AIProviderError('malformed', 'Gemini: respuesta truncada')
    const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    if (!text) throw new AIProviderError('malformed', 'Gemini: respuesta sin texto')
    let output: unknown
    try {
      output = parseJSONOutput(text)
    } catch {
      throw new AIProviderError('malformed', 'Gemini: la respuesta no es JSON')
    }
    const u = data.usageMetadata ?? {}
    return {
      output,
      usage: {
        inputTokens: u.promptTokenCount ?? 0,
        outputTokens: u.candidatesTokenCount ?? 0,
        totalTokens: u.totalTokenCount ?? (u.promptTokenCount ?? 0) + (u.candidatesTokenCount ?? 0),
      },
    }
  }

  return {
    id: `gemini:${model}`,
    model,
    completeWithUsage,
    complete: (request, signal) => completeWithUsage(request, { maxOutputTokens: 6000, signal }).then((c) => c.output),
  }
}
