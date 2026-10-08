/**
 * Weekly Brief · fase 2: la IA escribe; AXIS decide. Toda redacción que
 * cambie una cifra, una fecha, la recomendación o la prioridad se rechaza, y
 * el resultado es siempre el MISMO Brief determinista.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { phraseWeeklyBrief } from '../../ai/server/analyze'
import { AIProviderError } from '../../ai/provider'
import { buildFinancialContext } from '../../context'
import { decide } from '../../core/decision'
import type { AxisLanguageModel } from '../../language/model'
import { buildMarketContext } from '../../../market/relevance'
import { history, research } from '../../../market/__tests__/fixtures'
import type { MarketResearch } from '../../../market/types'
import type { MarketContext } from '../../types'
import { config, healthyMovements, NOW, objective, position, snapshot, TODAY } from '../../__tests__/fixtures'
import { briefPayload, buildWeeklyBriefRequest, parseWeeklyBriefPhrasing, weeklyBriefSignature, WEEKLY_BRIEF_PHRASING_SCHEMA, type WeeklyBriefPhrasing } from '../phrasing'
import { createWeeklyBriefPhrasingCache, withWeeklyBriefPhrasing } from '../phrasing-cache'
import { validateWeeklyBriefPhrasing, type PhrasingInvariant } from '../phrasing-validate'
import { buildWeeklyBrief, type WeeklyBrief } from '../weekly'

/* --------------------------------- fixtures -------------------------------- */

const NET = 255_000
const GOAL = objective({ name: 'Viaje', targetCents: 500_000 })
const FUND = position({ name: 'Fondo Global', investedCents: 150_000, valueCents: 158_000, fromLiquid: false })
const CAUTION = { key: 'equity-global', label: 'Renta variable global', aliases: ['global'], note: 'Valoraciones exigentes.', stance: 'caution' as const }

function briefWith(opts: { liquidCents?: number; market?: MarketContext | null; positions?: boolean; now?: Date } = {}): WeeklyBrief {
  const ctx = buildFinancialContext(
    snapshot({ config: config((opts.liquidCents ?? 300_000) - NET), movements: healthyMovements(), objectives: [GOAL], ...(opts.positions ? { positions: [FUND] } : {}) }),
    TODAY,
  )
  const market = opts.market === undefined ? buildMarketContext(research(), history, [], NOW) : opts.market
  return buildWeeklyBrief(decide({ context: ctx, market }), market, opts.now ?? NOW)
}
const marketOf = (r: MarketResearch, positions: string[] = []) => buildMarketContext(r, history, positions, NOW)

/** Secciones de mercado correctas para el Brief de los fixtures (cifras y fechas tal cual). */
const MARKET_SECTIONS = {
  market:
    'El último dato del BCE · facilidad de depósito es del 2 %, de 2026-09-11. El Euríbor 12 meses está en el 2,15 %, el IPC España en el 2,1 % y el HICP eurozona en el 2 %, todos con dato de agosto de 2026.',
  changes: 'Frente al dato anterior, la facilidad de depósito del BCE no ha cambiado.',
  reading: 'Según la investigación del 12 de septiembre de 2026, fue una semana tranquila: los índices europeos subieron ligeramente y el BCE mantuvo los tipos.',
  events:
    'El 11 de septiembre el BCE mantuvo los tipos; el 9 de septiembre se publicó el IPC de agosto, con una inflación más moderada; y el 8 de septiembre la Fed emitió un comunicado rutinario.',
}

/** Situación estable, sin recomendación (no-action). */
const STABLE: WeeklyBriefPhrasing = {
  title: 'Semana tranquila en el mercado y tu situación sigue estable',
  ...MARKET_SECTIONS,
  personal: 'Este mes ahorras 1.300,00 €, un 65% de tus ingresos, y ese excedente va solo a «Viaje», al que le faltan 2.000,00 €. Para ti, el mercado es contexto.',
  conclusion: 'Con los datos disponibles tu situación es estable y no hace falta actuar por el mercado; mantén el ritmo.',
}

