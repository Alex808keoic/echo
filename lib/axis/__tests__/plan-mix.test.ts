/**
 * Mezcla del largo plazo (plan/mix.ts) y dinero parado: el plan decide en qué
 * TIPOS invertir según tu perfil, tus objetivos y tu patrimonio. Siempre tipos,
 * nunca productos; la parte arriesgada, pequeña y con condiciones.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { buildAllocationPlan, CUSHION_OBJECTIVE_NAME, IDLE_SPREAD_MONTHS, planSleeves, type AllocationPlan, type PlanStep } from '../plan/allocation'
import { describeStep } from '../plan/describe'
import { mixWeights, splitMix, RISKY_MAX_PCT } from '../plan/mix'
import { recommendGuide } from '../guide/recommend'
import { productFit } from '../guide/fit'
import { PRODUCT_TYPES } from '../guide/products'
import type { MemoryFact, RiskAttitude, Horizon } from '../profile/types'
import type { Movement, Objective } from '../../types'
import { config, gasto, ingreso, objective, snapshot, TODAY } from './fixtures'

/** Junio–agosto cerrados: 2.000 € de ingresos y 1.000 € de gasto; ahorro habitual 1.000 €/mes. */
const history3 = (): Movement[] => [...['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 200_000), gasto(`2026-${m}-10`, 100_000)]), ingreso('2026-09-01', 200_000)]
const CUSHION = () => objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 300_000, priority: 1 })
const COCHE = () => objective({ name: 'Coche', targetCents: 2_000_000, priority: 2 })
const profile = (riskAttitude: RiskAttitude, horizon: Horizon, extra: MemoryFact[] = []): MemoryFact[] => [{ kind: 'riskAttitude', value: riskAttitude }, { kind: 'horizon', value: horizon }, ...extra]

function setup(liquidCents: number, objectives: Objective[], facts: MemoryFact[]) {
  const movements = history3()
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  const ctx = buildFinancialContext(snapshot({ config: config(liquidCents - net), movements, objectives }), TODAY)
  const decision = decide({ context: ctx, memory: { profileFacts: facts.map((fact, i) => ({ id: `mem-${i}`, updatedAt: i + 1, fact })) } })
  return { plan: buildAllocationPlan(decision), objectives: decision.context.objectives, decision }
}
const step = <K extends PlanStep['kind']>(p: AllocationPlan, kind: K) => p.steps.find((s): s is Extract<PlanStep, { kind: K }> => s.kind === kind)
const weightsOf = (s: Extract<PlanStep, { kind: 'invest-long-term' | 'idle-money' }> | undefined) => Object.fromEntries((s?.mix ?? []).map((p) => [p.key, p.pct]))

describe('mezcla por perfil y plazo', () => {
  it('plazo largo: prudente 60/40, equilibrado 30/70, dinámico todo renta variable', () => {
    assert.deepEqual(mixWeights('conservative', 'long', false), { 'global-equity': 40, bonds: 60, risky: 0 })
    assert.deepEqual(mixWeights('balanced', 'long', false), { 'global-equity': 70, bonds: 30, risky: 0 })
    assert.deepEqual(mixWeights('dynamic', 'long', false), { 'global-equity': 100, bonds: 0, risky: 0 })
  })

  it('plazo medio: más renta fija en todos los perfiles', () => {
    for (const r of ['conservative', 'balanced', 'dynamic'] as const) assert.ok(mixWeights(r, 'medium', false).bonds > mixWeights(r, 'long', false).bonds, r)
  })

  it('el reparto suma exactamente lo que se invierte, en euros enteros', () => {
    const parts = splitMix(33_300, { 'global-equity': 70, bonds: 30, risky: 0 })
    assert.equal(parts.reduce((t, p) => t + p.cents, 0), 33_300)
    assert.deepEqual(parts.map((p) => p.key), ['global-equity', 'bonds'])
  })

  it('en el plan: un prudente con objetivos a largo plazo pone la mayor parte en renta fija', () => {
    const { plan } = setup(800_000, [CUSHION(), COCHE()], profile('conservative', 'long'))
    const invest = step(plan, 'invest-long-term')
    assert.equal(invest?.pct, 20)
    assert.deepEqual(weightsOf(invest), { 'global-equity': 40, bonds: 60 })
  })
})

describe('cuánto invertir según tus objetivos', () => {
  it('con objetivos pendientes: 20 / 40 / 60 %', () => {
    for (const [r, pct] of [['conservative', 20], ['balanced', 40], ['dynamic', 60]] as const) assert.equal(setup(800_000, [CUSHION(), COCHE()], profile(r, 'long')).plan.longTerm.pct, pct)
  })

  it('sin objetivos pendientes: 40 / 70 / 90 %, y lo dice', () => {
    for (const [r, pct] of [['conservative', 40], ['balanced', 70], ['dynamic', 90]] as const) {
      const s = setup(300_000, [CUSHION()], profile(r, 'long'))
      const invest = step(s.plan, 'invest-long-term')!
      assert.equal(invest.pct, pct)
      assert.equal(invest.noObjectives, true)
      assert.match(describeStep(invest, s.plan, s.objectives).detail!, /no tienes objetivos pendientes/)
    }
  })

  it('sin objetivos, lo que sobra se queda en el líquido y no dice «a tus objetivos»', () => {
    const s = setup(300_000, [CUSHION()], profile('balanced', 'long'))
    const rest = step(s.plan, 'rest-to-objectives')!
    assert.equal(rest.noObjectives, true)
    assert.equal(describeStep(rest, s.plan, s.objectives).title, '300,00 € al mes se quedan en tu dinero líquido')
  })
})

