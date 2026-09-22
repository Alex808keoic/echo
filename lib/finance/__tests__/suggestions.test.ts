/**
 * Valores por defecto inteligentes: la categoría sugerida sale del historial
 * real del usuario, es determinista y no aparece sin datos suficientes.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MIN_HISTORY_FOR_SUGGESTION, suggestedCategory, SUGGESTION_WINDOW_DAYS } from '../suggestions'
import type { Movement, MovementType } from '../../types'

const TODAY = '2026-09-15'
let seq = 0
const mov = (type: MovementType, category: string, date: string): Movement => ({
  id: `m${++seq}`,
  type,
  amountCents: 1_000,
  date,
  category: category as Movement['category'],
  createdAt: 1,
  updatedAt: 1,
})
const gasto = (category: string, date = TODAY) => mov('gasto', category, date)
const ingreso = (category: string, date = TODAY) => mov('ingreso', category, date)

describe('categoría sugerida', () => {
  it('sin historial no sugiere nada', () => {
    assert.equal(suggestedCategory([], 'gasto', TODAY), null)
    assert.equal(suggestedCategory([], 'ingreso', TODAY), null)
  })

  it('por debajo del mínimo de historial no sugiere: acertar una vez no autoriza a decidir', () => {
    const pocos = Array.from({ length: MIN_HISTORY_FOR_SUGGESTION - 1 }, () => gasto('Comida'))
    assert.equal(suggestedCategory(pocos, 'gasto', TODAY), null)
    assert.equal(suggestedCategory([...pocos, gasto('Comida')], 'gasto', TODAY), 'Comida', 'alcanzado el mínimo, ya sugiere')
  })

  it('sugiere la categoría más usada, no la más reciente', () => {
    const movimientos = [gasto('Comida', '2026-09-01'), gasto('Comida', '2026-09-02'), gasto('Comida', '2026-09-03'), gasto('Ropa', '2026-09-14')]
    assert.equal(suggestedCategory(movimientos, 'gasto', TODAY), 'Comida')
  })

  it('a igual número de usos gana la más reciente; a igual fecha, orden alfabético (determinista)', () => {
    const empate = [gasto('Ropa', '2026-09-01'), gasto('Ropa', '2026-09-02'), gasto('Salidas', '2026-09-10'), gasto('Salidas', '2026-09-11'), gasto('Comida', '2026-09-05')]
    assert.equal(suggestedCategory(empate, 'gasto', TODAY), 'Salidas')
    const mismaFecha = [gasto('Ropa', '2026-09-02'), gasto('Ropa', '2026-09-02'), gasto('Comida', '2026-09-02'), gasto('Comida', '2026-09-02')]
    assert.equal(suggestedCategory(mismaFecha, 'gasto', TODAY), 'Comida')
    // Determinista: el orden de entrada no cambia el resultado.
    assert.equal(suggestedCategory([...mismaFecha].reverse(), 'gasto', TODAY), 'Comida')
  })

  it('cada tipo tiene su propia sugerencia y no se contaminan', () => {
    const mezcla = [gasto('Comida'), gasto('Comida'), gasto('Comida'), ingreso('Paga'), ingreso('Paga'), ingreso('Paga')]
    assert.equal(suggestedCategory(mezcla, 'gasto', TODAY), 'Comida')
    assert.equal(suggestedCategory(mezcla, 'ingreso', TODAY), 'Paga')
  })

  it('solo cuenta el historial reciente: lo viejo no decide el hábito actual', () => {
    const viejo = '2026-01-01'
    const movimientos = [gasto('Ropa', viejo), gasto('Ropa', viejo), gasto('Ropa', viejo), gasto('Ropa', viejo)]
    assert.equal(suggestedCategory(movimientos, 'gasto', TODAY), null, `fuera de los ${SUGGESTION_WINDOW_DAYS} días`)
    const dentro = [...movimientos, gasto('Comida', '2026-09-10'), gasto('Comida', '2026-09-11'), gasto('Comida', '2026-09-12')]
    assert.equal(suggestedCategory(dentro, 'gasto', TODAY), 'Comida')
  })

  it('ignora movimientos con fecha futura', () => {
    const futuros = [gasto('Ropa', '2026-12-01'), gasto('Ropa', '2026-12-02'), gasto('Ropa', '2026-12-03')]
    assert.equal(suggestedCategory(futuros, 'gasto', TODAY), null)
  })

  it('no muta la lista recibida', () => {
    const movimientos = [gasto('Comida'), gasto('Comida'), gasto('Comida')]
    const antes = JSON.parse(JSON.stringify(movimientos))
    suggestedCategory(movimientos, 'gasto', TODAY)
    assert.deepEqual(JSON.parse(JSON.stringify(movimientos)), antes)
  })
})
