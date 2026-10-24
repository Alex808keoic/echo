/**
 * Series muestreadas por el propio job. Algunas fuentes solo dan el precio de
 * hoy, sin histórico (el oro de gold-api.com). Cada recopilación apunta ese
 * valor en `series.json` de la rama de datos (uno por día, los últimos
 * `SAMPLED_KEEP`) y, cuando hay un dato de hace un mes, calcula la variación
 * con él. Así lo recomendaba docs/SPIKE_GOLD_SOURCES.md. Nunca inventa: sin un
 * dato de hace ≥ 28 días, la variación queda en `null`.
 */
import type { MarketIndicator } from '../../lib/market/types'
import { baseFor, daysBetween, pctChange } from './sources/shared'

export type SampledSeries = Record<string, Array<{ date: string; value: number }>>

/** Indicadores que se muestrean: clave y fuente (el mismo `key` puede venir de otra fuente con histórico propio). */
export const SAMPLED = [{ key: 'gold', source: 'gold-api.com' }] as const

export const SAMPLED_KEEP = 70

const isSampled = (i: MarketIndicator) => SAMPLED.some((s) => s.key === i.key && s.source === i.source)

/** Lee `series.json` sin fiarse de su forma: lo que no sea una serie válida se descarta. */
export function parseSampledSeries(raw: unknown): SampledSeries {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const out: SampledSeries = {}
  for (const [key, points] of Object.entries(raw)) {
    if (!Array.isArray(points)) continue
    out[key] = points.filter(
      (p): p is { date: string; value: number } => typeof p?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && typeof p?.value === 'number' && Number.isFinite(p.value) && p.value > 0,
    )
  }
  return out
}

/**
 * Apunta los indicadores muestreados (uno por día: el de hoy sustituye al de
 * hoy) y les pone la variación frente al dato de hace un mes si lo hay.
 */
export function applySampledSeries(indicators: MarketIndicator[], series: SampledSeries): { indicators: MarketIndicator[]; series: SampledSeries } {
  const next: SampledSeries = { ...series }
  const out = indicators.map((i) => {
    if (!isSampled(i) || i.value === null || !/^\d{4}-\d{2}-\d{2}$/.test(i.asOf)) return i
    const points = [...(next[i.key] ?? []).filter((p) => p.date !== i.asOf), { date: i.asOf, value: i.value }]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-SAMPLED_KEEP)
    next[i.key] = points
    const base = baseFor(points, 28)
    if (!base) return i
    return { ...i, changePct: pctChange(i.value, base.value), changeDays: daysBetween(base.date, i.asOf) }
  })
  return { indicators: out, series: next }
}
