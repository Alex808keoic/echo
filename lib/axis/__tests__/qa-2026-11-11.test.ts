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
import { describeStep, forecastCaption } from '../plan/describe'
import { monthChecklist } from '../plan/checklist'
import { projectWealth } from '../plan/projection'
import { idealSplit } from '../plan/ideal-split'
import { inflationFrom } from '../plan/inflation'
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

describe('dinero apartado, objetivos vencidos y la tarjeta de previsión', () => {
  const minor = profile({ adult: false, horizon: 'medium', work: 'student', irregularIncome: true })

  it('lo apartado para un objetivo a 32 meses se propone pasar a ahorro seguro (sin invertirlo)', () => {
    const goals = [objective({ name: 'Patrimonio ideal 18 años', targetCents: 500_000, targetDate: '2029-06-29', priority: 1 })]
    const { ctx, plan, violations } = run([...salary(3_500), ...spend(2_400), ...nov(3_500).slice(0, 1)], goals, 96_000, minor)
    const safe = step(plan.steps, 'goal-cash-to-safe')
    assert.ok(safe)
    assert.ok(safe.cents >= 10_000)
    assert.equal(planInvestment(plan).lumpCents, 0, 'no es invertir')
    const view = describeStep(safe, plan, ctx.objectives)
    assert.match(view.detail ?? '', /ahorro seguro/)
    assert.match(view.note ?? '', /menor de edad/)
    assert.ok(monthChecklist(plan, ctx.objectives).some((i) => /a ahorro seguro/.test(i.text)))
    assert.deepEqual(violations, [])
  })

  it('un objetivo a 2 meses no se mueve (se va a gastar ya) y uno lejano se invierte, no va a ahorro seguro', () => {
    const goals = [objective({ name: 'Portátil', targetCents: 120_000, targetDate: '2027-01-10', priority: 1 }), objective({ name: 'Casa', targetCents: 5_000_000, targetDate: '2034-01-01', priority: 2 })]
    const { plan } = run([...salary(180_000), ...spend(130_000), ...nov()], goals, 900_000)
    const safe = step(plan.steps, 'goal-cash-to-safe')
    assert.equal(safe, undefined, JSON.stringify(safe))
    assert.ok(step(plan.steps, 'invest-goal-money'))
  })

  it('un objetivo con la fecha pasada pregunta si ya lo usaste', () => {
    const goals = [objective({ name: 'Viaje Japón', targetCents: 600_000, targetDate: '2026-10-01' })]
    const { ctx, plan } = run([...salary(180_000), ...spend(140_000), ...nov()], goals, 500_000)
    const overdue = step(plan.steps, 'overdue-goal')
    assert.ok(overdue)
    assert.match(describeStep(overdue, plan, ctx.objectives).title, /La fecha de «Viaje Japón» ya pasó/)
    assert.ok(monthChecklist(plan, ctx.objectives).some((i) => /Marca «Viaje Japón» como conseguido/.test(i.text)))
  })

  it('la tarjeta del plan provisional explica las cifras que enseña', () => {
    assert.match(forecastCaption({ steps: [{ kind: 'forecast-basis', recurringIncomeCents: 3_500, spendingCents: 3_700, monthsNeeded: 1, spendingFrom: 'pace', lastMonthSavingsCents: 1_100 }] }), /ahorraste de verdad en tu último mes completo/)
    assert.equal(forecastCaption({ steps: [{ kind: 'forecast-basis', recurringIncomeCents: 3_500, spendingCents: 1_500, monthsNeeded: 1, spendingFrom: 'fixed' }] }), 'Previsión: tu ingreso fijo previsto menos tus gastos fijos de «Fijos».')
  })
})

