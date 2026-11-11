/**
 * Pendientes de la revisión como asesor del 2026-11-08:
 *   - el plan provisional no se fía de un solo mes: el gasto nunca baja de los
 *     gastos fijos de «Fijos» ni de lo que ya llevas gastado este mes;
 *   - datos que parecen mal apuntados: un préstamo como gasto, algo habitual
 *     marcado como puntual y un objetivo distinto del que le contaste a AXIS.
 *     Se avisa; nunca cambian los importes del plan.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { buildAllocationPlan, type PlanStep } from '../plan/allocation'
import { checkPlan } from '../plan/invariants'
import { checkData, goalAmountOf } from '../plan/data-checks'
import { dataIssueSentence, describeStep, smallSplitNote } from '../plan/describe'
import { isSmallSplit } from '../plan/mix'
import { monthChecklist } from '../plan/checklist'
import type { UserMemory } from '../chat/types'
import type { AppConfig, Movement, RecurringMovement } from '../../types'
import { gasto, ingreso, movement, objective, snapshot } from './fixtures'
import { reimbursedExpenses } from '../../finance/summary'
import type { MemoryFact } from '../profile/types'

const ASOF = '2026-11-08'
const startedOn = (iso: string): AppConfig => {
  const [y, m, d] = iso.split('-').map(Number)
  const at = new Date(y, m - 1, d, 12).getTime()
  return { key: 'config', initialBalanceCents: 50_000, configuredAt: at, updatedAt: at }
}
const fixed = (extra: Partial<RecurringMovement>): RecurringMovement => ({
  id: 'paga',
  name: 'Paga',
  type: 'ingreso',
  amountCents: 3_500,
  category: 'Paga',
  frequency: 'monthly',
  startDate: '2026-10-01',
  doneThrough: '2026-11-01',
  createdAt: 1,
  updatedAt: 1,
  ...extra,
})
const memory = (content: string, extra: Partial<UserMemory> = {}): UserMemory => ({
  id: `m-${content.length}`,
  content,
  category: 'goal',
  importance: 'high',
  confidence: 0.9,
  source: 'conversation',
  createdAt: 1,
  updatedAt: 1,
  ...extra,
})
const puntual = (m: Movement): Movement => ({ ...m, puntual: true })

describe('plan provisional: el gasto no sale solo de un mes', () => {
  // Empezó el 21-09 (septiembre no cuenta): octubre es el único mes completo, con 12 € de gasto.
  const base = [gasto('2026-09-25', 900), ingreso('2026-10-01', 3_500), gasto('2026-10-12', 1_200)]
  const planOf = (movements: Movement[], recurring: RecurringMovement[]) =>
    buildAllocationPlan(decide({ context: buildFinancialContext(snapshot({ config: startedOn('2026-09-21'), movements, recurring }), ASOF) }))
  const basisOf = (plan: ReturnType<typeof planOf>) => {
    const b = plan.steps.find((s) => s.kind === 'forecast-basis')
    assert.ok(b && b.kind === 'forecast-basis', 'plan provisional')
    return b
  }

  it('sin nada más, usa el último mes completo', () => {
    const plan = planOf(base, [fixed({})])
    assert.equal(basisOf(plan).spendingFrom, undefined)
    assert.equal(plan.monthly?.spendingCents, 1_200)
  })

  it('con gastos fijos mayores que lo apuntado, usa los fijos (los anuales, entre 12)', () => {
    const recurring = [fixed({}), fixed({ id: 'movil', name: 'Móvil', type: 'gasto', amountCents: 1_000, category: 'Facturas' }), fixed({ id: 'seguro', name: 'Seguro', type: 'gasto', amountCents: 6_000, category: 'Seguros y banco', frequency: 'yearly' })]
    const plan = planOf(base, recurring)
    const basis = basisOf(plan)
    assert.equal(basis.spendingFrom, 'fixed')
    assert.equal(plan.monthly?.spendingCents, 1_500, '10 € al mes + 60 € al año / 12')
    assert.equal(plan.monthly?.savingsCents, 2_000)
    assert.match(describeStep(basis, plan, []).detail ?? '', /gastos fijos de «Fijos»/)
  })

  it('si este mes ya gastaste más que el último mes completo, usa lo de este mes (sin lo puntual)', () => {
    const plan = planOf([...base, ingreso('2026-11-01', 3_500), gasto('2026-11-03', 2_000), puntual(gasto('2026-11-05', 900))], [fixed({})])
    const basis = basisOf(plan)
    // 20 € en 8 días de noviembre supera a los 12 € de octubre; con septiembre, el ritmo es aún más alto (≈ 26 €).
    assert.equal(basis.spendingFrom, 'pace')
    assert.equal(plan.monthly?.spendingCents, 2_600)
    assert.match(describeStep(basis, plan, []).detail ?? '', /tu ritmo de gasto/)
  })
})

describe('datos que parecen mal apuntados', () => {
  const check = (movements: Movement[], extra: { recurring?: RecurringMovement[]; memories?: UserMemory[]; objectives?: ReturnType<typeof objective>[] } = {}) =>
    checkData({ movements, recurring: extra.recurring ?? [], objectives: extra.objectives ?? [], memories: extra.memories ?? [], asOf: ASOF })

  it('un préstamo a alguien apuntado como gasto de cada mes', () => {
    const issues = check([gasto('2026-10-20', 2_000, 'Otros', 'Le presté a Juan'), gasto('2026-10-21', 500, 'Otros', 'Préstamo a Marta')])
    assert.deepEqual(issues.map((i) => i.kind), ['loan-as-expense', 'loan-as-expense'])
    assert.match(dataIssueSentence(issues[0]), /cámbialo a «Adelanto»/)
  })

  it('no avisa de la cuota de un préstamo del banco, ni de un préstamo ya marcado como puntual', () => {
    assert.deepEqual(check([gasto('2026-10-20', 15_000, 'Seguros y banco', 'Préstamo coche'), gasto('2026-10-21', 9_000, 'Otros', 'Cuota del préstamo a 5 años'), puntual(gasto('2026-10-22', 2_000, 'Otros', 'Le presté a Juan'))]), [])
  })

  it('una suscripción marcada como puntual', () => {
    const issues = check([puntual(gasto('2026-10-05', 1_099, 'Suscripciones'))])
    assert.equal(issues.length, 1)
    assert.ok(issues[0].kind === 'habitual-marked-one-off' && issues[0].reason === 'subscription')
  })

  it('un gasto que salió de un fijo y está marcado como puntual', () => {
    const recurring = [fixed({ id: 'gym', name: 'Gimnasio', type: 'gasto', amountCents: 3_000, category: 'Deporte' })]
    const issues = check([{ ...puntual(gasto('2026-10-02', 3_000, 'Deporte')), recurringId: 'gym' }], { recurring })
    assert.ok(issues[0]?.kind === 'habitual-marked-one-off' && issues[0].reason === 'fixed')
  })

  it('un gasto «puntual» que se repite otros meses por un importe parecido; uno de verdad puntual, no', () => {
    const issues = check([puntual(gasto('2026-10-02', 2_000, 'Otros', 'Clases de guitarra')), gasto('2026-09-02', 2_200, 'Otros', 'clases de guitarra'), puntual(gasto('2026-10-15', 30_000, 'Otros', 'Bicicleta'))])
    assert.equal(issues.length, 1)
    assert.ok(issues[0].kind === 'habitual-marked-one-off' && issues[0].reason === 'repeats' && issues[0].label === 'Clases de guitarra')
  })

  it('no mira más allá de 6 meses', () => {
    assert.deepEqual(check([gasto('2026-04-20', 2_000, 'Otros', 'Le presté a Juan')]), [])
  })

  it('un objetivo distinto del que le contaste a AXIS', () => {
    const objectives = [objective({ id: 'p', name: 'Patrimonio ideal 18 años', targetCents: 500_000 })]
    const issues = check([], { objectives, memories: [memory('Quiere tener 6.000 € a los 18 años')] })
    assert.equal(issues.length, 1)
    const issue = issues[0]
    assert.ok(issue.kind === 'goal-differs-from-memory' && issue.saidCents === 600_000 && issue.closest?.objectiveId === 'p')
    assert.match(dataIssueSentence(issue), /es de 5\.000/)
  })

  it('coincide (±5 %), es un ritmo al mes, o la nota no cuenta para el plan: no avisa', () => {
    const objectives = [objective({ id: 'p', name: 'Patrimonio', targetCents: 500_000 })]
    const memories = [memory('Quiere juntar unos 5.000 euros'), memory('Ahorra 50 € al mes', { id: 'x' }), memory('Quería 9.000 €', { id: 'y', planIgnored: true }), memory('Le gusta invertir 1.000 €', { id: 'z', category: 'preference' })]
    assert.deepEqual(check([], { objectives, memories }), [])
  })

  it('lee cantidades en el formato de aquí', () => {
    assert.equal(goalAmountOf('meta de 1.250,50 €'), 125_050)
    assert.equal(goalAmountOf('unos 5000 euros para el coche y 300 € al mes'), 500_000)
    assert.equal(goalAmountOf('20 €'), null, 'menos de 50 € no es una meta')
  })
})

describe('el paso «Revisa datos» en el plan', () => {
  it('va también en un plan bloqueado, no cambia importes y entra en la lista del mes', () => {
    const movements = [ingreso('2026-10-01', 3_500), gasto('2026-10-12', 1_200, 'Otros', 'Le presté a Juan')]
    const decision = decide({ context: buildFinancialContext(snapshot({ config: startedOn('2026-09-21'), movements }), ASOF) })
    const issues = checkData({ movements, objectives: [], memories: [], asOf: ASOF })
    const without = buildAllocationPlan(decision)
    const withIssues = buildAllocationPlan(decision, { dataIssues: issues })
    const step = withIssues.steps.find((s) => s.kind === 'check-data')
    assert.ok(step, 'el paso aparece aunque el plan esté bloqueado')
    assert.deepEqual(withIssues.monthly, without.monthly, 'los importes no cambian')
    assert.deepEqual(withIssues.steps.filter((s) => s.kind !== 'check-data'), without.steps)
    assert.equal(describeStep(step, withIssues, []).title, 'Revisa un dato que parece mal apuntado')
    assert.ok(monthChecklist(withIssues, []).some((i) => i.id === 'check-data'))
  })
})

describe('aportaciones muy pequeñas: un solo fondo', () => {
  it('5 € y 5 € → propone un fondo mixto o juntar meses; 200 € y 100 €, o una sola parte, no', () => {
    assert.equal(isSmallSplit([{ key: 'global-equity', cents: 500 }, { key: 'bonds', cents: 500 }]), true)
    assert.equal(isSmallSplit([{ key: 'global-equity', cents: 20_000 }, { key: 'bonds', cents: 10_000 }]), false)
    assert.equal(isSmallSplit([{ key: 'global-equity', cents: 1_000 }]), false)
    assert.equal(isSmallSplit([{ key: 'global-equity', cents: 9_000 }, { key: 'risky', cents: 1_000 }]), false, 'la parte arriesgada va aparte')
  })

  it('la nota compara comisiones y no nombra ningún producto', () => {
    const note = smallSplitNote([{ key: 'global-equity', label: 'Renta variable global', pct: 50, cents: 500 }, { key: 'bonds', label: 'Renta fija', pct: 50, cents: 500 }] as never)
    assert.ok(note && /fondo mixto/.test(note) && /comisión total/.test(note))
  })
})

/* Fallos vistos con la copia real del 2026-11-08 (menor, 35 € de paga, 1.099 €). */
const withNote = (m: Movement, nota: string): Movement => ({ ...m, nota })
const deuda = (date: string, cents: number, nota: string): Movement => movement({ type: 'ingreso', amountCents: cents, date, category: 'Deuda', nota })

