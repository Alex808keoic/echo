/**
 * Memorias de AXIS aceptadas por el usuario (Dexie, tabla `axisMemories`).
 *
 * Solo entra lo que el usuario confirma («Recordar»). Es contexto para
 * razonar, nunca fuente de verdad financiera; no entra en el backup y se
 * borra con «Borrar todos los datos». La lógica (duplicados, actualización,
 * secretos, tope) vive en lib/axis/chat/memory.ts; aquí solo se persiste.
 */
import { applyProposal, applyProposals, type ApplyOutcome } from '../axis/chat/memory'
import type { MemoryProposal, UserMemory } from '../axis/chat/types'
import { db, newId } from './db'

export function listUserMemories(): Promise<UserMemory[]> {
  return db.axisMemories.orderBy('updatedAt').reverse().toArray()
}

/** Guardar habría expulsado memorias que el usuario no ha confirmado: no se escribe nada. */
export type SaveOutcome = ApplyOutcome | { action: 'needs-confirmation'; evicted: UserMemory[] }

/**
 * Guarda una propuesta aceptada: crea, actualiza o deja igual según la lógica
 * de memoria. Nunca expulsa en silencio: si llegar al tope de memorias obliga a
 * olvidar alguna que no esté en `confirmedEvictions` (ids que el usuario ya
 * aceptó perder, ver `evictionPreview`), no escribe y devuelve
 * `needs-confirmation`. Todo ocurre en una transacción: lo confirmado es lo que pasa.
 */
export async function saveAcceptedProposal(proposal: MemoryProposal, now: number = Date.now(), confirmedEvictions: readonly string[] = []): Promise<SaveOutcome> {
  return db.transaction('rw', db.axisMemories, async () => {
    const current = await db.axisMemories.toArray()
    const outcome = applyProposal(current, proposal, now, newId)
    if (outcome.action === 'rejected') return outcome
    if (outcome.action === 'created' && outcome.evicted.some((m) => !confirmedEvictions.includes(m.id))) {
      return { action: 'needs-confirmation', evicted: outcome.evicted }
    }
    const keep = new Set(outcome.memories.map((m) => m.id))
    await Promise.all(current.filter((m) => !keep.has(m.id)).map((m) => db.axisMemories.delete(m.id)))
    await db.axisMemories.bulkPut(outcome.memories)
    return outcome
  })
}

/**
 * Guarda varias propuestas en una sola transacción (el cuestionario de perfil):
 * o se guardan todas o ninguna. Igual que `saveAcceptedProposal`, nunca
 * olvida en silencio: si el tope obliga a olvidar memorias no confirmadas,
 * no escribe y devuelve `needs-confirmation` con ellas.
 */
export async function saveMemoryProposals(
  proposals: readonly MemoryProposal[],
  now: number = Date.now(),
  confirmedEvictions: readonly string[] = [],
): Promise<{ action: 'saved' } | { action: 'rejected' } | { action: 'needs-confirmation'; evicted: UserMemory[] }> {
  return db.transaction('rw', db.axisMemories, async () => {
    const current = await db.axisMemories.toArray()
    const outcome = applyProposals(current, proposals, now, newId)
    if (outcome.action === 'rejected') return { action: 'rejected' as const }
    if (outcome.evicted.some((m) => !confirmedEvictions.includes(m.id))) return { action: 'needs-confirmation' as const, evicted: outcome.evicted }
    const keep = new Set(outcome.memories.map((m) => m.id))
    await Promise.all(current.filter((m) => !keep.has(m.id)).map((m) => db.axisMemories.delete(m.id)))
    await db.axisMemories.bulkPut(outcome.memories)
    return { action: 'saved' as const }
  })
}

/**
 * Respuesta del usuario a una propuesta de memoria («Recordar» / «No recordar»).
 * Solo aceptar escribe en Dexie; rechazar no toca nada. Devuelve el estado con
 * el que queda la propuesta: también «rejected» si se aceptó pero no era guardable,
 * y «needs-confirmation» (sin escribir) si expulsaría una memoria no confirmada.
 * Es la única vía de escritura de memorias, desde el chat y desde la pantalla de memoria.
 */
export async function resolveMemoryProposal(
  proposal: MemoryProposal,
  accept: boolean,
  now: number = Date.now(),
  confirmedEvictions: readonly string[] = [],
): Promise<'accepted' | 'rejected' | 'needs-confirmation'> {
  if (!accept) return 'rejected'
  const outcome = await saveAcceptedProposal(proposal, now, confirmedEvictions)
  if (outcome.action === 'needs-confirmation') return 'needs-confirmation'
  return outcome.action === 'rejected' ? 'rejected' : 'accepted'
}

export async function deleteUserMemory(id: string): Promise<void> {
  await db.axisMemories.delete(id)
}
