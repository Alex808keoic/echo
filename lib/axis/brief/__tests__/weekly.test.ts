/**
 * Weekly Market Brief determinista: presentación de lo que Finax ya sabe y de
 * lo que `decide()` ya ha decidido. Fechas fijas; nada depende del reloj.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../../context'
import { decide } from '../../core/decision'
import { render } from '../../compose'
import { LOCAL_RULES_ENGINE_INFO } from '../../local-engine'
import { buildMarketContext } from '../../../market/relevance'
import { history, research } from '../../../market/__tests__/fixtures'
import type { MarketIndicator, MarketResearch } from '../../../market/types'
import type { AxisMemory, MarketContext } from '../../types'
import { config, healthyMovements, NOW, objective, position, snapshot, TODAY } from '../../__tests__/fixtures'
import { BRIEF_MAX_INDICATORS, buildWeeklyBrief, type WeeklyBrief } from '../weekly'

const DAY = 86_400_000
/** healthyMovements deja +2.550,00 € netos: saldo inicial = líquido objetivo − 255.000. */
const NET = 255_000
const GOAL = objective({ name: 'Viaje', targetCents: 500_000 })
const FUND = position({ name: 'Fondo Global', investedCents: 150_000, valueCents: 158_000, fromLiquid: false })
const CAUTION = { key: 'equity-global', label: 'Renta variable global', aliases: ['global'], note: 'Valoraciones exigentes.', stance: 'caution' as const }

type Snap = Parameters<typeof snapshot>[0]
const contextWith = (liquidCents: number, extra: Snap = {}) =>
  buildFinancialContext(snapshot({ config: config(liquidCents - NET), movements: healthyMovements(), objectives: [GOAL], ...extra }), TODAY)
const marketOf = (r: MarketResearch, positionNames: string[] = [], now = NOW) => buildMarketContext(r, history, positionNames, now)
const withIndicators = (change: (i: MarketIndicator) => MarketIndicator, overrides: Partial<MarketResearch> = {}) => {
  const base = research(overrides)
  return { ...base, indicators: base.indicators.map(change) }
}

/** Brief de extremo a extremo: la decisión se toma con el MISMO mercado que recibe el Brief. */
function briefFor(opts: { liquidCents?: number; extra?: Snap; market?: MarketContext | null; memory?: AxisMemory; now?: Date } = {}): WeeklyBrief {
  const ctx = contextWith(opts.liquidCents ?? 800_000, opts.extra)
  const market = opts.market === undefined ? marketOf(research()) : opts.market
  const decision = decide({ context: ctx, market, ...(opts.memory ? { memory: opts.memory } : {}) })
  return buildWeeklyBrief(decision, market, opts.now ?? NOW)
}

const keys = (b: WeeklyBrief) => b.market.indicators.map((i) => i.key)
const titles = (b: WeeklyBrief) => b.uncertainties.map((u) => u.title)
const FORBIDDEN = /\b(compra|vende|invierte|aprovecha|entra|sal del mercado|va a subir|va a bajar|rentabilidad garantizada)\b/i

describe('1 · mercado normal: investigación reciente, indicadores frescos', () => {
  const b = briefFor()

  it('brief completo, con fechas separadas: generación, investigación y dato', () => {
    assert.equal(b.market.status, 'complete')
    assert.equal(b.generatedAt, NOW.toISOString())
    assert.equal(b.market.research?.generatedAt, '2026-09-12T06:00:00.000Z')
    assert.equal(b.market.research?.freshness, 'fresh')
    const euribor = b.market.indicators.find((i) => i.key === 'euribor-12m')
    assert.deepEqual({ asOf: euribor?.asOf, source: euribor?.source, unit: euribor?.unit, value: euribor?.value }, { asOf: '2026-08', source: 'Banco de España', unit: '%', value: 2.15 })
  })

  it(`como máximo ${BRIEF_MAX_INDICATORS} indicadores, en el orden de AXIS (tipos e inflación primero)`, () => {
    assert.deepEqual(keys(b), ['ecb-dfr', 'euribor-12m', 'ine-ipc', 'ea-hicp'])
  })

  it('«qué ha cambiado» solo con changePct: en puntos porcentuales para tipos, sin inventar los que no lo tienen', () => {
    assert.deepEqual(b.market.changes, [{ key: 'ecb-dfr', label: 'BCE · facilidad de depósito', delta: 0, unit: 'p.p.' }])
  })

  it('lectura fechada de la investigación, sin advertencia de antigüedad', () => {
    assert.equal(b.market.reading?.researchGeneratedAt, '2026-09-12T06:00:00.000Z')
    assert.equal(b.market.reading?.aging, false)
    assert.match(b.market.reading!.text, /BCE ha mantenido/)
  })

  it('sin incertidumbres de frescura del Brief (las de la decisión se conservan)', () => {
    const own = ['Sin información de mercado', 'Sin lectura de mercado reciente', 'Lectura de mercado con algunos días', 'Indicadores sin dato actual', 'Sin datos de mercado actuales']
    assert.ok(!titles(b).some((t) => own.includes(t)), titles(b).join(' · '))
  })

  it('una variación de índice va en %, no en puntos', () => {
    const indexOnly = buildWeeklyBrief(decide({ context: contextWith(800_000) }), marketOf(withIndicators((i) => (i.group === 'index' ? i : { ...i, asOf: '2025-01' }))), NOW)
    const ibex = indexOnly.market.changes.find((c) => c.key === 'ibex')
    assert.deepEqual(ibex && { delta: ibex.delta, unit: ibex.unit }, { delta: 1.2, unit: '%' })
  })
})

