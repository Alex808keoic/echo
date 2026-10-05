/**
 * Fuentes de inflación (sin red): series vigentes, estado del dato y rechazo
 * de series congeladas. Las respuestas reproducen la estructura real de las
 * APIs comprobada el 5-10-2026 (INE Tempus `tip=A`, Eurostat JSON-stat).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { assertCurrentMonthly, EUROSTAT_URL, eurostatHicp, INE_URL, ineIpc, MAX_MONTHLY_LAG, monthsBehind } from '../sources/inflation'
import { collectSources } from '../sources/index'
import { parseIndicator } from '../../../lib/market/validate'
import type { SourceContext } from '../sources/shared'

/** fetch falso que devuelve `body` y anota la URL pedida. */
function fakeFetch(body: unknown, calls: string[] = []): typeof fetch {
  return (async (url: unknown) => {
    calls.push(String(url))
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}
const ctx = (body: unknown, now: string, calls?: string[]): SourceContext => ({ fetch: fakeFetch(body, calls), now: new Date(now), env: {}, timeoutMs: 1_000 })

// INE · IPC290750 (base 2025), respuesta «amigable» (`tip=A`).
const INE_POINTS = [
  { Fecha: '2026-07-01T00:00:00.000+02:00', T3_TipoDato: 'Definitivo', T3_Periodo: 'M07', Anyo: 2026, Valor: 3.6 },
  { Fecha: '2026-08-01T00:00:00.000+02:00', T3_TipoDato: 'Definitivo', T3_Periodo: 'M08', Anyo: 2026, Valor: 4.3 },
  { Fecha: '2026-09-01T00:00:00.000+02:00', T3_TipoDato: 'Avance', T3_Periodo: 'M09', Anyo: 2026, Valor: 4.9 },
]
const ine = (points = INE_POINTS) => ({ COD: 'IPC290750', Nombre: 'Nacional. Índice general. Variación anual. ', T3_Unidad: 'Tasas', T3_Escala: ' ', Data: points })

// Eurostat · prc_hicp_minr (ECOICOP ver.2).
function eurostat(points: Array<[string, number, string?]>) {
  const index = Object.fromEntries(points.map(([p], i) => [p, i]))
  const value = Object.fromEntries(points.map(([, v], i) => [String(i), v]))
  const status = Object.fromEntries(points.flatMap(([, , s], i) => (s ? [[String(i), s]] : [])))
  return {
    version: '2.0',
    class: 'dataset',
    label: 'Harmonised index of consumer prices (HICP) - ECOICOP ver.2 - indices and rates of change, monthly data',
    updated: '2026-10-02T11:00:00+0200',
    id: ['freq', 'unit', 'coicop18', 'geo', 'time'],
    size: [1, 1, 1, 1, points.length],
    value,
    status,
    dimension: {
      freq: { category: { index: { M: 0 } } },
      unit: { category: { index: { RCH_A: 0 } } },
      coicop18: { category: { index: { TOTAL: 0 } } },
      geo: { category: { index: { EA: 0 } } },
      time: { category: { index } },
    },
  }
}

describe('inflación · series vigentes', () => {
  it('INE usa IPC290750 (base 2025) y no la serie congelada IPC251856', async () => {
    assert.match(INE_URL, /DATOS_SERIE\/IPC290750\?/)
    assert.doesNotMatch(INE_URL, /IPC251856/)
    const calls: string[] = []
    await ineIpc(ctx(ine(), '2026-10-05T07:30:00Z', calls))
    assert.deepEqual(calls, [INE_URL])
  })

  it('Eurostat usa prc_hicp_minr con coicop18=TOTAL y RCH_A, no prc_hicp_manr/CP00', async () => {
    assert.match(EUROSTAT_URL, /\/prc_hicp_minr\?/)
    assert.match(EUROSTAT_URL, /[?&]coicop18=TOTAL(&|$)/)
    assert.match(EUROSTAT_URL, /[?&]unit=RCH_A(&|$)/)
    assert.match(EUROSTAT_URL, /[?&]geo=EA(&|$)/)
    assert.doesNotMatch(EUROSTAT_URL, /prc_hicp_manr|CP00/)
    const calls: string[] = []
    await eurostatHicp(ctx(eurostat([['2026-08', 3.2], ['2026-09', 3.8, 'e']]), '2026-10-05T07:30:00Z', calls))
    assert.deepEqual(calls, [EUROSTAT_URL])
  })
})

describe('inflación · INE (IPC290750)', () => {
  it('julio 3,6 % y agosto 4,3 %: definitivos, sin estado', async () => {
    const jul = (await ineIpc(ctx(ine(INE_POINTS.slice(0, 1)), '2026-08-05T07:30:00Z'))).indicators[0]
    assert.deepEqual([jul.asOf, jul.value, jul.status], ['2026-07', 3.6, undefined])
    const aug = (await ineIpc(ctx(ine(INE_POINTS.slice(0, 2)), '2026-09-05T07:30:00Z'))).indicators[0]
    assert.deepEqual([aug.asOf, aug.value, aug.changePct, aug.status], ['2026-08', 4.3, 0.7, undefined])
  })

  it('septiembre 4,9 % se conserva como «Avance», nunca como definitivo', async () => {
    const [sep] = (await ineIpc(ctx(ine(), '2026-10-05T07:30:00Z'))).indicators
    assert.deepEqual(sep, { key: 'ine-ipc', label: 'IPC España (interanual)', group: 'inflation', value: 4.9, unit: '%', asOf: '2026-09', changePct: 0.6, source: 'INE', status: 'advance' })
  })

  it('un tipo de dato desconocido no se da por definitivo', async () => {
    const odd = [{ ...INE_POINTS[2], T3_TipoDato: 'Estimación' }]
    assert.equal((await ineIpc(ctx(ine(odd), '2026-10-05T07:30:00Z'))).indicators[0].status, 'provisional')
  })

  it('el orden de la respuesta no importa', async () => {
    const [sep] = (await ineIpc(ctx(ine([...INE_POINTS].reverse()), '2026-10-05T07:30:00Z'))).indicators
    assert.deepEqual([sep.asOf, sep.value], ['2026-09', 4.9])
  })
})

describe('inflación · Eurostat (prc_hicp_minr)', () => {
  it('septiembre 3,8 % como estimación (`e`), variación frente a agosto', async () => {
    const [sep] = (await eurostatHicp(ctx(eurostat([['2026-08', 3.2], ['2026-09', 3.8, 'e']]), '2026-10-05T07:30:00Z'))).indicators
    assert.deepEqual(sep, { key: 'ea-hicp', label: 'Inflación eurozona (HICP interanual)', group: 'inflation', value: 3.8, unit: '%', asOf: '2026-09', changePct: 0.6, source: 'Eurostat', status: 'estimated' })
  })

  it('sin marca de estado: sin `status`; `p` → provisional', async () => {
    const final = (await eurostatHicp(ctx(eurostat([['2026-07', 2.9], ['2026-08', 3.2]]), '2026-09-20T07:30:00Z'))).indicators[0]
    assert.equal(final.status, undefined)
    const prov = (await eurostatHicp(ctx(eurostat([['2026-08', 3.2, 'p']]), '2026-09-20T07:30:00Z'))).indicators[0]
    assert.equal(prov.status, 'provisional')
  })
})

describe('inflación · series congeladas', () => {
  const NOW = '2026-10-05T07:30:00Z'

  it('monthsBehind cuenta meses naturales', () => {
    assert.equal(monthsBehind('2026-09', new Date(NOW)), 1)
    assert.equal(monthsBehind('2025-12', new Date(NOW)), 10)
    assert.equal(monthsBehind('2026-11', new Date('2027-01-02T00:00:00Z')), 2)
  })

  it('una serie que termina en 2025-12 se rechaza en octubre de 2026', () => {
    assert.throws(() => assertCurrentMonthly('2025-12', new Date(NOW), 'IPC251856'), /serie congelada, último dato 2025-12 \(10 meses\)/)
  })

  it('una serie vigente que continúa en 2026 se acepta; el retraso normal (hasta 3 meses) también', () => {
    assert.doesNotThrow(() => assertCurrentMonthly('2026-09', new Date(NOW), 'x'))
    assert.doesNotThrow(() => assertCurrentMonthly('2026-07', new Date(NOW), 'x'))
    assert.equal(MAX_MONTHLY_LAG, 3)
    assert.throws(() => assertCurrentMonthly('2026-06', new Date(NOW), 'x'), /serie congelada/)
  })

  it('INE congelado (respuesta de la serie antigua) → la fuente falla en vez de publicar 2,9 % de 2025-12', async () => {
    const frozen = ine([
      { Fecha: '2025-11-01T00:00:00.000+01:00', T3_TipoDato: 'Definitivo', T3_Periodo: 'M11', Anyo: 2025, Valor: 3.0 },
      { Fecha: '2025-12-01T00:00:00.000+01:00', T3_TipoDato: 'Definitivo', T3_Periodo: 'M12', Anyo: 2025, Valor: 2.9 },
    ])
    await assert.rejects(ineIpc(ctx(frozen, NOW)), /serie congelada, último dato 2025-12/)
  })

  it('Eurostat congelado → la fuente falla en vez de publicar 2,0 % de 2025-12', async () => {
    await assert.rejects(eurostatHicp(ctx(eurostat([['2025-11', 2.1], ['2025-12', 2.0]]), NOW)), /serie congelada, último dato 2025-12/)
  })

  it('en la recopilación, una serie congelada queda en `failed` y no entra como indicador', async () => {
    const frozenEurostat = eurostat([['2025-11', 2.1], ['2025-12', 2.0]])
    const m = await collectSources([{ name: 'Eurostat', run: eurostatHicp }], { fetch: fakeFetch(frozenEurostat), now: new Date(NOW), env: {}, timeoutMs: 1_000 })
    assert.deepEqual(m.failed, ['Eurostat'])
    assert.deepEqual(m.indicators, [])
  })
})

describe('inflación · el estado sobrevive a la validación', () => {
  const base = { key: 'ine-ipc', label: 'IPC España (interanual)', group: 'inflation', value: 4.9, unit: '%', asOf: '2026-09', changePct: 0.6, source: 'INE' }

  it('parseIndicator conserva `status` y no lo inventa si falta', () => {
    assert.equal(parseIndicator({ ...base, status: 'advance' }).status, 'advance')
    assert.equal(parseIndicator({ ...base, status: 'estimated' }).status, 'estimated')
    assert.equal('status' in parseIndicator(base), false)
  })

  it('rechaza un estado desconocido', () => {
    assert.throws(() => parseIndicator({ ...base, status: 'definitivo' }), /status/)
  })
})
