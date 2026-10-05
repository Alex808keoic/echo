/**
 * Frescura de una investigación (por su edad al leerla) y de cada indicador.
 * fresh ≤ 7 días · aging ≤ 21 días · stale después (o fecha inválida).
 */
import type { Freshness, IndicatorFreshness, MarketIndicator } from './types'

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

/* ----------------------- Frescura por indicador ----------------------- */

/**
 * Reglas de frescura por indicador, en un solo sitio. Responden a «¿este dato
 * sigue siendo lo bastante reciente para interpretarlo hoy?», no a la edad de
 * la investigación. Se aplican según la granularidad de `asOf`:
 *
 * - Periodo mensual `YYYY-MM` (inflación, medias mensuales, FEDFUNDS):
 *   fresco hasta `monthlyGraceDays` días después del final del periodo.
 * - Día `YYYY-MM-DD`:
 *   - tipos oficiales (`policyRateKeys`): siguen vigentes hasta una decisión
 *     posterior; no se sabe cuándo será, así que se toleran `policyRateMaxDays`
 *     días desde su entrada en vigor (las reuniones del BCE y la Fed se
 *     separan unas 6–8 semanas). Una fecha futura (entrada en vigor
 *     anunciada) es vigente;
 *   - el resto (tipos de mercado, índices): `dailyMaxBusinessDays` días
 *     laborables (lunes a viernes) desde la observación.
 * - Sin fecha interpretable o sin valor: `unknown`. Nunca se inventa frescura.
 *
 * El estado del dato (`advance`, `estimated`…) no cambia la frescura: un
 * avance reciente es fresco y se sigue diciendo que es provisional.
 */
export const INDICATOR_FRESHNESS = Object.freeze({
  monthlyGraceDays: 45,
  dailyMaxBusinessDays: 5,
  policyRateMaxDays: 60,
  policyRateKeys: Object.freeze(['ecb-dfr', 'fed-funds']) as readonly string[],
})

const MONTH = /^(\d{4})-(\d{2})$/
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Inicio del día (UTC) de `now`. */
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

/** Días laborables (lunes a viernes) después de `from` y hasta `to`, ambos en ms UTC de inicio de día. */
export function businessDaysBetween(from: number, to: number): number {
  let n = 0
  for (let t = from + DAY_MS; t <= to; t += DAY_MS) {
    const wd = new Date(t).getUTCDay()
    if (wd !== 0 && wd !== 6) n += 1
  }
  return n
}

export function indicatorFreshness(
  indicator: Pick<MarketIndicator, 'key' | 'value' | 'asOf'>,
  now: Date = new Date(),
): IndicatorFreshness {
  if (indicator.value === null || !Number.isFinite(indicator.value)) return 'unknown'
  const today = utcDay(now)
  const month = MONTH.exec(indicator.asOf)
  if (month) {
    const y = Number(month[1])
    const m = Number(month[2])
    if (m < 1 || m > 12) return 'unknown'
    const periodEnd = Date.UTC(y, m, 0) // último día del mes
    return today <= periodEnd + INDICATOR_FRESHNESS.monthlyGraceDays * DAY_MS ? 'fresh' : 'stale'
  }
  const day = DAY.exec(indicator.asOf)
  if (day) {
    const observed = Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
    if (Number.isNaN(observed) || new Date(observed).getUTCDate() !== Number(day[3])) return 'unknown'
    if (INDICATOR_FRESHNESS.policyRateKeys.includes(indicator.key)) {
      return today - observed <= INDICATOR_FRESHNESS.policyRateMaxDays * DAY_MS ? 'fresh' : 'stale'
    }
    return businessDaysBetween(observed, today) <= INDICATOR_FRESHNESS.dailyMaxBusinessDays ? 'fresh' : 'stale'
  }
  return 'unknown'
}

/** Solo un indicador fresco puede describirse como situación actual o tendencia. */
export function isInterpretable(indicator: Pick<MarketIndicator, 'key' | 'value' | 'asOf'>, now: Date = new Date()): boolean {
  return indicatorFreshness(indicator, now) === 'fresh'
}

/** Separa los indicadores interpretables hoy de los antiguos o sin fecha fiable (sin borrar ninguno). */
export function partitionByFreshness<T extends Pick<MarketIndicator, 'key' | 'value' | 'asOf'>>(
  indicators: T[],
  now: Date = new Date(),
): { current: T[]; notCurrent: Array<T & { freshness: Exclude<IndicatorFreshness, 'fresh'> }> } {
  const current: T[] = []
  const notCurrent: Array<T & { freshness: Exclude<IndicatorFreshness, 'fresh'> }> = []
  for (const i of indicators) {
    const f = indicatorFreshness(i, now)
    if (f === 'fresh') current.push(i)
    else notCurrent.push({ ...i, freshness: f })
  }
  return { current, notCurrent }
}
