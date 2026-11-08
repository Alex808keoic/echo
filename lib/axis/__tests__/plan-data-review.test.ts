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
import { buildAllocationPlan } from '../plan/allocation'
import { checkData, goalAmountOf } from '../plan/data-checks'
import { dataIssueSentence, describeStep, smallSplitNote } from '../plan/describe'
import { isSmallSplit } from '../plan/mix'
import { monthChecklist } from '../plan/checklist'
import type { UserMemory } from '../chat/types'
import type { AppConfig, Movement, RecurringMovement } from '../../types'
import { gasto, ingreso, objective, snapshot } from './fixtures'

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
    assert.equal(basis.spendingFrom, 'current-month')
    assert.equal(plan.monthly?.spendingCents, 2_000)
    assert.match(describeStep(basis, plan, []).detail ?? '', /lo que llevas gastado este mes/)
  })
})

describe('datos que parecen mal apuntados', () => {
  const check = (movements: Movement[], extra: { recurring?: RecurringMovement[]; memories?: UserMemory[]; objectives?: ReturnType<typeof objective>[] } = {}) =>
    checkData({ movements, recurring: extra.recurring ?? [], objectives: extra.objectives ?? [], memories: extra.memories ?? [], asOf: ASOF })

  it('un préstamo a alguien apuntado como gasto de cada mes', () => {
    const issues = check([gasto('2026-10-20', 2_000, 'Otros', 'Le presté a Juan'), gasto('2026-10-21', 500, 'Otros', 'Préstamo a Marta')])
    assert.deepEqual(issues.map((i) => i.kind), ['loan-as-expense', 'loan-as-expense'])
    assert.match(dataIssueSentence(issues[0]), /márcalo como puntual/)
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