/** Líquido negativo (personal-priority, recomendación review/data). */
const NEGATIVE: WeeklyBriefPhrasing = {
  title: 'Esta semana, lo primero es tu dinero líquido',
  ...MARKET_SECTIONS,
  personal: 'Tu dinero líquido es negativo (-6.450,00 €) y tu patrimonio también. Mientras siga así, tus objetivos no reciben dinero; el contexto de mercado no cambia esa prioridad.',
  conclusion: 'Comprueba tu saldo inicial y tus movimientos y, si son correctos, prioriza volver a un líquido positivo antes que cualquier otro destino del dinero.',
}

const invariants = (b: WeeklyBrief, p: WeeklyBriefPhrasing): PhrasingInvariant[] => {
  const v = validateWeeklyBriefPhrasing(b, p)
  return v.ok ? [] : [...new Set(v.violations.map((x) => x.invariant))]
}
const rejects = (b: WeeklyBrief, p: WeeklyBriefPhrasing, inv: PhrasingInvariant) => {
  const got = invariants(b, p)
  assert.ok(got.includes(inv), `se esperaba «${inv}», se obtuvo [${got.join(', ')}]`)
}

function model(output: unknown | (() => unknown), seen: { user?: string; system?: string; calls?: number } = {}): AxisLanguageModel {
  return {
    id: 'test:mock',
    available: true,
    async complete(request) {
      seen.user = request.user
      seen.system = request.system
      seen.calls = (seen.calls ?? 0) + 1
      return typeof output === 'function' ? (output as () => unknown)() : output
    },
  }
}
const failing = (): AxisLanguageModel => model(() => {
  throw new AIProviderError('timeout', 'el proveedor no respondió')
})
/** El fallback completo: llama al servidor y, si falla, el Brief determinista. */
const phrased = (b: WeeklyBrief, m: AxisLanguageModel) => withWeeklyBriefPhrasing(b, (brief) => phraseWeeklyBrief(m, brief))

/* ---------------------------------- casos ---------------------------------- */

describe('A · redacción válida', () => {
  it('situación estable: se acepta', async () => {
    const b = briefWith()
    assert.equal(b.personal.kind, 'no-action')
    assert.deepEqual(invariants(b, STABLE), [])
    const r = await phrased(b, model(STABLE))
    assert.deepEqual(r.phrasing, STABLE)
    assert.equal(r.brief, b)
  })
})

describe('B · el proveedor falla', () => {
  it('fallback: el mismo Brief determinista, sin redacción ni error visible', async () => {
    const b = briefWith()
    const r = await phrased(b, failing())
    assert.equal(r.phrasing, null)
    assert.equal(r.brief, b)
  })
})