describe('parte arriesgada', () => {
  // 5.000 € parados (8.000 − colchón 3.000) = 5 meses de gasto: suficiente.
  const rich = (facts: MemoryFact[], objectives: Objective[] = [CUSHION()]) => setup(800_000, objectives, facts)

  it(`dinámico, plazo largo, colchón completo y dinero parado de sobra: como mucho el ${RISKY_MAX_PCT} %, con aviso`, () => {
    const s = rich(profile('dynamic', 'long'))
    const invest = step(s.plan, 'invest-long-term')!
    assert.deepEqual(weightsOf(invest), { 'global-equity': 90, risky: 10 })
    const v = describeStep(invest, s.plan, s.objectives)
    assert.match(v.warning!, /podrías perder entero/)
    assert.ok(planSleeves(s.plan).has('risky'))
  })

  it('no hace falta ser mayor de edad, pero se explica que lo haría un adulto y que muchas plataformas piden 18 años', () => {
    const s = rich(profile('dynamic', 'long', [{ kind: 'adult', value: false }]))
    const invest = step(s.plan, 'invest-long-term')!
    assert.equal(weightsOf(invest).risky, 10)
    assert.match(describeStep(invest, s.plan, s.objectives).note!, /un adulto a tu nombre.*18 años/)
  })

  it('no hay parte arriesgada si falta cualquier condición', () => {
    assert.equal(weightsOf(step(rich(profile('balanced', 'long')).plan, 'invest-long-term')).risky, undefined, 'perfil equilibrado')
    assert.equal(weightsOf(step(rich(profile('dynamic', 'medium')).plan, 'invest-long-term')).risky, undefined, 'plazo medio')
    assert.equal(weightsOf(step(setup(400_000, [CUSHION()], profile('dynamic', 'long')).plan, 'invest-long-term')).risky, undefined, 'poco dinero parado')
    const late = objective({ name: 'Viaje', targetCents: 4_000_000, targetDate: '2027-03-15', priority: 2 })
    assert.equal(weightsOf(step(rich(profile('dynamic', 'long'), [CUSHION(), late]).plan, 'invest-long-term')).risky, undefined, 'objetivo cercano con retraso')
  })
})

describe('dinero parado', () => {
  it('propone las dos formas (de una vez o en 6 meses) con la misma mezcla, y deja elegir', () => {
    const s = setup(800_000, [CUSHION()], profile('balanced', 'long'))
    const idle = step(s.plan, 'idle-money')!
    assert.equal(idle.idleCents, 500_000)
    assert.equal(idle.safe, false)
    assert.equal(idle.spreadMonths, IDLE_SPREAD_MONTHS)
    assert.equal(idle.perMonthCents, 83_300)
    assert.equal(idle.mix.reduce((t, p) => t + p.cents, 0), 500_000)
    const v = describeStep(idle, s.plan, s.objectives)
    assert.equal(v.title, 'Tienes 5.000,00 € sin destino')
    assert.match(v.detail!, /de una vez o poco a poco, 833,00 € al mes durante 6 meses.*Tú eliges/)
  })

  it('con plazo corto, propone ahorro seguro y no inversión', () => {
    const s = setup(800_000, [CUSHION()], profile('dynamic', 'short'))
    const idle = step(s.plan, 'idle-money')!
    assert.equal(idle.safe, true)
    assert.deepEqual(idle.mix, [])
    assert.match(describeStep(idle, s.plan, s.objectives).detail!, /ahorro seguro/)
  })

  it('el dinero que necesitan tus objetivos no está parado', () => {
    assert.equal(step(setup(800_000, [CUSHION(), COCHE()], profile('balanced', 'long')).plan, 'idle-money'), undefined)
  })

  it('sin perfil no propone nada con el dinero parado', () => {
    assert.equal(step(setup(800_000, [CUSHION()], []).plan, 'idle-money'), undefined)
  })
})

describe('la Guía dice lo mismo que el plan', () => {
  const type = (family: string) => PRODUCT_TYPES.find((t) => t.family === family)!

  it('renta fija encaja si el plan la incluye; lo arriesgado solo si el plan tiene parte arriesgada', () => {
    const conservative = setup(800_000, [CUSHION(), COCHE()], profile('conservative', 'long'))
    assert.equal(productFit(type('bonds'), conservative.plan, conservative.decision.profile.fields).verdict, 'fits')
    assert.equal(productFit(type('speculative'), conservative.plan, conservative.decision.profile.fields).verdict, 'outside-plan')
    const dynamicRich = setup(800_000, [CUSHION()], profile('dynamic', 'long'))
    assert.equal(productFit(type('speculative'), dynamicRich.plan, dynamicRich.decision.profile.fields).verdict, 'fits')
  })

  it('destaca el tipo con más peso en tu mezcla', () => {
    const balanced = setup(800_000, [CUSHION(), COCHE()], profile('balanced', 'long'))
    assert.equal(recommendGuide(balanced.plan, balanced.decision.profile.fields).lead.group.id, 'fondos')
    const conservative = setup(800_000, [CUSHION(), COCHE()], profile('conservative', 'long'))
    assert.equal(recommendGuide(conservative.plan, conservative.decision.profile.fields).lead.group.id, 'renta-fija')
  })
})
