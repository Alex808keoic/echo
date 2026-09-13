/**
 * FRED (Reserva Federal de St. Louis): tipo de fondos federales (FEDFUNDS,
 * mensual), S&P 500 y Nasdaq 100 (diarios). Requiere una clave gratuita
 * (`FRED_API_KEY`); si no está configurada, la fuente se omite (no cuenta
 * como fallo). La clave nunca se incluye en las URLs publicadas.
 */
import { fetchJSON, pctChange, round, source, type Source, type SourceContext } from './shared'
import type { MarketIndicator } from '../../../lib/market/types'

const BASE = 'https://api.stlouisfed.org/fred/series/observations'

export class SourceSkipped extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SourceSkipped'
  }
}

interface FredResponse {
  observations: Array<{ date: string; value: string }>
}

async function observations(ctx: SourceContext, key: string, seriesId: string, limit: number) {
  const url = `${BASE}?series_id=${seriesId}&sort_order=desc&limit=${limit}&file_type=json&api_key=${encodeURIComponent(key)}`
  const data = await fetchJSON<FredResponse>(ctx, url)
  return data.observations.map((o) => ({ date: o.date, value: Number(o.value) })).filter((p) => Number.isFinite(p.value)).reverse()
}

const SERIES: Array<{ id: string; key: string; label: string; group: MarketIndicator['group']; unit: MarketIndicator['unit']; limit: number }> = [
  { id: 'FEDFUNDS', key: 'fed-funds', label: 'Fed · tipo de fondos federales', group: 'rate', unit: '%', limit: 2 },
  { id: 'SP500', key: 'spx', label: 'S&P 500', group: 'index', unit: 'pts', limit: 8 },
  { id: 'NASDAQ100', key: 'ndq', label: 'Nasdaq 100', group: 'index', unit: 'pts', limit: 8 },
]

export const fredSeries: Source = async (ctx) => {
  const key = ctx.env.FRED_API_KEY?.trim()
  if (!key) throw new SourceSkipped('FRED_API_KEY no configurada')
  const results = await Promise.allSettled(
    SERIES.map(async (s) => {
      const points = await observations(ctx, key, s.id, s.limit)
      const last = points[points.length - 1]
      const prev = s.group === 'index' ? points[Math.max(0, points.length - 6)] : points[points.length - 2]
      if (!last) throw new Error(`${s.id}: sin datos`)
      const indicator: MarketIndicator = {
        key: s.key,
        label: s.label,
        group: s.group,
        value: round(last.value, 2),
        unit: s.unit,
        asOf: s.group === 'rate' ? last.date.slice(0, 7) : last.date,
        changePct: prev && prev !== last ? (s.group === 'rate' ? round(last.value - prev.value, 2) : pctChange(last.value, prev.value)) : null,
        source: 'FRED',
      }
      return indicator
    }),
  )
  const indicators = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (indicators.length === 0) throw new Error('ninguna serie disponible')
  return { source: source('FRED', `${BASE}?series_id=FEDFUNDS,SP500,NASDAQ100`, 'official', ctx.now), indicators, headlines: [] }
}
