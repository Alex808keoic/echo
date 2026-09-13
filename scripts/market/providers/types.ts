/**
 * Proveedores del Market Research Engine. Reutilizan el contrato de
 * `lib/axis/ai/provider.ts` y añaden el uso real de tokens, que el ledger
 * necesita. Ningún proveedor activa herramientas, búsqueda ni grounding.
 */
import type { AIProvider, AIRequest } from '../../../lib/axis/ai/provider'

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface Completion {
  output: unknown
  usage: TokenUsage
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