describe('C–F · cifras, fechas y eventos', () => {
  const b = briefWith()

  it('C · cifra inventada', () => {
    rejects(b, { ...STABLE, market: 'El Euríbor 12 meses ha bajado al 2,3 %, con dato de agosto de 2026.' }, 'figures')
    rejects(b, { ...STABLE, changes: 'Frente al dato anterior, el BCE ha bajado -0,25 p.p.' }, 'figures')
    rejects(b, { ...STABLE, personal: 'Este mes ahorras unos 1,3 mil euros.' }, 'figures')
  })

  it('C · una cifra de la lectura de la investigación no cuenta como dato', () => {
    const withFigure = briefWith({ market: marketOf(research({ overview: 'Los índices europeos han subido un 3 % en la semana.' })) })
    rejects(withFigure, { ...STABLE, reading: 'Según la investigación del 12 de septiembre de 2026, los índices europeos subieron un 3 %.' }, 'figures')
  })

  it('D · cifra de un indicador sin dato actual', () => {
    const r = research()
    const stale = briefWith({ market: marketOf({ ...r, indicators: r.indicators.map((i) => (i.key === 'euribor-12m' ? { ...i, asOf: '2026-05' } : i)) }) })
    assert.ok(stale.market.notCurrent.some((i) => i.key === 'euribor-12m'))
    rejects(stale, { ...STABLE, market: 'El Euríbor 12 meses sigue en el 2,15 %.' }, 'stale')
    // Nombrarlo sin valor está bien.
    assert.ok(!invariants(stale, { ...STABLE, market: 'No hay dato actual del Euríbor 12 meses; su último dato es de mayo de 2026.' }).includes('stale'))
  })

  it('E · fecha inventada', () => {
    rejects(b, { ...STABLE, market: 'El último dato del BCE es del 2 %, del 3 de septiembre de 2026.' }, 'dates')
    rejects(b, { ...STABLE, market: 'El IPC España está en el 2,1 %, con dato de julio de 2026.' }, 'dates')
  })

  it('F · evento inventado', () => {
    rejects(b, { ...STABLE, events: `${MARKET_SECTIONS.events} Además, el 10 de septiembre la Fed subió los tipos.` }, 'dates')
    rejects(b, { ...STABLE, events: `${MARKET_SECTIONS.events} También habló el Banco de Inglaterra.` }, 'unknown')
  })

  it('«hoy» no describe un dato de mercado', () => {
    rejects(b, { ...STABLE, market: 'Hoy el Euríbor 12 meses está en el 2,15 %.' }, 'today')
  })
})

describe('G–I · consejo prohibido', () => {
  const b = briefWith()

  it('G · compra', () => {
    rejects(b, { ...STABLE, conclusion: 'Compra acciones europeas ahora que el mercado está tranquilo.' }, 'advice')
    rejects(b, { ...STABLE, conclusion: 'Es buen momento para invertir.' }, 'timing')
  })

  it('H · venta', () => {
    rejects(b, { ...STABLE, conclusion: 'Vende tu fondo antes de que el mercado caiga.' }, 'advice')
  })

  it('I · producto', () => {
    rejects(b, { ...STABLE, personal: 'Un ETF de renta variable global encajaría con lo que ahorras.' }, 'unknown')
  })

  it('predicción', () => {
    rejects(b, { ...STABLE, reading: 'Según la investigación del 12 de septiembre de 2026, los índices subirán las próximas semanas.' }, 'timing')
  })
})

describe('J–L · la decisión no cambia', () => {
  const negative = briefWith({ liquidCents: -645_000 })

  it('J · cambiar la recomendación', () => {
    assert.equal(negative.conclusion.recommendation?.action.verb, 'review')
    rejects(negative, { ...NEGATIVE, conclusion: 'Te recomiendo destinar tu ahorro a tu colchón.' }, 'advice')
    rejects(negative, { ...NEGATIVE, conclusion: 'No hace falta hacer nada esta semana.' }, 'stance')
  })

  it('J · sin recomendación de AXIS, el modelo no puede crear una', () => {
    rejects(briefWith(), { ...STABLE, conclusion: 'Deberías ahorrar más este mes.' }, 'advice')
  })

  it('K · contradecir la prioridad personal', () => {
    rejects(negative, { ...NEGATIVE, title: 'Lo más importante esta semana es el mercado' }, 'priority')
  })

  it('L · previsión presentada como hecho', () => {
    const base = briefWith()
    const forecast: WeeklyBrief = {
      ...base,
      personal: { ...base.personal, lead: { id: 'forecast.income', domain: 'forecast', priority: 'low', fact: 'Si recibes tus ingresos habituales, el mes que viene tendrías previstos 3.500,00 €.', interpretation: 'Es una previsión, no dinero que ya tengas.' } },
    }
    rejects(forecast, { ...STABLE, personal: 'Tienes 3.500,00 € en tu cuenta.' }, 'forecast')
    assert.ok(!invariants(forecast, { ...STABLE, personal: 'Si recibes tus ingresos habituales, tendrías previstos 3.500,00 € el mes que viene.' }).includes('forecast'))
  })
})

