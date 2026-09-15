/**
 * Memorias de AXIS aceptadas por el usuario (Dexie, tabla `axisMemories`).
 *
 * Solo entra lo que el usuario confirma («Recordar»). Es contexto para
 * razonar, nunca fuente de verdad financiera; no entra en el backup y se
 * borra con «Borrar todos los datos». La lógica (duplicados, actualización,
 * secretos, tope) vive en lib/axis/chat/memory.ts; aquí solo se persiste.
 */
import { applyProposal, type ApplyOutcome } from '../axis/chat/memory'
import type { MemoryProposal, UserMemory } from '../axis/chat/types'
import { db, newId } from './db'

export function listUserMemories(): Promise<UserMemory[]> {
  return db.axisMemories.orderBy('updatedAt').reverse().toArray()
}

/** Guarda una propuesta aceptada: crea, actualiza o deja igual según la lógica de memoria. */
export async function saveAcceptedProposal(proposal: MemoryProposal, now: number = Date.now()): Promise<ApplyOutcome> {
  return db.transaction('rw', db.axisMemories, async () => {
    const current = await db.axisMemories.toArray()
    const outcome = applyProposal(current, proposal, now, newId)
    if (outcome.action === 'rejected') return outcome
    const keep = new Set(outcome.memories.map((m) => m.id))
    await Promise.all(current.filter((m) => !keep.has(m.id)).map((m) => db.axisMemories.delete(m.id)))
    await db.axisMemories.bulkPut(outcome.memories)
    return outcome
  })
}

export async function deleteUserMemory(id: string): Promise<void> {
  await db.axisMemories.delete(id)
}
