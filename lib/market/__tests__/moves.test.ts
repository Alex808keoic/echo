/**
 * Movimientos fuertes de la bolsa: solo con datos vigentes, comparables y
 * separados entre 3 y 7 semanas; −8 % o +10 % como mínimo.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pickBaselineId, strongEquityMove, type MarketBaseline } from '../moves'
import type { MarketIndicator } from '../types'

const NOW = new Date('2026-10-21T12:00:00Z')
const idx = (key: string, value: number, asOf: string): MarketIndicator => ({ key, label: key === 'ibex' ? 'IBEX 35' : key, group: 'index', value, unit: 'pts', asOf, changePct: null, source: 'BdE' })
const base = (indicators: MarketIndicator[]): MarketBaseline => ({ id: '2026-W38', generatedAt: '2026-09-19T12:00:00Z', indicators })

describe('pickBaselineId', () => {
  it('la más reciente con al menos 3 semanas', () => {
    const history = ['2026-10-17', '2026-10-10', '2026-10-03', '2026-09-26', '2026-09-19'].map((d, i) => ({ id: `W${42 - i}`, generatedAt: `${d}T12:00:00Z`, overview: '' }))
    assert.equal(pickBaselineId(history, '2026-10-17T12:00:00Z'), 'W39')
    assert.equal(pickBaselineId(history.slice(0, 2), '2026-10-17T12:00:00Z'), null)
  })
})

describe('strongEquityMove', () => {
  it('una caída del 8 % o más', () => {
    const m = strongEquityMove([idx('ibex', 18_000, '2026-10-20')], base([idx('ibex', 19_831.8, '2026-09-17')]), NOW)
    assert.deepEqual(m && { key: m.key, pct: m.pct, direction: m.direction, days: m.days }, { key: 'ibex', pct: -9.2, direction: 'drop', days: 33 })
  })

  it('una subida del 10 % o más', () => {
    assert.equal(strongEquityMove([idx('ibex', 22_000, '2026-10-20')], base([idx('ibex', 19_831.8, '2026-09-17')]), NOW)?.direction, 'rise')
  })

  it('movimientos normales no cuentan', () => {
    assert.equal(strongEquityMove([idx('ibex', 19_092.4, '2026-10-20')], base([idx('ibex', 19_831.8, '2026-09-17')]), NOW), null)
  })

  it('sin dato vigente, sin fechas comparables o sin base, nada', () => {
    const old = base([idx('ibex', 19_831.8, '2026-09-17')])
    assert.equal(strongEquityMove([idx('ibex', 15_000, '2026-10-01')], old, NOW), null, 'dato actual antiguo')
    assert.equal(strongEquityMove([idx('ibex', 15_000, '2026-10-20')], base([idx('ibex', 19_831.8, '2026-10-10')]), NOW), null, 'demasiado cerca')
    assert.equal(strongEquityMove([idx('ibex', 15_000, '2026-10-20')], base([idx('ibex', 19_831.8, '2026-08')]), NOW), null, 'día frente a mes')
    assert.equal(strongEquityMove([idx('ibex', 15_000, '2026-10-20')], null, NOW), null)
  })

  it('con varios, el mayor', () => {
    const m = strongEquityMove(
      [idx('ibex', 18_000, '2026-10-20'), idx('stoxx50', 5_000, '2026-09')],
      base([idx('ibex', 19_831.8, '2026-09-17'), idx('stoxx50', 6_483.56, '2026-08')]),
      NOW,
    )
    assert.equal(m?.key, 'stoxx50')
  })
})
