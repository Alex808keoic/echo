/**
 * Derivaciones de objetivos e inversiones. Sin persistencia ni UI.
 *
 * Objetivos: el progreso es automático. El líquido real (saldo inicial +
 * movimientos − inversiones pagadas con el líquido) se reparte en cascada
 * entre los objetivos activos, por prioridad: cada uno recibe lo que le falta
 * mientras quede dinero. Un mismo euro nunca cuenta para dos objetivos.
 * Los objetivos lejanos (fecha a más de `INVESTED_GOAL_MIN_MONTHS`) reciben
 * antes lo invertido, con la misma cascada, y el líquido completa lo que falte
 * (decidido por el usuario el 2026-10-25).
 * `allocateObjectives` es la única fuente del progreso que muestran las pantallas.
 */
import type { Objective, Position } from '../types'

/** Lo invertido cuenta para un objetivo con fecha a más de estos meses (cerca de la fecha ya debería estar en ahorro seguro). */
export const INVESTED_GOAL_MIN_MONTHS = 12
/** Objetivo a largo plazo: su dinero puede invertirse (el plan propone invertir lo que tiene en líquido). */
export const LONG_GOAL_MONTHS = 60
/** Desde aquí el plan propone pasar poco a poco lo invertido para el objetivo a ahorro seguro. */
export const TO_SAFE_MONTHS = 36

const MONTH_DAYS = 30.44
const DAY_MS = 86_400_000

/** Meses (fraccionarios) de `fromISO` a `toISO`; negativo si ya pasó. */
export function monthsBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split('-').map(Number)
  const [ty, tm, td] = toISO.split('-').map(Number)
  return Math.round((new Date(ty, tm - 1, td).getTime() - new Date(fy, fm - 1, fd).getTime()) / DAY_MS) / MONTH_DAYS
}

/** El objetivo puede recibir lo invertido: tiene fecha y está a más de `INVESTED_GOAL_MIN_MONTHS`. */
export function takesInvested(o: Pick<Objective, 'targetDate'>, asOf: string): boolean {
  return o.targetDate !== undefined && monthsBetween(asOf, o.targetDate) > INVESTED_GOAL_MIN_MONTHS
}

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

/**
 * Porcentaje que se muestra de `allocated` sobre `target`. El redondeo no puede
 * contradecir el estado: 100 % solo si llega a la meta y 0 % solo si no tiene
 * nada (29.990 de 30.000 es 99 %, no 100 %; 1 céntimo de 1.000.000 es 1 %, no 0 %).
 */
export function displayPct(allocated: number, target: number): number {
  if (target <= 0 || allocated <= 0) return 0
  if (allocated >= target) return 100
  return Math.min(99, Math.max(1, Math.round((allocated / target) * 100)))
}

export interface ObjectiveAllocation {
  objective: Objective
  /** Posición en el reparto (1 = el primero); `null` si está conseguido. */
  rank: number | null
  /** Lo que le corresponde ahora (líquido + invertido). 0 si está conseguido. */
  allocatedCents: number
  /** De `allocatedCents`, lo que sale del líquido y lo que sale de lo invertido. */
  fromLiquidCents: number
  fromInvestedCents: number
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
  /** Suma de lo repartido (líquido + invertido): «Destinado a objetivos». */
  allocatedCents: number
  /** De lo repartido, lo que sale del líquido y lo que sale de lo invertido. */
  fromLiquidCents: number
  fromInvestedCents: number
  /** Líquido − lo repartido del líquido. Negativo si el líquido lo es. */
  availableCents: number
  /** Suma de las metas activas y su porcentaje cubierto. */
  activeTargetCents: number
  activePct: number
  activeCount: number
  coveredCount: number
  achievedCount: number
}

/** Lo invertido que puede contar para los objetivos lejanos: su valor de hoy y la fecha desde la que se mide la distancia. */
export interface InvestedPool {
  cents: number
  asOf: string
}

/**
 * Reparte en cascada. Primero lo invertido (`invested`), solo entre los
 * objetivos lejanos (`takesInvested`), por prioridad; después el líquido entre
 * todos los activos, por prioridad, para lo que les falte. Invariantes:
 * Σ del líquido ≤ max(0, líquido); Σ de lo invertido ≤ max(0, invertido);
 * asignado ≤ meta; disponible = líquido − lo repartido del líquido. Los
 * conseguidos no reciben nada. Sin `invested`, solo el líquido. Pura y determinista.
 */
export function allocateObjectives(objectives: Objective[], liquidCents: number, invested?: InvestedPool): ObjectivesAllocation {
  const ordered = activeInOrder(objectives)
  let investedPool = invested ? Math.max(0, invested.cents) : 0
  const fromInvested = ordered.map((o) => {
    if (!invested || !takesInvested(o, invested.asOf)) return 0
    const cents = Math.min(Math.max(0, o.targetCents), investedPool)
    investedPool -= cents
    return cents
  })
  let pool = Math.max(0, liquidCents)
  const active = ordered.map((objective, i): ObjectiveAllocation => {
    const target = Math.max(0, objective.targetCents)
    const fromInvestedCents = fromInvested[i]
    const fromLiquidCents = Math.min(target - fromInvestedCents, pool)
    pool -= fromLiquidCents
    const allocatedCents = fromInvestedCents + fromLiquidCents
    const covered = target > 0 && allocatedCents >= target
    return {
      objective,
      rank: i + 1,
      allocatedCents,
      fromLiquidCents,
      fromInvestedCents,
      remainingCents: target - allocatedCents,
      pct: displayPct(allocatedCents, target),
      status: covered ? 'covered' : 'in-progress',
    }
  })
  const achieved = objectives
    .filter(isAchieved)
    .sort((a, b) => (b.achievedAt ?? 0) - (a.achievedAt ?? 0) || compareObjectives(a, b))
    .map((objective): ObjectiveAllocation => ({ objective, rank: null, allocatedCents: 0, fromLiquidCents: 0, fromInvestedCents: 0, remainingCents: 0, pct: 100, status: 'achieved' }))
  const fromLiquidCents = active.reduce((t, a) => t + a.fromLiquidCents, 0)
  const fromInvestedCents = active.reduce((t, a) => t + a.fromInvestedCents, 0)
  const allocatedCents = fromLiquidCents + fromInvestedCents
  const activeTargetCents = active.reduce((t, a) => t + Math.max(0, a.objective.targetCents), 0)
  return {
    liquidCents,
    items: [...active, ...achieved],
    allocatedCents,
    fromLiquidCents,
    fromInvestedCents,
    availableCents: liquidCents - fromLiquidCents,
    activeTargetCents,
    activePct: displayPct(allocatedCents, activeTargetCents),
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
 * y la meta a cada conseguido. Solo lo usan las copias de seguridad al exportar
 * (compatibilidad con versiones que leían `currentCents`); AXIS calcula el
 * reparto él mismo en `buildFinancialContext`.
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
