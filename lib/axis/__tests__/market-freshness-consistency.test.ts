/**
 * Mercado coherente con la frescura de cada dato:
 *  - la lectura de la investigación semanal (overview) va fechada y sus cifras
 *    nunca se aceptan como actuales: el job diario puede haberlas superado;
 *  - con la investigación desactualizada, los indicadores que el job diario sí
 *    refrescó se usan como hechos, sin lectura, eventos, prudencia ni recomendación;
 *  - la situación personal sigue mandando sobre el mercado.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AI_ENGINE_INFO } from '../ai-engine'
import { buildChatGuard, validateChatReply } from '../chat/semantic'
import type { ChatInput } from '../chat/types'
import { parseChatReply } from '../chat/validate'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { validateExpression } from '../core/semantic'
import { buildMarketContext } from '../../market/relevance'
import type { MarketContext, MarketIndicator, MarketResearch } from '../../market/types'
import { history, NOW as MARKET_NOW, research } from '../../market/__tests__/fixtures'
import type { AxisDecision, AxisMemory } from '../types'
import { config, healthyMovements, NOW, position, snapshot, TODAY } from './fixtures'

const CAUTION = { key: 'equity-global', label: 'Renta variable global', aliases: ['global', 'msci'], note: 'Valoraciones exigentes en el periodo analizado.', stance: 'caution' as const }
const OVERVIEW_WITH_FIGURES = 'El Euríbor a 12 meses se sitúa en el 2,15 % y el BCE mantiene el tipo de depósito en el 2 %.'

/** La investigación del sábado 12-09 y, el lunes 14-09, el job diario refresca el Euríbor (2,15 % → 2,45 %). */
function refreshed(overrides: Partial<MarketResearch> = {}): MarketResearch {
  const base = research({ overview: OVERVIEW_WITH_FIGURES, assetClasses: [CAUTION], ...overrides })
  return { ...base, indicators: base.indicators.map((i) => (i.key === 'euribor-12m' ? { ...i, value: 2.45, asOf: '2026-09-14' } : i)) }
}
const marketOf = (r: MarketResearch, positions: string[] = []): MarketContext => buildMarketContext(r, history, positions, MARKET_NOW)
const financial = (withPosition = false, initial = 100_000) =>
  buildFinancialContext(snapshot({ config: config(initial), movements: healthyMovements(), positions: withPosition ? [position({ name: 'Fondo MSCI Global', investedCents: 150_000, valueCents: 158_000 })] : [] }), TODAY)
const signal = (d: AxisDecision, id: string) => d.signals.find((s) => s.id === id)
const marketIds = (d: AxisDecision) => d.signals.filter((s) => s.domain === 'market').map((s) => s.id)

const chatVerdict = (text: string, market: MarketContext, extra: Partial<ChatInput> = {}) => {
  const input: ChatInput = { context: financial(), market, conversation: { summary: null, recent: [] }, message: '¿Cómo está el Euríbor?', ...extra }
  return validateChatReply(parseChatReply({ reply: text, confidence: 'media', nextStep: null, memoryProposal: null, engine: AI_ENGINE_INFO, generatedAt: NOW.toISOString() }), buildChatGuard(input))
}
const figureViolations = (v: ReturnType<typeof chatVerdict>) => (v.ok ? [] : v.violations.filter((x) => x.invariant === 'figures').map((x) => x.detail))

describe('A · indicador fresco + overview con una cifra ya superada', () => {
  const market = marketOf(refreshed())
  const d = decide({ context: financial(), market })

  it('el hecho usa el valor fresco; la lectura de la investigación va fechada', () => {
    const snap = signal(d, 'market.snapshot')!
    assert.match(snap.fact, /Euríbor 12 meses: 2,45 % \(2026-09-14, Banco de España\)/)
    assert.equal(snap.interpretation, `Según la investigación del 2026-09-12 (puede no reflejar datos publicados después): ${OVERVIEW_WITH_FIGURES}`)
    assert.ok(d.relevant.some((s) => s.id === 'market.snapshot'), 'la señal llega a la lectura')
  })

  it('chat: la cifra fresca se acepta; la antigua del overview, presentada como actual, se rechaza', () => {
    assert.deepEqual(chatVerdict('El Euríbor a 12 meses está en el 2,45 %.', market), { ok: true })
    assert.ok(figureViolations(chatVerdict('El Euríbor a 12 meses está en el 2,15 %.', market)).some((x) => /2,15 %/.test(x)))
  })

  it('análisis con IA: repetir la cifra del overview también se rechaza (vuelve la redacción local)', () => {
    const expression = {
      headline: 'Lectura de AXIS.',
      interpretation: { summary: 'Situación estable.', signals: d.relevant.map((s) => ({ id: s.id, text: s.id === 'market.snapshot' ? 'El Euríbor está en el 2,15 %.' : s.interpretation })) },
      recommendationWhy: d.recommendation ? d.recommendation.why : null,
      alternatives: d.alternatives.map((a) => ({ name: a.name, summary: a.summary })),
      uncertainties: d.uncertainties.map((u) => ({ title: u.title, detail: u.detail })),
      conclusion: 'Sigue así.',
    }
    const verdict = validateExpression(d, expression)
    assert.equal(verdict.ok, false)
    assert.ok(!verdict.ok && verdict.violations.some((v) => v.invariant === 'figures' && /2,15 %/.test(v.detail)))
  })
})