describe('2 · algunos indicadores sin dato actual', () => {
  const r = withIndicators((i) => (i.key === 'euribor-12m' ? { ...i, asOf: '2026-05' } : i.key === 'ea-hicp' ? { ...i, asOf: 'sin-fecha' } : i))
  const b = briefFor({ market: marketOf(r) })

  it('excluye sus valores del dato actual y los nombra aparte', () => {
    assert.equal(b.market.status, 'partial')
    assert.ok(!keys(b).includes('euribor-12m') && !keys(b).includes('ea-hicp'))
    assert.deepEqual(
      b.market.notCurrent.map((i) => [i.key, i.freshness, i.lastAsOf]),
      [
        ['euribor-12m', 'stale', '2026-05'],
        ['ea-hicp', 'unknown', null],
      ],
    )
  })

  it('distingue dato antiguo y desconocido en la incertidumbre, sin dar el valor antiguo', () => {
    const detail = b.uncertainties.find((u) => u.title === 'Indicadores sin dato actual')?.detail ?? ''
    assert.match(detail, /Euríbor 12 meses \(último dato de 2026-05\)/)
    assert.match(detail, /HICP eurozona \(sin fecha fiable\)/)
    assert.doesNotMatch(JSON.stringify(b.market.indicators), /2\.15/)
  })

  it('la lectura de la investigación reciente se mantiene', () => {
    assert.ok(b.market.reading)
  })
})

describe('3 · todos los indicadores sin dato actual', () => {
  const b = briefFor({ market: marketOf(withIndicators((i) => ({ ...i, asOf: '2025-01-02' }))) })

  it('no finge actualidad: ningún valor, todos nombrados como antiguos', () => {
    assert.equal(b.market.status, 'no-current-data')
    assert.deepEqual(b.market.indicators, [])
    assert.deepEqual(b.market.changes, [])
    assert.ok(b.market.notCurrent.every((i) => i.freshness === 'stale' && i.lastAsOf === '2025-01-02'))
    assert.ok(titles(b).includes('Sin datos de mercado actuales'))
  })

  it('la lectura de una investigación reciente sigue fechada', () => {
    assert.equal(b.market.reading?.researchGeneratedAt, '2026-09-12T06:00:00.000Z')
  })
})

describe('4 · investigación desactualizada + indicadores frescos', () => {
  // Investigación de hace 30 días; el job diario mantiene indicadores al día.
  const later = new Date(NOW.getTime() + 30 * DAY)
  const r = withIndicators((i) => ({ ...i, asOf: i.asOf.length === 7 ? '2026-09' : '2026-10-14' }))
  const market = marketOf(r, [FUND.name], later)
  const b = briefFor({ market, now: later, extra: { positions: [FUND] } })

  it('solo hechos: indicadores actuales, sin lectura antigua ni eventos', () => {
    assert.equal(market.freshness, 'stale')
    assert.equal(b.market.status, 'facts-only')
    assert.ok(b.market.indicators.length > 0)
    assert.equal(b.market.reading, null)
    assert.deepEqual(b.market.events, [])
  })

  it('la investigación antigua no genera prudencia ni recomendación de mercado', () => {
    assert.notEqual(b.personal.kind, 'market-caution')
    assert.notEqual(b.personal.lead?.domain, 'market')
    assert.ok(titles(b).includes('Sin lectura de mercado reciente'))
  })
})

