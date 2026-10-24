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
import type { MarketIndicator } from '../../../lib/market/types'
import { research } from '../../../lib/market/__tests__/fixtures'
import { bdeSavings, DEPOSITS_URL, LETRAS_URL } from '../sources/savings'
import { goldApiSpot, GOLD_SPOT_URL } from '../sources/commodities'
import { applySampledSeries, parseSampledSeries, SAMPLED_KEEP } from '../sampled'
import { runLightCheck } from '../light'
import { memoryStore } from '../store'

/** fetch falso: responde según la URL; lo que no está en `routes` da 503. */
function fakeFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (url: unknown) => {
    const hit = Object.entries(routes).find(([prefix]) => String(url).startsWith(prefix))
    if (!hit) return new Response('no healthy upstream', { status: 503 })
    const body = typeof hit[1] === 'string' ? hit[1] : JSON.stringify(hit[1])
    // El Banco de España sirve sus CSV en latin1.
    return new Response(String(url).includes('bde.es') ? Buffer.from(body, 'latin1') : body, { status: 200 })
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

describe('ahorro seguro (Banco de España)', () => {
  const deposits = [
    '"","BE_19_7.1","BE_19_7.2","BE_19_7.3"',
    '"DESCRIPCIÓN DE LA SERIE","Tipos de interés. Nuevas operaciones. Entidades de crédito y EFC. TEDR. Depósitos de hogares e ISFLSH. A la vista","Tipos de interés. Nuevas operaciones. Entidades de crédito y EFC. TEDR. Hogares e ISFLSH. Depósitos a plazo. Tipo medio ponderado","Tipos de interés. Nuevas operaciones. Entidades de crédito y EFC. TEDR. Hogares e ISFLSH. Depósitos a plazo hasta 1 año"',
    '"JUL 2026",0.1575,2.1,2.0237',
    '"AGO 2026",0.1582,2.08,2.0143',
  ].join('\n')
  const letras = [
    '"DESCRIPCIÓN DE LA SERIE","Tipos de interés. Del mercado secundario de valores. Letras del tesoro. De 1 a 3 meses","Tipos de interés. Del mercado secundario de valores. Letras del tesoro. 1 Año. Conjunto del mercado"',
    '"22 SEP 2026",2.5,3.2',
    '"23 SEP 2026",2.5,"_"',
    '"21 OCT 2026",2.562,3.062',
  ].join('\n')

  it('depósitos (mensual) y Letras a 1 año (diario, en puntos frente a hace un mes)', async () => {
    const r = await bdeSavings(ctx({ [DEPOSITS_URL]: deposits, [LETRAS_URL]: letras }))
    const by = Object.fromEntries(r.indicators.map((i) => [i.key, i]))
    assert.deepEqual([by['es-deposit-1y'].value, by['es-deposit-1y'].asOf, by['es-deposit-1y'].changePct], [2.01, '2026-08', -0.01])
    assert.deepEqual([by['es-deposit-sight'].value, by['es-deposit-sight'].asOf], [0.16, '2026-08'])
    assert.deepEqual([by['es-letras-1y'].value, by['es-letras-1y'].asOf, by['es-letras-1y'].changePct, by['es-letras-1y'].changeDays], [3.06, '2026-10-21', -0.14, 29])
    for (const i of r.indicators) parseIndicator(i)
  })
})

describe('oro del día (gold-api) y serie muestreada', () => {
  const gold = (asOf: string, value: number, src = 'gold-api.com'): MarketIndicator => ({ key: 'gold', label: 'Oro', group: 'commodity', value, unit: 'USD', asOf, changePct: null, source: src })

  it('lee el precio con su fecha; rechaza una respuesta rara', async () => {
    const r = await goldApiSpot(ctx({ [GOLD_SPOT_URL]: { currency: 'USD', name: 'Gold', price: 3996.899902, symbol: 'XAU', updatedAt: '2026-10-24T09:52:53Z' } }))
    assert.deepEqual([r.indicators[0].key, r.indicators[0].value, r.indicators[0].asOf, r.indicators[0].changePct, r.source.type], ['gold', 3996.9, '2026-10-24', null, 'data'])
    await assert.rejects(goldApiSpot(ctx({ [GOLD_SPOT_URL]: { currency: 'EUR', price: 1, updatedAt: '2026-10-24' } })), /no válida/)
  })

  it('apunta un valor por día y calcula la variación cuando hay uno de hace un mes', () => {
    const first = applySampledSeries([gold('2026-09-25', 3600)], {})
    assert.equal(first.indicators[0].changePct, null, 'sin dato de hace un mes, no hay variación')
    const again = applySampledSeries([gold('2026-09-25', 3610)], first.series)
    assert.deepEqual(again.series.gold, [{ date: '2026-09-25', value: 3610 }], 'el mismo día se sustituye')
    const later = applySampledSeries([gold('2026-10-24', 3971)], again.series)
    assert.deepEqual([later.indicators[0].changePct, later.indicators[0].changeDays], [10, 29])
    // El oro del FMI (otra fuente, media mensual) no se apunta.
    assert.deepEqual(applySampledSeries([gold('2026-09', 3600, 'FMI')], {}).series, {})
    assert.deepEqual(parseSampledSeries({ gold: [{ date: '2026-10-24', value: 1 }, { date: 'x', value: 2 }, { date: '2026-10-25', value: -1 }], bad: 3 }), { gold: [{ date: '2026-10-24', value: 1 }] })
    assert.equal(SAMPLED_KEEP, 70)
  })

  it('la comprobación ligera guarda la serie en series.json', async () => {
    const store = memoryStore({ latest: research() })
    const material = { retrievedAt: '2026-10-24T07:30:00Z', indicators: [gold('2026-10-24', 3996.9)], headlines: [], sources: [], failed: [], skipped: [] }
    await runLightCheck({ store, collect: async () => material, now: new Date('2026-10-24T07:30:00Z') })
    assert.deepEqual(store.files.get('series.json'), { gold: [{ date: '2026-10-24', value: 3996.9 }] })
  })
})
