/**
 * Acceso a datos de movimientos fijos. Confirmar una vez crea un movimiento
 * normal y la marca como hecha en la misma transacción: un doble toque o dos
 * pestañas no crean el movimiento dos veces.
 */
import { db, newId } from './db'
import { addMovement } from './movements'
import { shiftedISO } from '../dates'
import { isHandled, markHandled, movementFromOccurrence, nextOccurrence } from '../finance/recurring'
import type { MovementInput, RecurringMovement, RecurringMovementInput } from '../types'

function normalize(input: RecurringMovementInput): RecurringMovementInput {
  return { ...input, name: input.name.trim() }
}

/** Por nombre, sin distinguir mayúsculas. */
export async function listRecurring(): Promise<RecurringMovement[]> {
  const all = await db.recurring.toArray()
  return all.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) || a.createdAt - b.createdAt)
}

export async function getRecurring(id: string): Promise<RecurringMovement | undefined> {
  return db.recurring.get(id)
}

export async function addRecurring(input: RecurringMovementInput): Promise<RecurringMovement> {
  const now = Date.now()
  const recurring: RecurringMovement = { ...normalize(input), id: newId(), createdAt: now, updatedAt: now }
  await db.recurring.add(recurring)
  return recurring
}

/**
 * Cambia los datos. Si cambian la frecuencia o la próxima vez, el calendario
 * vuelve a empezar en esa fecha: lo anterior a ella deja de proponerse.
 */
export async function updateRecurring(id: string, input: RecurringMovementInput): Promise<void> {
  const n = normalize(input)
  await db.transaction('rw', db.recurring, async () => {
    const current = await db.recurring.get(id)
    if (!current) return
    const reschedule = n.frequency !== current.frequency || n.startDate !== nextOccurrence(current)
    await db.recurring.update(id, {
      name: n.name,
      type: n.type,
      amountCents: n.amountCents,
      category: n.category,
      ...(reschedule ? { frequency: n.frequency, startDate: n.startDate, doneThrough: shiftedISO(n.startDate, -1), handled: undefined } : {}),
      updatedAt: Date.now(),
    })
  })
}

/** Borra el fijo. Los movimientos que ya confirmaste se quedan en tu historial. */
export async function deleteRecurring(id: string): Promise<void> {
  await db.recurring.delete(id)
}

/**
 * Confirma una vez: crea el movimiento (con `input` si lo cambiaste; si no,
 * con lo previsto) y la marca como hecha. Si ya estaba hecha, no hace nada.
 */
export async function confirmOccurrence(id: string, occurrence: string, input?: MovementInput): Promise<boolean> {
  return db.transaction('rw', [db.recurring, db.movements], async () => {
    const r = await db.recurring.get(id)
    if (!r || isHandled(r, occurrence)) return false
    const base = movementFromOccurrence(r, occurrence)
    await addMovement(input ? { ...input, recurringId: r.id, occurrence } : base)
    await db.recurring.update(id, { ...markHandled(r, occurrence), updatedAt: Date.now() })
    return true
  })
}

/** Omite una vez (ese mes no pasó, o ya lo habías apuntado a mano). */
export async function skipOccurrence(id: string, occurrence: string): Promise<void> {
  await db.transaction('rw', db.recurring, async () => {
    const r = await db.recurring.get(id)
    if (!r || isHandled(r, occurrence)) return
    await db.recurring.update(id, { ...markHandled(r, occurrence), updatedAt: Date.now() })
  })
}