describe('5 · investigación desactualizada sin indicadores frescos', () => {
  const later = new Date(NOW.getTime() + 60 * DAY)
  const b = briefFor({ market: marketOf(research(), [], later), now: later })

  it('deja claro que no hay lectura actual interpretable', () => {
    assert.equal(b.market.status, 'no-current-data')
    assert.equal(b.market.reading, null)
    assert.deepEqual(b.market.indicators, [])
    assert.deepEqual(b.market.events, [])
    assert.ok(titles(b).includes('Sin lectura de mercado reciente'))
    assert.ok(titles(b).includes('Sin datos de mercado actuales'))
  })
})

describe('6 · investigación con algunos días', () => {
  const later = new Date(NOW.getTime() + 10 * DAY)
  const b = briefFor({ market: marketOf(research(), [], later), now: later })

  it('lectura marcada como antigua y advertida', () => {
    assert.equal(b.market.research?.freshness, 'aging')
    assert.equal(b.market.reading?.aging, true)
    assert.ok(titles(b).includes('Lectura de mercado con algunos días'))
  })
})

describe('6/7 · eventos', () => {
  it('investigación reciente: solo eventos de los últimos 7 días naturales, con su propia fecha', () => {
    const b = briefFor()
    // Contexto: 09-11, 09-09 y 09-08 (los 3 de pickEvents). Hoy es 09-15: entran los tres.
    assert.deepEqual(b.market.events.map((e) => e.date), ['2026-09-11', '2026-09-09', '2026-09-08'])
  })

  it('eventos antiguos (o futuros) no aparecen aunque estén en la investigación', () => {
    const old = research({
      events: [
        { date: '2026-09-01', title: 'Subasta antigua', summary: 'Hace dos semanas.', impact: 'high', source: 'Tesoro', affects: [] },
        { date: '2026-09-20', title: 'Fecha futura', summary: 'No puede haber pasado.', impact: 'high', source: 'Tesoro', affects: [] },
        { date: '2026-09-13', title: 'Reciente', summary: 'Dentro de la semana.', impact: 'medium', source: 'BCE', affects: [] },
      ],
    })
    const b = briefFor({ market: marketOf(old) })
    assert.deepEqual(b.market.events.map((e) => e.title), ['Reciente'])
  })

  it('sin eventos válidos, lista vacía', () => {
    const b = briefFor({ market: marketOf(research({ events: [] })) })
    assert.deepEqual(b.market.events, [])
  })
})

describe('8 · líquido negativo', () => {
  const b = briefFor({ liquidCents: -645_000 })

  it('lidera la situación personal; el mercado no es el asunto principal', () => {
    assert.equal(b.personal.kind, 'personal-priority')
    assert.equal(b.personal.lead?.id, 'liquidity.negative')
    assert.equal(b.conclusion.recommendation?.action.verb, 'review')
    assert.match(b.personal.marketRelevance, /no cambia tu prioridad/)
  })

  it('ni «sólida» ni «nada urgente»', () => {
    assert.doesNotMatch(JSON.stringify(b), /sólida|No hay nada urgente/)
  })
})

describe('9 · líquido positivo bajo el mínimo declarado', () => {
  it('se conserva la lógica existente: completar el colchón', () => {
    const memory: AxisMemory = { profileFacts: [{ id: 'mem-liq', updatedAt: 1, fact: { kind: 'minLiquidity', cents: 1_500_000 } }] }
    const b = briefFor({ liquidCents: 800_000, memory })
    assert.equal(b.personal.lead?.id, 'liquidity.below-min')
    assert.equal(b.conclusion.recommendation?.action.verb, 'complete-cushion')
    assert.equal(b.personal.kind, 'personal-priority')
  })
})

describe('10 · situación cubierta + prudencia de mercado', () => {
  it('aparece la prudencia existente, con su acción de mantener', () => {
    const market = marketOf(research({ assetClasses: [CAUTION] }), [FUND.name])
    const b = briefFor({ market, extra: { positions: [FUND] } })
    assert.equal(b.personal.kind, 'market-caution')
    assert.equal(b.conclusion.recommendation?.action.verb, 'hold')
    assert.match(b.personal.marketRelevance, /no comprar ni vender/)
  })
})

describe('11 · objetivos activos', () => {
  it('la implicación personal es la de la decisión (señal, recomendación y conclusión idénticas)', () => {
    // 3.000 € de líquido: «Viaje» (5.000 €) sigue en curso.
    const ctx = contextWith(300_000)
    const market = marketOf(research())
    const decision = decide({ context: ctx, market })
    const b = buildWeeklyBrief(decision, market, NOW)
    const analysis = render(decision, LOCAL_RULES_ENGINE_INFO, NOW)
    assert.equal(analysis.status, 'analysis')
    assert.equal(b.personal.lead?.id, decision.lead?.id)
    assert.equal(b.personal.lead?.fact, decision.lead?.fact)
    assert.equal(b.conclusion.recommendation, decision.recommendation)
    assert.equal(b.conclusion.summary, analysis.status === 'analysis' ? analysis.analysis.conclusion.summary : '')
    assert.match(b.personal.lead?.interpretation ?? '', /«Viaje»/)
  })
})

