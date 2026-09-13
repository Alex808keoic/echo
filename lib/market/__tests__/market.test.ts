import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { freshnessOf } from '../freshness'
import { buildMarketContext } from '../relevance'
import { MARKET_CONTEXT_LIMITS } from '../types'
import { hasCertaintyLanguage, MarketValidationError, parseMarketResearch } from '../validate'
import { history, NOW, research } from './fixtures'
import { buildFinancialContext } from '../../axis/context'
import { analyzeLocally } from '../../axis/local-engine'
import { buildAIRequest } from '../../axis/ai/prompt'
import { config, healthyMovements, position, snapshot, TODAY } from '../../axis/__tests__/fixtures'

describe('lib/market · validación', () => {
  it('acepta una investigación válida y la normaliza', () => {
    const r = parseMarketResearch(JSON.parse(JSON.stringify(research())))
    assert.equal(r.id, '2026-W37')
    assert.equal(r.indicators.length, 8)
    assert.equal(r.sources.length, 2)
  })

  it('rechaza JSON inválido o incompleto', () => {
    assert.throws(() => parseMarketResearch('texto'), MarketValidationError)
    assert.throws(() => parseMarketResearch({ id: '2026-W37' }), MarketValidationError)
    assert.throws(() => parseMarketResearch({ ...research(), sources: [] }), MarketValidationError)
    assert.throws(() => parseMarketResearch({ ...research(), id: 'semana-37' }), MarketValidationError)
    assert.throws(() => parseMarketResearch({ ...research(), sources: [{ name: 'x', url: 'http://inseguro', retrievedAt: NOW.toISOString(), type: 'data' }] }), MarketValidationError)
  })

  it('rechaza predicciones presentadas como certezas', () => {
    assert.ok(hasCertaintyLanguage('El S&P 500 va a subir.'))
    assert.ok(hasCertaintyLanguage('Los tipos bajarán en octubre.'))
    assert.ok(hasCertaintyLanguage('Rentabilidad garantizada.'))
    assert.equal(hasCertaintyLanguage('El índice ha subido un 3 % durante el periodo analizado.'), null)
    assert.equal(hasCertaintyLanguage('Los mercados podrían seguir volátiles según los datos disponibles.'), null)
    assert.throws(() => parseMarketResearch({ ...research(), overview: 'El IBEX va a subir la semana que viene.' }), /certeza/)
    assert.throws(() => parseMarketResearch({ ...research(), trends: [{ title: 'Subida', summary: 'El oro subirá.', horizon: 'weeks', confidence: 'alta' }] }), /certeza/)
  })
})

describe('lib/market · frescura y relevancia', () => {
  it('calcula la frescura por edad y marca stale', () => {
    assert.equal(freshnessOf('2026-09-12T06:00:00Z', NOW), 'fresh')
    assert.equal(freshnessOf('2026-09-01T06:00:00Z', NOW), 'aging')
    assert.equal(freshnessOf('2026-08-01T06:00:00Z', NOW), 'stale')
    assert.equal(freshnessOf('no es fecha', NOW), 'stale')
  })

  it('construye un MarketContext reducido y personalizado localmente', () => {
    const ctx = buildMarketContext(research(), history, ['Fondo Indexado Global', 'Cuenta remunerada'], NOW)
    assert.ok(ctx.keyIndicators.length <= MARKET_CONTEXT_LIMITS.indicators)
    assert.ok(ctx.relevantEvents.length <= MARKET_CONTEXT_LIMITS.events)
    assert.ok(ctx.history.length <= MARKET_CONTEXT_LIMITS.history)
    assert.deepEqual(ctx.relevantAssetClasses.map((a) => a.key), ['equity-global', 'cash'])
    assert.equal(ctx.keyIndicators[0].key, 'ecb-dfr')
    assert.equal(ctx.relevantEvents[0].title, 'El BCE mantiene los tipos')
    assert.ok(!ctx.history.some((h) => h.id === '2026-W37'), 'excluye la investigación actual del histórico')
    assert.equal(ctx.freshness, 'fresh')
    // Los nombres de las posiciones no se copian al contexto.
    assert.doesNotMatch(JSON.stringify(ctx), /Fondo Indexado Global|Cuenta remunerada/)
  })

  it('sin posiciones no hay clases relevantes, pero sí contexto general', () => {
    const ctx = buildMarketContext(research(), history, [], NOW)
    assert.equal(ctx.relevantAssetClasses.length, 0)
    assert.equal(ctx.keyIndicators.length, 6)
  })
})

describe('AXIS + MarketContext', () => {
  const financial = () =>
    buildFinancialContext(
      snapshot({ config: config(100_000), movements: healthyMovements(), positions: [position({ name: 'Fondo Indexado Global', valueCents: 150_000 })] }),
      TODAY,
    )

  it('el motor local funciona sin MarketContext (ausencia)', () => {
    const result = analyzeLocally({ context: financial() }, NOW)
    assert.equal(result.status, 'analysis')
    if (result.status !== 'analysis') return
    assert.ok(!result.analysis.interpretation.signals.some((s) => s.id.startsWith('market.')))
  })

  it('con investigación fresca aporta hechos y, si cruza una clase en caution, prudencia (nunca comprar/vender)', () => {
    const market = buildMarketContext(research(), history, ['Fondo Indexado Global'], NOW)
    const result = analyzeLocally({ context: financial(), market }, NOW)
    if (result.status !== 'analysis') throw new Error('unreachable')
    const ids = result.analysis.interpretation.signals.map((s) => s.id)
    assert.ok(ids.includes('market.caution:equity-global'))
    const text = JSON.stringify(result.analysis)
    assert.ok(ids.includes('market.snapshot'))
    assert.match(text, /Semana tranquila/)
    // Comprar/vender solo pueden aparecer negados, nunca como instrucción.
    assert.doesNotMatch(text, /\b(compra|vende)\b/i)
    assert.doesNotMatch(text, /\b(deberías|conviene|es momento de|puedes) (comprar|vender)\b/i)
    assert.ok(result.analysis.uncertainty.items.some((u) => /mercado/i.test(u.title)))
  })

  it('con investigación stale no emite recomendaciones de mercado', () => {
    const stale = research({ generatedAt: '2026-07-01T06:00:00Z' })
    const market = buildMarketContext(stale, history, ['Fondo Indexado Global'], NOW)
    assert.equal(market.freshness, 'stale')
    const result = analyzeLocally({ context: financial(), market }, NOW)
    if (result.status !== 'analysis') throw new Error('unreachable')
    const marketSignals = result.analysis.interpretation.signals.filter((s) => s.id.startsWith('market.'))
    assert.ok(marketSignals.every((s) => s.id === 'market.stale'))
    assert.ok(!marketSignals.some((s) => s.id.startsWith('market.caution')))
    assert.ok(result.analysis.uncertainty.items.some((u) => /desactualizado/i.test(u.title)))
  })

  it('el prompt de AXIS incluye el contexto de mercado reducido', () => {
    const market = buildMarketContext(research(), history, [], NOW)
    const req = buildAIRequest({ context: financial(), market })
    assert.match(req.user, /contexto_de_mercado/)
    assert.match(req.user, /"freshness":"fresh"/)
    assert.match(req.system, /contexto_de_mercado/)
  })
})
