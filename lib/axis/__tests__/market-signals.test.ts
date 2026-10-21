/**
 * «El mercado y tu plan»: señales con tus datos y los del mercado vigentes.
 * Nunca cambian lo que inviertes ni nombran productos o entidades.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { freshValue, marketSignals, safeRatePct, type MarketSignalsInput } from '../plan/market-signals'
import { repricing } from '../../finance/debts'
import type { ContextIndicator } from '../../market/types'
import type { Debt } from '../../types'

const ind = (key: string, value: number, freshness: ContextIndicator['freshness'] = 'fresh'): ContextIndicator => ({
  key,
  label: key,
  group: 'rate',
  value,
  unit: '%',
  asOf: '2026-10-20',
  changePct: null,
  source: 'BCE',
  freshness,
})
const DROP = { key: 'ibex', label: 'IBEX 35', pct: -9.2, direction: 'drop' as const, days: 33, asOf: '2026-10-20' }
const hipoteca: Debt = { id: 'h', name: 'Hipoteca', balanceCents: 15_000_000, aprBp: 250, monthlyPaymentCents: 80_000, variableSpreadBp: 90, createdAt: 1, updatedAt: 1 }
const input = (over: Partial<MarketSignalsInput> = {}): MarketSignalsInput => ({
  indicators: [ind('ecb-dfr', 2.5), ind('euribor-12m', 3.245)],
  move: null,
  invests: true,
  inflation: { pct: 4.9, source: 'ine', asOf: '2026-09' },
  debts: [],
  ...over,
})
const ids = (i: MarketSignalsInput) => marketSignals(i).map((s) => s.id)

describe('bolsa', () => {
  it('una caída fuerte: calma, el plan no cambia', () => {
    const [s] = marketSignals(input({ move: DROP, indicators: [] }))
    assert.equal(s.id, 'equity-drop')
    assert.equal(s.tone, 'calm')
    assert.match(s.title, /9,2 %/)
    assert.match(s.text, /tu plan no cambia/)
  })

  it('solo si inviertes', () => {
    assert.ok(!ids(input({ move: DROP, invests: false })).includes('equity-drop'))
  })
})

describe('ahorro seguro frente a la inflación', () => {
  it('BCE por debajo de la inflación: lo dice y da la referencia para comparar', () => {
    const s = marketSignals(input()).find((x) => x.id === 'safe-vs-inflation')
    assert.equal(s?.title, 'Tu ahorro seguro no le gana a la inflación')
    assert.match(s?.text ?? '', /2,5 %/)
    assert.match(s?.text ?? '', /4,9 %/)
  })

  it('sin tipo del BCE vigente o sin IPC real, no se dice nada', () => {
    assert.ok(!ids(input({ indicators: [ind('ecb-dfr', 2.5, 'stale')] })).includes('safe-vs-inflation'))
    assert.ok(!ids(input({ inflation: { pct: 2, source: 'assumption' } })).includes('safe-vs-inflation'))
  })

  it('el tipo del BCE vigente es la referencia del ahorro seguro', () => {
    assert.equal(safeRatePct([ind('ecb-dfr', 2.5)]), 2.5)
    assert.equal(safeRatePct([ind('ecb-dfr', 2.5, 'stale')]), null)
    assert.equal(freshValue([ind('euribor-12m', 3.245)], 'euribor-12m'), 3.245)
  })
})

describe('deudas variables', () => {
  it('estima la cuota de la próxima revisión con Euríbor + diferencial, en el mismo plazo', () => {
    const r = repricing(hipoteca, 3.245)
    assert.equal(r?.newAprPct, 4.145)
    assert.ok(r && r.newPaymentCents > hipoteca.monthlyPaymentCents, 'con más interés, más cuota')
    assert.equal(repricing({ ...hipoteca, variableSpreadBp: undefined }, 3.245), null, 'una deuda fija no se revisa')
  })

  it('avisa si la cuota cambia; sin Euríbor vigente, no', () => {
    const s = marketSignals(input({ debts: [hipoteca] })).find((x) => x.id === 'variable-debt:h')
    assert.equal(s?.tone, 'warning')
    assert.match(s?.title ?? '', /podría subir/)
    assert.ok(!ids(input({ debts: [hipoteca], indicators: [ind('euribor-12m', 3.245, 'stale')] })).some((id) => id.startsWith('variable-debt')))
  })
})

describe('dinero sin destino', () => {
  it('con tus cifras: lo que pierde al año con la inflación de hoy', () => {
    const s = marketSignals(input({ idleCents: 400_000 })).find((x) => x.id === 'idle-loss')
    assert.match(s?.title ?? '', /4\.000,00 €/)
    assert.match(s?.title ?? '', /196,00 €/)
    assert.ok(!ids(input()).includes('idle-loss'), 'solo si se pide')
  })
})

describe('nunca productos ni entidades', () => {
  it('ningún texto nombra marcas o bancos ni manda comprar o vender', () => {
    const all = marketSignals(input({ move: DROP, debts: [hipoteca], idleCents: 400_000 }))
    for (const s of all) assert.doesNotMatch(`${s.title} ${s.text}`, /\b(cómpra\w*|compra (ya|ahora)|vende (ya|ahora)|BBVA|Santander|ING|Revolut|Trade Republic|MyInvestor)\b/i, s.id)
  })
})
