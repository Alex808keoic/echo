/**
 * Frescura de una investigación, derivada de su edad al leerla.
 * fresh ≤ 7 días · aging ≤ 21 días · stale después (o fecha inválida).
 */
import type { Freshness } from './types'

export const FRESH_MAX_DAYS = 7
export const AGING_MAX_DAYS = 21

const DAY_MS = 86_400_000

export function ageInDays(generatedAt: string, now: Date = new Date()): number {
  const t = Date.parse(generatedAt)
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY
  return Math.max(0, (now.getTime() - t) / DAY_MS)
}

export function freshnessOf(generatedAt: string, now: Date = new Date()): Freshness {
  const days = ageInDays(generatedAt, now)
  if (days <= FRESH_MAX_DAYS) return 'fresh'
  if (days <= AGING_MAX_DAYS) return 'aging'
  return 'stale'
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  fresh: 'reciente',
  aging: 'con algunos días',
  stale: 'desactualizado',
}
