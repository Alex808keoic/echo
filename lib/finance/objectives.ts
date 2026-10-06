/**
 * Derivaciones de objetivos e inversiones. Sin persistencia ni UI.
 *
 * Objetivos: el progreso es automático. El líquido real (saldo inicial +
 * movimientos − inversiones pagadas con el líquido) se reparte en cascada
 * entre los objetivos activos, por prioridad: cada uno recibe lo que le falta
 * mientras quede dinero. Un mismo euro nunca cuenta para dos objetivos.
 * `allocateObjectives` es la única fuente del progreso que muestran las pantallas.
 */
import type { Objective, Position } from '../types'

/** Progreso 0–100 de un `currentCents` dado, nunca por encima de la meta (lo usa AXIS). */
export function objectiveProgressPct(o: Pick<Objective, 'currentCents' | 'targetCents'>): number {
  if (o.targetCents <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((o.currentCents / o.targetCents) * 100)))
}

/** `currentCents` llega a la meta (lo usa AXIS; en Finax: «Cubierto»). */
export function isObjectiveCompleted(o: Pick<Objective, 'currentCents' | 'targetCents'>): boolean {
  return o.targetCents > 0 && o.currentCents >= o.targetCents
}

/* ------------------------------ Orden y reparto ------------------------------ */

export const isAchieved = (o: Pick<Objective, 'achievedAt'>): boolean => o.achievedAt !== undefined

/**
 * Orden del reparto, determinista: primero los que tienen `priority` (de menor
 * a mayor), después los que nunca se han reordenado; empates por `createdAt`
 * y después por `id`.
 */
