/**
 * Derivaciones de objetivos e inversiones. Sin persistencia ni UI.
 */
import type { Objective, Position } from '../types'

/** Progreso 0–100, nunca por encima de la meta. */
export function objectiveProgressPct(o: Objective): number {
  if (o.targetCents <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((o.currentCents / o.targetCents) * 100)))
}

export function isObjectiveCompleted(o: Objective): boolean {
  return o.targetCents > 0 && o.currentCents >= o.targetCents
}

export interface ObjectivesTotals {
  count: number
  activeCount: number
  savedCents: number
  targetCents: number
  pct: number
}

export function summarizeObjectives(objectives: Objective[]): ObjectivesTotals {
  const savedCents = objectives.reduce((t, o) => t + Math.min(o.currentCents, o.targetCents), 0)
  const targetCents = objectives.reduce((t, o) => t + o.targetCents, 0)
  return {
    count: objectives.length,
    activeCount: objectives.filter((o) => !isObjectiveCompleted(o)).length,
    savedCents,
    targetCents,
    pct: targetCents > 0 ? Math.min(100, Math.round((savedCents / targetCents) * 100)) : 0,
  }
}

/* ------------------------------- Inversiones ------------------------------ */

export function totalInvestedCents(positions: Position[]): number {
  return positions.reduce((t, p) => t + p.investedCents, 0)
}

export function totalValueCents(positions: Position[]): number {
  return positions.reduce((t, p) => t + p.valueCents, 0)
}

/** Diferencia entre valor actual y aportado (rentabilidad simple, no ponderada). */
export function positionGain(position: Position): { cents: number; pct: number | null } {
  const cents = position.valueCents - position.investedCents
  return { cents, pct: position.investedCents > 0 ? (cents / position.investedCents) * 100 : null }
}
