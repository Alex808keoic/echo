/**
 * Acceso a datos de posiciones de inversión (manuales).
 */
import { db, newId } from './db'
import type { Position, PositionInput } from '../types'

function normalize(input: PositionInput): PositionInput {
  return { ...input, name: input.name.trim() }
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
  const position: Position = { ...normalize(input), id: newId(), createdAt: now, updatedAt: now }
  await db.positions.add(position)
  return position
}

export async function updatePosition(id: string, input: PositionInput): Promise<void> {
  const n = normalize(input)
  await db.positions.update(id, {
    name: n.name,
    investedCents: n.investedCents,
    valueCents: n.valueCents,
    date: n.date,
    updatedAt: Date.now(),
  })
}

export async function deletePosition(id: string): Promise<void> {
  await db.positions.delete(id)
}
