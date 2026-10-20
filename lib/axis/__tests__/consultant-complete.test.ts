/**
 * El consultor completo (2026-10-18): deudas en el plan, simulador «¿Y si…?»,
 * rentabilidad real y comisiones, recordatorio de copia, resumen del año y
 * revisión mensual con la pregunta «¿Ha cambiado algo?».
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { contextFigures } from '../core/figures'
import { buildAllocationPlan, CUSHION_OBJECTIVE_NAME, type AllocationPlan, type PlanStep } from '../plan/allocation'
import { describeStep, durationText } from '../plan/describe'
import { monthChecklist } from '../plan/checklist'
import { stepReasons } from '../plan/why'
import { expectedMixReturnPct, mixWeights } from '../plan/mix'
import { simulate, type Scenario } from '../plan/simulate'
import { feeSummary, isHighFee, portfolioReturn } from '../plan/returns'
import { reviewYear, yearsWithData } from '../plan/year-review'
import { reviewMonth } from '../plan/review'
import { annuityPaymentCents, extraPaymentEffect, payoffMonths, remainingInterestCents } from '../../finance/debts'
import { dueReminders } from '../../reminders'
import { parsePercentToBp } from '../../money'
import type { InflationRef } from '../plan/inflation'
import type { MemoryFact } from '../profile/types'
import type { Debt, Movement, Objective } from '../../types'
import { db } from '../../db/db'
import { clearAllData, exportBackup, parseBackup, restoreBackup } from '../../db/backup'
import { addDebt, listDebts } from '../../db/debts'
import { getLastBackupAt, setLastBackupAt } from '../../db/meta'
import { getPlanMonth, setMonthCheckIn, setPlanCheck } from '../../db/plan-checks'
import { config, gasto, ingreso, objective, position, snapshot, TODAY } from './fixtures'

const history3 = (): Movement[] => [...['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 200_000), gasto(`2026-${m}-10`, 100_000)]), ingreso('2026-09-01', 200_000)]
const CUSHION = () => objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 300_000, priority: 1 })
const COCHE = () => objective({ name: 'Coche', targetCents: 2_000_000, priority: 2 })
const BALANCED: MemoryFact[] = [
  { kind: 'riskAttitude', value: 'balanced' },
  { kind: 'horizon', value: 'long' },
]
const CONSERVATIVE: MemoryFact[] = [
  { kind: 'riskAttitude', value: 'conservative' },
  { kind: 'horizon', value: 'long' },
]
const INFLATION: InflationRef = { pct: 2, source: 'assumption' }
const memoryOf = (facts: MemoryFact[]) => ({ profileFacts: facts.map((fact, i) => ({ id: `mem-${i}`, updatedAt: i + 1, fact })) })

const debt = (name: string, balanceCents: number, aprPct: number, monthlyPaymentCents: number): Debt => ({
  id: `debt-${name}`,
  name,
  balanceCents,
  aprBp: Math.round(aprPct * 100),
  monthlyPaymentCents,
  createdAt: 1,
  updatedAt: 1,
})

function baseSnapshot(liquidCents: number, objectives: Objective[], debts: Debt[] = []) {
  const movements = history3()
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  return snapshot({ config: config(liquidCents - net), movements, objectives, debts })
}

function setup(liquidCents: number, objectives: Objective[], facts: MemoryFact[], debts: Debt[] = []) {
  const ctx = buildFinancialContext(baseSnapshot(liquidCents, objectives, debts), TODAY)
  const decision = decide({ context: ctx, memory: memoryOf(facts) })
  return { plan: buildAllocationPlan(decision, { inflation: INFLATION }), objectives: decision.context.objectives, decision, ctx }
}
const step = <K extends PlanStep['kind']>(p: AllocationPlan, kind: K) => p.steps.find((s): s is Extract<PlanStep, { kind: K }> => s.kind === kind)

describe('cálculos de deudas', () => {
  it('meses, intereses y cuota de un préstamo nuevo', () => {
    assert.equal(payoffMonths(100_000, 0, 10_000), 10)
    assert.equal(payoffMonths(100_000, 24, 1_000), null, 'la cuota no cubre los intereses')
    assert.equal(annuityPaymentCents(1_000_000, 0, 10), 100_000)
    assert.equal(annuityPaymentCents(1_000_000, 6, 12), 86_067)
    const interest = remainingInterestCents(1_000_000, 6, 86_067)!
    assert.ok(interest > 32_000 && interest < 33_000, `intereses ${interest}`)
  })

  it('pagar más cada mes acorta la deuda y ahorra intereses', () => {
    const e = extraPaymentEffect(300_000, 20, 10_000, 100_000)!
    assert.ok(e.months < payoffMonths(300_000, 20, 10_000)!)
    assert.ok(e.monthsSaved! > 0 && e.interestSavedCents! > 0)
  })

  it('porcentajes que escribe el usuario', () => {
    assert.equal(parsePercentToBp('8,5'), 850)
    assert.equal(parsePercentToBp('0,2 %'), 20)
    assert.equal(parsePercentToBp('-1'), null)
    assert.equal(parsePercentToBp('12', 10), null)
  })

  it('el contexto lleva las deudas (de la más cara a la más barata) solo si hay alguna', () => {
    assert.equal(buildFinancialContext(baseSnapshot(800_000, []), TODAY).debts, undefined)
    const ctx = buildFinancialContext(baseSnapshot(800_000, [], [debt('Hipoteca', 5_000_000, 2, 30_000), debt('Tarjeta', 200_000, 22, 10_000), debt('Pagada', 0, 9, 0)]), TODAY)
    assert.deepEqual(ctx.debts?.map((d) => [d.name, d.aprPct]), [['Tarjeta', 22], ['Hipoteca', 2]])
    assert.ok(contextFigures(ctx).some((f) => f.label === 'Deuda «Tarjeta»: pendiente' && f.kind === 'money' && f.cents === 200_000))
  })
})

describe('deudas en el plan', () => {
  it('deuda cara sin colchón mínimo: primero un mes de gasto apartado, sin invertir', () => {
    const s = setup(50_000, [CUSHION(), COCHE()], BALANCED, [debt('Tarjeta', 300_000, 20, 10_000)])
    const fill = step(s.plan, 'fill-cushion')!
    assert.equal(fill.starter, true)
    assert.equal(fill.remainingCents, 50_000)
    assert.equal(s.plan.longTerm.reason, 'debt-first')
    assert.equal(step(s.plan, 'invest-long-term'), undefined)
    assert.match(describeStep(fill, s.plan, s.objectives).title, /colchón mínimo/)
  })

  it('con el colchón mínimo: todo el ahorro a devolver la deuda cara, y se explica por qué', () => {
    const s = setup(150_000, [CUSHION(), COCHE()], BALANCED, [debt('Tarjeta', 300_000, 20, 10_000)])
    const pay = step(s.plan, 'pay-debt')!
    assert.equal(pay.monthlyCents, 100_000)
    assert.equal(pay.name, 'Tarjeta')
    assert.ok(pay.months! > 0 && pay.monthsSaved! > 0 && pay.interestSavedCents! > 0)
    assert.equal(pay.objectivesWaiting, true)
    assert.equal(step(s.plan, 'invest-long-term'), undefined)
    assert.equal(step(s.plan, 'fill-cushion'), undefined)
    const view = describeStep(pay, s.plan, s.objectives)
    assert.match(view.title, /1\.000,00 € al mes para devolver antes «Tarjeta»/)
    assert.match(view.detail!, /20 % al año/)
    assert.match(view.warning!, /tus objetivos no reciben ahorro nuevo/)
    assert.doesNotMatch(`${view.title} ${view.detail}`, /\bETF\b|Vanguard|Indexa|MyInvestor/i)
    assert.ok(stepReasons(pay, s.plan, s.decision.profile.fields).some((w) => /rentabilidad segura/.test(w)))
    assert.ok(monthChecklist(s.plan, s.objectives).some((i) => i.id === `pay-debt:${pay.debtId}`))
  })

  it('con líquido de sobra (colchón completo, objetivos lejanos), propone devolverla de una vez', () => {
    const s = setup(800_000, [CUSHION(), COCHE()], BALANCED, [debt('Tarjeta', 300_000, 20, 10_000)])
    const pay = step(s.plan, 'pay-debt')!
    assert.equal(pay.lumpSumCents, 300_000)
    assert.match(describeStep(pay, s.plan, s.objectives).note!, /podrías devolver 3\.000,00 € de una vez/)
    const near = setup(800_000, [CUSHION(), objective({ name: 'Viaje', targetCents: 600_000, priority: 2, targetDate: '2027-03-01' })], BALANCED, [debt('Tarjeta', 300_000, 20, 10_000)])
    assert.equal(step(near.plan, 'pay-debt')!.lumpSumCents, 0, 'lo apartado para un objetivo cercano no se toca')
  })

  it('el umbral depende de tu perfil: un 5 % se devuelve antes si eres prudente, no si eres equilibrado', () => {
    assert.equal(expectedMixReturnPct(mixWeights('balanced', 'long', false)), 5.8)
    assert.equal(expectedMixReturnPct(mixWeights('conservative', 'long', false)), 4.6)
    const loan = [debt('Coche', 600_000, 5, 15_000)]
    const balanced = setup(800_000, [CUSHION(), COCHE()], BALANCED, loan)
    assert.equal(step(balanced.plan, 'pay-debt'), undefined)
    assert.ok(step(balanced.plan, 'invest-long-term'))
    const choice = step(balanced.plan, 'debt-choice')!
    assert.equal(choice.aprPct, 5)
    assert.match(describeStep(choice, balanced.plan, balanced.objectives).detail!, /Las dos opciones son razonables/)
    const conservative = setup(800_000, [CUSHION(), COCHE()], CONSERVATIVE, loan)
    assert.ok(step(conservative.plan, 'pay-debt'))
    assert.equal(step(conservative.plan, 'invest-long-term'), undefined)
  })

  it('sin perfil, el umbral es el 7 %; una deuda barata no cambia nada', () => {
    const noProfile = setup(800_000, [CUSHION()], [], [debt('Préstamo', 600_000, 6, 15_000)])
    assert.equal(step(noProfile.plan, 'pay-debt'), undefined)
    const cheap = setup(800_000, [CUSHION(), COCHE()], BALANCED, [debt('Hipoteca', 10_000_000, 2, 40_000)])
    assert.ok(!cheap.plan.steps.some((s) => s.kind === 'pay-debt' || s.kind === 'debt-choice' || s.kind === 'debt-load'))
  })

  it('cuotas por encima del 35 % de tus ingresos: aviso', () => {
    const s = setup(800_000, [CUSHION(), COCHE()], BALANCED, [debt('Hipoteca', 10_000_000, 2, 80_000)])
    const load = step(s.plan, 'debt-load')!
    assert.equal(load.pct, 40)
    assert.match(describeStep(load, s.plan, s.objectives).title, /el 40 % de tus ingresos/)
  })

  it('deudas mal formadas en un contexto que llega de fuera se ignoran', () => {
    const ctx = buildFinancialContext(baseSnapshot(150_000, [CUSHION()]), TODAY)
    const forged = { ...ctx, debts: [{ id: 'x', name: 'Rara', balanceCents: 'mucho', aprPct: 30, monthlyPaymentCents: 1 }] } as unknown as typeof ctx
    const plan = buildAllocationPlan(decide({ context: forged, memory: memoryOf(BALANCED) }))
    assert.equal(step(plan, 'pay-debt'), undefined)
  })
})

describe('simulador «¿Y si…?»', () => {
  const run = (scenario: Scenario, liquid = 800_000, objectives: Objective[] = [CUSHION(), COCHE()]) =>
    simulate({ snapshot: baseSnapshot(liquid, objectives), memory: memoryOf(BALANCED), asOf: TODAY, inflation: INFLATION, scenario })

  it('una compra que te puedes permitir no desordena el plan', () => {
    const r = run({ kind: 'purchase', cents: 100_000 })
    assert.equal(r.status, 'ok')
    if (r.status !== 'ok') return
    assert.equal(r.after.liquidCents, r.before.liquidCents - 100_000)
    assert.equal(r.after.savingsCents, r.before.savingsCents, 'lo puntual no cambia el ahorro habitual')
    assert.equal(r.verdict, 'ok')
  })

  it('una compra que vacía el colchón: con cuidado', () => {
    const r = run({ kind: 'purchase', cents: 790_000 })
    assert.equal(r.status === 'ok' && r.verdict, 'careful')
  })

  it('un gasto fijo mayor que tu ahorro: ahora no', () => {
    const r = run({ kind: 'expense', monthlyCents: 150_000 })
    assert.equal(r.status === 'ok' && r.verdict, 'not-now')
    assert.ok(r.status === 'ok' && r.checks.some((c) => !c.ok && /Dejarías de ahorrar/.test(c.text)))
  })

  it('un préstamo caro: cuota, intereses, y tu plan pasaría a devolverlo primero', () => {
    const r = run({ kind: 'loan', cents: 1_000_000, aprPct: 8, months: 48 })
    assert.equal(r.status, 'ok')
    if (r.status !== 'ok') return
    assert.ok(r.facts.some((f) => /^Cuota: 244,13 € al mes durante 4 años\.$/.test(f)), r.facts.join(' | '))
    assert.ok(r.facts.some((f) => /intereses/.test(f)))
    assert.match(r.after.firstStep, /Préstamo simulado/)
    assert.equal(r.after.savingsCents, r.before.savingsCents! - 24_500, 'la cuota baja el ahorro (en euros enteros)')
  })

  it('una vivienda sin la entrada: ahora no, y cuánto falta', () => {
    const r = run({ kind: 'home', priceCents: 20_000_000, aprPct: 3, years: 30, rentSavedCents: 0 })
    assert.equal(r.status === 'ok' && r.verdict, 'not-now')
    assert.ok(r.status === 'ok' && r.checks.some((c) => !c.ok && /te faltan/.test(c.text)))
  })

  it('un trabajo mejor pagado sube el ahorro', () => {
    const r = run({ kind: 'job', newIncomeCents: 300_000, gapMonths: 0 })
    assert.equal(r.status === 'ok' && r.after.savingsCents, 200_000)
  })

  it('sin dos meses completos no simula', () => {
    const r = simulate({ snapshot: snapshot({ config: config(100_000), movements: [ingreso('2026-08-01', 200_000), gasto('2026-08-05', 50_000)] }), asOf: TODAY, inflation: INFLATION, scenario: { kind: 'purchase', cents: 100 } })
    assert.deepEqual(r, { status: 'insufficient-data' })
  })

  it('duraciones legibles', () => {
    assert.equal(durationText(8), '8 meses')
    assert.equal(durationText(12), '1 año')
    assert.equal(durationText(27), '2 años y 3 meses')
  })
})

describe('rentabilidad real y comisiones', () => {
  it('rentabilidad anual (TIR) y descontando la inflación, solo con un año o más', () => {
    const r = portfolioReturn([position({ name: 'Fondo', investedCents: 100_000, valueCents: 121_000, date: '2024-09-15' })], TODAY, 2)!
    assert.equal(r.annualPct, 10)
    assert.ok(r.realAnnualPct! >= 7.8 && r.realAnnualPct! <= 7.9, String(r.realAnnualPct))
    assert.equal(r.gainPct, 21)
    const recent = portfolioReturn([position({ name: 'Fondo', investedCents: 100_000, valueCents: 110_000, date: '2026-03-01' })], TODAY, 2)!
    assert.equal(recent.annualPct, null)
  })

  it('comisión media, coste a largo plazo y comisiones altas para su tipo', () => {
    const cheap = position({ name: 'Indexado', investedCents: 100_000, valueCents: 100_000, assetType: 'global-equity', feeBp: 20 })
    const pricey = position({ name: 'Gestionado', investedCents: 100_000, valueCents: 100_000, assetType: 'global-equity', feeBp: 180 })
    assert.equal(isHighFee(cheap), false)
    assert.equal(isHighFee(pricey), true)
    const f = feeSummary([cheap, pricey], 20_000)!
    assert.equal(f.avgPct, 1)
    assert.equal(f.yearlyCents, 2_000)
    assert.equal(f.highFeeCount, 1)
    assert.ok(f.longRun!.yoursCents > f.longRun!.lowCents * 4)
    assert.equal(feeSummary([position({ name: 'Sin dato', valueCents: 100_000 })], 0), null)
  })
})

describe('recordatorios: copia de seguridad y resumen del año', () => {
  const base = { checklist: null, hasRecurringIncome: false, incomeThisMonth: 1, positionsUpdatedAt: [] }
  const now = new Date('2026-09-15T10:00:00Z').getTime()
  const DAY = 86_400_000
  const ids = (input: Partial<Parameters<typeof dueReminders>[0]>) => dueReminders({ ...base, today: TODAY, now, ...input }).map((r) => r.id)

  it('sin ninguna copia y datos de hace más de una semana; o la última tiene más de un mes', () => {
    assert.deepEqual(ids({ firstDataAt: now - 8 * DAY, lastBackupAt: null }), ['backup'])
    assert.deepEqual(ids({ firstDataAt: now - 3 * DAY, lastBackupAt: null }), [])
    assert.deepEqual(ids({ firstDataAt: now - 90 * DAY, lastBackupAt: now - 10 * DAY }), [])
    assert.deepEqual(ids({ firstDataAt: now - 90 * DAY, lastBackupAt: now - 31 * DAY }), ['backup'])
    assert.deepEqual(ids({ firstDataAt: null, lastBackupAt: null }), [], 'sin datos no hay nada que copiar')
  })

  it('del 1 al 15 de enero, si hay datos del año anterior', () => {
    const r = dueReminders({ ...base, today: '2027-01-05', now, hasLastYearData: true })
    assert.deepEqual(r.map((x) => [x.id, x.text]), [['year-review', 'Tu resumen de 2026 está listo.']])
    assert.deepEqual(ids({ hasLastYearData: true }), [])
  })
})

describe('resumen del año y revisión del mes', () => {
  it('lo que va de año, con lo que conviene hacer y la propuesta de repetir el perfil', () => {
    const snap = { ...baseSnapshot(800_000, [CUSHION()], [debt('Coche', 600_000, 5, 15_000)]), positions: [] }
    assert.deepEqual(yearsWithData(snap.movements), ['2026'])
    const r = reviewYear({ snapshot: snap, year: '2026', asOf: TODAY, inflation: INFLATION, profileAnsweredAt: null, now: new Date(TODAY).getTime() })!
    assert.equal(r.partial, true)
    assert.equal(r.incomeCents, 800_000)
    assert.equal(r.expenseCents, 300_000)
    assert.equal(r.savingsRatePct, 63)
    assert.ok(r.lines.some((l) => /Donde más gastaste: «Supermercado»/.test(l)))
    assert.ok(r.lines.some((l) => /Hoy debes 6\.000,00 € en total/.test(l)))
    assert.equal(r.profileStale, true)
    assert.ok(r.next.some((n) => /«Tu perfil»/.test(n)))
    const fresh = reviewYear({ snapshot: snap, year: '2026', asOf: TODAY, inflation: INFLATION, profileAnsweredAt: Date.now(), now: Date.now() })!
    assert.equal(fresh.profileStale, false)
    assert.equal(reviewYear({ snapshot: snap, year: '2025', asOf: TODAY, inflation: INFLATION, profileAnsweredAt: null }), null)
  })

  it('la revisión del mes dice dónde más gastaste y lo que debes', () => {
    const snap = baseSnapshot(800_000, [], [debt('Coche', 600_000, 5, 15_000)])
    const r = reviewMonth({ snapshot: snap, asOf: TODAY, planned: null, currentPlanned: { savingsCents: 100_000, investCents: 0, items: 0 }, doneCount: 0, inflation: INFLATION })!
    assert.ok(r.lines.includes('Donde más gastaste: «Supermercado», 1.000,00 € (el 100 % de tus gastos).'))
    assert.ok(r.lines.includes('Debes 6.000,00 € en total: actualiza lo que queda de cada deuda.'))
  })
})

describe('datos: deudas en la copia, última copia y «¿Ha cambiado algo?»', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open()
    await clearAllData()
  })

  it('la copia (v3 en adelante) lleva las deudas; restaurar una v2 conserva las del dispositivo', async () => {
    await addDebt({ name: 'Tarjeta', balanceCents: 200_000, aprBp: 2_200, monthlyPaymentCents: 10_000 })
    const backup = await exportBackup()
    assert.equal(backup.version, 4)
    assert.deepEqual(backup.debts?.map((d) => d.name), ['Tarjeta'])
    const parsed = parseBackup(JSON.stringify(backup))
    await clearAllData()
    await restoreBackup(parsed)
    assert.deepEqual((await listDebts()).map((d) => d.name), ['Tarjeta'])
    const v2 = parseBackup(JSON.stringify({ ...backup, version: 2, debts: undefined }))
    assert.equal(v2.debts, undefined)
    await restoreBackup(v2)
    assert.equal((await listDebts()).length, 1, 'una copia sin deudas no borra las del dispositivo')
    assert.throws(() => parseBackup(JSON.stringify({ ...backup, debts: [{ id: 'x', name: 'Mal', balanceCents: -1, aprBp: 0, monthlyPaymentCents: 0, createdAt: 1, updatedAt: 1 }] })), /deudas no válidas/)
  })

  it('la fecha de la última copia se guarda y se borra con todo', async () => {
    assert.equal(await getLastBackupAt(), null)
    await setLastBackupAt(123)
    assert.equal(await getLastBackupAt(), 123)
    await clearAllData()
    assert.equal(await getLastBackupAt(), null)
  })

  it('responder «¿Ha cambiado algo?» no borra lo marcado, ni marcar borra la respuesta', async () => {
    await setPlanCheck('2026-09', 'invest:global-equity', true)
    await setMonthCheckIn('2026-09', 42)
    await setPlanCheck('2026-09', 'fill-cushion', true)
    const entry = await getPlanMonth('2026-09')
    assert.equal(entry?.checkIn, 42)
    assert.deepEqual(entry?.done, ['invest:global-equity', 'fill-cushion'])
  })
})
