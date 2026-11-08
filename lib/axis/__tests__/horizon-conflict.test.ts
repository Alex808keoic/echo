/**
 * 2026-11-08 (revisión como asesor de un caso real): un menor con perfil «2 a 5 años» y un objetivo
 * «sigue creciendo» a 2 años y medio recibía un 70 % de renta variable, mientras la propia app decía
 * que la renta variable es «solo para dinero de más de 5 años». Ahora el plan no adivina: usa la
 * mezcla del plazo de tu perfil y te pregunta (paso `confirm-horizon`). La renta fija, de corto plazo.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { buildAllocationPlan, horizonInDoubt, type AllocationPlan, type PlanStep } from '../plan/allocation'
import { describeStep } from '../plan/describe'
import { monthChecklist } from '../plan/checklist'
import { idealSplit } from '../plan/ideal-split'
import { recommendGuide } from '../guide/recommend'
import { productFit } from '../guide/fit'
import { PRODUCT_TYPES } from '../guide/products'
import type { MemoryFact } from '../profile/types'
import type { Movement, Objective } from '../../types'
import { config, gasto, ingreso, objective, snapshot, TODAY } from './fixtures'

type H = 'medium' | 'long' | 'short'
const facts = (horizon: H): MemoryFact[] => [
  { kind: 'riskAttitude', value: 'balanced' },
  { kind: 'horizon', value: horizon },
  { kind: 'irregularIncome', value: true },
  { kind: 'adult', value: false },
]
const habitual: Movement[] = ['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 3_500), gasto(`2026-${m}-10`, 2_400)])
const goal = (extra: Partial<Objective> = {}) => objective({ name: 'Patrimonio ideal 18 años', targetCents: 500_000, targetDate: '2029-03-15', ...extra })

function setup(objectives: Objective[], horizon: H = 'medium') {
  const net = habitual.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  const ctx = buildFinancialContext(snapshot({ config: config(110_000 - net), movements: habitual, objectives }), TODAY)
  const decision = decide({ context: ctx, memory: { profileFacts: facts(horizon).map((fact, i) => ({ id: `mem-${i}`, updatedAt: i + 1, fact })) } })
  return { decision, plan: buildAllocationPlan(decision) }
}
const step = <K extends PlanStep['kind']>(p: AllocationPlan, kind: K) => p.steps.find((s): s is Extract<PlanStep, { kind: K }> => s.kind === kind)
const pctOf = (mix: readonly { key: string; pct: number }[], key: string) => mix.find((p) => p.key === key)?.pct ?? 0
const typeById = (id: string) => PRODUCT_TYPES.find((t) => t.id === id)!

describe('plazo en duda: «sigue creciendo» cercano con un perfil de 2 a 5 años', () => {
  it('detecta la duda solo cuando de verdad la hay', () => {
    assert.equal(horizonInDoubt({ keepGrowing: true, monthsLeft: 30 }, 'medium'), true)
    assert.equal(horizonInDoubt({ keepGrowing: true, monthsLeft: 30 }, 'short'), true)
    assert.equal(horizonInDoubt({ keepGrowing: true }, 'medium'), true)
    assert.equal(horizonInDoubt({ keepGrowing: true, monthsLeft: 30 }, 'long'), false)
    assert.equal(horizonInDoubt({ keepGrowing: true, monthsLeft: 80 }, 'medium'), false)
    assert.equal(horizonInDoubt({ monthsLeft: 30 }, 'medium'), false)
  })

  it('caso real: la mezcla es la de su plazo (50/50 equilibrado), no 70/30, y el plan pregunta', () => {
    const { plan } = setup([goal({ keepGrowing: true })])
    const money = step(plan, 'invest-goal-money')!
    assert.equal(pctOf(money.mix, 'global-equity'), 50)
    assert.equal(pctOf(money.mix, 'bonds'), 50)
    assert.equal(money.mediumHorizon, true)
    const forGoals = step(plan, 'invest-for-goals')
    if (forGoals) assert.equal(pctOf(forGoals.mix, 'global-equity'), 50)
    const ask = step(plan, 'confirm-horizon')
    assert.ok(ask, 'el plan pregunta por el plazo')
    // La pregunta va antes de los pasos de inversión.
    assert.ok(plan.steps.indexOf(ask) < plan.steps.indexOf(money))
  })

  it('la pregunta se entiende y lleva a «Tu perfil»; la lista del mes la incluye', () => {
    const { decision, plan } = setup([goal({ keepGrowing: true })])
    const objectives = decision.context.objectives
    const view = describeStep(step(plan, 'confirm-horizon')!, plan, objectives)
    assert.match(view.title, /Patrimonio ideal 18 años/)
    assert.match(view.detail ?? "", /antes de 5 años/)
    assert.equal(view.action?.kind, 'answer-profile')
    const money = describeStep(step(plan, 'invest-goal-money')!, plan, objectives)
    assert.match(money.detail ?? "", /más renta fija hasta que lo aclares/)
    assert.ok(monthChecklist(plan, objectives).some((i) => i.id === 'confirm-horizon'))
  })

  it('«Cómo debería repartirse» usa la misma mezcla que el plan (50/50 con la duda, 70/30 aclarado)', () => {
    const share = (horizon: H) => {
      const { decision, plan } = setup([goal({ keepGrowing: true, currentCents: 95_600 })], horizon)
      const split = idealSplit(plan, decision)
      assert.equal(split.kind, 'ready')
      if (split.kind !== 'ready') return [0, 0]
      const cents = (k: string) => split.parts.find((p) => p.key === k)?.cents ?? 0
      return [cents('global-equity'), cents('bonds')]
    }
    const [eqDoubt, bondsDoubt] = share('medium')
    assert.equal(eqDoubt, bondsDoubt)
    const [eqLong, bondsLong] = share('long')
    assert.ok(eqLong > 2 * bondsLong)
  })

  it('con el plazo aclarado («más de 5 años»): 70/30 y sin pregunta', () => {
    const { plan } = setup([goal({ keepGrowing: true })], 'long')
    const money = step(plan, 'invest-goal-money')!
    assert.equal(pctOf(money.mix, 'global-equity'), 70)
    assert.equal(money.mediumHorizon, undefined)
    assert.equal(step(plan, 'confirm-horizon'), undefined)
  })

  it('un objetivo lejano por fecha (más de 5 años) no tiene duda aunque el perfil diga 2 a 5 años', () => {
    const { plan } = setup([goal({ targetDate: '2034-01-01' })])
    assert.equal(step(plan, 'confirm-horizon'), undefined)
    const money = step(plan, 'invest-goal-money')
    if (money) assert.equal(pctOf(money.mix, 'global-equity'), 70)
  })
})

describe('renta fija: diversificada y, con menos de 5 años, de corto plazo', () => {
  it('en la Guía, lo mejor de la renta fija es un fondo, no Bonos y Obligaciones sueltos', () => {
    const { decision, plan } = setup([goal({ keepGrowing: true })])
    const rec = recommendGuide(plan, decision.profile.fields)
    const rf = rec.groups.find((g) => g.group.id === 'renta-fija')!
    assert.equal(rf.best.type.id, 'fondo-renta-fija')
    assert.equal(rec.lead.type.family, 'diversified-equity')
  })

  it('con un plazo de menos de 5 años, avisa de que la renta fija sea de corto plazo', () => {
    const { decision, plan } = setup([goal({ keepGrowing: true })])
    const bonos = productFit(typeById('bonos-estado'), plan, decision.profile.fields)
    assert.ok(bonos.checks.some((c) => /corto plazo/.test(c)))
    assert.ok(bonos.reasons.some((r) => /Obligaciones a 10 años/.test(r)))
    const fondo = productFit(typeById('fondo-renta-fija'), plan, decision.profile.fields)
    assert.ok(fondo.checks.some((c) => /corto plazo/.test(c)))
  })

  it('con plazo largo no lo exige', () => {
    const { decision, plan } = setup([goal({ keepGrowing: true })], 'long')
    const fondo = productFit(typeById('fondo-renta-fija'), plan, decision.profile.fields)
    assert.ok(!fondo.checks.some((c) => /corto plazo/.test(c)))
  })
})
