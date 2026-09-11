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

export async function deleteObjective(id: string): Promise<void> {
  await db.objectives.delete(id)
}
