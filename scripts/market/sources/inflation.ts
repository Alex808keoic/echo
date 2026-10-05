/**
 * Inflación (sin autenticación):
 * - INE (API Tempus, JSON): IPC general nacional, variación anual, base 2025
 *   (serie IPC290750, ECOICOP ver.2). La serie de base 2021 (IPC251856) dejó de
 *   actualizarse en 2025-12.
 * - Eurostat (API dissemination, JSON-stat): HICP eurozona, variación anual
 *   (prc_hicp_minr, geo=EA, coicop18=TOTAL, unit=RCH_A). `prc_hicp_manr`
 *   (coicop=CP00) quedó discontinuado en 2025-12 con el paso a ECOICOP ver.2.
 *
 * Se conserva el estado que marca la fuente (INE «Avance», Eurostat `e`/`p`) y
 * se rechaza una serie cuyo último dato es demasiado antiguo: una serie
 * congelada falla (queda en `failedSources`) en lugar de publicarse como actual.
 */
import { fetchJSON, round, source, type Source } from './shared'
import type { IndicatorStatus, MarketIndicator } from '../../../lib/market/types'

export const INE_SERIES = 'IPC290750'
// `tip=A`: respuesta «amigable», con el tipo de dato en texto («Definitivo», «Avance»).
export const INE_URL = `https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/${INE_SERIES}?nult=2&tip=A`
export const EUROSTAT_URL =
  'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=EA&coicop18=TOTAL&unit=RCH_A&lastTimePeriod=2&format=JSON'

/**
 * Antigüedad máxima, en meses naturales, del último periodo de una serie
 * mensual de inflación. El INE publica el avance al cierre del propio mes y
 * Eurostat la estimación flash a primeros del siguiente: lo normal es 0–2
 * meses. Más de 3 es una serie que ha dejado de actualizarse.
 */
export const MAX_MONTHLY_LAG = 3

/** Meses naturales entre un periodo `YYYY-MM` y el mes de `now` (UTC). */
export function monthsBehind(period: string, now: Date): number {
  const m = /^(\d{4})-(\d{2})$/.exec(period)
  if (!m) throw new Error(`periodo no válido: ${period}`)
  return (now.getUTCFullYear() - Number(m[1])) * 12 + (now.getUTCMonth() + 1 - Number(m[2]))
}

/** Rechaza una serie mensual congelada: su último periodo no puede quedar más de `MAX_MONTHLY_LAG` meses atrás. */
export function assertCurrentMonthly(period: string, now: Date, series: string): void {
  const lag = monthsBehind(period, now)
  if (lag > MAX_MONTHLY_LAG) throw new Error(`${series}: serie congelada, último dato ${period} (${lag} meses)`)
}

const INE_STATUS: Record<string, IndicatorStatus | undefined> = { Definitivo: undefined, Avance: 'advance', Provisional: 'provisional' }
const EUROSTAT_STATUS: Record<string, IndicatorStatus | undefined> = { e: 'estimated', p: 'provisional' }

interface IneSeries {
  Data: Array<{ Anyo: number; T3_Periodo: string; T3_TipoDato?: string; Valor: number }>
}

export const ineIpc: Source = async (ctx) => {
  const data = await fetchJSON<IneSeries>(ctx, INE_URL)
  const period = (p: IneSeries['Data'][number]) => `${p.Anyo}-${p.T3_Periodo.replace(/^M/, '').padStart(2, '0')}`
  const points = data.Data.map((p) => ({ ...p, period: period(p) })).sort((a, b) => a.period.localeCompare(b.period))
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  if (!last) throw new Error('sin datos')
  assertCurrentMonthly(last.period, ctx.now, INE_SERIES)
  // Un tipo de dato desconocido no se da por definitivo.
  const status = last.T3_TipoDato && last.T3_TipoDato in INE_STATUS ? INE_STATUS[last.T3_TipoDato] : 'provisional'
  const indicator: MarketIndicator = {
    key: 'ine-ipc',
    label: 'IPC España (interanual)',
    group: 'inflation',
    value: last.Valor,
    unit: '%',
    asOf: last.period,
    changePct: prev ? round(last.Valor - prev.Valor, 2) : null,
    source: 'INE',
    ...(status ? { status } : {}),
  }
  return { source: source('INE · IPC', INE_URL, 'official', ctx.now), indicators: [indicator], headlines: [] }
}

/** Fecha ISO de Eurostat («2026-10-02T11:00:00+0200») normalizada; `undefined` si no es interpretable. */
export function eurostatUpdated(updated: unknown): string | undefined {
  if (typeof updated !== 'string') return undefined
  const iso = updated.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
  const t = Date.parse(iso)
  return Number.isNaN(t) ? undefined : new Date(t).toISOString()
}

interface JsonStat {
  updated?: string
  value: Record<string, number>
  status?: Record<string, string>
  dimension: { time: { category: { index: Record<string, number> } } }
}

export const eurostatHicp: Source = async (ctx) => {
  const data = await fetchJSON<JsonStat>(ctx, EUROSTAT_URL)
  const periods = Object.entries(data.dimension.time.category.index).sort((a, b) => a[1] - b[1])
  const points = periods
    .map(([period, idx]) => ({ period, value: data.value[String(idx)], flag: data.status?.[String(idx)] }))
    .filter((p) => Number.isFinite(p.value))
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  if (!last) throw new Error('sin datos')
  assertCurrentMonthly(last.period, ctx.now, 'prc_hicp_minr')
  const status = last.flag ? (EUROSTAT_STATUS[last.flag] ?? 'provisional') : undefined
  const indicator: MarketIndicator = {
    key: 'ea-hicp',
    label: 'Inflación eurozona (HICP interanual)',
    group: 'inflation',
    value: last.value,
    unit: '%',
    asOf: last.period,
    changePct: prev ? round(last.value - prev.value, 2) : null,
    source: 'Eurostat',
    ...(status ? { status } : {}),
    // Fecha de actualización del conjunto de datos que declara Eurostat.
    ...(eurostatUpdated(data.updated) ? { publishedAt: eurostatUpdated(data.updated) } : {}),
  }
  return { source: source('Eurostat · HICP', EUROSTAT_URL, 'official', ctx.now), indicators: [indicator], headlines: [] }
}
