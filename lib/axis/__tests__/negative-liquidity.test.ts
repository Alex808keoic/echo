/**
 * Líquido negativo: AXIS no puede leerlo como una situación sólida.
 * `liquidity.negative` (high) es distinta del mínimo declarado (`liquidity.below-min`):
 * una mira el signo del líquido; la otra, el colchón que fija el usuario.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { render } from '../compose'
import { LOCAL_RULES_ENGINE_INFO } from '../local-engine'
import { buildMarketContext } from '../../market/relevance'
import { history, NOW as MARKET_NOW, research } from '../../market/__tests__/fixtures'
import type { AxisDecision, AxisMemory, AxisAnalysis } from '../types'
import { config, healthyMovements, NOW, objective, position, snapshot, TODAY } from './fixtures'

/** healthyMovements deja +2.550,00 € netos: saldo inicial = líquido objetivo − 255.000. */
const NET = 255_000
const ctxWithLiquid = (liquidCents: number, extra: Parameters<typeof snapshot>[0] = {}) => buildFinancialContext(snapshot({ config: config(liquidCents - NET), movements: healthyMovements(), ...extra }), TODAY)
const minLiquidity = (cents: number): AxisMemory => ({ profileFacts: [{ id: 'mem-liq', updatedAt: 1, fact: { kind: 'minLiquidity', cents } }] })
const ids = (d: AxisDecision) => d.signals.map((s) => s.id)
const analysisOf = (d: AxisDecision): AxisAnalysis => {
  const r = render(d, LOCAL_RULES_ENGINE_INFO, NOW)
  assert.equal(r.status, 'analysis')
  return (r as { analysis: AxisAnalysis }).analysis
}

describe('A · líquido negativo', () => {
  const d = decide({ context: ctxWithLiquid(-645_000) })

  it('lidera una señal propia, con su recomendación, por delante del ahorro del mes', () => {
    assert.equal(d.lead?.id, 'liquidity.negative')
    assert.equal(d.lead?.priority, 'high')
    assert.match(d.lead!.fact, /-6\.450,00 €/)
    assert.deepEqual(d.recommendation?.action, { verb: 'review', target: 'data' })
  })

  it('la lectura ya no dice que la situación sea sólida ni que no haya nada urgente', () => {
    const a = analysisOf(d)
    const text = [a.headline, a.interpretation.summary, a.conclusion.summary].join(' ')
    assert.doesNotMatch(text, /sólida|No hay nada urgente|No hace falta actuar/)
    assert.match(a.conclusion.summary, /Conviene actuar sobre este punto/)
  })

  it('no habla de excedente que se asigna a objetivos (con el líquido en negativo no se asigna nada)', () => {
    const withGoal = decide({ context: ctxWithLiquid(-645_000, { objectives: [objective({ name: 'Viaje', targetCents: 500_000 })] }) })
    const healthy = withGoal.signals.find((s) => s.id === 'savings.healthy')
    assert.ok(healthy, 'el ahorro del mes sigue siendo un dato real')
    assert.doesNotMatch(healthy!.interpretation, /se asigna solo a tus objetivos/)
  })

  it('nunca recomienda invertir, comprar ni vender', () => {
    const verbs = d.signals.flatMap((s) => (s.recommendation ? [s.recommendation.action.verb as string] : []))
    assert.ok(!verbs.some((v) => /invest|buy|sell/.test(v)), verbs.join(','))
  })
})

describe('B · líquido cero no es negativo', () => {
  it('no activa la regla', () => {
    assert.ok(!ids(decide({ context: ctxWithLiquid(0) })).includes('liquidity.negative'))
  })
})

describe('C · positivo pero por debajo del mínimo declarado', () => {
  it('sigue mandando liquidity.below-min, sin la regla de negativo', () => {
    const d = decide({ context: ctxWithLiquid(100_000), memory: minLiquidity(500_000) })
    assert.ok(!ids(d).includes('liquidity.negative'))
    assert.equal(d.lead?.id, 'liquidity.below-min')
    assert.equal(d.recommendation?.action.verb, 'complete-cushion')
  })
})

describe('D · positivo y suficiente', () => {
  it('ninguna de las dos reglas de liquidez', () => {
    const d = decide({ context: ctxWithLiquid(800_000), memory: minLiquidity(500_000) })
    assert.ok(!ids(d).some((id) => id.startsWith('liquidity.')))
  })
})

describe('E · patrimonio y líquido negativos', () => {
  it('la lectura es la del líquido negativo aunque haya inversiones', () => {
    const ctx = ctxWithLiquid(-645_000, { positions: [position({ name: 'Fondo Global', investedCents: 150_000, valueCents: 158_000, fromLiquid: false })] })
    assert.ok(ctx.wealth.totalCents < 0, 'patrimonio negativo')
    const d = decide({ context: ctx })
    assert.equal(d.lead?.id, 'liquidity.negative')
    assert.match(d.lead!.fact, /patrimonio/)
  })

  it('con un mínimo declarado conviven las dos señales; lidera la de negativo', () => {
    const d = decide({ context: ctxWithLiquid(-645_000), memory: minLiquidity(500_000) })
    assert.deepEqual(ids(d).slice(0, 2), ['liquidity.negative', 'liquidity.below-min'])
  })

  it('sin saldo inicial no se juzga el signo (la liquidez no es calculable de forma válida)', () => {
    const ctx = buildFinancialContext(snapshot({ movements: healthyMovements().filter((m) => m.type === 'gasto') }), TODAY)
    assert.ok(ctx.wealth.liquidCents < 0)
    assert.ok(!ids(decide({ context: ctx })).includes('liquidity.negative'))
  })
})

describe('F · líquido negativo + prudencia de mercado', () => {
  it('la situación personal manda: el mercado no es la recomendación principal', () => {
    const caution = { key: 'equity-global', label: 'Renta variable global', aliases: ['global'], note: 'Valoraciones exigentes.', stance: 'caution' as const }
    const market = buildMarketContext(research({ assetClasses: [caution] }), history, ['Fondo Global'], MARKET_NOW)
    const ctx = ctxWithLiquid(-645_000, { positions: [position({ name: 'Fondo Global', investedCents: 150_000, valueCents: 158_000, fromLiquid: false })] })
    const d = decide({ context: ctx, market })
    assert.ok(ids(d).some((id) => id.startsWith('market.caution')), 'hay prudencia de mercado')
    assert.equal(d.lead?.id, 'liquidity.negative')
    assert.equal(d.recommendation?.action.verb, 'review')
  })
})
