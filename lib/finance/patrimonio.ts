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
import { revaluationDeltas } from './position-values'

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
 * - No hay cotizaciones: lo que suben o bajan las inversiones entra el día en
 *   que apuntaste cada valor (`Position.valueHistory`). Lo que el historial no
 *   explica (posiciones anteriores a él) entra en `asOf`, así que la curva
 *   termina siempre en la misma cifra que el patrimonio.
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
  // Sin otros datos, un cambio de valor solo no dibuja curva (no hay de dónde partir).
  if (deltaByDate.size === 0) return []
  for (const p of positions) for (const d of revaluationDeltas(p, asOf)) addDelta(deltaByDate, d.date, d.cents)
  const series = runningSeries(initialBalanceCents, deltaByDate)
  const start = { date: shiftedISO(series[0].date, -1), cents: initialBalanceCents }
  return [start, ...series]
}

/** De dónde viene el cambio del patrimonio en un periodo. */
export interface WealthSources {
  /** Ingresos menos gastos (lo que ahorraste o gastaste de más). */
  savingsCents: number
  /** Lo que subieron o bajaron tus inversiones (según los valores que apuntaste). */
  investmentsCents: number
}

/**
 * Reparte el cambio del patrimonio entre lo ahorrado y lo que hicieron las
 * inversiones, con las mismas reglas que `buildWealthSeries`: desde `fromISO`
 * (incluido, como `seriesForRange`; `null` = todo, sin el saldo inicial) hasta
 * `asOf`. Invertir desde el líquido no cuenta en ninguna de las dos: solo
 * cambia de sitio el dinero. Suman lo mismo que la curva en ese periodo.
 */
export function wealthSources(movements: Movement[], positions: Position[], fromISO: string | null, asOf: string): WealthSources {
  const after = (date: string) => fromISO === null || date >= fromISO
  let savingsCents = 0
  let investmentsCents = 0
  for (const m of movements) if (after(m.date)) savingsCents += signedAmountCents(m)
  for (const p of positions) {
    // Lo aportado desde fuera de Finax es dinero nuevo en tu patrimonio: cuenta como ahorro.
    if (after(p.date)) savingsCents += p.investedCents - liquidOutflowCents(p)
    for (const d of revaluationDeltas(p, asOf)) if (after(d.date)) investmentsCents += d.cents
  }
  return { savingsCents, investmentsCents }
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
