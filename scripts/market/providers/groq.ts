/**
 * Groq (plan free) — proveedor de fallback.
 *
 * Endpoint compatible con OpenAI, `response_format: json_schema` con
 * `strict: true` (soportado por `openai/gpt-oss-120b`). Sin herramientas.
 * La clave llega por `GROQ_API_KEY` (GitHub Actions Secrets).
 */
import { AIProviderError, type AIRequest } from '../../../lib/axis/ai/provider'
import { classifyHttpStatus, fetchWithTimeout, parseJSONOutput, type Completion, type MarketAIProvider } from './types'

export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-120b'
const URL = 'https://api.groq.com/openai/v1/chat/completions'

interface GroqResponse {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

export function createGroqProvider(opts: { apiKey: string; model?: string; timeoutMs?: number; fetchImpl?: typeof fetch }): MarketAIProvider {
  const model = opts.model ?? GROQ_DEFAULT_MODEL
  const timeoutMs = opts.timeoutMs ?? 60_000

  async function completeWithUsage(request: AIRequest, options: { maxOutputTokens: number; signal?: AbortSignal }): Promise<Completion> {
    const body = {
      model,
      temperature: 0.2,
      max_completion_tokens: options.maxOutputTokens,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'market_research', strict: true, schema: request.schema } },
      // Sin `tools`.
    }
    let res: Response
    try {
      res = await fetchWithTimeout(
        URL,
        { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` }, body: JSON.stringify(body) },
        timeoutMs,
        options.signal,
        opts.fetchImpl ?? fetch,
      )
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new AIProviderError('timeout', 'Groq: tiempo de espera agotado')
      throw new AIProviderError('http', 'Groq: error de red')
    }
    if (!res.ok) throw new AIProviderError(classifyHttpStatus(res.status), `Groq: HTTP ${res.status}`)
    const data = (await res.json()) as GroqResponse
    const choice = data.choices?.[0]
    if (choice?.finish_reason === 'length') throw new AIProviderError('malformed', 'Groq: respuesta truncada')
    const text = choice?.message?.content ?? ''
    if (!text) throw new AIProviderError('malformed', 'Groq: respuesta sin texto')
    let output: unknown
    try {
      output = parseJSONOutput(text)
    } catch {
      throw new AIProviderError('malformed', 'Groq: la respuesta no es JSON')
    }
    const u = data.usage ?? {}
    return {
      output,
      usage: {
        inputTokens: u.prompt_tokens ?? 0,
        outputTokens: u.completion_tokens ?? 0,
        totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
      },
    }
  }

  return {
    id: `groq:${model}`,
    model,
    completeWithUsage,
    complete: (request, signal) => completeWithUsage(request, { maxOutputTokens: 6000, signal }).then((c) => c.output),
  }
}
