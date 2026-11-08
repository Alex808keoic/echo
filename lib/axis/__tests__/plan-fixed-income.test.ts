/**
 * La paga fija y el mes en que empezaste (2026-11-07). Caso real: empezó a usar
 * Finax el 21 de septiembre y tiene una paga fija de 35 € al mes que no siempre
 * confirma. El plan decía «Primero, consigue que te sobre algo cada mes»:
 * septiembre tenía gastos pero no la paga (llegó antes de empezar), y la paga
 * pendiente de confirmar no contaba.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext, closedMonthsOf } from '../context'
import { decide } from '../core/decision'
import { buildAllocationPlan } from '../plan/allocation'
import { usualExpenseMonths } from '../rules/shared'
import type { AppConfig, RecurringMovement } from '../../types'
import { gasto, ingreso, snapshot } from './fixtures'

const ASOF = '2026-11-07'
const startedOn = (iso: string): AppConfig => {
  const [y, m, d] = iso.split('-').map(Number)
  const at = new Date(y, m - 1, d, 12).getTime()
  return { key: 'config', initialBalanceCents: 5_000, configuredAt: at, updatedAt: at }
}
const paga = (extra: Partial<RecurringMovement> = {}): RecurringMovement => ({
  id: 'paga',
  name: 'Paga',
  type: 'ingreso',
  amountCents: 3_500,
  category: 'Paga',
  frequency: 'monthly',
  startDate: '2026-09-01',
  createdAt: 1,
  updatedAt: 1,
  ...extra,
})
const movements = [gasto('2026-09-22', 1_200), gasto('2026-09-28', 800), gasto('2026-10-04', 900), gasto('2026-10-18', 600), ingreso('2026-10-25', 1_000), ingreso('2026-11-02', 2_611), gasto('2026-11-03', 500)]

describe('el mes en que empezaste a usar Finax', () => {
  it('si empezaste a mitad de mes, ese mes no cuenta como habitual', () => {
    const months = closedMonthsOf(movements, ASOF, { startedOn: '2026-09-21' })
    assert.equal(months.find((m) => m.key === '2026-09')?.partial, true)
    assert.equal(months.find((m) => m.key === '2026-10')?.partial, undefined)
    assert.deepEqual(usualExpenseMonths(months).map((m) => m.key), ['2026-10'])
  })

  it('si empezaste en los primeros días, o apuntaste cosas de antes, el mes cuenta entero', () => {
    assert.equal(closedMonthsOf(movements, ASOF, { startedOn: '2026-09-03' }).find((m) => m.key === '2026-09')?.partial, undefined)
    const backfilled = [gasto('2026-09-02', 700), ...movements]
    assert.equal(closedMonthsOf(backfilled, ASOF, { startedOn: '2026-09-21' }).find((m) => m.key === '2026-09')?.partial, undefined)
  })
})

describe('la paga fija pendiente de confirmar', () => {
  it('cuenta para lo habitual de cada mes, nunca como dinero real', () => {
    const months = closedMonthsOf(movements, ASOF, { recurring: [paga()] })
    const oct = months.find((m) => m.key === '2026-10')!
    assert.equal(oct.pendingFixedIncomeCents, 3_500)
    assert.equal(oct.incomeCents, 1_000, 'el ingreso real no cambia')
  })

  it('confirmada u omitida, ya no cuenta como pendiente', () => {
    const confirmed = closedMonthsOf(movements, ASOF, { recurring: [paga({ doneThrough: '2026-10-01' })] })
    assert.equal(confirmed.find((m) => m.key === '2026-10')?.pendingFixedIncomeCents, undefined)
  })

  it('los gastos fijos pendientes no cuentan como ingreso', () => {
    const months = closedMonthsOf(movements, ASOF, { recurring: [paga({ type: 'gasto' })] })
    assert.equal(months.find((m) => m.key === '2026-10')?.pendingFixedIncomeCents, undefined)
  })
})

describe('el plan con la paga fija', () => {
  const planOf = (recurring: RecurringMovement[] | undefined) =>
    buildAllocationPlan(decide({ context: buildFinancialContext(snapshot({ config: startedOn('2026-09-21'), movements, recurring }), ASOF) }))

  it('caso real: ya no dice que no te sobra nada', () => {
    const plan = planOf([paga()])
    assert.notEqual(plan.blocker, 'no-surplus')
    assert.ok(plan.monthly && plan.monthly.savingsCents > 0, 'con la paga, cada mes sobra algo')
    assert.ok(plan.steps.some((s) => s.kind === 'forecast-basis'), 'con un solo mes completo, plan provisional con la paga fija')
  })

  it('el plan provisional usa lo que ingresaste de verdad ese mes si es más que la paga (con la paga pendiente incluida)', () => {
    // Octubre: 10 € de otro ingreso + 35 € de paga pendiente = 45 €, no solo los 35 € de paga.
    // Gasto: el ritmo de todos los días apuntados (20 € en 10 días de septiembre, 15 € en octubre, 5 € en 7 días
    // de noviembre ≈ 26 €/mes), no los 15 € de octubre solo (2026-11-08) → sobran 45 − 26 = 19 €.
    const plan = planOf([paga()])
    const basis = plan.steps.find((s) => s.kind === 'forecast-basis')
    assert.ok(basis && basis.kind === 'forecast-basis')
    assert.equal(basis.lastMonthIncomeCents, 4_500)
    assert.equal(basis.spendingFrom, 'pace')
    assert.equal(plan.monthly?.spendingCents, 2_600, '25,37 € redondeado hacia arriba')
    assert.equal(plan.monthly?.savingsCents, 1_900)
  })

  it('si octubre ingresó menos que la paga, se queda con la paga', () => {
    const plan = buildAllocationPlan(
      decide({ context: buildFinancialContext(snapshot({ config: startedOn('2026-09-21'), movements: movements.filter((m) => m.date !== '2026-10-25'), recurring: [paga({ doneThrough: '2026-10-01' })] }), ASOF) }),
    )
    const basis = plan.steps.find((s) => s.kind === 'forecast-basis')
    assert.ok(basis && basis.kind === 'forecast-basis')
    assert.equal(basis.lastMonthIncomeCents, undefined)
    assert.equal(plan.monthly?.savingsCents, 3_500 - 2_600, 'la paga menos el ritmo de gasto')
  })

  it('sin la paga en «Fijos», faltan datos (septiembre está incompleto), no «no te sobra nada»', () => {
    assert.equal(planOf(undefined).blocker, 'insufficient-data')
  })
})