describe('M–N · forma', () => {
  const b = briefWith()

  it('M · respuesta incompleta → fallback', async () => {
    const { conclusion: _c, ...partial } = STABLE
    void _c
    assert.equal((await phrased(b, model(partial))).phrasing, null)
    // Una sección que el Brief tiene, a null.
    rejects(b, { ...STABLE, events: null }, 'coverage')
  })

  it('N · respuesta malformada → fallback', async () => {
    for (const raw of ['texto libre', null, [], { ...STABLE, extra: 'sección inventada' }, { ...STABLE, title: '' }, { ...STABLE, personal: 'x'.repeat(701) }]) {
      assert.equal((await phrased(b, model(raw))).phrasing, null, JSON.stringify(raw).slice(0, 40))
    }
    assert.throws(() => parseWeeklyBriefPhrasing({ ...STABLE, extra: 1 }), /campos no permitidos/)
  })

  it('la lectura debe nombrar la fecha de su investigación', () => {
    rejects(b, { ...STABLE, reading: 'Fue una semana tranquila y el BCE mantuvo los tipos.' }, 'coverage')
  })

  it('el esquema solo admite las secciones del Brief', () => {
    assert.deepEqual(Object.keys(WEEKLY_BRIEF_PHRASING_SCHEMA.properties), ['title', 'market', 'changes', 'reading', 'events', 'personal', 'conclusion'])
    assert.equal(WEEKLY_BRIEF_PHRASING_SCHEMA.additionalProperties, false)
  })
})

describe('O–Q · estados del Brief', () => {
  it('O · sin mercado: la IA no puede inventarlo', () => {
    const b = briefWith({ market: null })
    const ok: WeeklyBriefPhrasing = { ...STABLE, market: null, changes: null, reading: null, events: null }
    assert.deepEqual(invariants(b, ok), [])
    rejects(b, { ...ok, market: 'El Euríbor 12 meses está en el 2,15 %.' }, 'coverage')
    rejects(b, { ...ok, personal: `${STABLE.personal} El Euríbor 12 meses está en el 2,15 %.` }, 'unknown')
  })

  it('P · líquido negativo: se acepta si mantiene la prioridad', async () => {
    const b = briefWith({ liquidCents: -645_000 })
    assert.equal(b.personal.kind, 'personal-priority')
    assert.deepEqual(invariants(b, NEGATIVE), [])
    assert.deepEqual((await phrased(b, model(NEGATIVE))).phrasing, NEGATIVE)
    rejects(b, { ...NEGATIVE, conclusion: 'Aprovecha para invertir lo que puedas.' }, 'timing')
  })

  it('Q · prudencia de mercado: no se convierte en compra ni venta', () => {
    const b = briefWith({ market: marketOf(research({ assetClasses: [CAUTION] }), [FUND.name]), positions: true })
    assert.equal(b.personal.kind, 'market-caution')
    // Base fiel al propio Brief: su señal y su conclusión, tal cual.
    const base: WeeklyBriefPhrasing = { ...STABLE, personal: `${b.personal.lead?.fact} ${b.personal.lead?.interpretation}`, conclusion: b.conclusion.summary }
    assert.deepEqual(invariants(b, base), [])
    rejects(b, { ...base, conclusion: 'Espera a que baje para comprar más.' }, 'timing')
    rejects(b, { ...base, conclusion: 'Vende parte de tu posición para reducir riesgo.' }, 'advice')
  })

  it('sin datos personales: no se llama al modelo', async () => {
    const empty = buildFinancialContext(snapshot(), TODAY)
    const market = marketOf(research())
    const b = buildWeeklyBrief(decide({ context: empty, market }), market, NOW)
    const seen: { calls?: number } = {}
    const r = await phrased(b, model(STABLE, seen))
    assert.equal(r.phrasing, null)
    assert.equal(seen.calls, undefined)
  })
})

