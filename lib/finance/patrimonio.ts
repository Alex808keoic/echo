/**
 * Patrimonio y su evolución.
 *
 * El patrimonio NO se almacena: se deriva del saldo inicial y de los
 * movimientos, así que cualquier alta, edición o borrado lo actualiza.
 * Líquido = saldo inicial + movimientos − inversiones que salieron del
 * líquido. Total = líquido + valor invertido.
 *
 * La evolución (D-21) solo usa datos reales: cada punto es el patrimonio al
 * cierre de un día con datos. No se interpola ni se inventa histórico.
 */
import { liquidOutflowCents, signedAmountCents, type Movement, type Position } from '../types'
import { shiftedISO } from '../dates'

/**
 * Líquido = saldo inicial + movimientos − lo invertido que salió del líquido
 * (`Position.fromLiquid`). Sin posiciones, solo saldo inicial + movimientos.
 */
export function computeLiquidCents(
  initialBalanceCents: number,
  movements: Movement[],
  positions: Position[] = [],
): number {
  const afterMovements = movements.reduce((total, m) => total + signedAmountCents(m), initialBalanceCents)
  return positions.reduce((total, p) => total - liquidOutflowCents(p), afterMovements)
}

export interface PatrimonioPoint {
  /** `YYYY-MM-DD` */
  date: string
  /** Patrimonio líquido al cierre de ese día, en céntimos. */
  cents: number
}

/** Puntos mínimos para que una evolución signifique algo (D-21). */
export const MIN_EVOLUTION_POINTS = 3

function addDelta(map: Map<string, number>, date: string, cents: number): void {
  map.set(date, (map.get(date) ?? 0) + cents)
}

function runningSeries(startCents: number, deltaByDate: Map<string, number>): PatrimonioPoint[] {
  const dates = [...deltaByDate.keys()].sort()
  let running = startCents
  return dates.map((date) => {
    running += deltaByDate.get(date) ?? 0
    return { date, cents: running }
  })
}

/**
 * Líquido al cierre de cada día con movimientos (o con una inversión que salió
 * del líquido). Es la serie que usa AXIS.
 */
export function buildPatrimonioSeries(
  initialBalanceCents: number,
  movements: Movement[],
  positions: Position[] = [],
): PatrimonioPoint[] {
  const deltaByDate = new Map<string, number>()
  for (const m of movements) addDelta(deltaByDate, m.date, signedAmountCents(m))
  for (const p of positions) {
    const outflow = liquidOutflowCents(p)
    if (outflow > 0) addDelta(deltaByDate, p.date, -outflow)
  }
  return runningSeries(initialBalanceCents, deltaByDate)
}

/**
 * Patrimonio total (líquido + inversiones) para la gráfica.
 *
 * - Arranca en el saldo inicial, el día anterior al primer dato: es el valor
 *   real de partida, no un punto inventado.
 * - Cada inversión cuenta por su importe aportado desde su fecha. Si salió del
 *   líquido, ese día el total no cambia (sale del líquido y entra invertido).
 * - Como no hay cotizaciones históricas, solo el último punto usa el valor
 *   actual de las posiciones; si ese valor difiere de lo aportado, se añade un
 *   punto `asOf` para que la curva termine en la misma cifra que el patrimonio.
 */
export function buildWealthSeries(
  initialBalanceCents: number,
  movements: Movement[],
  positions: Position[],
  asOf: string,
): PatrimonioPoint[] {
  const deltaByDate = new Map<string, number>()
  for (const m of movements) addDelta(deltaByDate, m.date, signedAmountCents(m))
  for (const p of positions) {
    const net = p.investedCents - liquidOutflowCents(p)
    // Aunque no cambie el total, el día de la inversión es un dato real.
    addDelta(deltaByDate, p.date, net)
  }
  const series = runningSeries(initialBalanceCents, deltaByDate)
  if (series.length === 0) return series

  const start = { date: shiftedISO(series[0].date, -1), cents: initialBalanceCents }
  const revaluation = positions.reduce((t, p) => t + p.valueCents - p.investedCents, 0)
  if (revaluation === 0) return [start, ...series]

  const last = series[series.length - 1]
  const tail =
    last.date >= asOf
      ? [{ ...last, cents: last.cents + revaluation }]
      : [last, { date: asOf, cents: last.cents + revaluation }]
  return [start, ...series.slice(0, -1), ...tail]
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

/**
 * Patrimonio total al cierre del mes anterior a `monthKey` (`YYYY-MM`), leído
 * de la serie de `buildWealthSeries`. Sin datos anteriores, el saldo inicial.
 */
export function wealthBeforeMonth(series: PatrimonioPoint[], monthKey: string, initialBalanceCents: number): number {
  const before = series.filter((p) => p.date < monthKey)
  return before.length > 0 ? before[before.length - 1].cents : initialBalanceCents
}
