/**
 * MOTOR CONVERSACIONAL — AXIS
 * ------------------------------------------------------------------
 * Misma filosofía que `createAIEngine`: delega en un transporte (en la app,
 * `/api/axis`; en tests, un mock) y ante CUALQUIER fallo responde el motor
 * local, diciéndolo (core/fallback.ts). Nunca conoce secretos.
 *
 *   ChatInput → transporte → ChatReply (ya validado en el servidor con
 *   `parseChatReply`) → campos fijados por Finax → ChatReply
 *
 * La salida cruda del modelo solo la ve el servidor (`chatWithProvider`):
 * aquí no se vuelve a parsear, porque lo que llega ya no es esa salida.
 *
 * Fases reales, notificadas para la UI (nunca se finge actividad):
 *   'analyzing'  preparando el contexto y comprobando disponibilidad
 *   'responding' la llamada al proveedor está en curso
 */
import { AI_ENGINE_INFO } from '../ai-engine'
import { rememberAvailability, withFallback } from '../core/fallback'
import { composeLocalReply } from './local-reply'
import type { ChatInput, ChatReply, FallbackReason } from './types'

export type ChatPhase = 'analyzing' | 'responding'

export interface ChatTransport {
  isAvailable(): Promise<boolean>
  /** Devuelve el `ChatReply` ya validado por el servidor, o lanza `ChatTransportError`. */
  ask(input: ChatInput, signal: AbortSignal): Promise<ChatReply>
}

/** Error del transporte con causa clasificada (p. ej. 429 → sin cupo). */
export class ChatTransportError extends Error {
  constructor(
    public readonly reason: Exclude<FallbackReason, 'no-data'>,
    message: string,
  ) {
    super(message)
    this.name = 'ChatTransportError'
  }
}

export interface ChatEngineOptions {
  transport: ChatTransport
  timeoutMs?: number
  /** `true` cuando el dispositivo no tiene conexión: no se intenta la IA. */
  isOffline?: () => boolean
  onPhase?: (phase: ChatPhase) => void
  onFallback?: (reason: FallbackReason, detail: string) => void
}

export const DEFAULT_CHAT_TIMEOUT_MS = 25_000

export interface ChatEngine {
  ask(input: ChatInput): Promise<ChatReply>
}

export function createChatEngine({ transport, timeoutMs = DEFAULT_CHAT_TIMEOUT_MS, isOffline, onPhase, onFallback }: ChatEngineOptions): ChatEngine {
  const isAvailable = rememberAvailability(() => transport.isAvailable())

  async function askAI(input: ChatInput, signal: AbortSignal): Promise<ChatReply> {
    onPhase?.('responding')
    const reply = await transport.ask(input, signal)
    // El texto, la propuesta y el siguiente paso ya vienen validados del servidor.
    // Estos campos los fija Finax, nunca el modelo ni el transporte.
    const { fallbackReason: _ignored, ...rest } = reply
    void _ignored
    return {
      ...rest,
      engine: AI_ENGINE_INFO,
      generatedAt: typeof reply.generatedAt === 'string' ? reply.generatedAt : new Date().toISOString(),
    }
  }

  return {
    async ask(input) {
      onPhase?.('analyzing')
      // Sin datos no hay nada que interpretar: el motor local explica qué falta (0 llamadas).
      if (input.context.quality.level === 'none') return composeLocalReply(input, 'no-data')
      if (isOffline?.()) {
        onFallback?.('offline', 'sin conexión')
        return composeLocalReply(input, 'offline')
      }
      return withFallback<ChatReply>({
        isAvailable,
        timeoutMs,
        attempt: (signal) => askAI(input, signal),
        whenUnavailable: () => {
          onFallback?.('unavailable', 'IA no configurada')
          return composeLocalReply(input, 'unavailable')
        },
        whenFailed: (error) => {
          const reason: FallbackReason = error instanceof ChatTransportError ? error.reason : 'error'
          onFallback?.(reason, error instanceof Error ? error.message : 'error desconocido')
          return composeLocalReply(input, reason)
        },
      })
    },
  }
}
