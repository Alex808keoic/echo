/**
 * Banco de España — tablas estadísticas públicas en CSV (latin1, sin autenticación):
 * - ti_1_7: mercado monetario → Euríbor a 12 meses (diario);
 * - ti_1_6: Bolsa de Madrid → índice IBEX 35 (diario).
 * La variación de los índices se calcula frente al cierre de ~5 sesiones antes.
 */
import { fetchText, parseBdeTable, pctChange, round, source, type Source } from './shared'
import type { MarketIndicator } from '../../../lib/market/types'

const TABLE = (id: string) => `https://www.bde.es/webbe/es/estadisticas/compartido/datos/csv/${id}.csv`

export const bdeEuribor12m: Source = async (ctx) => {
  const url = TABLE('ti_1_7')
  const csv = await fetchText(ctx, url, {}, 'latin1')
  const [prev, last] = parseBdeTable(csv, /Eur.bor\. A 12 meses/i, 2)
  if (!last) throw new Error('sin datos')
  const indicator: MarketIndicator = {
    key: 'euribor-12m',
    label: 'Euríbor 12 meses',
    group: 'rate',
    value: round(last.value, 3),
    unit: '%',
    asOf: last.date,
    changePct: prev ? round(last.value - prev.value, 3) : null,
    source: 'Banco de España',
  }
  return { source: source('Banco de España · mercado monetario', url, 'official', ctx.now), indicators: [indicator], headlines: [] }
}

export const bdeIbex35: Source = async (ctx) => {
  const url = TABLE('ti_1_6')
  const csv = await fetchText(ctx, url, {}, 'latin1')
  const points = parseBdeTable(csv, /IBEX 35/i, 6)
  const last = points[points.length - 1]
  const weekAgo = points[0]
  if (!last) throw new Error('sin datos')
  const indicator: MarketIndicator = {
    key: 'ibex',
    label: 'IBEX 35',
    group: 'index',
    value: round(last.value, 2),
    unit: 'pts',
    asOf: last.date,
    changePct: points.length >= 2 ? pctChange(last.value, weekAgo.value) : null,
    source: 'Banco de España',
  }
  return { source: source('Banco de España · Bolsa de Madrid', url, 'data', ctx.now), indicators: [indicator], headlines: [] }
}
