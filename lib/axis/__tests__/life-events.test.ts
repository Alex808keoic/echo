/**
 * «Me ha pasado algo» (2026-10-21): cada cambio de vida dice qué revisar y
 * lleva a un sitio que existe. Nunca recomienda productos ni mueve dinero.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { LIFE_EVENTS } from '../plan/life-events'
import { simulate, type ScenarioKind } from '../plan/simulate'

const SCENARIOS: readonly ScenarioKind[] = ['purchase', 'loan', 'income', 'expense', 'no-income', 'home', 'job', 'move-out']

describe('me ha pasado algo', () => {
  it('ids únicos; cada cambio con consejo y al menos una acción', () => {
    assert.equal(new Set(LIFE_EVENTS.map((e) => e.id)).size, LIFE_EVENTS.length)
    for (const e of LIFE_EVENTS) {
      assert.ok(e.advice.length > 20, e.id)
      assert.ok(e.actions.length >= 1 && e.actions.length <= 2, e.id)
    }
  })

  it('las simulaciones a las que lleva son escenarios del simulador', () => {
    assert.equal(typeof simulate, 'function')
    for (const e of LIFE_EVENTS) for (const a of e.actions) if (a.action.kind === 'simulate') assert.ok(SCENARIOS.includes(a.action.scenario), `${e.id}: ${a.action.scenario}`)
  })

  it('sin productos, entidades ni órdenes de comprar o vender', () => {
    const text = LIFE_EVENTS.map((e) => `${e.label} ${e.advice} ${e.actions.map((a) => a.label).join(' ')}`).join(' ').toLowerCase()
    for (const word of ['etf', 'fondo indexado', 'bitcoin', 'banco', 'bróker', 'broker', 'cómpralo', 'vende', 'depósito']) assert.equal(text.includes(word), false, word)
  })

  it('sin cifras: los importes los pone tu plan', () => {
    for (const e of LIFE_EVENTS) assert.equal(/\d+\s*(€|%)/.test(e.advice), false, e.id)
  })
})
