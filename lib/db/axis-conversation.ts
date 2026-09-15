/**
 * Conversación con AXIS (Dexie, tabla `axisConversation`, registro único).
 *
 * Guarda el mínimo necesario para la continuidad: los últimos mensajes
 * íntegros y un resumen de los antiguos (ver lib/axis/chat/history.ts).
 * Persiste entre recargas; no entra en el backup; se borra con «Borrar
 * todos los datos» o con «Borrar conversación».
 */
import { EMPTY_CONVERSATION } from '../axis/chat/history'
import type { ConversationState } from '../axis/chat/types'
import { db } from './db'

export const CONVERSATION_KEY = 'conversation' as const

export interface ConversationEntry {
  key: typeof CONVERSATION_KEY
  state: ConversationState
  updatedAt: number
}

export async function getConversation(): Promise<ConversationState> {
  const entry = await db.axisConversation.get(CONVERSATION_KEY)
  return entry?.state ?? EMPTY_CONVERSATION
}

export async function putConversation(state: ConversationState): Promise<void> {
  await db.axisConversation.put({ key: CONVERSATION_KEY, state, updatedAt: Date.now() })
}

/** Borra el historial y el resumen; las memorias aceptadas se conservan. */
export async function clearConversation(): Promise<void> {
  await db.axisConversation.delete(CONVERSATION_KEY)
}