describe('entrada del modelo: solo el Brief', () => {
  it('ni movimientos, ni memorias, ni fechas de generación', async () => {
    const b = briefWith()
    const seen: { user?: string } = {}
    await phrased(b, model(STABLE, seen))
    const sent = JSON.parse((seen.user ?? '').slice((seen.user ?? '').indexOf('{')))
    assert.deepEqual(sent, briefPayload(b))
    assert.deepEqual(Object.keys(sent), ['mercado', 'para_ti', 'conclusion_de_axis', 'incertidumbres'])
    // healthyMovements usa categorías y motivos que nunca deben salir.
    assert.doesNotMatch(seen.user ?? '', /Comida|motivo|memoria|generatedAt|ageDays|2026-09-15/)
  })

  it('tamaño acotado', () => {
    const r = buildWeeklyBriefRequest(briefWith({ liquidCents: -645_000 }))
    assert.ok(r.system.length + r.user.length + JSON.stringify(r.schema).length < 10_000)
  })
})

describe('R–T · caché', () => {
  it('R · mismo Brief → misma firma (aunque se construya en otro momento del día)', () => {
    assert.equal(weeklyBriefSignature(briefWith()), weeklyBriefSignature(briefWith()))
    assert.equal(weeklyBriefSignature(briefWith()), weeklyBriefSignature(briefWith({ now: new Date(NOW.getTime() + 3_600_000) })))
  })

  it('S · cambio relevante → otra firma', () => {
    const r = research()
    const refreshed = briefWith({ market: marketOf({ ...r, indicators: r.indicators.map((i) => (i.key === 'euribor-12m' ? { ...i, value: 2.45 } : i)) }) })
    assert.notEqual(weeklyBriefSignature(refreshed), weeklyBriefSignature(briefWith()))
    assert.notEqual(weeklyBriefSignature(briefWith({ liquidCents: -645_000 })), weeklyBriefSignature(briefWith()))
  })

  it('T · mismo contenido con las propiedades en otro orden → misma firma', () => {
    const reorder = (v: unknown): unknown =>
      Array.isArray(v) ? v.map(reorder) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).reverse().map(([k, x]) => [k, reorder(x)])) : v
    const b = briefWith()
    const reordered = reorder(b) as WeeklyBrief
    assert.notDeepEqual(Object.keys(reordered), Object.keys(b))
    assert.equal(weeklyBriefSignature(reordered), weeklyBriefSignature(b))
  })

  it('una redacción por Brief: ni en cada render ni tras un fallo', async () => {
    const seen: { calls?: number } = {}
    const cache = createWeeklyBriefPhrasingCache((brief) => phraseWeeklyBrief(model(STABLE, seen), brief))
    const b = briefWith()
    const [one, two] = await Promise.all([cache.resultFor(b), cache.resultFor(briefWith())])
    assert.deepEqual([one.phrasing, two.phrasing], [STABLE, STABLE])
    assert.equal(seen.calls, 1)

    const failures: { calls?: number } = {}
    const failingCache = createWeeklyBriefPhrasingCache((brief) => phraseWeeklyBrief(model(() => { failures.calls = (failures.calls ?? 0) + 1; throw new AIProviderError('timeout', 'x') }), brief))
    assert.equal((await failingCache.resultFor(b)).phrasing, null)
    assert.equal((await failingCache.resultFor(b)).phrasing, null)
    assert.equal(failures.calls, 1)
  })

  it('un Brief distinto pide una redacción nueva', async () => {
    let calls = 0
    const cache = createWeeklyBriefPhrasingCache(async () => (calls++, STABLE))
    await cache.resultFor(briefWith())
    await cache.resultFor(briefWith({ liquidCents: -645_000 }))
    assert.equal(calls, 2)
  })
})
