/**
 * Importes sin decimales para leer un punto de las gráficas: se redondea,
 * nunca se trunca, y un negativo conserva su «-».
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatWholeCurrency } from '../format'
import { formatMonthYear } from '../dates'

describe('formatWholeCurrency', () => {
  it('redondea al euro y agrupa miles', () => {
    assert.equal(formatWholeCurrency(8851.21), '8.851 €')
    assert.equal(formatWholeCurrency(396.89), '397 €')
    assert.equal(formatWholeCurrency(1450), '1.450 €')
    assert.equal(formatWholeCurrency(1234567.5), '1.234.568 €')
  })

  it('negativos con signo; lo que redondea a cero es «0 €»', () => {
    assert.equal(formatWholeCurrency(-1740.79), '-1.741 €')
    assert.equal(formatWholeCurrency(-0.4), '0 €')
    assert.equal(formatWholeCurrency(0), '0 €')
  })
})

describe('formatMonthYear', () => {
  it('mes completo y año', () => {
    assert.equal(formatMonthYear('2026-10'), 'octubre de 2026')
    assert.equal(formatMonthYear('2025-01'), 'enero de 2025')
  })
})
