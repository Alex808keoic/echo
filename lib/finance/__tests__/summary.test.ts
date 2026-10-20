/**
 * Barras de Estadísticas: el rango «Todo» cubre todo el historial, nunca menos que «1A».
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { historyMonthCount, monthlyTotals } from '../summary'
import { shiftedMonthKey } from '../../dates'
import type { Movement } from '../../types'

let seq = 0
const gasto = (monthOffset: number, amountCents = 1000): Movement => ({
  id: `m${++seq}`,
  type: 'gasto',
  amountCents,
  date: `${shiftedMonthKey(monthOffset)}-15`,
  category: 'Supermercado',
  createdAt: 0,
  updatedAt: 0,
})

describe('historyMonthCount', () => {
  it('sin historial largo, «Todo» enseña lo mismo que «1A»', () => {
    assert.equal(historyMonthCount([], 12), 12)
    assert.equal(historyMonthCount([gasto(0), gasto(-3)], 12), 12)
  })

  it('cuenta desde el mes del movimiento más antiguo hasta el actual, ambos incluidos', () => {
    assert.equal(historyMonthCount([gasto(0), gasto(-29), gasto(-5)], 12), 30)
  })

  it('un movimiento con fecha futura no alarga el rango', () => {
    assert.equal(historyMonthCount([gasto(4), gasto(-20)], 12), 21)
  })

  it('las barras de «Todo» llegan hasta el primer gasto', () => {
    const movements = [gasto(0, 500), gasto(-17, 2500)]
    const bars = monthlyTotals(movements, 'gasto', historyMonthCount(movements, 12))
    assert.equal(bars.length, 18)
    assert.equal(bars[0].monthKey, shiftedMonthKey(-17))
    assert.equal(bars[0].value, 25)
    assert.equal(bars.at(-1)?.monthKey, shiftedMonthKey(0))
  })
})
