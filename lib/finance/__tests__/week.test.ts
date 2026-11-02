/**
 * La última semana: hoy y los 6 días anteriores, en la gráfica y en las barras por día.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dailyTotals, periodStartISO } from '../summary'
import type { Movement } from '../../types'

const mv = (date: string, type: Movement['type'], amountCents: number): Movement => ({
  id: `${date}-${type}-${amountCents}`,
  type,
  amountCents,
  date,
  category: type === 'gasto' ? 'Supermercado' : 'Paga',
  createdAt: 1,
  updatedAt: 1,
})

describe('última semana', () => {
  it('empieza 6 días antes de hoy', () => {
    assert.equal(periodStartISO('1S', new Date(2026, 10, 2)), '2026-10-27')
  })

  it('las barras son los 7 días hasta hoy, con su día de la semana', () => {
    const bars = dailyTotals([mv('2026-11-02', 'gasto', 1250), mv('2026-11-02', 'gasto', 750), mv('2026-10-27', 'gasto', 500), mv('2026-10-26', 'gasto', 9999), mv('2026-11-01', 'ingreso', 3000)], 'gasto', 7, '2026-11-02')
    assert.equal(bars.length, 7)
    assert.deepEqual(bars.map((b) => b.monthKey), ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    assert.equal(bars[0].value, 5)
    assert.equal(bars[5].value, 0)
    assert.equal(bars[6].value, 20)
    assert.equal(bars[6].month, 'Lu')
    assert.equal(bars[6].fullLabel, 'lunes 2 nov')
  })
})
