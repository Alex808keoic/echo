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
import { withProfileProposal } from './profile-proposal'
import { withChatActions } from './actions'
import { TOOL_LIMITS, type ChatToolRequest, type ChatToolResult } from './tools'
import type { ChatInput, ChatReply, FallbackReason } from './types'

export type ChatPhase = 'analyzing' | 'consulting' | 'responding'

export interface ChatTransport {
  isAvailable(): Promise<boolean>
  /** Devuelve el `ChatReply` ya validado por el servidor, o la consulta que pide el modelo (parte 4c), o lanza `ChatTransportError`. */
  ask(input: ChatInput, signal: AbortSignal): Promise<ChatReply | { toolRequest: ChatToolRequest }>
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
  /**
   * Ejecuta en el dispositivo la consulta que pide el modelo (parte 4c), sobre
   * los datos locales. Sin ella, una consulta no se puede atender y responde el motor local.
   */
  runTool?: (request: ChatToolRequest) => ChatToolResult | Promise<ChatToolResult>
}

export const DEFAULT_CHAT_TIMEOUT_MS = 25_000

export interface ChatEngine {
  ask(input: ChatInput): Promise<ChatReply>
}

export function createChatEngine({ transport, timeoutMs = DEFAULT_CHAT_TIMEOUT_MS, isOffline, onPhase, onFallback, runTool }: ChatEngineOptions): ChatEngine {
  const isAvailable = rememberAvailability(() => transport.isAvailable())
  // Respuesta local: misma puerta de datos de perfil que el servidor aplica a las respuestas con IA.
  const local = (input: ChatInput, reason: FallbackReason) => withProfileProposal(composeLocalReply(input, reason), input.message).reply

  async function askAI(input: ChatInput, signal: AbortSignal): Promise<ChatReply> {
    onPhase?.('responding')
    // Como mucho TOOL_LIMITS.MAX_ROUNDS consultas: si el modelo pide más, o no hay quien la ejecute, responde el motor local.
    let current = input
    let reply: ChatReply | null = null
    for (let round = 0; reply === null; round++) {
      const turn = await transport.ask(current, signal)
      if (!('toolRequest' in turn)) {
        reply = turn
        break
      }
      if (!runTool || round >= TOOL_LIMITS.MAX_ROUNDS) throw new ChatTransportError('error', 'consulta no atendida')
      onPhase?.('consulting')
      const result = await runTool(turn.toolRequest)
      current = { ...input, toolResults: [result] }
      onPhase?.('responding')
    }
    // El texto, la propuesta y el siguiente paso ya vienen validados del servidor.
    // Estos campos los fija Finax, nunca el modelo ni el transporte.
    // Las tarjetas de acción tampoco: las añade withChatActions aquí, nunca el servidor ni el modelo.
    const { fallbackReason: _ignored, actions: _notFromServer, ...rest } = reply
    void _ignored
    void _notFromServer
    return {
      ...rest,
      engine: AI_ENGINE_INFO,
      generatedAt: typeof reply.generatedAt === 'string' ? reply.generatedAt : new Date().toISOString(),
    }
  }

  // Toda respuesta (con IA o local) recibe sus tarjetas de acción aquí, en el dispositivo.
  const ask = async (input: ChatInput): Promise<ChatReply> => withChatActions(await answer(input), input)
  return { ask }

  async function answer(input: ChatInput): Promise<ChatReply> {
      onPhase?.('analyzing')
      // Sin datos no hay nada que interpretar: el motor local explica qué falta (0 llamadas).
      if (input.context.quality.level === 'none') return local(input, 'no-data')
      if (isOffline?.()) {
        onFallback?.('offline', 'sin conexión')
        return local(input, 'offline')
      }
      return withFallback<ChatReply>({
        isAvailable,
        timeoutMs,
        attempt: (signal) => askAI(input, signal),
        whenUnavailable: () => {
          onFallback?.('unavailable', 'IA no configurada')
          return local(input, 'unavailable')
        },
        whenFailed: (error) => {
          const reason: FallbackReason = error instanceof ChatTransportError ? error.reason : 'error'
          onFallback?.(reason, error instanceof Error ? error.message : 'error desconocido')
          return local(input, reason)
        },
      })
  }
}
