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

/* -------------------------------- Aportar --------------------------------- */

export interface ContributionLimit {
  /** Lo que le falta al objetivo para llegar a la meta. */
  remainingCents: number
  /** Líquido que aún no está apartado en ningún objetivo. */
  freeCents: number
  /** Máximo aportable ahora: lo menor de los dos, nunca negativo. */
  maxCents: number
}

/**
 * Aportar a un objetivo no mueve dinero ni crea movimientos: aparta parte del
 * líquido. Por eso no se puede apartar más líquido del que hay sin apartar.
 */
export function contributionLimit(
  objective: Objective,
  objectives: Objective[],
  liquidCents: number,
): ContributionLimit {
  const remainingCents = Math.max(0, objective.targetCents - objective.currentCents)
  const freeCents = Math.max(0, liquidCents - summarizeObjectives(objectives).savedCents)
  return { remainingCents, freeCents, maxCents: Math.min(remainingCents, freeCents) }
}

/** Mensaje de error para una aportación, o `null` si es válida. */
export function contributionError(amountCents: number | null, limit: ContributionLimit): string | null {
  if (amountCents === null) return 'Introduce un importe mayor que cero.'
  if (limit.remainingCents === 0) return 'Este objetivo ya está conseguido.'
  if (limit.freeCents === 0) return 'No te queda líquido sin apartar en otros objetivos.'
  if (amountCents > limit.remainingCents) return 'Es más de lo que le falta al objetivo.'
  if (amountCents > limit.freeCents) return 'Es más del líquido que tienes sin apartar.'
  return null
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
