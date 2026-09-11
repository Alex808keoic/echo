/**
 * Acceso a datos de movimientos. La interfaz nunca habla directamente con Dexie.
 */
import { db, newId } from './db'
import { requiresMotivo, type Movement, type MovementInput } from '../types'

/** Limpia campos de texto: una cadena vacía equivale a ausencia de dato. */
function normalize(input: MovementInput): MovementInput {
  const motivo = input.motivo?.trim()
  const nota = input.nota?.trim()
  return {
    ...input,
    motivo: requiresMotivo(input.category) && motivo ? motivo : undefined,
    nota: nota ? nota : undefined,
  }
}

/** Historial completo, del más reciente al más antiguo. */
export async function listMovements(): Promise<Movement[]> {
  const movements = await db.movements.toArray()
  return movements.sort((a, b) =>
    a.date !== b.date ? b.date.localeCompare(a.date) : b.createdAt - a.createdAt,
  )
}

export async function addMovement(input: MovementInput): Promise<Movement> {
  const now = Date.now()
  const movement: Movement = { ...normalize(input), id: newId(), createdAt: now, updatedAt: now }
  await db.movements.add(movement)
  return movement
}

/**
 * Sustituye los datos editables. Se escriben también los campos ausentes para
 * que al cambiar de categoría no sobreviva un motivo antiguo.
 */
export async function updateMovement(id: string, input: MovementInput): Promise<void> {
  const n = normalize(input)
  await db.movements.update(id, {
    type: n.type,
    amountCents: n.amountCents,
    date: n.date,
    category: n.category,
    motivo: n.motivo,
    nota: n.nota,
    updatedAt: Date.now(),
  })
}

export async function deleteMovement(id: string): Promise<void> {
  await db.movements.delete(id)
}