describe('12 · sin objetivos', () => {
  it('no inventa objetivos: solo la recomendación que ya tiene la decisión', () => {
    const b = briefFor({ extra: { objectives: [] } })
    assert.doesNotMatch(JSON.stringify(b), /Viaje/)
    assert.equal(b.conclusion.recommendation?.action.verb, 'define')
  })
})

describe('13 · sin inversiones', () => {
  it('no habla de posiciones aunque la investigación tenga notas de clases de activo', () => {
    const b = briefFor({ market: marketOf(research({ assetClasses: [CAUTION] })) })
    assert.notEqual(b.personal.kind, 'market-caution')
    assert.doesNotMatch(JSON.stringify(b), /Fondo Global|Renta variable global/)
    assert.ok(!b.personal.lead?.id.startsWith('market.caution'))
  })
})

describe('14 · patrimonio negativo', () => {
  it('coherente con liquidity.negative, también con prudencia de mercado sobre una posición', () => {
    const market = marketOf(research({ assetClasses: [CAUTION] }), [FUND.name])
    const b = briefFor({ liquidCents: -645_000, market, extra: { positions: [FUND] } })
    assert.equal(b.personal.lead?.id, 'liquidity.negative')
    assert.match(b.personal.lead?.fact ?? '', /patrimonio total también/)
    assert.equal(b.personal.kind, 'personal-priority')
    assert.notEqual(b.conclusion.recommendation?.action.verb, 'hold')
  })
})

describe('15 · sin datos de mercado', () => {
  const b = briefFor({ market: null })

  it('estado seguro: sin información de mercado, sin valores ni lectura', () => {
    assert.equal(b.market.status, 'unavailable')
    assert.equal(b.market.research, null)
    assert.deepEqual([b.market.indicators, b.market.events, b.market.changes], [[], [], []])
    assert.equal(b.market.reading, null)
    assert.ok(titles(b).includes('Sin información de mercado'))
  })

  it('la parte personal sigue saliendo de la decisión', () => {
    assert.ok(b.personal.lead)
  })
})

describe('sin datos personales', () => {
  it('insufficient-data, con el mensaje de AXIS y sin recomendación', () => {
    const decision = decide({ context: buildFinancialContext(snapshot(), TODAY), market: marketOf(research()) })
    const b = buildWeeklyBrief(decision, marketOf(research()), NOW)
    assert.equal(b.personal.kind, 'insufficient-data')
    assert.equal(b.personal.lead, null)
    assert.equal(b.conclusion.recommendation, null)
    assert.ok(titles(b).includes('Sin datos personales suficientes'))
  })
})

describe('invariantes', () => {
  const variants: WeeklyBrief[] = [
    briefFor(),
    briefFor({ liquidCents: -645_000 }),
    briefFor({ market: null }),
    briefFor({ market: marketOf(research({ assetClasses: [CAUTION] }), [FUND.name]), extra: { positions: [FUND] } }),
    briefFor({ market: marketOf(research(), [], new Date(NOW.getTime() + 30 * DAY)), now: new Date(NOW.getTime() + 30 * DAY) }),
  ]

  it('ninguna recomendación prohibida (comprar, vender, timing, predicciones)', () => {
    for (const b of variants) assert.doesNotMatch(JSON.stringify(b), FORBIDDEN)
  })

  it('la recomendación es siempre la de la decisión: solo verbos cerrados de AXIS', () => {
    const allowed = new Set(['allocate', 'reserve', 'define', 'review', 'register', 'adjust', 'hold', 'complete-cushion', 'decide'])
    for (const b of variants) if (b.conclusion.recommendation) assert.ok(allowed.has(b.conclusion.recommendation.action.verb))
  })

  it('determinista: mismas entradas → mismo Brief', () => {
    assert.deepEqual(briefFor(), briefFor())
  })

  it('no-action: sin recomendación en la decisión, ninguna en el Brief', () => {
    const ctx = contextWith(800_000)
    const decision = { ...decide({ context: ctx }), recommendation: null }
    const b = buildWeeklyBrief(decision, null, NOW)
    assert.equal(b.personal.kind, 'no-action')
    assert.equal(b.conclusion.recommendation, null)
  })
})
