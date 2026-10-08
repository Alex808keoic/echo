/**
 * Acceso a datos de objetivos de ahorro.
 *
 * El progreso no se guarda: lo calcula `allocateObjectives` con el líquido
 * actual. Aquí solo se escriben los datos del usuario (nombre, meta, fecha),
 * el orden (`priority`) y «Conseguido» (`achievedAt`). Ningún movimiento
 * escribe en esta tabla.
 */
import { db, newId } from './db'
import { activeInOrder } from '../finance/objectives'
import type { Objective, ObjectiveInput } from '../types'

function normalize(input: ObjectiveInput): ObjectiveInput {
  return {
    name: input.name.trim(),
    targetCents: input.targetCents,
    targetDate: input.targetDate?.trim() || undefined,
  }
}

/** Objetivos del más reciente al más antiguo (el orden del reparto lo da `allocateObjectives`). */
export async function listObjectives(): Promise<Objective[]> {
  const objectives = await db.objectives.toArray()
  return objectives.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Objetivo nuevo, sin prioridad: entra el último en el reparto. `currentCents`
 * se guarda a 0 solo por compatibilidad del formato.
 */
export async function addObjective(input: ObjectiveInput): Promise<Objective> {
  const now = Date.now()
  const objective: Objective = { ...normalize(input), currentCents: 0, id: newId(), createdAt: now, updatedAt: now }
  await db.objectives.add(objective)
  return objective
}

/** Cambia nombre, meta y fecha. Conserva orden, «Conseguido» y el `currentCents` antiguo. */
export async function updateObjective(id: string, input: ObjectiveInput): Promise<void> {
  const n = normalize(input)
  await db.objectives.update(id, { name: n.name, targetCents: n.targetCents, targetDate: n.targetDate, updatedAt: Date.now() })
}

/** Escribe `priority` 1..n en el orden dado (solo si cambia). */
async function persistOrder(ordered: Objective[], now: number): Promise<void> {
  await Promise.all(ordered.map((o, i) => (o.priority === i + 1 ? undefined : db.objectives.update(o.id, { priority: i + 1, updatedAt: now }))))
}

/**
 * Sube (`-1`) o baja (`+1`) un objetivo activo en el reparto. Persiste el orden
 * efectivo de todos los activos, para que los que nunca se habían reordenado
 * no cambien de sitio. Sin efecto en los extremos o si está conseguido.
 */
export async function moveObjective(id: string, direction: -1 | 1): Promise<void> {
  await db.transaction('rw', db.objectives, async () => {
    const ordered = activeInOrder(await db.objectives.toArray())
    const from = ordered.findIndex((o) => o.id === id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= ordered.length) return
    ;[ordered[from], ordered[to]] = [ordered[to], ordered[from]]
    await persistOrder(ordered, Date.now())
  })
}

/**
 * Pone un objetivo activo el primero del reparto (el plan lo usa para el
 * «Fondo de emergencia»). El resto conserva su orden relativo.
 */
export async function moveObjectiveToFirst(id: string): Promise<void> {
  await db.transaction('rw', db.objectives, async () => {
    const ordered = activeInOrder(await db.objectives.toArray())
    const from = ordered.findIndex((o) => o.id === id)
    if (from <= 0) return
    const [target] = ordered.splice(from, 1)
    await persistOrder([target, ...ordered], Date.now())
  })
}

/** Crea un objetivo y lo pone el primero del reparto, en una sola transacción. */
export async function addObjectiveFirst(input: ObjectiveInput): Promise<Objective> {
  return db.transaction('rw', db.objectives, async () => {
    const now = Date.now()
    const objective: Objective = { ...normalize(input), currentCents: 0, id: newId(), createdAt: now, updatedAt: now }
    const others = activeInOrder(await db.objectives.toArray())
    await db.objectives.add(objective)
    await persistOrder([objective, ...others], now)
    return { ...objective, priority: 1 }
  })
}

/** Marca «Conseguido»: sale del reparto y su parte pasa a los siguientes. */
export async function markObjectiveAchieved(id: string, now: number = Date.now()): Promise<void> {
  await db.transaction('rw', db.objectives, async () => {
    if (!(await db.objectives.get(id))) throw new Error('Objetivo no encontrado')
    await db.objectives.update(id, { achievedAt: now, updatedAt: now })
  })
}

/** Vuelve a activar un objetivo conseguido: entra el último en el reparto. */
export async function reactivateObjective(id: string, now: number = Date.now()): Promise<void> {
  await db.transaction('rw', db.objectives, async () => {
    const objective = await db.objectives.get(id)
    if (!objective) throw new Error('Objetivo no encontrado')
    if (objective.achievedAt === undefined) return
    const ordered = activeInOrder(await db.objectives.toArray())
    await persistOrder(ordered, now)
    await db.objectives.update(id, { achievedAt: undefined, priority: ordered.length + 1, updatedAt: now })
  })
}

export async function deleteObjective(id: string): Promise<void> {
  await db.objectives.delete(id)
}
