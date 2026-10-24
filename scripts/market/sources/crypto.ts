/**
 * Criptomonedas — CoinGecko, API pública (JSON, sin clave): bitcoin y ether
 * en euros, con la variación de los últimos 30 días. No hay fuente oficial
 * para las criptomonedas; CoinGecko agrega precios de muchos mercados y es
 * una fuente de datos, no oficial (`type: 'data'`).
 */
import { baseFor, daysBetween, fetchJSON, pctChange, round, source, type Source, type SourceContext } from './shared'
import type { MarketIndicator } from '../../../lib/market/types'

const BASE = 'https://api.coingecko.com/api/v3/coins'
export const coingeckoUrl = (id: string) => `${BASE}/${id}/market_chart?vs_currency=eur&days=31&interval=daily`

const COINS = [
  { id: 'bitcoin', key: 'btc', label: 'Bitcoin (euros)' },
  { id: 'ethereum', key: 'eth', label: 'Ether (euros)' },
] as const

interface MarketChart {
  prices: Array<[number, number]>
}

async function coin(ctx: SourceContext, c: (typeof COINS)[number]): Promise<MarketIndicator> {
  const data = await fetchJSON<MarketChart>(ctx, coingeckoUrl(c.id))
  const points = (data.prices ?? [])
    .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] > 0)
    .map(([t, value]) => ({ date: new Date(t).toISOString().slice(0, 10), value }))
  const last = points[points.length - 1]
  if (!last) throw new Error(`${c.id}: sin datos`)
  const base = baseFor(points, 28)
  return {
    key: c.key,
    label: c.label,
    group: 'crypto',
    value: round(last.value, 0),
    unit: 'EUR',
    asOf: last.date,
    changePct: base ? pctChange(last.value, base.value) : null,
    ...(base ? { changeDays: daysBetween(base.date, last.date) } : {}),
    source: 'CoinGecko',
  }
}

export const coingeckoCrypto: Source = async (ctx) => {
  const results = await Promise.allSettled(COINS.map((c) => coin(ctx, c)))
  const indicators = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (indicators.length === 0) throw new Error('ninguna criptomoneda disponible')
  return { source: source('CoinGecko · criptomonedas', coingeckoUrl('bitcoin'), 'data', ctx.now), indicators, headlines: [] }
}
