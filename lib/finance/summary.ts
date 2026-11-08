/**
 * Resúmenes de ingresos/gastos por periodo y por categoría.
 * Todo en céntimos enteros. No inventa nada: sin movimientos no hay resumen.
 */
import { formatMonthLabel, formatWeekdayLong, formatWeekdayShort, shiftedISO, shiftedMonthKey, toISODate } from '../dates'
import { CATEGORY_DEUDA, expenseNeed, isOneOff, movementLabel, type Movement, type MovementType } from '../types'

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

/**
 * Parte puntual (marcados como `puntual` e ingresos por deudas, `isOneOff`) de los ingresos y gastos.
 * `reimbursed` (de `reimbursedExpenses`): lo que te devolvieron de un gasto tampoco es gasto habitual.
 */
export function oneOffTotals(movements: Movement[], reimbursed?: ReadonlyMap<string, number>): { incomeCents: number; expenseCents: number } {
  let incomeCents = 0
  let expenseCents = 0
  for (const m of movements) {
    if (!isOneOff(m)) {
      if (m.type === 'gasto') expenseCents += reimbursed?.get(m.id) ?? 0
      continue
    }
    if (m.type === 'ingreso') incomeCents += m.amountCents
    else expenseCents += m.amountCents
  }
  return { incomeCents, expenseCents }
}

/** Días hacia atrás en los que se busca el gasto que te devuelven. */
export const REIMBURSE_WINDOW_DAYS = 45

const normalizeText = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
const ownTextOf = (m: Movement) => normalizeText(m.motivo || m.nota || '')
const sameText = (a: string, b: string) => a.length > 0 && b.length > 0 && (a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `))

/**
 * Gastos que te devolvieron (2026-11-08: «Peluquero» 18 € y, días después, 20 € de «Deuda: Peluquero»).
 * Un ingreso de «Deuda» con el mismo texto (motivo o nota) que un gasto no puntual de los
 * `REIMBURSE_WINDOW_DAYS` días anteriores lo cubre, hasta su importe. Devuelve, por id de gasto, lo cubierto.
 * El dinero real no cambia: solo deja de contar como gasto habitual.
 */
export function reimbursedExpenses(movements: readonly Movement[]): Map<string, number> {
  const covered = new Map<string, number>()
  const expenses = movements.filter((m) => m.type === 'gasto' && !isOneOff(m) && ownTextOf(m).length > 0)
  const refunds = movements.filter((m) => m.type === 'ingreso' && m.category === CATEGORY_DEUDA && ownTextOf(m).length > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  for (const r of refunds) {
    const text = ownTextOf(r)
    const from = shiftedISO(r.date, -REIMBURSE_WINDOW_DAYS)
    const match = expenses
      .filter((e) => e.date <= r.date && e.date >= from && sameText(ownTextOf(e), text) && (covered.get(e.id) ?? 0) < e.amountCents)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0]
    if (!match) continue
    const already = covered.get(match.id) ?? 0
    covered.set(match.id, already + Math.min(match.amountCents - already, r.amountCents))
  }
  return covered
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

/** Gasto partido según para qué sirve cada categoría (`EXPENSE_NEED`). `otherCents`: «Otros», sin clasificar. */
export interface NeedSplit {
  necesarioCents: number
  prescindibleCents: number
  otherCents: number
  /** Porcentajes enteros de las tres partes, en el mismo orden; suman 100 (o 0 sin gasto). */
  pcts: [number, number, number]
}

/** Lo necesario frente a lo prescindible de los gastos dados (solo para mayores de edad o sin edad dicha). */
export function needSplit(movements: Movement[]): NeedSplit {
  let necesarioCents = 0
  let prescindibleCents = 0
  let otherCents = 0
  for (const m of movements) {
    if (m.type !== 'gasto') continue
    const need = expenseNeed(m.category)
    if (need === 'necesario') necesarioCents += m.amountCents
    else if (need === 'prescindible') prescindibleCents += m.amountCents
    else otherCents += m.amountCents
  }
  const [a, b, c] = roundedShares([necesarioCents, prescindibleCents, otherCents])
  return { necesarioCents, prescindibleCents, otherCents, pcts: [a, b, c] }
}

/* -------------------------------- Periodos ------------------------------- */

export type PeriodId = '1S' | '1M' | '3M' | '6M' | '1A' | 'Todo'

/** `days`: periodo en días (la última semana = hoy y los 6 días anteriores). `months: null` sin `days` = todo. */
export const PERIODS: ReadonlyArray<{ id: PeriodId; months: number | null; days?: number }> = [
  { id: '1S', months: null, days: 7 },
  { id: '1M', months: 1 },
  { id: '3M', months: 3 },
  { id: '6M', months: 6 },
  { id: '1A', months: 12 },
  { id: 'Todo', months: null },
]

/** Fecha de inicio del periodo (`YYYY-MM-DD`) o `null` para todo el historial. */
export function periodStartISO(id: PeriodId, today: Date = new Date()): string | null {
  const period = PERIODS.find((p) => p.id === id)
  if (period?.days) return shiftedISO(toISODate(today), -(period.days - 1))
  const months = period?.months ?? null
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
/**
 * Meses de calendario desde el mes del movimiento más antiguo hasta el actual
 * (ambos incluidos), con un mínimo de `min`: el rango «Todo» de las barras
 * nunca enseña menos meses que «1A». Los movimientos con fecha futura no
 * alargan el rango.
 */
export function historyMonthCount(movements: Movement[], min: number): number {
  const current = shiftedMonthKey(0)
  let first = current
  for (const m of movements) {
    const key = m.date.slice(0, 7)
    if (key < first) first = key
  }
  const [fy, fm] = first.split('-').map(Number)
  const [cy, cm] = current.split('-').map(Number)
  return Math.max(min, (cy - fy) * 12 + (cm - fm) + 1)
}

/** Totales por día de un tipo de movimiento: los últimos `days` días hasta `today` (incluido), en euros. */
export function dailyTotals(movements: Movement[], type: MovementType, days: number, today: string): Array<MonthTotal & { fullLabel: string }> {
  const result: Array<MonthTotal & { fullLabel: string }> = []
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = shiftedISO(today, -offset)
    const cents = movements.reduce((t, m) => (m.type === type && m.date === date ? t + m.amountCents : t), 0)
    result.push({ monthKey: date, month: formatWeekdayShort(date), value: cents / 100, fullLabel: formatWeekdayLong(date) })
  }
  return result
}

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
