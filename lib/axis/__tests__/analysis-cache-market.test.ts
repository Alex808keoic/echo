/**
 * La caché del análisis distingue el mercado por los indicadores que AXIS usa,
 * no solo por `researchId@freshness`: el job diario refresca indicadores sin
 * cambiar la investigación, y el análisis anterior no debe reutilizarse.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createAnalysisCache, marketCacheKey, type AnalyzeFn } from '../analysis-cache'
import type { FinancialSnapshot } from '../context'
import { buildMarketContext } from '../../market/relevance'
import { history, NOW, research } from '../../market/__tests__/fixtures'
import type { MarketContext, MarketResearch } from '../../market/types'
import type { AxisResult } from '../types'

const snapshot: FinancialSnapshot = { config: null, movements: [], objectives: [], positions: [] }
const marketOf = (r: MarketResearch, now = NOW) => buildMarketContext(r, history, [], now)
/** Mismo `researchId` y misma frescura: lo que hace el job diario. */
const refresh = (r: MarketResearch, key: string, change: Partial<MarketResearch['indicators'][number]>): MarketResearch => ({
  ...r,
  indicators: r.indicators.map((i) => (i.key === key ? { ...i, ...change } : i)),
})

function countingCache() {
  const calls: Array<MarketContext | null> = []
  const analyze: AnalyzeFn = async (_s, _mode, market) => {
    calls.push(market ?? null)
    return { status: 'no-analysis' } as unknown as AxisResult
  }
  return { cache: createAnalysisCache(analyze), calls }
}

describe('caché del análisis · mercado', () => {
  const base = research()

  it('G · mismos indicadores → misma clave (la caché sigue sirviendo)', async () => {
    assert.equal(marketCacheKey(marketOf(base)), marketCacheKey(marketOf(research())))
    const { cache, calls } = countingCache()
    await cache.resultFor(snapshot, false, marketOf(base), null)
    await cache.resultFor(snapshot, false, marketOf(research()), null)
    assert.equal(calls.length, 1)
  })

  it('H · cambia el valor o la fecha de un indicador clave → otra clave', () => {
    const a = marketCacheKey(marketOf(base))
    assert.notEqual(marketCacheKey(marketOf(refresh(base, 'euribor-12m', { value: 2.45 }))), a)
    assert.notEqual(marketCacheKey(marketOf(refresh(base, 'euribor-12m', { asOf: '2026-09' }))), a)
  })

  it('I · un indicador que no llega al contexto de AXIS no invalida', () => {
    // pickIndicators deja 6 indicadores clave; «dax» no está entre ellos.
    assert.ok(!marketOf(base).keyIndicators.some((i) => i.key === 'dax'))
    assert.equal(marketCacheKey(marketOf(refresh(base, 'dax', { value: 99_999, asOf: '2026-09-14' }))), marketCacheKey(marketOf(base)))
  })

  it('J · refresco diario de un indicador usado → no se reutiliza el análisis anterior', async () => {
    const { cache, calls } = countingCache()
    const before = marketOf(base)
    const after = marketOf(refresh(base, 'euribor-12m', { value: 2.45, asOf: '2026-09-14' }))
    assert.equal(after.researchId, before.researchId)
    assert.equal(after.freshness, before.freshness)
    await cache.resultFor(snapshot, false, before, null)
    await cache.resultFor(snapshot, false, after, null)
    assert.equal(calls.length, 2, 'se vuelve a analizar con los indicadores nuevos')
    assert.equal(calls[1]!.keyIndicators.find((i) => i.key === 'euribor-12m')!.value, 2.45)
  })

  it('J · un indicador que deja de ser fresco con el tiempo también cambia la clave', () => {
    const later = new Date(NOW.getTime() + 30 * 86_400_000)
    assert.notEqual(marketCacheKey(marketOf(base, later)), marketCacheKey(marketOf(base)))
  })

  it('K · mismo contenido en otro orden → misma clave', () => {
    const shuffled = { ...base, indicators: [...base.indicators].reverse() }
    const a = marketOf(base)
    const b = marketOf(shuffled)
    assert.deepEqual(new Set(a.keyIndicators.map((i) => i.key)), new Set(b.keyIndicators.map((i) => i.key)))
    assert.equal(marketCacheKey(b), marketCacheKey(a))
  })

  it('sin mercado, clave estable', () => {
    assert.equal(marketCacheKey(null), 'none')
  })
})
