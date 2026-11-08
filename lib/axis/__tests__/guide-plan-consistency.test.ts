/**
 * 2026-11-08 (caso real revisado como asesor): un menor con 35 € de paga, 24 € de gasto, 1.100 € y un
 * objetivo «sigue creciendo». «Tu plan» proponía invertir 11 €/mes y los 955 € del objetivo, pero la
 * Guía decía «Este mes, nada» y destacaba la renta fija (30 % del plan) en vez de la renta variable
 * global (70 %): solo miraba el paso `invest-long-term`. Ahora todas las pantallas leen
 * `planInvestment`, y este test exige que la Guía diga lo mismo que el Plan.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { buildAllocationPlan, monthlyInvestCents, planInvestment, type AllocationPlan, type PlanStep } from '../plan/allocation'
import { investEstimate, monthlyForType, sleeveGuide } from '../guide/invest'
import { recommendGuide } from '../guide/recommend'
import { PRODUCT_TYPES } from '../guide/products'
import type { MemoryFact } from '../profile/types'
import type { Movement, Objective } from '../../types'
import { config, gasto, ingreso, objective, snapshot, TODAY } from './fixtures'

const MINOR: MemoryFact[] = [
  { kind: 'riskAttitude', value: 'balanced' },
  { kind: 'horizon', value: 'medium' },
  { kind: 'irregularIncome', value: true },
  { kind: 'adult', value: false },
  { kind: 'lossCapacity', value: 'high' },
]
const habitual = (spend: number): Movement[] => ['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 3_500), gasto(`2026-${m}-10`, spend)])
const goal = (extra: Partial<Objective> = {}) => objective({ name: 'Patrimonio ideal 18 años', targetCents: 500_000, targetDate: '2029-03-15', ...extra })

function setup(liquidCents: number, objectives: Objective[], movements: Movement[], facts: MemoryFact[] = MINOR) {
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  const ctx = buildFinancialContext(snapshot({ config: config(liquidCents - net), movements, objectives }), TODAY)
  const decision = decide({ context: ctx, memory: { profileFacts: facts.map((fact, i) => ({ id: `mem-${i}`, updatedAt: i + 1, fact })) } })
  return { decision, plan: buildAllocationPlan(decision) }
}
const step = <K extends PlanStep['kind']>(p: AllocationPlan, kind: K) => p.steps.find((s): s is Extract<PlanStep, { kind: K }> => s.kind === kind)
const INVEST_KINDS = new Set<PlanStep['kind']>(['invest-long-term', 'invest-for-goals', 'idle-money', 'invest-goal-money'])

describe('la Guía dice lo mismo que «Tu plan»', () => {
  it('caso real: menor con objetivo «sigue creciendo» → la Guía propone invertir, no «nada»', () => {
    const { decision, plan } = setup(110_000, [goal({ keepGrowing: true })], habitual(2_400))
    const goalMoney = step(plan, 'invest-goal-money')
    assert.ok(goalMoney, 'el plan propone invertir el dinero del objetivo')
    const estimate = investEstimate(decision, plan)
    assert.equal(estimate.kind, 'now')
    if (estimate.kind !== 'now') return
    assert.equal(estimate.lumpCents, goalMoney.cents)
    assert.equal(estimate.goalLumpCents, goalMoney.cents)
    assert.equal(estimate.monthlyCents, monthlyInvestCents(plan))
    assert.equal(estimate.keptCents, 110_000 - goalMoney.cents)
  })

  it('caso real: lo que más destaca es lo que más pesa en su mezcla (renta variable global, no renta fija)', () => {
    const { decision, plan } = setup(110_000, [goal({ keepGrowing: true })], habitual(2_400))
    const rec = recommendGuide(plan, decision.profile.fields)
    assert.equal(rec.lead.fit.verdict, 'fits')
    assert.equal(rec.lead.type.family, 'diversified-equity')
    const sleeves = sleeveGuide(plan, decision.profile.fields)
    const equity = sleeves.find((s) => s.key === 'global-equity')!
    const bonds = sleeves.find((s) => s.key === 'bonds')!
    assert.ok(equity.pct > bonds.pct)
    assert.equal(equity.lumpCents + bonds.lumpCents, step(plan, 'invest-goal-money')!.cents)
    assert.ok(equity.types.length > 0, 'enseña tipos para la renta variable global')
  })

  it('suma todos los pasos de inversión y respeta los pesos de la mezcla', () => {
    const { plan } = setup(110_000, [goal({ keepGrowing: true })], habitual(2_400))
    const inv = planInvestment(plan)
    const sum = (parts: { cents: number }[]) => parts.reduce((t, p) => t + p.cents, 0)
    assert.equal(sum(inv.monthlyMix), inv.monthlyCents)
    assert.equal(sum(inv.lumpMix), inv.lumpCents)
    const goalMoney = step(plan, 'invest-goal-money')!
    for (const p of goalMoney.mix) assert.equal(inv.lumpMix.find((q) => q.key === p.key)?.pct, p.pct)
    const fund = PRODUCT_TYPES.find((t) => t.family === 'diversified-equity')!
    if (inv.monthlyCents > 0) assert.ok((monthlyForType(fund, plan) ?? 0) > 0)
  })

  // Regla general: si algún paso del plan dice «invierte», la Guía nunca puede decir «nada».
  const SCENARIOS: [string, () => ReturnType<typeof setup>][] = [
    ['objetivo «sigue creciendo» con ahorro', () => setup(110_000, [goal({ keepGrowing: true })], habitual(2_400))],
    ['objetivo «sigue creciendo» sin ahorro al mes', () => setup(110_000, [goal({ keepGrowing: true })], habitual(4_600))],
    ['objetivo lejano normal', () => setup(110_000, [goal({ targetDate: '2034-01-01' })], habitual(2_400))],
    ['sin objetivos', () => setup(300_000, [], habitual(2_000))],
    ['adulto equilibrado sin objetivos', () => setup(800_000, [], ['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 200_000), gasto(`2026-${m}-10`, 120_000)]), [{ kind: 'riskAttitude', value: 'balanced' }, { kind: 'horizon', value: 'long' }, { kind: 'adult', value: true }])],
  ]
  for (const [name, make] of SCENARIOS)
    it(`regla: plan que invierte ⇒ Guía que invierte (${name})`, () => {
      const { decision, plan } = make()
      const invests = plan.steps.some((s) => INVEST_KINDS.has(s.kind) && ('mix' in s ? s.mix.some((p) => p.cents > 0) : false))
      const estimate = investEstimate(decision, plan)
      if (invests) assert.equal(estimate.kind, 'now', `la Guía dice «${estimate.kind}» con pasos: ${plan.steps.map((s) => s.kind).join(', ')}`)
      else assert.notEqual(estimate.kind, 'now')
    })
})
