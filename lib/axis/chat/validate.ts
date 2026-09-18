/**
 * Frontera de validación de la conversación.
 *
 *   salida del modelo → parseChatReply → ChatReply (única puerta hacia la UI; SOLO en servidor)
 *   cuerpo recibido   → isChatInput    → ChatInput  (única puerta hacia el modelo)
 *   ChatReply por HTTP → isChatReply   → forma comprobada en el navegador, sin volver a parsear
 *
 * Mismo criterio que `parseAxisAnalysis`: forma comprobada, textos limpios y
 * acotados, destinos desconocidos descartados, propuestas de memoria con
 * datos sensibles eliminadas.
 */
import { AxisValidationError } from '../validate'
import { isSavableProposal, normalizeMemoryContent } from './memory'
import type { AxisDestination, AxisEngineInfo, AxisNextStep, Confidence } from '../types'
import { CHAT_LIMITS, MEMORY_CATEGORIES, MEMORY_IMPORTANCES, type ChatInput, type ChatReply, type ConversationWindow, type MemoryProposal } from './types'

const DESTINATIONS: readonly AxisDestination[] = ['inicio', 'dinero', 'movimientos', 'estadisticas', 'objetivos', 'inversiones']
const CONFIDENCES: readonly Confidence[] = ['alta', 'media', 'baja']
const CONTROL_CHARS = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(8)}${String.fromCharCode(11)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`, 'g')

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Texto de conversación: conserva saltos de línea (párrafos), limpia el resto y acota. */
export function cleanChatText(v: unknown, field: string, max: number): string {
  if (typeof v !== 'string') throw new AxisValidationError(`«${field}» debe ser texto`)
  const clean = v
    .replace(CONTROL_CHARS, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (clean.length === 0) throw new AxisValidationError(`«${field}» está vacío`)
  return clean.slice(0, max)
}

function nextStep(v: unknown): AxisNextStep | undefined {
  if (v === undefined || v === null) return undefined
  if (!isRecord(v) || typeof v.label !== 'string' || v.label.trim().length === 0) return undefined
  const step: AxisNextStep = { label: cleanChatText(v.label, 'nextStep.label', 80) }
  if (typeof v.to === 'string' && DESTINATIONS.includes(v.to as AxisDestination)) step.to = v.to as AxisDestination
  return step
}

/** Propuesta de memoria: se descarta (null) en lugar de romper la respuesta si no es válida o contiene secretos. */
function memoryProposal(v: unknown): MemoryProposal | null {
  if (v === undefined || v === null || !isRecord(v)) return null
  if (typeof v.content !== 'string') return null
  const proposal: MemoryProposal = {
    content: normalizeMemoryContent(v.content.replace(CONTROL_CHARS, '')),
    category: MEMORY_CATEGORIES.includes(v.category as never) ? (v.category as MemoryProposal['category']) : 'other',
    importance: MEMORY_IMPORTANCES.includes(v.importance as never) ? (v.importance as MemoryProposal['importance']) : 'medium',
    confidence: typeof v.confidence === 'number' && Number.isFinite(v.confidence) ? Math.min(1, Math.max(0, v.confidence)) : 0.5,
    replacesId: typeof v.replacesId === 'string' && v.replacesId.trim().length > 0 ? v.replacesId.trim().slice(0, 64) : null,
  }
  return isSavableProposal(proposal) ? proposal : null
}

/** Convierte la salida cruda del modelo en un `ChatReply` seguro o lanza `AxisValidationError`. */
export function parseChatReply(input: unknown): ChatReply {
  if (!isRecord(input)) throw new AxisValidationError('la respuesta no es un objeto')
  const generatedAt = typeof input.generatedAt === 'string' ? input.generatedAt : ''
  if (Number.isNaN(Date.parse(generatedAt))) throw new AxisValidationError('«generatedAt» no es una fecha')
  const engine = input.engine
  if (!isRecord(engine) || (engine.id !== 'local-rules' && engine.id !== 'external-ai') || typeof engine.label !== 'string') {
    throw new AxisValidationError('falta «engine»')
  }
  const reply: ChatReply = {
    text: cleanChatText(input.reply, 'reply', CHAT_LIMITS.MAX_REPLY_CHARS),
    confidence: CONFIDENCES.includes(input.confidence as Confidence) ? (input.confidence as Confidence) : 'media',
    nextStep: nextStep(input.nextStep),
    memoryProposal: memoryProposal(input.memoryProposal),
    engine: { id: engine.id, label: engine.label, isAI: engine.isAI === true } as AxisEngineInfo,
    generatedAt,
  }
  if (input.fallbackReason !== undefined && typeof input.fallbackReason === 'string') {
    reply.fallbackReason = input.fallbackReason as ChatReply['fallbackReason']
  }
  return reply
}

/**
 * Forma de un `ChatReply` ya validado por el servidor (`{ text, engine, … }`), tal y
 * como viaja en `{ reply }` desde `/api/axis`. Solo comprueba la forma: la limpieza
 * y el acotado los hizo `parseChatReply` en el servidor y no se repiten.
 */
export function isChatReply(v: unknown): v is ChatReply {
  return isRecord(v) && typeof v.text === 'string' && v.text.length > 0 && isRecord(v.engine) && typeof v.engine.id === 'string'
}

/* --------------------------- Entrada (servidor) --------------------------- */

function isWindow(v: unknown): v is ConversationWindow {
  if (!isRecord(v)) return false
  if (v.summary !== null && typeof v.summary !== 'string') return false
  if (typeof v.summary === 'string' && v.summary.length > CHAT_LIMITS.MAX_SUMMARY_CHARS) return false
  if (!Array.isArray(v.recent) || v.recent.length > CHAT_LIMITS.MAX_RECENT_FOR_MODEL) return false
  return v.recent.every(
    (m) => isRecord(m) && (m.role === 'user' || m.role === 'axis') && typeof m.text === 'string' && m.text.length <= CHAT_LIMITS.MAX_REPLY_CHARS,
  )
}

/** Comprobación de forma y tamaño de la parte conversacional de la petición (el contexto se comprueba aparte). */
export function isChatPayload(v: unknown): v is Pick<ChatInput, 'conversation' | 'message'> {
  return (
    isRecord(v) &&
    typeof v.message === 'string' &&
    v.message.trim().length > 0 &&
    v.message.length <= CHAT_LIMITS.MAX_MESSAGE_CHARS &&
    isWindow(v.conversation)
  )
}