describe('caso real: falsa alarma de «se repite»', () => {
  it('un préstamo marcado como puntual no se avisa aunque su categoría se repita', () => {
    const issues = checkData({ movements: [puntual(withNote(gasto('2026-09-28', 1_000, 'Restaurantes'), 'Se lo he prestado a Lucas')), gasto('2026-11-06', 900, 'Restaurantes')], objectives: [], memories: [], asOf: ASOF })
    assert.deepEqual(issues, [])
  })

  it('la categoría sola no basta para decir que se repite', () => {
    const issues = checkData({ movements: [puntual(gasto('2026-10-17', 500, 'Restaurantes')), gasto('2026-09-10', 450, 'Restaurantes')], objectives: [], memories: [], asOf: ASOF })
    assert.deepEqual(issues, [])
  })
})

describe('caso real: lo que te devuelven no es gasto habitual', () => {
  it('«Peluquero» 18 € y 20 € de «Deuda: Peluquero» días después: cubre los 18 €', () => {
    const corte = withNote(gasto('2026-11-04', 1_800, 'Ropa'), 'Peluquero')
    const covered = reimbursedExpenses([corte, deuda('2026-11-07', 2_000, 'Peluquero')])
    assert.equal(covered.get(corte.id), 1_800)
  })

  it('sin el mismo texto, fuera de plazo o con el gasto ya puntual, no cubre nada', () => {
    const corte = withNote(gasto('2026-11-04', 1_800, 'Ropa'), 'Peluquero')
    assert.equal(reimbursedExpenses([corte, deuda('2026-11-07', 5_000, 'Mi madre me debía 50 euros')]).size, 0)
    assert.equal(reimbursedExpenses([corte, deuda('2027-01-30', 2_000, 'Peluquero')]).size, 0)
    assert.equal(reimbursedExpenses([puntual(corte), deuda('2026-11-07', 2_000, 'Peluquero')]).size, 0)
  })

  it('el plan provisional ya no cuenta el corte devuelto como gasto de este mes', () => {
    const at = new Date(2026, 8, 22, 12).getTime()
    const movements = [
      gasto('2026-09-25', 2_698, 'Ropa'),
      ingreso('2026-10-02', 3_500),
      gasto('2026-10-12', 2_390, 'Restaurantes'),
      ingreso('2026-11-01', 3_500),
      withNote(gasto('2026-11-04', 1_800, 'Ropa'), 'Peluquero'),
      gasto('2026-11-06', 1_089, 'Restaurantes'),
      deuda('2026-11-07', 2_000, 'Peluquero'),
    ]
    const recurring: RecurringMovement[] = [fixed({ startDate: '2026-11-01' })]
    const ctx = buildFinancialContext(snapshot({ config: { key: 'config', initialBalanceCents: 50_000, configuredAt: at, updatedAt: at }, movements, recurring }), ASOF)
    const plan = buildAllocationPlan(decide({ context: ctx }))
    const basis = plan.steps.find((s) => s.kind === 'forecast-basis')
    assert.ok(basis && basis.kind === 'forecast-basis')
    // Este mes (10,89 € sin el corte) ya no supera a octubre. Manda el ritmo de todos los días: 26,98 € en los
    // 9 días de septiembre + 23,90 € de octubre + 10,89 € en 8 días de noviembre ≈ 39,17 €/mes (2026-11-08).
    assert.equal(basis.spendingFrom, 'pace')
    assert.equal(plan.monthly?.spendingCents, 4_000, 'redondeado hacia arriba')
  })
})

