/**
 * Inflación (sin autenticación):
 * - INE (API Tempus, JSON): IPC general nacional, variación anual (serie IPC251856).
 * - Eurostat (API dissemination, JSON-stat): HICP eurozona, variación anual
 *   (prc_hicp_manr, geo=EA, coicop=CP00, unit=RCH_A).
 */
import { fetchJSON, round, source, type Source } from './shared'
import type { MarketIndicator } from '../../../lib/market/types'

const INE_URL = 'https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/IPC251856?nult=2'
const EUROSTAT_URL =
  'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_manr?geo=EA&coicop=CP00&unit=RCH_A&lastTimePeriod=2&format=JSON'

interface IneSeries {
  Data: Array<{ Anyo: number; FK_Periodo: number; Valor: number }>
}

export const ineIpc: Source = async (ctx) => {
  const data = await fetchJSON<IneSeries>(ctx, INE_URL)
  const points = [...data.Data].sort((a, b) => a.Anyo - b.Anyo || a.FK_Periodo - b.FK_Periodo)
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  if (!last) throw new Error('sin datos')
  const period = (p: { Anyo: number; FK_Periodo: number }) => `${p.Anyo}-${String(p.FK_Periodo).padStart(2, '0')}`
  const indicator: MarketIndicator = {
    key: 'ine-ipc',
    label: 'IPC España (interanual)',
    group: 'inflation',
    value: last.Valor,
    unit: '%',
    asOf: period(last),
    changePct: prev ? round(last.Valor - prev.Valor, 2) : null,
    source: 'INE',
  }
  return { source: source('INE · IPC', INE_URL, 'official', ctx.now), indicators: [indicator], headlines: [] }
}

interface JsonStat {
  value: Record<string, number>
  dimension: { time: { category: { index: Record<string, number> } } }
}

export const eurostatHicp: Source = async (ctx) => {
  const data = await fetchJSON<JsonStat>(ctx, EUROSTAT_URL)
  const periods = Object.entries(data.dimension.time.category.index).sort((a, b) => a[1] - b[1])
  const points = periods.map(([period, idx]) => ({ period, value: data.value[String(idx)] })).filter((p) => Number.isFinite(p.value))
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  if (!last) throw new Error('sin datos')
  const indicator: MarketIndicator = {
    key: 'ea-hicp',
    label: 'Inflación eurozona (HICP interanual)',
    group: 'inflation',
    value: last.value,
    unit: '%',
    asOf: last.period,
    changePct: prev ? round(last.value - prev.value, 2) : null,
    source: 'Eurostat',
  }
  return { source: source('Eurostat · HICP', EUROSTAT_URL, 'official', ctx.now), indicators: [indicator], headlines: [] }
}
