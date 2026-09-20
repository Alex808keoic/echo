/**
 * Historial de la conversación con AXIS: mínimo necesario para la
 * continuidad, sin crecer indefinidamente.
 *
 *   - Se conservan íntegros los últimos `MAX_STORED_MESSAGES`.
 *   - Lo anterior se comprime en un resumen de texto (determinista, sin
 *     llamadas a la IA): una línea corta por mensaje, acotada en longitud,
 *     conservando siempre lo más reciente.
 *   - Al modelo solo van el resumen y los últimos `MAX_RECENT_FOR_MODEL`.
 *
 * Funciones puras: la persistencia vive en lib/db/axis-conversation.ts.
 */
import { redactWindow } from './secrets'
import { CHAT_LIMITS, type ChatMessage, type ConversationState, type ConversationWindow } from './types'

const ROLE_LABEL = { user: 'Usuario', axis: 'AXIS' } as const

function summaryLine(m: ChatMessage): string {
  const text = m.text.replace(/\s+/g, ' ').trim()
  const max = CHAT_LIMITS.MAX_SUMMARY_ITEM_CHARS
  return `${ROLE_LABEL[m.role]}: ${text.length > max ? `${text.slice(0, max - 1)}…` : text}`
}

/** Une resumen anterior + líneas nuevas y recorta por el principio (lo más antiguo sale primero). */
function foldSummary(previous: string | null, lines: string[]): string | null {
  const parts = [...(previous ? [previous] : []), ...lines]
  if (parts.length === 0) return null
  let joined = parts.join(' · ')
  if (joined.length > CHAT_LIMITS.MAX_SUMMARY_CHARS) {
    joined = joined.slice(joined.length - CHAT_LIMITS.MAX_SUMMARY_CHARS)
    const firstSep = joined.indexOf(' · ')
    if (firstSep > 0) joined = joined.slice(firstSep + 3)
  }
  return joined
}

/** Añade un mensaje y compacta si hace falta. No muta. */
export function appendMessage(state: ConversationState, message: ChatMessage): ConversationState {
  return compact({ summary: state.summary, messages: [...state.messages, message] })
}

/** Comprime en el resumen los mensajes que exceden el máximo almacenado. */
export function compact(state: ConversationState): ConversationState {
  const overflow = state.messages.length - CHAT_LIMITS.MAX_STORED_MESSAGES
  if (overflow <= 0) return state
  const folded = state.messages.slice(0, overflow)
  return {
    summary: foldSummary(state.summary, folded.map(summaryLine)),
    messages: state.messages.slice(overflow),
  }
}

/** Ventana que se envía al modelo: resumen + últimos mensajes (sin metadatos), con los secretos detectables redactados. */
export function windowForModel(state: ConversationState): ConversationWindow {
  return redactWindow({
    summary: state.summary,
    recent: state.messages.slice(-CHAT_LIMITS.MAX_RECENT_FOR_MODEL).map(({ role, text }) => ({ role, text })),
  })
}

export function updateMessage(state: ConversationState, id: string, patch: (m: ChatMessage) => ChatMessage): ConversationState {
  return { ...state, messages: state.messages.map((m) => (m.id === id ? patch(m) : m)) }
}

export const EMPTY_CONVERSATION: ConversationState = { summary: null, messages: [] }
