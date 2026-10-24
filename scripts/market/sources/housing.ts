/**
 * Vivienda — INE (API Tempus, JSON, sin autenticación): Índice de Precios de
 * Vivienda, nacional, general, variación anual (serie IPV1376, base 2025,
 * trimestral). El valor es la variación anual en %; `changePct`, en puntos
 * frente a la del trimestre anterior. Se rechaza una serie congelada.
 */
import { fetchJSON, round, source, type Source } from './shared'
import type { IndicatorStatus, MarketIndicator } from '../../../lib/market/types'

export const IPV_SERIES = 'IPV1376'
export const IPV_URL = `https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/${IPV_SERIES}?nult=2&tip=A`

/** El INE publica cada trimestre unos 70 días después: más de 3 trimestres atrás es una serie que ya no se actualiza. */
export const MAX_QUARTERLY_LAG = 3

const STATUS: Record<string, IndicatorStatus | undefined> = { Definitivo: undefined, Provisional: 'provisional', Avance: 'advance' }

interface IneSeries {
  Data: Array<{ Anyo: number; T3_Periodo: string; T3_TipoDato?: string; Valor: number }>
}

/** Trimestres entre `YYYY-Qn` y el trimestre de `now` (UTC). */
export function quartersBehind(period: string, now: Date): number {
  const m = /^(\d{4})-Q([1-4])$/.exec(period)
  if (!m) throw new Error(`trimestre no válido: ${period}`)
  return (now.getUTCFullYear() - Number(m[1])) * 4 + (Math.floor(now.getUTCMonth() / 3) + 1 - Number(m[2]))
}

export const ineHousePrices: Source = async (ctx) => {
  const data = await fetchJSON<IneSeries>(ctx, IPV_URL)
  const points = data.Data.filter((p) => /^T[1-4]$/.test(p.T3_Periodo) && Number.isFinite(p.Valor))
    .map((p) => ({ ...p, period: `${p.Anyo}-Q${p.T3_Periodo.slice(1)}` }))
    .sort((a, b) => a.period.localeCompare(b.period))
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  if (!last) throw new Error('sin datos')
  const lag = quartersBehind(last.period, ctx.now)
  if (lag > MAX_QUARTERLY_LAG) throw new Error(`${IPV_SERIES}: serie congelada, último dato ${last.period} (${lag} trimestres)`)
  const status = last.T3_TipoDato && last.T3_TipoDato in STATUS ? STATUS[last.T3_TipoDato] : 'provisional'
  const indicator: MarketIndicator = {
    key: 'ine-ipv',
    label: 'Precio de la vivienda en España (interanual)',
    group: 'housing',
    value: round(last.Valor, 1),
    unit: '%',
    asOf: last.period,
    changePct: prev ? round(last.Valor - prev.Valor, 1) : null,
    ...(prev ? { changeDays: 91 } : {}),
    source: 'INE',
    ...(status ? { status } : {}),
  }
  return { source: source('INE · Índice de Precios de Vivienda', IPV_URL, 'official', ctx.now), indicators: [indicator], headlines: [] }
}
