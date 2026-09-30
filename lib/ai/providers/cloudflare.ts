/**
 * Cloudflare Workers AI — proveedor principal de AXIS.
 *
 * Endpoint compatible con OpenAI (`/accounts/{id}/ai/v1/chat/completions`),
 * `response_format: json_schema` con `strict: true`. Sin herramientas.
 * Gemma 4 se usa con `enable_thinking: false` para que el tope de salida se
 * gaste en la respuesta estructurada y no en razonamiento.
 *
 * Credenciales solo en el servidor: `CF_ACCOUNT_ID` + `CF_API_TOKEN`. El
 * identificador de cuenta va en la URL y nunca aparece en errores ni logs.
 */
import { AIProviderError, type AIRequest } from '../../axis/ai/provider'
import { classifyHttpStatus, failureDiagnostics, fetchWithTimeout, parseJSONOutput, rateLimitHeaders, type Completion, type MarketAIProvider } from './types'

export const CLOUDFLARE_DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it'
const API_BASE = 'https://api.cloudflare.com/client/v4/accounts'

interface CloudflareResponse {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; neurons?: number }
}

export function createCloudflareProvider(opts: { accountId: string; apiToken: string; model?: string; timeoutMs?: number; fetchImpl?: typeof fetch }): MarketAIProvider {
  const model = opts.model ?? CLOUDFLARE_DEFAULT_MODEL
  const timeoutMs = opts.timeoutMs ?? 20_000
  const url = `${API_BASE}/${encodeURIComponent(opts.accountId)}/ai/v1/chat/completions`

  async function completeWithUsage(request: AIRequest, options: { maxOutputTokens: number; signal?: AbortSignal }): Promise<Completion> {
    const body = {
      model,
      temperature: 0.3,
      max_completion_tokens: options.maxOutputTokens,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'axis_output', strict: true, schema: request.schema } },
      chat_template_kwargs: { enable_thinking: false },
      // Sin `tools`.
    }
    let res: Response
    try {
      res = await fetchWithTimeout(
        url,
        { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiToken}` }, body: JSON.stringify(body) },
        timeoutMs,
        options.signal,
        opts.fetchImpl ?? fetch,
      )
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new AIProviderError('timeout', 'Cloudflare: tiempo de espera agotado')
      throw new AIProviderError('http', 'Cloudflare: error de red')
    }
    if (!res.ok) throw new AIProviderError(classifyHttpStatus(res.status), `Cloudflare: HTTP ${res.status}`, await failureDiagnostics(res))
    let data: CloudflareResponse
    try {
      data = (await res.json()) as CloudflareResponse
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new AIProviderError('timeout', 'Cloudflare: tiempo de espera agotado')
      throw new AIProviderError('malformed', 'Cloudflare: el cuerpo de la respuesta no es JSON', { status: res.status })
    }
    const choice = data.choices?.[0]
    const u = data.usage ?? {}
    const diagnostics = {
      status: res.status,
      finishReason: choice?.finish_reason,
      promptTokens: u.prompt_tokens,
      completionTokens: u.completion_tokens,
      totalTokens: u.total_tokens,
      neurons: u.neurons,
      ...rateLimitHeaders(res.headers),
    }
    if (choice?.finish_reason === 'length') throw new AIProviderError('malformed', 'Cloudflare: respuesta truncada', diagnostics)
    const text = choice?.message?.content ?? ''
    if (!text) throw new AIProviderError('malformed', 'Cloudflare: respuesta sin texto', diagnostics)
    let output: unknown
    try {
      output = parseJSONOutput(text)
    } catch {
      throw new AIProviderError('malformed', 'Cloudflare: la respuesta no es JSON', diagnostics)
    }
    return {
      output,
      usage: {
        inputTokens: u.prompt_tokens ?? 0,
        outputTokens: u.completion_tokens ?? 0,
        totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
      },
      diagnostics,
    }
  }

  return {
    id: `cloudflare:${model}`,
    model,
    completeWithUsage,
    complete: (request, signal) => completeWithUsage(request, { maxOutputTokens: 6000, signal }).then((c) => c.output),
  }
}
