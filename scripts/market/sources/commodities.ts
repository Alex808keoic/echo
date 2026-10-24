/**
 * Materias primas — FMI, Primary Commodity Price System (SDMX 2.1 en CSV, sin
 * autenticación; ver docs/SPIKE_GOLD_SOURCES.md): oro y petróleo Brent, en
 * dólares, media mensual. Llega con ~1 mes de retraso: la variación es mes a
 * mes. Si FRED da el Brent diario, ese gana (va antes en `ALL_SOURCES`).
 */
import { daysBetween, fetchJSON, fetchText, pctChange, round, source, splitCsvLine, type Source, type SourceContext } from './shared'
import type { MarketIndicator } from '../../../lib/market/types'

const BASE = 'https://api.imf.org/external/sdmx/2.1/data/IMF.RES,PCPS'
export const imfUrl = (commodity: string, now: Date) => {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1)).toISOString().slice(0, 7)
  return `${BASE}/G001.${commodity}.USD.M?startPeriod=${from}&format=csv`
}

const SERIES = [
  { id: 'PGOLD', key: 'gold', label: 'Oro (dólares por onza, media mensual)' },
  { id: 'POILBRE', key: 'brent', label: 'Petróleo Brent (dólares por barril, media mensual)' },
] as const

/** Observaciones (mes `YYYY-MM`, valor) de un CSV SDMX: columnas TIME_PERIOD y OBS_VALUE. */
export function parseSdmxCsv(csv: string): Array<{ date: string; value: number }> {
  const rows = csv.trim().split(/\r?\n/).map(splitCsvLine)
  const header = (rows.shift() ?? []).map((h) => h.replace(/^\uFEFF/, '').replace(/"/g, '').toUpperCase())
  const time = header.indexOf('TIME_PERIOD')
  const value = header.indexOf('OBS_VALUE')
  if (time < 0 || value < 0) throw new Error('CSV sin TIME_PERIOD/OBS_VALUE')
  return rows
    .map((r) => {
      const m = /^(\d{4})-?M?(\d{2})$/.exec((r[time] ?? '').replace(/"/g, ''))
      return { date: m ? `${m[1]}-${m[2]}` : '', value: Number((r[value] ?? '').replace(/"/g, '')) }
    })
    .filter((p) => p.date && Number.isFinite(p.value) && p.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
}

async function series(ctx: SourceContext, s: (typeof SERIES)[number]): Promise<MarketIndicator> {
  const points = parseSdmxCsv(await fetchText(ctx, imfUrl(s.id, ctx.now)))
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  if (!last) throw new Error(`${s.id}: sin datos`)
  return {
    key: s.key,
    label: s.label,
    group: 'commodity',
    value: round(last.value, 2),
    unit: 'USD',
    asOf: last.date,
    changePct: prev ? pctChange(last.value, prev.value) : null,
    ...(prev ? { changeDays: daysBetween(prev.date, last.date) } : {}),
    source: 'FMI',
  }
}

export const imfCommodities: Source = async (ctx) => {
  const results = await Promise.allSettled(SERIES.map((s) => series(ctx, s)))
  const indicators = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (indicators.length === 0) throw new Error('ninguna materia prima disponible')
  return { source: source('FMI · precios de materias primas', imfUrl('PGOLD', ctx.now), 'official', ctx.now), indicators, headlines: [] }
}

/**
 * Oro del día — gold-api.com (JSON, sin clave): solo el precio actual, sin
 * histórico, así que no es oficial y va como respaldo (`type: 'data'`). La
 * variación a un mes la calcula el job con los precios que apunta cada día
 * (`scripts/market/sampled.ts`). Va antes que el FMI en `ALL_SOURCES`: un
 * precio de hoy es más útil que una media del mes pasado.
 */
export const GOLD_SPOT_URL = 'https://api.gold-api.com/price/XAU'

export const goldApiSpot: Source = async (ctx) => {
  const data = await fetchJSON<{ price?: number; updatedAt?: string; currency?: string }>(ctx, GOLD_SPOT_URL)
  if (typeof data.price !== 'number' || !(data.price > 0) || data.currency !== 'USD' || typeof data.updatedAt !== 'string') throw new Error('oro: respuesta no válida')
  const asOf = data.updatedAt.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error('oro: fecha no válida')
  const indicator: MarketIndicator = {
    key: 'gold',
    label: 'Oro (dólares por onza)',
    group: 'commodity',
    value: round(data.price, 2),
    unit: 'USD',
    asOf,
    changePct: null,
    source: 'gold-api.com',
  }
  return { source: source('gold-api.com · oro', GOLD_SPOT_URL, 'data', ctx.now), indicators: [indicator], headlines: [] }
}
