/**
 * Acceso a datos de posiciones de inversión (manuales). Cada valor que se
 * apunta queda en `valueHistory` con la fecha de hoy.
 */
import { db, newId } from './db'
import { todayISO } from '../dates'
import { withValue } from '../finance/position-values'
import type { Position, PositionInput } from '../types'

function normalize(input: PositionInput): PositionInput {
  return { ...input, name: input.name.trim() }
}

/** Día en que se apunta un valor: hoy, o la fecha de la aportación si es posterior. */
function valueDate(positionDate: string): string {
  const today = todayISO()
  return positionDate > today ? positionDate : today
}

/** Posiciones de la más reciente a la más antigua. */
export async function listPositions(): Promise<Position[]> {
  const positions = await db.positions.toArray()
  return positions.sort((a, b) =>
    a.date !== b.date ? b.date.localeCompare(a.date) : b.createdAt - a.createdAt,
  )
}

export async function addPosition(input: PositionInput): Promise<Position> {
  const now = Date.now()
  const n = normalize(input)
  const position: Position = { ...n, valueHistory: withValue(undefined, valueDate(n.date), n.valueCents), id: newId(), createdAt: now, updatedAt: now }
  await db.positions.add(position)
  return position
}

/** Cambia los datos. Si cambia el valor, se apunta el nuevo con la fecha de hoy. */
export async function updatePosition(id: string, input: PositionInput): Promise<void> {
  const n = normalize(input)
  await db.transaction('rw', db.positions, async () => {
    const current = await db.positions.get(id)
    if (!current) return
    const valueChanged = current.valueCents !== n.valueCents
    await db.positions.update(id, {
      name: n.name,
      investedCents: n.investedCents,
      valueCents: n.valueCents,
      date: n.date,
      fromLiquid: n.fromLiquid === true,
      assetType: n.assetType,
      feeBp: n.feeBp,
      ...(valueChanged ? { valueHistory: withValue(current.valueHistory, valueDate(n.date), n.valueCents) } : {}),
      updatedAt: Date.now(),
    })
  })
}

/**
 * «Actualizar valores»: el valor de hoy de varias posiciones a la vez, en una
 * transacción. Se apunta aunque no haya cambiado (confirma que está al día).
 */
export async function setPositionValues(values: ReadonlyArray<{ id: string; valueCents: number }>): Promise<void> {
  await db.transaction('rw', db.positions, async () => {
    const now = Date.now()
    for (const { id, valueCents } of values) {
      const current = await db.positions.get(id)
      if (!current) continue
      await db.positions.update(id, { valueCents, valueHistory: withValue(current.valueHistory, valueDate(current.date), valueCents), updatedAt: now })
    }
  })
}

export async function deletePosition(id: string): Promise<void> {
  await db.positions.delete(id)
}
