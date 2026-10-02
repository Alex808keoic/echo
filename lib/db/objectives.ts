/**
 * Acceso a datos de objetivos de ahorro.
 */
import { db, newId } from './db'
import type { Objective, ObjectiveInput } from '../types'

function normalize(input: ObjectiveInput): ObjectiveInput {
  return {
    ...input,
    name: input.name.trim(),
    targetDate: input.targetDate?.trim() || undefined,
  }
}

/** Objetivos del más reciente al más antiguo. */
export async function listObjectives(): Promise<Objective[]> {
  const objectives = await db.objectives.toArray()
  return objectives.sort((a, b) => b.createdAt - a.createdAt)
}

export async function addObjective(input: ObjectiveInput): Promise<Objective> {
  const now = Date.now()
  const objective: Objective = { ...normalize(input), id: newId(), createdAt: now, updatedAt: now }
  await db.objectives.add(objective)
  return objective
}

export async function updateObjective(id: string, input: ObjectiveInput): Promise<void> {
  const n = normalize(input)
  await db.objectives.update(id, {
    name: n.name,
    currentCents: n.currentCents,
    targetCents: n.targetCents,
    targetDate: n.targetDate,
    updatedAt: Date.now(),
  })
}

/**
 * Suma `amountCents` a lo ahorrado en el objetivo. Lee y escribe en la misma
 * transacción para no pisar una edición simultánea. No crea movimientos: el
 * dinero sigue en el líquido, solo queda apartado. Los límites los valida la
 * UI con `contributionLimit`.
 */
export async function contributeToObjective(id: string, amountCents: number): Promise<void> {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('Aportación no válida')
  await db.transaction('rw', db.objectives, async () => {
    const objective = await db.objectives.get(id)
    if (!objective) throw new Error('Objetivo no encontrado')
    await db.objectives.update(id, { currentCents: objective.currentCents + amountCents, updatedAt: Date.now() })
  })
}

export async function deleteObjective(id: string): Promise<void> {
  await db.objectives.delete(id)
}
