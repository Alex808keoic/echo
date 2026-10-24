/**
 * Fuentes de las familias de inversión (sin red): bonos (BCE), vivienda (INE),
 * materias primas (FMI) y criptomonedas (CoinGecko). Las respuestas
 * reproducen la estructura real de las APIs comprobada el 24-10-2026 (el FMI
 * no respondía ese día: su CSV sigue docs/SPIKE_GOLD_SOURCES.md).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ecbBondYields, EA_10Y_URL, ES_10Y_URL } from '../sources/bonds'
import { imfCommodities, parseSdmxCsv } from '../sources/commodities'
import { coingeckoCrypto } from '../sources/crypto'
import { ineHousePrices, IPV_URL, quartersBehind } from '../sources/housing'
import { baseFor, daysBetween, type SourceContext } from '../sources/shared'
import { parseIndicator } from '../../../lib/market/validate'

/** fetch falso: responde según la URL; lo que no está en `routes` da 503. */
function fakeFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (url: unknown) => {
    const hit = Object.entries(routes).find(([prefix]) => String(url).startsWith(prefix))
    if (!hit) return new Response('no healthy upstream', { status: 503 })
    const body = typeof hit[1] === 'string' ? hit[1] : JSON.stringify(hit[1])
    return new Response(body, { status: 200 })
  }) as typeof fetch
}
const ctx = (routes: Record<string, unknown>, now = '2026-10-24T07:30:00Z'): SourceContext => ({ fetch: fakeFetch(routes), now: new Date(now), env: {}, timeoutMs: 1_000 })

/** Respuesta SDMX-JSON del BCE con estas observaciones. */
function ecb(points: Array<[string, number]>) {
  return {
    dataSets: [{ series: { '0:0:0': { observations: Object.fromEntries(points.map(([, v], i) => [String(i), [v, 0, 0, null, null]])) } } }],
    structure: { dimensions: { observation: [{ id: 'TIME_PERIOD', values: points.map(([d]) => ({ id: d })) }] } },
  }
}

describe('utilidades de variación a un mes', () => {
  it('daysBetween entre días y entre meses (a día 15)', () => {
    assert.equal(daysBetween('2026-09-24', '2026-10-22'), 28)
    assert.equal(daysBetween('2026-08', '2026-09'), 31)
  })
  it('baseFor: la observación más reciente con al menos N días menos que la última', () => {
    const points = ['2026-09-18', '2026-09-23', '2026-09-24', '2026-09-25', '2026-10-22'].map((date) => ({ date }))
    assert.equal(baseFor(points, 28)?.date, '2026-09-24')
    assert.equal(baseFor(points.slice(-2), 28), undefined)
  })
})

describe('bonos a 10 años (BCE)', () => {
  it('eurozona diario: variación en puntos frente a hace un mes; España: mes con mes', async () => {
    const r = await ecbBondYields(
      ctx({
        [EA_10Y_URL]: ecb([['2026-09-18', 3.53], ['2026-09-24', 3.56], ['2026-10-21', 3.4], ['2026-10-22', 3.3844]]),
        [ES_10Y_URL]: ecb([['2026-08', 3.635], ['2026-09', 3.927]]),
      }),
    )
    const [ea, es] = r.indicators
    assert.deepEqual([ea.key, ea.group, ea.value, ea.asOf, ea.changePct, ea.changeDays], ['ea-10y', 'bond', 3.38, '2026-10-22', -0.18, 28])
    assert.deepEqual([es.key, es.value, es.asOf, es.changePct, es.changeDays], ['es-10y', 3.93, '2026-09', 0.29, 31])
    for (const i of r.indicators) parseIndicator(i)
  })
  it('si una serie falla, publica la otra; si fallan las dos, la fuente falla', async () => {
    const one = await ecbBondYields(ctx({ [ES_10Y_URL]: ecb([['2026-08', 3.6], ['2026-09', 3.9]]) }))
    assert.deepEqual(one.indicators.map((i) => i.key), ['es-10y'])
    await assert.rejects(ecbBondYields(ctx({})), /ninguna serie de bonos/)
  })
})

