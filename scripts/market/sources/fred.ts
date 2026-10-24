/**
 * FRED (Reserva Federal de St. Louis): tipo de fondos federales (FEDFUNDS,
 * mensual), S&P 500, Nasdaq 100, petróleo Brent, bono de EE. UU. a 10 años y
 * bonos europeos de alto rendimiento (diarios; variación frente al dato de
 * hace un mes), cobre y gas europeo (medias mensuales del FMI). Requiere una clave gratuita
 * (`FRED_API_KEY`); si no está configurada, la fuente se omite (no cuenta
 * como fallo). La clave nunca se incluye en las URLs publicadas.
 */
import { baseFor, daysBetween, fetchJSON, pctChange, round, source, type Source, type SourceContext } from './shared'
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

/** `monthly`: serie mensual (fecha `YYYY-MM`, compara con el mes anterior). Si el valor es un %, la variación va en puntos. */
const SERIES: Array<{ id: string; key: string; label: string; group: MarketIndicator['group']; unit: MarketIndicator['unit']; limit: number; monthly?: boolean }> = [
  { id: 'FEDFUNDS', key: 'fed-funds', label: 'Fed · tipo de fondos federales', group: 'rate', unit: '%', limit: 2, monthly: true },
  { id: 'SP500', key: 'spx', label: 'S&P 500', group: 'index', unit: 'pts', limit: 30 },
  { id: 'NASDAQ100', key: 'ndq', label: 'Nasdaq 100', group: 'index', unit: 'pts', limit: 30 },
  { id: 'DCOILBRENTEU', key: 'brent', label: 'Petróleo Brent (dólares por barril)', group: 'commodity', unit: 'USD', limit: 30 },
  // Añadidas el 2026-10-24 (renta fija y materias primas).
  { id: 'DGS10', key: 'us-10y', label: 'Bono a 10 años de EE. UU.', group: 'bond', unit: '%', limit: 30 },
  { id: 'BAMLHE00EHYIEY', key: 'eu-hy', label: 'Bonos de empresas europeas de alto rendimiento', group: 'bond', unit: '%', limit: 30 },
  { id: 'PCOPPUSDM', key: 'copper', label: 'Cobre (dólares por tonelada, media mensual)', group: 'commodity', unit: 'USD', limit: 2, monthly: true },
  { id: 'PNGASEUUSDM', key: 'gas-eu', label: 'Gas natural en Europa (dólares por MMBtu, media mensual)', group: 'commodity', unit: 'USD', limit: 2, monthly: true },
]

export const fredSeries: Source = async (ctx) => {
  const key = ctx.env.FRED_API_KEY?.trim()
  if (!key) throw new SourceSkipped('FRED_API_KEY no configurada')
  const results = await Promise.allSettled(
    SERIES.map(async (s) => {
      const points = await observations(ctx, key, s.id, s.limit)
      const last = points[points.length - 1]
      const prev = s.monthly ? points[points.length - 2] : baseFor(points, 28)
      if (!last) throw new Error(`${s.id}: sin datos`)
      const indicator: MarketIndicator = {
        key: s.key,
        label: s.label,
        group: s.group,
        value: round(last.value, 2),
        unit: s.unit,
        asOf: s.monthly ? last.date.slice(0, 7) : last.date,
        changePct: prev && prev !== last ? (s.unit === '%' ? round(last.value - prev.value, 2) : pctChange(last.value, prev.value)) : null,
        ...(prev && prev !== last ? { changeDays: daysBetween(s.monthly ? prev.date.slice(0, 7) : prev.date, s.monthly ? last.date.slice(0, 7) : last.date) } : {}),
        source: 'FRED',
      }
      return indicator
    }),
  )
  const indicators = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (indicators.length === 0) throw new Error('ninguna serie disponible')
  return { source: source('FRED', `${BASE}?series_id=FEDFUNDS,SP500,NASDAQ100,DCOILBRENTEU,DGS10,BAMLHE00EHYIEY,PCOPPUSDM,PNGASEUUSDM`, 'official', ctx.now), indicators, headlines: [] }
}