describe('textos que se contradecían', () => {
  it('deuda cara sin objetivos lejanos: la nota no habla de ellos', () => {
    const debts = [{ id: 'd1', name: 'Tarjeta', balanceCents: 300_000, aprBp: 2_200, monthlyPaymentCents: 15_000, createdAt: 1, updatedAt: 1 }]
    const ctx = buildFinancialContext(snapshot({ config: config(1_500_000), movements: [...salary(220_000), ...spend(160_000), ...nov()], debts } as Parameters<typeof snapshot>[0]), ASOF)
    const decision = decide({ context: ctx, memory: profile() })
    const plan = buildAllocationPlan(decision)
    const pay = step(plan.steps, 'pay-debt')
    assert.ok(pay && pay.lumpSumCents > 0)
    assert.doesNotMatch(describeStep(pay, plan, ctx.objectives).note ?? '', /objetivos lejanos/)
  })

  it('con objetivos cubiertos no dice «no tienes objetivos pendientes»', () => {
    const goals = [objective({ name: 'Moto', targetCents: 300_000, targetDate: '2027-06-01' })]
    const { ctx, plan } = run([...salary(180_000), ...spend(130_000), ...nov()], goals, 900_000)
    const texts = plan.steps.map((s) => describeStep(s, plan, ctx.objectives).detail ?? '').join(' ')
    assert.doesNotMatch(texts, /no tienes objetivos pendientes/)
    assert.match(texts, /ya están cubiertos/)
  })
})

describe('plazo medio e importes pequeños', () => {
  it('con un perfil de 2 a 5 años el paso dice «a medio plazo»', () => {
    const { ctx, plan } = run([...salary(180_000), ...spend(130_000), ...nov()], [], 300_000, profile({ horizon: 'medium' }))
    const lt = step(plan.steps, 'invest-long-term')
    assert.ok(lt)
    assert.match(describeStep(lt, plan, ctx.objectives).title, /a medio plazo \(2 a 5 años\)/)
  })

  it('menos de 50 € al mes: la lista dice juntarlos primero, como con los extras', () => {
    const { ctx, plan } = run([...salary(10_000), ...spend(5_000), ingreso('2026-11-01', 10_000)], [], 300_000, profile({ horizon: 'medium' }))
    const lt = step(plan.steps, 'invest-long-term')
    assert.ok(lt && lt.monthlyCents < 5_000, JSON.stringify(lt))
    const items = monthChecklist(plan, ctx.objectives).map((i) => i.text)
    assert.ok(items.some((t) => /^Aparta .* cuando llegues a 50,00 €/.test(t)), items.join(' | '))
  })
})

describe('tu caso, segunda revisión: extras, proyección y reparto ideal coherentes con el ahorro seguro', () => {
  const minor = profile({ adult: false, horizon: 'medium', work: 'student', irregularIncome: true })
  const goals = () => [objective({ name: 'Patrimonio ideal 18 años', targetCents: 500_000, targetDate: '2029-06-29', priority: 1 })]
  const movements = () => [...salary(3_500), ...spend(2_400), ...nov(3_500).slice(0, 1)]

  it('con ingresos irregulares y sin nada que invertir, los extras tienen regla (a ahorro seguro)', () => {
    const { ctx, plan, violations } = run(movements(), goals(), 96_000, minor)
    const extras = step(plan.steps, 'extras-split')
    assert.ok(extras?.toSafe)
    assert.match(describeStep(extras, plan, ctx.objectives).detail ?? '', /pásalo a tu ahorro seguro/)
    assert.deepEqual(violations, [])
  })

  it('la proyección cuenta el ahorro seguro que propone el plan', () => {
    const { ctx, plan } = run(movements(), goals(), 96_000, minor)
    const p = projectWealth(plan, ctx, 5, inflationFrom(null))
    assert.ok(p && p.midCents > p.contributedCents, JSON.stringify(p))
  })

  it('el reparto ideal no dice «bien repartido» si el plan propone mover dinero a ahorro seguro', () => {
    const { decision, plan } = run(movements(), goals(), 96_000, minor)
    const split = idealSplit(plan, decision)
    assert.ok(split.kind === 'ready')
    assert.match(split.headline, /pasarlos a ahorro seguro/)
  })
})
