/**
 * Proveedores del Market Research Engine. Reutilizan el contrato de
 * `lib/axis/ai/provider.ts` y añaden el uso real de tokens, que el ledger
 * necesita. Ningún proveedor activa herramientas, búsqueda ni grounding.
 */
import type { AIProvider, AIRequest, ProviderDiagnostics } from '../../axis/ai/provider'

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface Completion {
  output: unknown
  usage: TokenUsage
  /** Motivo de fin, uso y cabeceras de límite de la llamada (solo para logs). */
  diagnostics?: ProviderDiagnostics
}

const RATE_LIMIT_HEADERS = {
  retryAfter: 'retry-after',
  limitRequests: 'x-ratelimit-limit-requests',
  limitTokens: 'x-ratelimit-limit-tokens',
  remainingRequests: 'x-ratelimit-remaining-requests',
  remainingTokens: 'x-ratelimit-remaining-tokens',
  resetRequests: 'x-ratelimit-reset-requests',
  resetTokens: 'x-ratelimit-reset-tokens',
} as const

/** Cabeceras de límite presentes en la respuesta (Groq las envía; Gemini, no). Valores cortos y sin datos de cuenta. */
export function rateLimitHeaders(headers: Headers): ProviderDiagnostics {
  const out: ProviderDiagnostics = {}
  for (const [field, name] of Object.entries(RATE_LIMIT_HEADERS) as Array<[keyof typeof RATE_LIMIT_HEADERS, string]>) {
    const value = headers.get(name)
    if (value) out[field] = value.slice(0, 32)
  }
  return out
}

/**
 * Qué límite ha saltado, a partir del cuerpo de un 429. Solo se extraen el
 * tipo (`TPM`, `TPD`, `RPM`, `RPD`) y las cifras «Limit / Used / Requested»;
 * el cuerpo completo nunca se registra (incluye el identificador de la organización).
 */
export function rateLimitFromBody(body: string): ProviderDiagnostics {
  const out: ProviderDiagnostics = {}
  const type = body.match(/\((TPM|TPD|RPM|RPD)\)/)
  if (type) out.limitType = type[1]
  for (const [field, label] of [['limit', 'Limit'], ['used', 'Used'], ['requested', 'Requested']] as const) {
    const m = body.match(new RegExp(`\\b${label}\\s+(\\d+)`))
    if (m) out[field] = Number(m[1])
  }
  return out
}

/** Diagnóstico de una respuesta HTTP fallida: código, cabeceras de límite y, en un 429, el límite concreto. */
export async function failureDiagnostics(res: Response): Promise<ProviderDiagnostics> {
  const out: ProviderDiagnostics = { status: res.status, ...rateLimitHeaders(res.headers) }
  if (res.status !== 429) return out
  try {
    return { ...out, ...rateLimitFromBody(await res.text()) }
  } catch {
    return out
  }
}

export interface MarketAIProvider extends AIProvider {
  readonly model: string
  completeWithUsage(request: AIRequest, options: { maxOutputTokens: number; signal?: AbortSignal }): Promise<Completion>
}

export function classifyHttpStatus(status: number): 'rate-limit' | 'unavailable' | 'http' {
  if (status === 429) return 'rate-limit'
  if (status === 401 || status === 403) return 'unavailable'
  return 'http'
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

export function parseJSONOutput(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // Algunos modelos envuelven el JSON en ```json … ```.
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (m) return JSON.parse(m[1])
    throw new Error('la respuesta no es JSON')
  }
}