export function compareObjectives(a: Objective, b: Objective): number {
  const pa = a.priority ?? Number.POSITIVE_INFINITY
  const pb = b.priority ?? Number.POSITIVE_INFINITY
  if (pa !== pb) return pa < pb ? -1 : 1
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Objetivos activos (sin «Conseguido») en el orden en que reciben dinero. */
export function activeInOrder(objectives: Objective[]): Objective[] {
  return objectives.filter((o) => !isAchieved(o)).sort(compareObjectives)
}

export type ObjectiveStatus = 'in-progress' | 'covered' | 'achieved'

export interface ObjectiveAllocation {
  objective: Objective
  /** Posición en el reparto (1 = el primero); `null` si está conseguido. */
  rank: number | null
  /** Parte del líquido que le corresponde ahora. 0 si está conseguido. */
  allocatedCents: number
  /** Lo que le falta para la meta con ese reparto. 0 si está conseguido. */
  remainingCents: number
  /** Progreso 0–100 del reparto; 100 si está conseguido. */
  pct: number
  /** «Cubierto»: el reparto llega a la meta. «Conseguido»: marcado a mano. */
  status: ObjectiveStatus
}

export interface ObjectivesAllocation {
  liquidCents: number
  /** Activos en orden de reparto y, detrás, los conseguidos (el más reciente primero). */
  items: ObjectiveAllocation[]
  /** Suma de lo repartido: «Destinado a objetivos». */
  allocatedCents: number
  /** Líquido − destinado. Negativo si el líquido lo es. */
  availableCents: number
  /** Suma de las metas activas y su porcentaje cubierto. */
  activeTargetCents: number
  activePct: number
  activeCount: number
  coveredCount: number
  achievedCount: number
}

/**
 * Reparte el líquido en cascada. Invariantes: Σ asignado ≤ max(0, líquido);
 * asignado ≤ meta; disponible = líquido − destinado. Los conseguidos no
 * reciben nada. Pura y determinista.
 */
export function allocateObjectives(objectives: Objective[], liquidCents: number): ObjectivesAllocation {
  let pool = Math.max(0, liquidCents)
  const active = activeInOrder(objectives).map((objective, i): ObjectiveAllocation => {
    const target = Math.max(0, objective.targetCents)
    const allocatedCents = Math.min(target, pool)
    pool -= allocatedCents
    const covered = target > 0 && allocatedCents >= target
    return {
      objective,
      rank: i + 1,
      allocatedCents,
      remainingCents: target - allocatedCents,
      pct: objectiveProgressPct({ currentCents: allocatedCents, targetCents: target }),
      status: covered ? 'covered' : 'in-progress',
    }
  })
  const achieved = objectives
    .filter(isAchieved)
    .sort((a, b) => (b.achievedAt ?? 0) - (a.achievedAt ?? 0) || compareObjectives(a, b))
    .map((objective): ObjectiveAllocation => ({ objective, rank: null, allocatedCents: 0, remainingCents: 0, pct: 100, status: 'achieved' }))
  const allocatedCents = active.reduce((t, a) => t + a.allocatedCents, 0)
  const activeTargetCents = active.reduce((t, a) => t + Math.max(0, a.objective.targetCents), 0)
  return {
    liquidCents,
    items: [...active, ...achieved],
    allocatedCents,
    availableCents: liquidCents - allocatedCents,
    activeTargetCents,
    activePct: activeTargetCents > 0 ? Math.min(100, Math.round((allocatedCents / activeTargetCents) * 100)) : 0,
    activeCount: active.length,
    coveredCount: active.filter((a) => a.status === 'covered').length,
    achievedCount: achieved.length,
  }
}

/** Meses hasta quedar cubierto, o `beyond` si no se cubre dentro del horizonte simulado. */
export type ProjectedMonths = number | 'beyond'

export interface ObjectiveProjection {
  objective: Objective
  /** Posición en el reparto actual (1 = el primero). */
  rank: number
  /** 0 si ya está cubierto; si no, el primer mes en que el reparto lo cubre. */
  months: ProjectedMonths
}

/**
 * Previsión del reparto: aplica `allocateObjectives` (la misma cascada, sin
 * reglas nuevas) al líquido actual más k meses de capacidad, k = 0…maxMonths,
 * y devuelve para cada objetivo activo con meta el primer k en que queda
 * cubierto. Así un objetivo empieza a recibir capacidad solo cuando los
 * anteriores están cubiertos, y la misma capacidad nunca cuenta dos veces.
 * `null` sin capacidad positiva: no hay previsión que hacer.
 */
export function forecastObjectiveAllocation(
  objectives: Objective[],
  liquidCents: number,
  monthlyCents: number,
  maxMonths: number,
): ObjectiveProjection[] | null {
  if (!Number.isSafeInteger(monthlyCents) || monthlyCents <= 0) return null
  const current = allocateObjectives(objectives, liquidCents).items.filter((i) => i.status !== 'achieved' && i.objective.targetCents > 0)
  const coveredAt = new Map<string, number>()
  for (let k = 0; k <= maxMonths && coveredAt.size < current.length; k++) {
    for (const item of allocateObjectives(objectives, liquidCents + k * monthlyCents).items) {
      if (item.status === 'covered' && !coveredAt.has(item.objective.id)) coveredAt.set(item.objective.id, k)
    }
  }
  return current.map((i) => ({ objective: i.objective, rank: i.rank ?? 0, months: coveredAt.get(i.objective.id) ?? 'beyond' }))
}

/**
 * Objetivos con `currentCents` = el valor calculado: lo repartido a cada activo
 * y la meta a cada conseguido. Es lo que reciben AXIS (que aún lee
 * `currentCents`, Fase B) y las copias de seguridad (compatibilidad).
 */
export function withDerivedCurrentCents(objectives: Objective[], liquidCents: number): Objective[] {
  const byId = new Map(allocateObjectives(objectives, liquidCents).items.map((a) => [a.objective.id, a]))
  return objectives.map((o) => {
    const a = byId.get(o.id)!
    return { ...o, currentCents: a.status === 'achieved' ? Math.max(0, o.targetCents) : a.allocatedCents }
  })
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
