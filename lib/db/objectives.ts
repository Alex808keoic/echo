/**
 * Acceso a datos de objetivos de ahorro.
 */
import { CONFIG_KEY, db, newId } from './db'
import { computeLiquidCents } from '../finance/patrimonio'
import { reservationError, reservationLimitCents } from '../finance/objectives'
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

export type SaveObjectiveResult = { ok: true; id: string } | { ok: false; error: string; limitCents: number }

/**
 * Crea (`id` ausente) o edita un objetivo validando lo apartado con los datos
 * actuales, leídos en la misma transacción: no puede superar el líquido sin
 * apartar en otros objetivos (`reservationLimitCents`). Mantener o reducir lo
 * que ya tenía siempre se permite. No toca movimientos ni otros objetivos.
 */
export async function saveObjectiveChecked(input: ObjectiveInput, id?: string): Promise<SaveObjectiveResult> {
  return db.transaction('rw', [db.config, db.movements, db.objectives, db.positions], async () => {
    const [config, movements, objectives, positions] = await Promise.all([
      db.config.get(CONFIG_KEY),
      db.movements.toArray(),
      db.objectives.toArray(),
      db.positions.toArray(),
    ])
    const previous = id === undefined ? undefined : objectives.find((o) => o.id === id)
    if (id !== undefined && !previous) throw new Error('Objetivo no encontrado')
    const liquidCents = computeLiquidCents(config?.initialBalanceCents ?? 0, movements, positions)
    const limitCents = reservationLimitCents(objectives, liquidCents, id)
    const error = reservationError(input.currentCents, limitCents, previous?.currentCents)
    if (error) return { ok: false, error, limitCents }
    if (id === undefined) return { ok: true, id: (await addObjective(input)).id }
    await updateObjective(id, input)
    return { ok: true, id }
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
