/**
 * Escenarios ilustrativos de la guía: cada tipo tiene supuestos, los
 * escenarios están ordenados, el interés fijo no tiene abanico y nada de esto
 * llega al chat ni al modelo.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { chatGuideOf, guideForPrompt } from '../guide/chat'
import { PRODUCT_TYPES } from '../guide/products'
import { defaultYears, monthsLabel, projectScenario, SCENARIO_ASSUMPTIONS, SCENARIO_NOTICE, SCENARIO_YEARS, scenarioSeries, type GrowthAssumption } from '../guide/scenarios'
import { config, gasto, ingreso, snapshot, TODAY } from './fixtures'

const growth = (id: string) => SCENARIO_ASSUMPTIONS[id] as GrowthAssumption

describe('supuestos', () => {
  it('cada tipo de la guía tiene los suyos, y no sobra ninguno', () => {
    assert.deepEqual(Object.keys(SCENARIO_ASSUMPTIONS).sort(), PRODUCT_TYPES.map((p) => p.id).sort())
  })

  it('los que no se pueden aproximar lo explican', () => {
    for (const [id, a] of Object.entries(SCENARIO_ASSUMPTIONS)) if (a.kind === 'none') assert.ok(a.reason.length > 20, id)
    for (const id of ['cripto', 'cripto-otras', 'etf-apalancado', 'crowdfunding-inmobiliario', 'stablecoins']) assert.equal(SCENARIO_ASSUMPTIONS[id].kind, 'none', id)
  })

  it('el aviso dice que no es una previsión y qué no incluye', () => {
    assert.match(SCENARIO_NOTICE, /no una previsión/)
    assert.match(SCENARIO_NOTICE, /comisiones, impuestos ni inflación/)
  })
})

describe('escenarios', () => {
  it('si va mal ≤ lo normal ≤ si va bien, en céntimos enteros, para todo tipo, cantidad y plazo', () => {
    for (const [id, a] of Object.entries(SCENARIO_ASSUMPTIONS)) {
      if (a.kind !== 'growth') continue
      for (const years of SCENARIO_YEARS) {
        const r = projectScenario(100_000, a, years)
        assert.ok(r.badCents <= r.midCents && r.midCents <= r.goodCents, `${id} ${years}`)
        for (const v of [r.badCents, r.midCents, r.goodCents]) assert.ok(Number.isSafeInteger(v) && v > 0, `${id} ${years}`)
      }
    }
  })

  it('lo normal es el interés compuesto del supuesto', () => {
    // 1.000 € al 7 % durante 10 años ≈ 1.967 €.
    assert.equal(projectScenario(100_000, growth('fondo-indexado'), 10).midCents, Math.round(100_000 * 1.07 ** 10))
  })

  it('una cuenta sin volatilidad no tiene abanico', () => {
    const r = projectScenario(100_000, growth('cuenta-deposito'), 5)
    assert.equal(r.badCents, r.midCents)
    assert.equal(r.goodCents, r.midCents)
  })

  it('más riesgo, abanico más abierto', () => {
    const spread = (id: string) => {
      const r = projectScenario(100_000, growth(id), 10)
      return r.goodCents - r.badCents
    }
    assert.ok(spread('bonos-estado') < spread('fondo-indexado'))
    assert.ok(spread('fondo-indexado') < spread('acciones-crecimiento'))
  })

  it('a 10 años, una empresa de crecimiento puede acabar perdiendo y un indexado, en el caso malo, apenas gana', () => {
    assert.ok(projectScenario(100_000, growth('acciones-crecimiento'), 10).badCents < 100_000)
    const bad = projectScenario(100_000, growth('fondo-indexado'), 10).badCents
    assert.ok(bad > 90_000 && bad < 120_000, String(bad))
  })

  it('la serie es mes a mes: empieza en lo que pones y acaba en el resultado', () => {
    const s = scenarioSeries(100_000, growth('etf'), 5)
    assert.equal(s.length, 61)
    assert.deepEqual([s[0].badCents, s[0].midCents, s[0].goodCents], [100_000, 100_000, 100_000])
    assert.deepEqual(s[60], projectScenario(100_000, growth('etf'), 5))
  })

  it('las etiquetas de tiempo se leen bien', () => {
    assert.deepEqual([0, 1, 5, 12, 15, 24, 38].map(monthsLabel), ['Hoy', '1 mes', '5 meses', '1 año', '1 año y 3 meses', '2 años', '3 años y 2 meses'])
  })

  it('plazo por defecto: corto para lo seguro, largo para la renta variable', () => {
    assert.equal(defaultYears(SCENARIO_ASSUMPTIONS['cuenta-deposito']), 1)
    assert.equal(defaultYears(SCENARIO_ASSUMPTIONS['bonos-estado']), 5)
    assert.equal(defaultYears(SCENARIO_ASSUMPTIONS['fondo-indexado']), 10)
  })
})

describe('nunca llega al chat', () => {
  it('el bloque de la guía del prompt no lleva escenarios ni supuestos', () => {
    const movements = [ingreso('2026-08-01', 200_000), gasto('2026-08-10', 100_000), ingreso('2026-09-01', 200_000), gasto('2026-09-05', 50_000)]
    const decision = decide({ context: buildFinancialContext(snapshot({ config: config(500_000), movements }), TODAY) })
    const guide = chatGuideOf('¿Qué tal un fondo indexado?', decision)
    assert.ok(guide)
    assert.doesNotMatch(JSON.stringify(guideForPrompt(guide)), /si va bien|si va mal|escenario|volatilidad|no una previsión/i)
  })
})
