/**
 * Patrimonio y su evolución.
 *
 * El patrimonio NO se almacena: se deriva del saldo inicial y de los
 * movimientos, así que cualquier alta, edición o borrado lo actualiza.
 * Líquido = saldo inicial + movimientos. Total = líquido + valor invertido.
 *
 * La evolución (D-21) solo usa datos reales: cada punto es el patrimonio al
 * cierre de un día con movimientos. No se interpola ni se inventa histórico.
 */
import { signedAmountCents, type Movement } from '../types'

export function computeLiquidCents(initialBalanceCents: number, movements: Movement[]): number {
  return movements.reduce((total, m) => total + signedAmountCents(m), initialBalanceCents)
}

export interface PatrimonioPoint {
  /** `YYYY-MM-DD` */
  date: string
  /** Patrimonio líquido al cierre de ese día, en céntimos. */
  cents: number
}

/** Puntos mínimos para que una evolución signifique algo (D-21). */
export const MIN_EVOLUTION_POINTS = 3

export function buildPatrimonioSeries(
  initialBalanceCents: number,
  movements: Movement[],
): PatrimonioPoint[] {
  const deltaByDate = new Map<string, number>()
  for (const m of movements) {
    deltaByDate.set(m.date, (deltaByDate.get(m.date) ?? 0) + signedAmountCents(m))
  }
  const dates = [...deltaByDate.keys()].sort()
  let running = initialBalanceCents
  return dates.map((date) => {
    running += deltaByDate.get(date) ?? 0
    return { date, cents: running }
  })
}

export function hasEnoughHistory(series: PatrimonioPoint[]): boolean {
  return series.length >= MIN_EVOLUTION_POINTS
}

/** Variación entre el primer y el último punto de una serie. */
export function seriesDelta(series: PatrimonioPoint[]): { cents: number; pct: number | null } | null {
  if (series.length < 2) return null
  const first = series[0].cents
  const last = series[series.length - 1].cents
  const cents = last - first
  return { cents, pct: first > 0 ? (cents / first) * 100 : null }
}

/** Patrimonio líquido antes de un mes dado (`YYYY-MM`). */
export function liquidBeforeMonth(
  initialBalanceCents: number,
  movements: Movement[],
  monthKey: string,
): number {
  return movements.reduce(
    (total, m) => (m.date < monthKey ? total + signedAmountCents(m) : total),
    initialBalanceCents,
  )
}
