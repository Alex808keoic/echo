/**
 * SOLO SERVIDOR. Implementación concreta de `AIProvider` sobre la API de
 * Anthropic (SDK oficial). La clave sale exclusivamente de la variable de
 * entorno `ANTHROPIC_API_KEY` y nunca abandona el servidor.
 *
 * Este archivo solo debe importarse desde código de servidor (route handlers).
 */
import Anthropic from '@anthropic-ai/sdk'
import { AIProviderError, type AIProvider, type AIRequest } from '../provider'

export const DEFAULT_MODEL = 'claude-opus-5'

export interface AnthropicProviderOptions {
  apiKey: string
  model?: string
  /** Cliente inyectable para tests; por defecto se construye con la clave. */
  client?: Pick<Anthropic, 'messages'>
  timeoutMs?: number
}

/** Extrae el JSON del primer bloque de texto de la respuesta. */
export function extractJSON(message: Anthropic.Message): unknown {
  if (message.stop_reason === 'refusal') throw new AIProviderError('refusal', 'el modelo declinó la petición')
  if (message.stop_reason === 'max_tokens') throw new AIProviderError('malformed', 'respuesta truncada')
  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text
  if (!text) throw new AIProviderError('malformed', 'respuesta sin texto')
  try {
    return JSON.parse(text)
  } catch {
    throw new AIProviderError('malformed', 'la respuesta no es JSON')
  }
}

export function createAnthropicProvider({ apiKey, model = DEFAULT_MODEL, client, timeoutMs = 20_000 }: AnthropicProviderOptions): AIProvider {
  const anthropic = client ?? new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 })
  return {
    id: `anthropic:${model}`,
    async complete(request: AIRequest, signal?: AbortSignal) {
      try {
        const message = await anthropic.messages.create(
          {
            model,
            max_tokens: 4096,
            // El prompt de sistema es estable: cacheable entre peticiones.
            system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: request.user }],
            output_config: { format: { type: 'json_schema', schema: request.schema } },
          },
          { signal },
        )
        return extractJSON(message)
      } catch (error) {
        if (error instanceof AIProviderError) throw error
        if (error instanceof Anthropic.RateLimitError) throw new AIProviderError('rate-limit', 'límite de peticiones alcanzado')
        if (error instanceof Anthropic.AuthenticationError) throw new AIProviderError('unavailable', 'credenciales no válidas')
        if (error instanceof Anthropic.APIConnectionTimeoutError) throw new AIProviderError('timeout', 'tiempo de espera agotado')
        if (error instanceof Anthropic.APIError) throw new AIProviderError('http', `error del proveedor (${error.status ?? 'sin estado'})`)
        if (error instanceof Error && error.name === 'AbortError') throw new AIProviderError('timeout', 'petición cancelada')
        throw new AIProviderError('http', 'error de red')
      }
    },
  }
}