describe('caso real: la lista del mes y la nota dicen lo mismo', () => {
  it('5 € y 1 € → una sola línea con un fondo mixto, sin una línea por fondo', () => {
    const facts: MemoryFact[] = [
      { kind: 'riskAttitude', value: 'balanced' },
      { kind: 'horizon', value: 'long' },
      { kind: 'adult', value: false },
      { kind: 'lossCapacity', value: 'high' },
      { kind: 'recurringIncome', cents: 3_500, frequency: 'monthly', category: 'Paga' },
    ]
    const movements = ['08', '09', '10'].flatMap((m) => [ingreso(`2026-${m}-01`, 3_500), gasto(`2026-${m}-10`, 2_900)])
    const objectives = [objective({ id: 'p', name: 'Patrimonio ideal 18 años', targetCents: 500_000, targetDate: '2029-06-29', keepGrowing: true, priority: 2 }), objective({ id: 'c', name: 'Fondo de emergencia', targetCents: 14_400, priority: 1 })]
    const ctx = buildFinancialContext(snapshot({ config: { key: 'config', initialBalanceCents: 100_000, configuredAt: 1, updatedAt: 1 }, movements, objectives }), ASOF)
    const plan = buildAllocationPlan(decide({ context: ctx, memory: { profileFacts: facts.map((fact, i) => ({ id: `f${i}`, updatedAt: i + 1, fact })) } }))
    const step = plan.steps.find((s) => s.kind === 'invest-for-goals')
    assert.ok(step && step.kind === 'invest-for-goals' && isSmallSplit(step.mix), 'aportación pequeña repartida')
    const items = monthChecklist(plan, ctx.objectives).filter((i) => i.id.startsWith('goal-invest'))
    assert.equal(items.length, 1)
    assert.equal(items[0].id, 'goal-invest:together')
    assert.match(items[0].text, /un solo fondo mixto \(unos \d+ % acciones y \d+ % bonos\)/)
  })
})