describe('precio de la vivienda (INE IPV1376)', () => {
  const ipv = (points: Array<[number, string, number]>) => ({
    COD: 'IPV1376',
    Data: points.map(([Anyo, T3_Periodo, Valor]) => ({ Fecha: '', T3_TipoDato: 'Definitivo', T3_Periodo, Anyo, Valor })),
  })
  it('variación anual del último trimestre, en puntos frente al anterior', async () => {
    const r = await ineHousePrices(ctx({ [IPV_URL]: ipv([[2026, 'T1', 12.9], [2026, 'T2', 12.2]]) }))
    const [i] = r.indicators
    assert.deepEqual([i.key, i.group, i.value, i.unit, i.asOf, i.changePct, i.changeDays], ['ine-ipv', 'housing', 12.2, '%', '2026-Q2', -0.7, 91])
    assert.equal(i.status, undefined)
    parseIndicator(i)
  })
  it('rechaza una serie congelada (como la de base 2015, que acabó en 2025-T4)', async () => {
    assert.equal(quartersBehind('2026-Q2', new Date('2026-10-24T00:00:00Z')), 2)
    await assert.rejects(ineHousePrices(ctx({ [IPV_URL]: ipv([[2025, 'T3', 12.8], [2025, 'T4', 12.9]]) }, '2026-12-01T00:00:00Z')), /serie congelada/)
  })
})

describe('materias primas (FMI PCPS, CSV)', () => {
  const csv = (rows: Array<[string, number]>) =>
    ['DATAFLOW,FREQ,REF_AREA,COMMODITY,UNIT_MEASURE,TIME_PERIOD,OBS_VALUE', ...rows.map(([d, v]) => `IMF.RES:PCPS(1.0),M,G001,PGOLD,USD,${d},${v}`)].join('\n')
  it('lee TIME_PERIOD y OBS_VALUE en cualquier columna y con meses «2026-M08» o «2026-08»', () => {
    assert.deepEqual(parseSdmxCsv(csv([['2026-M09', 3900], ['2026-M08', 3600]])), [
      { date: '2026-08', value: 3600 },
      { date: '2026-09', value: 3900 },
    ])
    assert.throws(() => parseSdmxCsv('A,B\n1,2'), /TIME_PERIOD/)
  })
  it('oro y Brent con variación mes a mes; si el FMI no responde, la fuente falla', async () => {
    const r = await imfCommodities(ctx({ 'https://api.imf.org/external/sdmx/2.1/data/IMF.RES,PCPS/G001.PGOLD': csv([['2026-08', 3600], ['2026-09', 3960]]) }))
    assert.deepEqual(r.indicators.map((i) => [i.key, i.unit, i.asOf, i.changePct, i.changeDays]), [['gold', 'USD', '2026-09', 10, 31]])
    await assert.rejects(imfCommodities(ctx({})), /ninguna materia prima/)
  })
})

describe('criptomonedas (CoinGecko)', () => {
  const DAY = 86_400_000
  const chart = (start: number, end: number) => ({
    prices: Array.from({ length: 32 }, (_, k) => [Date.UTC(2026, 8, 23) + k * DAY, start + ((end - start) * k) / 31]),
  })
  it('precio en euros y variación frente a hace un mes', async () => {
    const r = await coingeckoCrypto(
      ctx({
        'https://api.coingecko.com/api/v3/coins/bitcoin/': chart(70000, 105000),
        'https://api.coingecko.com/api/v3/coins/ethereum/': chart(2400, 2100),
      }),
    )
    const [btc, eth] = r.indicators
    assert.deepEqual([btc.key, btc.group, btc.unit, btc.value, btc.asOf, btc.changeDays], ['btc', 'crypto', 'EUR', 105000, '2026-10-24', 28])
    assert.ok(btc.changePct !== null && btc.changePct > 40)
    assert.ok(eth.changePct !== null && eth.changePct < -10)
    assert.equal(r.source.type, 'data')
    for (const i of r.indicators) parseIndicator(i)
  })
})