describe('B · overview sin cifras', () => {
  it('igual que antes salvo la fecha: mismos hechos, misma decisión', () => {
    const plain = research()
    const d = decide({ context: financial(), market: marketOf(plain) })
    const snap = signal(d, 'market.snapshot')!
    assert.equal(snap.interpretation, `Según la investigación del 2026-09-12 (puede no reflejar datos publicados después): ${plain.overview}`)
    assert.match(snap.fact, /^Mercado \(reciente, 2026-09-05 → 2026-09-12\): /)
    assert.deepEqual(marketIds(d), ['market.snapshot'])
  })
})

describe('C · investigación desactualizada + indicadores frescos (job diario)', () => {
  const stale = refreshed({ generatedAt: '2026-07-01T06:00:00Z' })
  const market = marketOf(stale, ['Fondo MSCI Global'])
  const d = decide({ context: financial(true), market })

  it('aviso + hechos de los indicadores frescos, con valor, fecha y fuente', () => {
    assert.equal(market.freshness, 'stale')
    assert.deepEqual(marketIds(d), ['market.stale', 'market.indicators'])
    const fact = signal(d, 'market.indicators')!.fact
    assert.match(fact, /Euríbor 12 meses: 2,45 % \(2026-09-14, Banco de España\)/)
    assert.match(fact, /BCE · facilidad de depósito: 2 % \(2026-09-11, BCE\)/)
  })

  it('sin overview, sin eventos, sin prudencia y sin ninguna recomendación de mercado', () => {
    const texts = JSON.stringify(d.signals.filter((s) => s.domain === 'market'))
    assert.ok(!texts.includes(OVERVIEW_WITH_FIGURES))
    for (const e of market.relevantEvents) assert.ok(!texts.includes(e.title), e.title)
    assert.ok(!marketIds(d).some((id) => id.startsWith('market.caution')))
    assert.ok(d.signals.filter((s) => s.domain === 'market').every((s) => s.recommendation === undefined))
  })

  it('chat: el indicador fresco se puede citar; la cifra antigua, no', () => {
    assert.deepEqual(chatVerdict('El Euríbor a 12 meses está en el 2,45 %.', market), { ok: true })
    assert.ok(figureViolations(chatVerdict('El Euríbor a 12 meses está en el 2,15 %.', market)).length > 0)
  })
})

describe('D · investigación desactualizada y ningún indicador fresco', () => {
  it('solo el aviso; ningún valor antiguo como actual', () => {
    const old: MarketIndicator[] = research().indicators.map((i) => ({ ...i, asOf: i.asOf.length === 7 ? '2026-03' : '2026-05-04' }))
    const market = marketOf(research({ generatedAt: '2026-07-01T06:00:00Z', indicators: old }))
    assert.ok(market.keyIndicators.every((i) => i.freshness !== 'fresh'))
    const d = decide({ context: financial(), market })
    assert.deepEqual(marketIds(d), ['market.stale'])
    const fact = signal(d, 'market.stale')!.fact
    for (const i of old) {
      const written = i.unit === '%' ? `${String(i.value).replace('.', ',')} %` : `${i.value!.toLocaleString('es-ES')} pts`
      assert.ok(!fact.includes(written), `${i.key}: «${written}» no aparece`)
    }
  })
})

describe('E · colchón sin cubrir + mercado: la situación personal manda', () => {
  it('la recomendación principal es completar el colchón; el mercado nunca compra, vende ni invierte', () => {
    const memory: AxisMemory = { profileFacts: [{ id: 'mem-liq', updatedAt: 1, fact: { kind: 'minLiquidity', cents: 5_000_000 } }] }
    const market = marketOf(refreshed(), ['Fondo MSCI Global'])
    assert.ok(decide({ context: financial(true), market }).signals.some((s) => s.id.startsWith('market.caution')), 'hay prudencia de mercado')
    const d = decide({ context: financial(true), market, memory })
    assert.equal(d.lead?.id, 'liquidity.below-min')
    assert.equal(d.recommendation?.action.verb, 'complete-cushion')
    const marketVerbs = d.signals.filter((s) => s.domain === 'market' && s.recommendation).map((s) => s.recommendation!.action.verb)
    assert.ok(marketVerbs.every((v) => v === 'hold'), marketVerbs.join(','))
    const allVerbs = d.signals.flatMap((s) => (s.recommendation ? [s.recommendation.action.verb as string] : []))
    assert.ok(!allVerbs.some((v) => /invest|buy|sell/.test(v)), allVerbs.join(','))
  })
})