describe('caso real (copia del 8-nov, 21:52): el colchón sigue a tu gasto y los extras tienen regla', () => {
  // Menor, paga de 35 €, ingresos irregulares, empezó el 22-09. Gasto real sin lo puntual ni lo devuelto ≈ 43 €/mes;
  // octubre solo eran 24 €, y con eso el plan proponía un colchón de 144 € e «invertir 11 € al mes».
  const at = new Date(2026, 8, 22, 12).getTime()
  const movements: Movement[] = [
    puntual(gasto('2026-09-22', 4_500, 'Otros', 'Critique ai')),
    gasto('2026-09-24', 180, 'Restaurantes'),
    ingreso('2026-09-24', 800),
    gasto('2026-09-25', 200, 'Regalos'),
    gasto('2026-09-25', 2_698, 'Ropa'),
    gasto('2026-09-26', 140, 'Restaurantes'),
    puntual(gasto('2026-09-28', 1_000, 'Restaurantes')),
    ingreso('2026-10-02', 3_500),
    deuda('2026-10-07', 5_000, 'Mi madre me debía 50 euros'),
    gasto('2026-10-08', 105),
    movement({ type: 'ingreso', amountCents: 900, date: '2026-10-08', category: 'Deuda' }),
    gasto('2026-10-09', 145, 'Restaurantes'),
    puntual(ingreso('2026-10-11', 60_000)),
    gasto('2026-10-12', 1_250, 'Restaurantes'),
    gasto('2026-10-12', 200),
    puntual(gasto('2026-10-13', 2_178, 'Otros', 'Claude')),
    gasto('2026-10-16', 100),
    puntual(gasto('2026-10-17', 500, 'Restaurantes')),
    gasto('2026-10-25', 250, 'Caprichos'),
    gasto('2026-10-26', 90),
    gasto('2026-10-30', 50, 'Restaurantes'),
    gasto('2026-10-31', 200),
    ingreso('2026-11-01', 3_500),
    withNote(gasto('2026-11-04', 1_800, 'Ropa'), 'Peluquero'),
    gasto('2026-11-06', 189, 'Caprichos'),
    gasto('2026-11-06', 900, 'Restaurantes'),
    deuda('2026-11-07', 2_000, 'Peluquero'),
  ]
  const facts: MemoryFact[] = [
    { kind: 'riskAttitude', value: 'balanced' },
    { kind: 'horizon', value: 'long' },
    { kind: 'irregularIncome', value: true },
    { kind: 'adult', value: false },
    { kind: 'work', value: 'student' },
    { kind: 'dependents', value: false },
    { kind: 'investingExperience', value: 'some' },
    { kind: 'lossCapacity', value: 'high' },
    { kind: 'recurringIncome', cents: 3_500, category: 'Paga', frequency: 'monthly' },
  ]
  const objectives = [
    objective({ name: 'Fondo de emergencia', targetCents: 14_400, priority: 1 }),
    objective({ name: 'Patrimonio ideal 18 años', targetCents: 500_000, targetDate: '2029-06-29', keepGrowing: true, priority: 2 }),
  ]
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  const config: AppConfig = { key: 'config', initialBalanceCents: 109_937 - net, configuredAt: at, updatedAt: at }
  const decision = decide({
    context: buildFinancialContext(snapshot({ config, movements, objectives, recurring: [fixed({ startDate: '2026-10-01' })] }), ASOF),
    memory: { profileFacts: facts.map((fact, i) => ({ id: `f-${i}`, updatedAt: i + 1, fact })) },
  })
  const plan = buildAllocationPlan(decision)
  const step = <K extends PlanStep['kind']>(kind: K) => plan.steps.find((s): s is Extract<PlanStep, { kind: K }> => s.kind === kind)

  it('el gasto es el ritmo de todos los días apuntados (43 €), no los 24 € de octubre', () => {
    assert.equal(plan.monthly?.spendingCents, 4_300)
    assert.equal(step('forecast-basis')?.spendingFrom, 'pace')
    assert.equal(plan.monthly?.savingsCents, 0, 'la paga no cubre el gasto: no se propone invertir nada cada mes')
    assert.equal(step('invest-for-goals'), undefined)
  })

  it('propone subir el colchón de 144 € a 258 € (6 × 43 €) y no invierte esa diferencia', () => {
    const raise = step('raise-cushion')
    assert.equal(raise?.targetCents, 14_400)
    assert.equal(raise?.suggestedCents, 25_800)
    assert.equal(step('invest-goal-money')?.cents, 84_100, '1.099 € − 258 € de colchón')
    assert.ok(monthChecklist(plan, decision.context.objectives).some((i) => i.id === 'raise-cushion'))
  })

  it('dice qué hacer con cada extra, con la misma mezcla y aviso de menor', () => {
    const extras = step('extras-split')
    assert.ok(extras)
    assert.deepEqual(extras.weights.map((w) => w.pct), step('invest-goal-money')!.mix.map((p) => p.pct))
    const text = describeStep(extras, plan, decision.context.objectives)
    assert.match(text.detail ?? '', /colchón no está completo, va primero/)
    assert.match(text.note ?? '', /un adulto/)
  })

  it('cumple todas las reglas de asesor', () => {
    assert.deepEqual(checkPlan(plan, decision), [])
  })
})
