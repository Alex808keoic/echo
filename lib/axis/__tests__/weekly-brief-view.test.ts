/**
 * Resumen semanal visible (parte 5a): presentación determinista, forma que
 * acepta el servidor y redacción con IA (validada dos veces, una por Brief).
 */
import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { buildMarketContext } from '../../market/relevance'
import { history, research } from '../../market/__tests__/fixtures'
import type { WeeklyBriefPhrasing } from '../brief/phrasing'
import { phraseWeeklyBriefRemote } from '../brief/transport'
import { briefView, dataDate, isWeeklyBrief } from '../brief/view'
import { buildWeeklyBrief, type WeeklyBrief } from '../brief/weekly'
import { config, healthyMovements, NOW, objective, snapshot, TODAY } from './fixtures'

function brief(): WeeklyBrief {
  const ctx = buildFinancialContext(snapshot({ config: config(300_000 - 255_000), movements: healthyMovements(), objectives: [objective({ name: 'Viaje', targetCents: 500_000 })] }), TODAY)
  const market = buildMarketContext(research(), history, [], NOW)
  return buildWeeklyBrief(decide({ context: ctx, market }), market, NOW)
}

const GOOD: WeeklyBriefPhrasing = {
  title: 'Semana tranquila en el mercado y tu situación sigue estable',
  market:
    'El último dato del BCE · facilidad de depósito es del 2 %, de 2026-09-11. El Euríbor 12 meses está en el 2,15 %, el IPC España en el 2,1 % y el HICP eurozona en el 2 %, todos con dato de agosto de 2026.',
  changes: 'Frente al dato anterior, la facilidad de depósito del BCE no ha cambiado.',
  reading: 'Según la investigación del 12 de septiembre de 2026, fue una semana tranquila: los índices europeos subieron ligeramente y el BCE mantuvo los tipos.',
  events: 'El 11 de septiembre el BCE mantuvo los tipos; el 9 de septiembre se publicó el IPC de agosto, con una inflación más moderada; y el 8 de septiembre la Fed emitió un comunicado rutinario.',
  personal: 'Este mes ahorras 1.300,00 €, un 65% de tus ingresos, y ese excedente va solo a «Viaje», al que le faltan 2.000,00 €. Para ti, el mercado es contexto.',
  conclusion: 'Con los datos disponibles tu situación es estable y no hace falta actuar por el mercado; mantén el ritmo.',
}

describe('presentación determinista', () => {
  it('valores, unidades y fechas exactamente los del Brief', () => {
    const v = briefView(brief())
    assert.equal(v.title, 'Tu resumen semanal del mercado')
    assert.equal(v.researchLine, 'Investigación del 12 sep 2026')
    assert.deepEqual(v.indicators[1], { label: 'Euríbor 12 meses', value: '2,15 %', detail: 'Dato de agosto de 2026 · Banco de España' })
    assert.deepEqual(v.changes, [{ label: 'BCE · facilidad de depósito', value: 'sin cambios' }])
    assert.equal(v.events.length, 3)
  })

  it('fechas de día y de mes', () => {
    assert.equal(dataDate('2026-09-11'), '11 sep 2026')
    assert.equal(dataDate('2026-08'), 'agosto de 2026')
  })
})

describe('forma que acepta el servidor', () => {
  it('un Brief real', () => assert.equal(isWeeklyBrief(brief()), true))

  it('manipulado o desmesurado: no', () => {
    const b = brief()
    assert.equal(isWeeklyBrief(null), false)
    assert.equal(isWeeklyBrief({ ...b, market: { ...b.market, status: 'inventado' } }), false)
    assert.equal(isWeeklyBrief({ ...b, market: { ...b.market, indicators: Array(7).fill(b.market.indicators[0]) } }), false)
    assert.equal(isWeeklyBrief({ ...b, personal: { ...b.personal, marketRelevance: 'x'.repeat(5_000) } }), false)
    assert.equal(isWeeklyBrief({ ...b, market: { ...b.market, indicators: [{ ...b.market.indicators[0], value: 'mucho' }] } }), false)
  })
})

describe('redacción desde el navegador', () => {
  const realFetch = globalThis.fetch
  const store = new Map<string, string>()
  let calls: string[] = []

  beforeEach(() => {
    store.clear()
    calls = []
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    delete (globalThis as { localStorage?: unknown }).localStorage
  })
  const serve = (phrasing: unknown) => {
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      calls.push(init?.method ?? 'GET')
      if ((init?.method ?? 'GET') === 'GET') return new Response(JSON.stringify({ available: true, mode: 'decision-first' }))
      return new Response(JSON.stringify({ phrasing }))
    }) as typeof fetch
  }

  it('usa la redacción válida, la guarda y la siguiente vez no llama', async () => {
    serve(GOOD)
    const b = brief()
    assert.deepEqual(await phraseWeeklyBriefRemote(b), GOOD)
    assert.deepEqual(calls, ['GET', 'POST'])
    calls = []
    assert.deepEqual(await phraseWeeklyBriefRemote(b), GOOD)
    assert.deepEqual(calls, [], 'guardada: sin llamadas')
  })

  it('una redacción inválida del servidor se descarta (→ Brief determinista)', async () => {
    serve({ ...GOOD, conclusion: 'Compra acciones europeas ahora que el mercado está tranquilo.' })
    await assert.rejects(phraseWeeklyBriefRemote(brief()))
    assert.equal(store.size, 0)
  })

  it('lo guardado se valida otra vez: si no vale para este Brief, se pide de nuevo', async () => {
    const b = brief()
    serve(GOOD)
    await phraseWeeklyBriefRemote(b)
    const key = [...store.keys()][0]
    const saved = JSON.parse(store.get(key)!)
    store.set(key, JSON.stringify({ ...saved, phrasing: { ...GOOD, market: 'El Euríbor 12 meses está en el 9,99 %.' } }))
    calls = []
    await phraseWeeklyBriefRemote(b)
    assert.deepEqual(calls, ['GET', 'POST'])
  })
})
