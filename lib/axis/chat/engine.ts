/**
 * MOTOR CONVERSACIONAL — AXIS
 * ------------------------------------------------------------------
 * Misma filosofía que `createAIEngine`: delega en un transporte (en la app,
 * `/api/axis`; en tests, un mock) y ante CUALQUIER fallo responde el motor
 * local, diciéndolo. Nunca conoce secretos.
 *
 *   ChatInput → transporte → salida cruda → parseChatReply → ChatReply
 *
 * Fases reales, notificadas para la UI (nunca se finge actividad):
 *   'analyzing'  preparando el contexto y comprobando disponibilidad
 *   'responding' la llamada al proveedor está en curso
 */
import { AI_ENGINE_INFO } from '../ai-engine'
import { composeLocalReply } from './local-reply'
import type { ChatInput, ChatReply, FallbackReason } from './types'
import { parseChatReply } from './validate'

export type ChatPhase = 'analyzing' | 'responding'

export interface ChatTransport {
  isAvailable(): Promise<boolean>
  /** Devuelve la salida cruda de la respuesta (se valida después). */
  ask(input: ChatInput, signal: AbortSignal): Promise<unknown>
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
  let availability: Promise<boolean> | null = null
  const isAvailable = () => (availability ??= transport.isAvailable().catch(() => false))

  async function askAI(input: ChatInput): Promise<ChatReply> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      onPhase?.('responding')
      const raw = await transport.ask(input, controller.signal)
      if (typeof raw !== 'object' || raw === null) throw new Error('respuesta no válida')
      const generatedAt = (raw as { generatedAt?: unknown }).generatedAt
      // Estos campos los fija Finax, nunca el modelo ni el transporte.
      return parseChatReply({
        ...raw,
        engine: AI_ENGINE_INFO,
        fallbackReason: undefined,
        generatedAt: typeof generatedAt === 'string' ? generatedAt : new Date().toISOString(),
      })
    } finally {
      clearTimeout(timer)
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
      if (!(await isAvailable())) {
        onFallback?.('unavailable', 'IA no configurada')
        return composeLocalReply(input, 'unavailable')
      }
      try {
        return await askAI(input)
      } catch (error) {
        const reason: FallbackReason = error instanceof ChatTransportError ? error.reason : 'error'
        onFallback?.(reason, error instanceof Error ? error.message : 'error desconocido')
        return composeLocalReply(input, reason)
      }
    },
  }
}
