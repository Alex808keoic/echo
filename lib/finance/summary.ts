/**
 * Resúmenes de ingresos/gastos por periodo y por categoría.
 * Todo en céntimos enteros. No inventa nada: sin movimientos no hay resumen.
 */
import { formatMonthLabel, shiftedMonthKey, toISODate } from '../dates'
import { movementLabel, type Movement, type MovementType } from '../types'

export interface PeriodSummary {
  incomeCents: number
  /** Magnitud positiva del gasto. El signo lo pone la presentación. */
  expenseCents: number
  balanceCents: number
  movementCount: number
}

export function summarize(movements: Movement[]): PeriodSummary {
  let incomeCents = 0
  let expenseCents = 0
  for (const m of movements) {
    if (m.type === 'ingreso') incomeCents += m.amountCents
    else expenseCents += m.amountCents
  }
  return {
    incomeCents,
    expenseCents,
    balanceCents: incomeCents - expenseCents,
    movementCount: movements.length,
  }
}

export function inMonth(movements: Movement[], monthKey: string): Movement[] {
  return movements.filter((m) => m.date.startsWith(monthKey))
}

export function onDate(movements: Movement[], iso: string): Movement[] {
  return movements.filter((m) => m.date === iso)
}

/**
 * Variación porcentual entre dos importes. `null` si no hay base positiva con
 * la que comparar (una base cero o negativa daría un porcentaje sin sentido).
 */
export function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}

/**
 * Reparte 100 puntos porcentuales entre varias magnitudes (método del mayor
 * resto): los porcentajes mostrados son enteros y suman exactamente 100.
 */
export function roundedShares(values: number[]): number[] {
  const total = values.reduce((t, v) => t + v, 0)
  if (total <= 0) return values.map(() => 0)
  const exact = values.map((v) => (v / total) * 100)
  const result = exact.map(Math.floor)
  let remaining = 100 - result.reduce((t, v) => t + v, 0)
  const byRest = exact
    .map((v, i) => ({ i, rest: v - result[i] }))
    .sort((a, b) => b.rest - a.rest)
  for (const { i } of byRest) {
    if (remaining <= 0) break
    result[i] += 1
    remaining -= 1
  }
  return result
}

/* ------------------------------ Categorías ------------------------------- */

export interface CategoryTotal {
  key: string
  label: string
  cents: number
  /** Porcentaje entero sobre el total del tipo; los de una lista suman 100. */
  pct: number
}

/**
 * Distribución por categoría de un tipo de movimiento, de mayor a menor.
 * Los movimientos «Otros» se agrupan por su motivo, que en el historial
 * sustituye a la categoría.
 */
export function totalsByCategory(movements: Movement[], type: MovementType): CategoryTotal[] {
  const byKey = new Map<string, number>()
  for (const m of movements) {
    if (m.type !== type) continue
    const label = movementLabel(m)
    byKey.set(label, (byKey.get(label) ?? 0) + m.amountCents)
  }
  const entries = [...byKey.entries()].sort(([, a], [, b]) => b - a)
  const shares = roundedShares(entries.map(([, cents]) => cents))
  return entries.map(([label, cents], i) => ({ key: label, label, cents, pct: shares[i] }))
}

/* -------------------------------- Periodos ------------------------------- */

export type PeriodId = '1M' | '3M' | '6M' | '1A' | 'Todo'

export const PERIODS: ReadonlyArray<{ id: PeriodId; months: number | null }> = [
  { id: '1M', months: 1 },
  { id: '3M', months: 3 },
  { id: '6M', months: 6 },
  { id: '1A', months: 12 },
  { id: 'Todo', months: null },
]

/** Fecha de inicio del periodo (`YYYY-MM-DD`) o `null` para todo el historial. */
export function periodStartISO(id: PeriodId, today: Date = new Date()): string | null {
  const months = PERIODS.find((p) => p.id === id)?.months ?? null
  if (months === null) return null
  return toISODate(new Date(today.getFullYear(), today.getMonth() - months, today.getDate()))
}

export function filterFrom<T extends { date: string }>(items: T[], startISO: string | null): T[] {
  return startISO === null ? items : items.filter((i) => i.date >= startISO)
}

/* --------------------------- Evolución mensual --------------------------- */

export interface MonthTotal {
  monthKey: string
  month: string
  value: number
}

/**
 * Totales mensuales de un tipo de movimiento para los últimos `count` meses
 * (incluido el actual), en euros para el gráfico de barras. Los meses sin
 * movimientos valen 0: son meses reales del calendario, no datos inventados.
 */
export function monthlyTotals(movements: Movement[], type: MovementType, count: number): MonthTotal[] {
  const result: MonthTotal[] = []
  for (let offset = count - 1; offset >= 0; offset--) {
    const monthKey = shiftedMonthKey(-offset)
    const cents = movements.reduce(
      (t, m) => (m.type === type && m.date.startsWith(monthKey) ? t + m.amountCents : t),
      0,
    )
    result.push({ monthKey, month: formatMonthLabel(monthKey), value: cents / 100 })
  }
  return result
}
