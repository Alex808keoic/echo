import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Debt, Movement, Objective, Position } from '../../types'
import { validateSnapshot } from '../contract'
import { DEFAULT_METRICS, isEcosystemSharing } from '../sharing'
import { buildWeeklySnapshots, mondayOf, type SnapshotInput } from '../snapshot'

let n = 0
function movement(date: string, type: Movement['type'], euros: number, extra: Partial<Movement> = {}): Movement {
  return { id: `m${n++}`, type, amountCents: euros * 100, date, category: type === 'gasto' ? 'Supermercado' : 'Nómina', createdAt: 0, updatedAt: 0, ...extra } as Movement
}

function position(date: string, investedEuros: number, valueEuros: number, valueHistory?: Position['valueHistory']): Position {
  return { id: `p${n++}`, name: 'Fondo', investedCents: investedEuros * 100, valueCents: valueEuros * 100, date, fromLiquid: true, createdAt: 0, updatedAt: 0, ...(valueHistory ? { valueHistory } : {}) } as Position
}

function input(data: Partial<SnapshotInput['data']> = {}, metrics: SnapshotInput['metrics'] = DEFAULT_METRICS): SnapshotInput {
  return {
    data: { initialBalanceCents: 100_000, movements: [], positions: [], objectives: [], debts: [], ...data },
    metrics,
    today: '2026-10-30', // jueves
    generatedAt: '2026-10-30T18:00:00Z',
    appVersion: 'test',
  }
}

describe('resúmenes semanales de Finax para AXIS', () => {
  it('el lunes se calcula sin que la zona horaria lo mueva', () => {
    assert.equal(mondayOf('2026-10-30'), '2026-10-26')
    assert.equal(mondayOf('2026-10-26'), '2026-10-26')
    assert.equal(mondayOf('2026-11-01'), '2026-10-26')
  })

  it('sin datos hay un solo snapshot: la semana actual, con el saldo inicial como patrimonio', () => {
    const [week, ...rest] = buildWeeklySnapshots(input())
    assert.equal(rest.length, 0)
    assert.equal(week.weekStart, '2026-10-26')
    assert.equal(week.complete, false)
    assert.deepEqual(week.metrics.wealth_cents, { value: 100_000 })
    assert.deepEqual(week.metrics.income_cents, { value: 0 })
  })

  it('ingresos, gastos y gastos habituales por semana; lo puntual no es habitual', () => {
    const movements = [
      movement('2026-10-12', 'ingreso', 1500),
      movement('2026-10-13', 'gasto', 40),
      movement('2026-10-14', 'gasto', 300, { puntual: true }),
      movement('2026-10-27', 'gasto', 25),
    ]
    const weeks = buildWeeklySnapshots(input({ movements }))
    assert.deepEqual(weeks.map((w) => w.weekStart), ['2026-10-12', '2026-10-19', '2026-10-26'])
    assert.deepEqual(weeks[0].metrics.income_cents, { value: 150_000 })
    assert.deepEqual(weeks[0].metrics.expense_cents, { value: 34_000 })
    assert.deepEqual(weeks[0].metrics.expense_habitual_cents, { value: 4_000 })
    assert.deepEqual(weeks[0].metrics.movements_count, { value: 3 })
    assert.deepEqual(weeks[1].metrics.expense_cents, { value: 0 })
    // Patrimonio al cierre: 1000 + 1500 − 340 = 2160 €, y la semana vacía lo mantiene.
    assert.deepEqual(weeks[0].metrics.wealth_cents, { value: 216_000 })
    assert.deepEqual(weeks[1].metrics.wealth_cents, { value: 216_000 })
    assert.deepEqual(weeks[2].metrics.wealth_cents, { value: 213_500 })
  })

  it('el valor invertido sigue los valores apuntados, en la semana en que se apuntaron', () => {
    const positions = [position('2026-10-13', 500, 560, [{ date: '2026-10-21', valueCents: 530 * 100 }])]
    const weeks = buildWeeklySnapshots(input({ positions }))
    assert.deepEqual(weeks.map((w) => w.metrics.invested_value_cents), [{ value: 50_000 }, { value: 53_000 }, { value: 56_000 }])
  })

  it('las deudas solo tienen dato en la semana actual', () => {
    const debts = [{ id: 'd', name: 'Coche', balanceCents: 300_000, aprBp: 500, monthlyPaymentCents: 20_000, createdAt: 0, updatedAt: 0 } as Debt]
    const weeks = buildWeeklySnapshots(input({ debts, movements: [movement('2026-10-20', 'gasto', 10)] }))
    assert.deepEqual(weeks[0].metrics.debt_cents, { value: null })
    assert.deepEqual(weeks[1].metrics.debt_cents, { value: 300_000 })
  })

  it('los objetivos van solo en la semana actual, con el mismo reparto que la pantalla', () => {
    const objectives = [{ id: 'o1', name: 'Fondo de emergencia', currentCents: 0, targetCents: 200_000, createdAt: 0, updatedAt: 0 } as Objective]
    const weeks = buildWeeklySnapshots(input({ objectives, movements: [movement('2026-10-20', 'ingreso', 0)] }))
    assert.deepEqual(weeks[0].goals, [])
    assert.deepEqual(weeks[1].goals, [{ id: 'o1', title: 'Fondo de emergencia', progress: 0.5, target: 200_000, status: 'active' }])
  })

  it('solo viajan las métricas activadas, y todo cumple el contrato', () => {
    const data = { movements: [movement('2026-09-30', 'ingreso', 900), movement('2026-10-02', 'gasto', 12)], positions: [position('2026-10-01', 100, 120)] }
    assert.deepEqual(Object.keys(buildWeeklySnapshots(input(data, ['expense_cents']))[0].metrics), ['expense_cents'])
    for (const snapshot of buildWeeklySnapshots(input(data))) assert.equal(validateSnapshot(snapshot).ok, true, snapshot.weekStart)
  })

  it('el consentimiento solo admite métricas de Finax', () => {
    assert.equal(isEcosystemSharing({ metrics: ['income_cents'], since: '2026-10-30T18:00:00Z' }), true)
    assert.equal(isEcosystemSharing({ metrics: ['mood_avg'], since: '2026-10-30T18:00:00Z' }), false)
  })
})
