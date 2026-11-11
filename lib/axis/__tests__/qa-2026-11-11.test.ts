/**
 * QA del 2026-11-11 (10 pruebas como tester y asesor: la copia real y 9 casos inventados). Cada fallo
 * encontrado queda aquí como caso real, y los de coherencia, también como regla de `checkPlan`.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { buildAllocationPlan, planInvestment, type PlanStep } from '../plan/allocation'
import { checkPlan } from '../plan/invariants'
import { describeStep } from '../plan/describe'
import { monthChecklist } from '../plan/checklist'
import type { AxisMemory } from '../types'
import type { Movement, Objective } from '../../types'
import { config, gasto, ingreso, movement, objective, snapshot } from './fixtures'

const ASOF = '2026-11-11'
const MONTHS = ['2026-08', '2026-09', '2026-10']
const salary = (cents: number, months = MONTHS) => months.map((m) => ingreso(`${m}-01`, cents))
const spend = (cents: number, months = MONTHS) =>
  months.flatMap((m) => [gasto(`${m}-05`, cents / 2, 'Vivienda'), gasto(`${m}-12`, (cents * 3) / 10, 'Supermercado'), gasto(`${m}-20`, cents / 5, 'Restaurantes')])
const nov = (income = 180_000) => [ingreso('2026-11-01', income), gasto('2026-11-05', 65_000, 'Vivienda')]
const profile = (over: Record<string, unknown> = {}): AxisMemory => {
  const fields: Record<string, unknown> = { adult: true, horizon: 'long', riskAttitude: 'balanced', work: 'employee', dependents: false, lossCapacity: 'high', investingExperience: 'some', irregularIncome: false, ...over }
  return { profileFacts: Object.entries(fields).map(([kind, value], i) => ({ id: `f${i}`, updatedAt: i + 1, fact: { kind, value } })) } as unknown as AxisMemory
}
const run = (movements: Movement[], objectives: Objective[], initial: number, memory = profile()) => {
  const ctx = buildFinancialContext(snapshot({ config: config(initial), movements, objectives }), ASOF)
  const decision = decide({ context: ctx, memory })
  const plan = buildAllocationPlan(decision)
  return { ctx, decision, plan, violations: checkPlan(plan, decision) }
}
const step = <K extends PlanStep['kind']>(steps: PlanStep[], kind: K) => steps.find((s): s is Extract<PlanStep, { kind: K }> => s.kind === kind)

describe('objetivos a 2–5 años (antes, ningún paso)', () => {
  it('un objetivo a 40 meses recibe su ahorro antes de invertir y avisa con cifras si no llega', () => {
    const goals = [objective({ name: 'Fondo de emergencia', targetCents: 420_000, priority: 1 }), objective({ name: 'Entrada piso', targetCents: 3_000_000, targetDate: '2030-03-01', priority: 2 })]
    const { ctx, plan, violations } = run([...salary(180_000), ...spend(140_000), ...nov()], goals, 1_000_000)
    const near = step(plan.steps, 'short-term-objectives')
    assert.ok(near, 'paso para el objetivo')
    assert.equal(near.monthlyCents, 40_000, 'todo el ahorro: necesita 552 € al mes')
    assert.equal(near.atRisk, true)
    assert.equal(step(plan.steps, 'invest-long-term'), undefined, 'no se invierte mientras el objetivo no llega')
    assert.match(describeStep(near, plan, ctx.objectives).warning ?? '', /llegarías a la fecha con unos/)
    assert.deepEqual(violations, [])
  })
})

describe('plazo corto y «sigue creciendo»', () => {
  it('con un perfil de menos de 2 años no invierte el dinero del objetivo y la pregunta lo dice', () => {
    const goals = [objective({ name: 'Fondo de emergencia', targetCents: 400_000, priority: 1 }), objective({ name: 'Ahorro', targetCents: 2_000_000, keepGrowing: true, priority: 2 })]
    const { ctx, plan, violations } = run([...salary(180_000), ...spend(130_000), ...nov()], goals, 1_200_000, profile({ horizon: 'short' }))
    assert.equal(planInvestment(plan).lumpCents, 0)
    assert.equal(step(plan.steps, 'invest-goal-money'), undefined)
    const ask = step(plan.steps, 'confirm-horizon')
    assert.ok(ask?.shortProfile)
    assert.match(describeStep(ask, plan, ctx.objectives).detail ?? '', /menos de 2 años.*no lo invierte/)
    assert.deepEqual(violations, [])
  })

  it('checkPlan detecta invertir un objetivo en duda con plazo corto', () => {
    const goals = [objective({ name: 'Fondo de emergencia', targetCents: 400_000, priority: 1 }), objective({ id: 'g', name: 'Ahorro', targetCents: 2_000_000, keepGrowing: true, priority: 2 })]
    const { plan, decision } = run([...salary(180_000), ...spend(130_000), ...nov()], goals, 1_200_000, profile({ horizon: 'short' }))
    const forged = { ...plan, steps: [...plan.steps, { kind: 'invest-goal-money' as const, cents: 100_000, objectiveIds: ['g'], mix: [{ key: 'bonds' as const, label: 'Renta fija', pct: 100, cents: 100_000 }], spreadMonths: 6, perMonthCents: 16_700, adult: true }] }
    assert.ok(checkPlan(forged, decision).some((v) => v.rule === 'short-horizon-no-invest'))
  })
})

describe('AXIS no contradice al plan', () => {
  it('si tus meses completos gastan más de lo que ingresas, no dice «ahorras el 100 %»', () => {
    const { decision } = run([...salary(150_000), ...spend(170_000), ingreso('2026-11-01', 150_000)], [], 2_000_000)
    const ids = decision.signals.map((s) => s.id)
    assert.ok(!ids.includes('savings.healthy'))
    const tight = decision.signals.find((s) => s.id === 'savings.tight')
    assert.match(tight?.fact ?? '', /gastas más de lo que ingresas: unos 200,00 €/)
  })

  it('volver a tu sueldo después de un bonus no es una caída de ingresos ni de ahorro', () => {
    const bonus = movement({ type: 'ingreso', amountCents: 600_000, date: '2026-10-15', category: 'Otros', nota: 'Bonus anual' })
    const { decision } = run([...salary(180_000), ...spend(140_000), bonus, ...nov()], [], 600_000)
    const ids = decision.signals.map((s) => s.id)
    assert.ok(!ids.includes('income.drop'), ids.join(','))
    assert.ok(!ids.includes('savings.falling'), ids.join(','))
  })

  it('una caída real de ingresos sigue avisando', () => {
    const { decision } = run([...salary(180_000), ...spend(100_000), ingreso('2026-11-01', 90_000)], [], 600_000)
    assert.ok(decision.signals.some((s) => s.id === 'income.drop'))
  })

  it('el ritmo de un objetivo se entiende solo, sin «ese ritmo»', () => {
    const goals = [objective({ name: 'Coche', targetCents: 2_000_000, targetDate: '2027-06-01' })]
    const { decision } = run([...salary(180_000), ...spend(140_000), ...nov()], goals, 100_000)
    const pace = decision.signals.find((s) => s.id.startsWith('objectives.pace:'))
    assert.match(pace?.interpretation ?? '', /al mes que harían falta para «Coche»/)
  })
})

describe('el plan provisional de la copia real (menor, 35 € de paga)', () => {
  it('la lista del mes ya no propone invertir 4 €', () => {
    const goals = [objective({ name: 'Patrimonio ideal 18 años', targetCents: 500_000, targetDate: '2029-06-29', priority: 2 })]
    const { plan } = run([...salary(3_500), ...spend(2_400), ...nov(3_500).slice(0, 1)], goals, 100_000, profile({ adult: false, horizon: 'medium', work: 'student' }))
    assert.equal(step(plan.steps, 'invest-long-term'), undefined)
    assert.ok(!monthChecklist(plan, []).some((i) => /Invierte \d+,00 €/.test(i.text)))
  })
})
