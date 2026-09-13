/**
 * BCE — Data Portal (SDMX-JSON, sin autenticación):
 * - tipo de la facilidad de depósito (DFR), diario;
 * - Euríbor a 12 meses, media mensual;
 * - EURO STOXX 50, media mensual.
 */
import { fetchJSON, parseEcbSeries, pctChange, round, source, type EcbSdmxJson, type Source } from './shared'
import type { MarketIndicator } from '../../../lib/market/types'

const BASE = 'https://data-api.ecb.europa.eu/service/data/FM'
const url = (key: string, n: number) => `${BASE}/${key}?format=jsondata&lastNObservations=${n}`

async function lastTwo(ctx: Parameters<Source>[0], key: string, n = 2) {
  const points = parseEcbSeries(await fetchJSON<EcbSdmxJson>(ctx, url(key, n)))
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  if (!last) throw new Error(`${key}: sin observaciones`)
  return { last, prev }
}

export const ecbDepositRate: Source = async (ctx) => {
  const key = 'B.U2.EUR.4F.KR.DFR.LEV'
  const { last, prev } = await lastTwo(ctx, key)
  const indicator: MarketIndicator = {
    key: 'ecb-dfr',
    label: 'BCE · facilidad de depósito',
    group: 'rate',
    value: last.value,
    unit: '%',
    asOf: last.date,
    // Para tipos, la «variación» es en puntos porcentuales.
    changePct: prev ? round(last.value - prev.value, 2) : null,
    source: 'BCE',
  }
  return { source: source('BCE · Data Portal (DFR)', url(key, 2), 'official', ctx.now), indicators: [indicator], headlines: [] }
}

export const ecbEuribor12m: Source = async (ctx) => {
  const key = 'M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA'
  const { last, prev } = await lastTwo(ctx, key)
  const indicator: MarketIndicator = {
    key: 'euribor-12m',
    label: 'Euríbor 12 meses (media mensual)',
    group: 'rate',
    value: round(last.value, 3),
    unit: '%',
    asOf: last.date,
    changePct: prev ? round(last.value - prev.value, 3) : null,
    source: 'BCE',
  }
  return { source: source('BCE · Data Portal (Euríbor)', url(key, 2), 'official', ctx.now), indicators: [indicator], headlines: [] }
}

export const ecbEuroStoxx50: Source = async (ctx) => {
  const key = 'M.U2.EUR.DS.EI.DJES50I.HSTA'
  const { last, prev } = await lastTwo(ctx, key)
  const indicator: MarketIndicator = {
    key: 'stoxx50',
    label: 'EURO STOXX 50 (media mensual)',
    group: 'index',
    value: round(last.value, 2),
    unit: 'pts',
    asOf: last.date,
    changePct: prev ? pctChange(last.value, prev.value) : null,
    source: 'BCE',
  }
  return { source: source('BCE · Data Portal (EURO STOXX 50)', url(key, 2), 'data', ctx.now), indicators: [indicator], headlines: [] }
}
