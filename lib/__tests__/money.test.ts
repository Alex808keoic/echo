/**
 * Parseo de importes: la coma es el decimal es-ES, pero muchos teclados
 * móviles solo ofrecen el punto. "12.50" nunca puede convertirse en 1.250 €.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { centsToInputValue, parseAmountToCents, parseBalanceToCents } from '../money'

describe('parseAmountToCents', () => {
  it('coma decimal (es-ES)', () => {
    assert.equal(parseAmountToCents('12,50'), 1250)
    assert.equal(parseAmountToCents('12,5'), 1250)
    assert.equal(parseAmountToCents('0,99'), 99)
    assert.equal(parseAmountToCents('1.234,56'), 123456)
    assert.equal(parseAmountToCents('1.234.567,8'), 123456780)
  })

  it('punto decimal con 1 o 2 cifras (teclado móvil)', () => {
    assert.equal(parseAmountToCents('12.50'), 1250)
    assert.equal(parseAmountToCents('12.5'), 1250)
    assert.equal(parseAmountToCents('0.5'), 50)
    assert.equal(parseAmountToCents('1234.56'), 123456)
  })

  it('punto de miles cuando agrupa de 3 en 3', () => {
    assert.equal(parseAmountToCents('1.234'), 123400)
    assert.equal(parseAmountToCents('12.500'), 1250000)
    assert.equal(parseAmountToCents('1.234.567'), 123456700)
  })

  it('enteros, espacios y símbolo de euro', () => {
    assert.equal(parseAmountToCents('12'), 1200)
    assert.equal(parseAmountToCents(' 12,50 € '), 1250)
    assert.equal(parseAmountToCents('1 234,50'), 123450)
  })

  it('rechaza formatos ambiguos o inválidos', () => {
    for (const raw of ['', 'abc', '12,5,0', '12.5.0', '12.5000', '1.23,45', '12,505', '1,234.56', '12.', '.5', ',5']) {
      assert.equal(parseAmountToCents(raw), null, raw)
    }
  })

  it('rechaza cero y negativos', () => {
    assert.equal(parseAmountToCents('0'), null)
    assert.equal(parseAmountToCents('-12,50'), null)
  })
})

describe('parseBalanceToCents', () => {
  it('admite cero y negativos con ambos separadores', () => {
    assert.equal(parseBalanceToCents('0'), 0)
    assert.equal(parseBalanceToCents('-12,50'), -1250)
    assert.equal(parseBalanceToCents('-12.50'), -1250)
    assert.equal(parseBalanceToCents('-1.234'), -123400)
  })

  it('lo que rellena el formulario se vuelve a leer igual', () => {
    for (const cents of [0, 5, 1250, 123456, -987654]) {
      assert.equal(parseBalanceToCents(centsToInputValue(cents)), cents)
    }
  })
})
