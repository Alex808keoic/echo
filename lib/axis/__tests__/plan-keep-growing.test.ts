/**
 * 2026-11-08: un menor con 35 € de paga, extras puntuales y 1.100 € en la cuenta veía el plan bloqueado
 * («consigue que te sobre algo cada mes») y su objetivo a 2 años y medio, que no piensa gastar, nunca
 * se proponía invertir. Ahora: sin ahorro al mes el plan reparte lo que ya tienes, y un objetivo
 * «sigue creciendo» es largo plazo aunque su fecha esté cerca.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { buildAllocationPlan, CUSHION_OBJECTIVE_NAME, type AllocationPlan, type PlanStep } from '../plan/allocation'
import { describeStep } from '../plan/describe'
import { allocateObjectives, isLongGoal, takesInvested } from '../../finance/objectives'
import type { MemoryFact } from '../profile/types'
import type { Movement, Objective } from '../../types'
import { config, gasto, ingreso, objective, snapshot, TODAY } from './fixtures'

const PROFILE: MemoryFact[] = [
  { kind: 'riskAttitude', value: 'balanced' },
  { kind: 'horizon', value: 'medium' },
  { kind: 'irregularIncome', value: true },
  { kind: 'adult', value: false },
]
// Paga de 35 € y 46 € de gasto: no sobra nada al mes.
const tight = (): Movement[] => ['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 3_500), gasto(`2026-${m}-10`, 4_600)])
// En 2 años y medio (desde TODAY, 2026-09-15).
const goal = (extra: Partial<Objective> = {}) => objective({ name: 'Patrimonio a los 18', targetCents: 500_000, targetDate: '2029-03-15', ...extra })

function setup(liquidCents: number, objectives: Objective[], movements: Movement[] = tight(), facts: MemoryFact[] = PROFILE) {
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  const ctx = buildFinancialContext(snapshot({ config: config(liquidCents - net), movements, objectives }), TODAY)
  const decision = decide({ context: ctx, memory: { profileFacts: facts.map((fact, i) => ({ id: `mem-${i}`, updatedAt: i + 1, fact })) } })
  return { plan: buildAllocationPlan(decision), objectives: decision.context.objectives }
}
const step = <K extends PlanStep['kind']>(p: AllocationPlan, kind: K) => p.steps.find((s): s is Extract<PlanStep, { kind: K }> => s.kind === kind)

describe('objetivo «sigue creciendo»', () => {
  it('es largo plazo aunque la fecha esté cerca, y lo invertido sigue contando para él', () => {
    assert.equal(isLongGoal({ monthsLeft: 30 }), false)
    assert.equal(isLongGoal({ monthsLeft: 30, keepGrowing: true }), true)
    assert.equal(isLongGoal({ keepGrowing: true }), true)
    assert.equal(takesInvested({ targetDate: '2026-12-01' }, TODAY), false)
    assert.equal(takesInvested({ targetDate: '2026-12-01', keepGrowing: true }, TODAY), true)
    const o = goal({ keepGrowing: true, targetDate: '2026-12-01' })
    assert.equal(allocateObjectives([o], 0, { cents: 100_000, asOf: TODAY }).items[0].fromInvestedCents, 100_000)
  })

  it('sin la marca, el dinero de un objetivo a 2 años y medio se queda en la cuenta', () => {
    const { plan } = setup(110_000, [goal()], [...tight(), ingreso('2026-09-01', 10_000)])
    assert.equal(step(plan, 'invest-goal-money'), undefined)
  })

  it('con la marca, propone invertir su dinero, nunca el del colchón, y nunca pasarlo a ahorro seguro', () => {
    const habitual = [...['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 3_500), gasto(`2026-${m}-10`, 2_400)])]
    const { plan, objectives } = setup(110_000, [goal({ keepGrowing: true })], habitual)
    const money = step(plan, 'invest-goal-money')!
    // 6 meses de 24 € = 144 € de colchón sin crear: no se invierten.
    assert.equal(plan.cushion?.targetCents, 14_400)
    assert.equal(money.cents, 95_600)
    assert.equal(money.keepGrowing, true)
    assert.equal(step(plan, 'invest-for-goals')?.keepGrowing, true)
    assert.equal(step(plan, 'move-goal-to-safe'), undefined)
    const text = describeStep(money, plan, objectives)
    assert.match(text.detail!, /No lo vas a gastar al llegar la fecha/)
    assert.doesNotMatch(text.detail!, /3 años antes de la fecha/)
    assert.match(text.note ?? '', /un adulto/)
  })

  it('con el colchón ya creado y el primero, se invierte todo lo del objetivo', () => {
    const cushion = objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 20_000, priority: 1 })
    const { plan } = setup(110_000, [cushion, goal({ keepGrowing: true, priority: 2 })])
    // 200 € de colchón con 46 € de gasto: se queda corto (6 × 46 = 276 €). Se propone subirlo y esos 76 € no se invierten.
    assert.equal(step(plan, 'raise-cushion')?.suggestedCents, 27_600)
    assert.equal(step(plan, 'invest-goal-money')?.cents, 82_400)
  })
})

describe('sin ahorro al mes', () => {
  it('con dinero de sobra, el plan reparte lo que ya tienes en lugar de bloquearse', () => {
    const { plan, objectives } = setup(110_000, [goal({ keepGrowing: true })])
    assert.equal(plan.status, 'ready')
    assert.equal(plan.monthly?.savingsCents, 0)
    assert.equal(plan.steps[0].kind, 'reduce-spending')
    assert.match(describeStep(plan.steps[0], plan, objectives).title, /ya tienes dinero que repartir/)
    assert.ok(step(plan, 'invest-goal-money'))
    assert.equal(step(plan, 'invest-for-goals'), undefined)
    assert.equal(step(plan, 'invest-long-term'), undefined)
  })

  it('sin colchón cubierto o sin nada que repartir, sigue bloqueado', () => {
    assert.equal(setup(10_000, [goal({ keepGrowing: true })]).plan.blocker, 'no-surplus')
    assert.equal(setup(110_000, [goal()]).plan.blocker, 'no-surplus')
  })

  it('sin perfil, sigue bloqueado', () => {
    assert.equal(setup(110_000, [goal({ keepGrowing: true })], tight(), []).plan.blocker, 'no-surplus')
  })
})
