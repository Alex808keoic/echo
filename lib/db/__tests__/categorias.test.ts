/**
 * Renombrado de la categoría de ingreso «Trabajo» → «Paga».
 *
 * Lo que se renombra es solo la ETIQUETA que ve el usuario. Los datos ya
 * guardados (base local y copias de seguridad anteriores) siguen siendo
 * válidos: se traducen al leerlos, nunca se pierden ni se rechazan.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseBackup, BACKUP_FORMAT, BACKUP_VERSION } from '../backup'
import { categoriesFor, currentCategory, INCOME_CATEGORIES, LEGACY_CATEGORIES } from '../../types'

const movimiento = (category: string) => ({
  id: 'm1',
  type: 'ingreso' as const,
  amountCents: 145_000,
  date: '2026-09-01',
  category,
  createdAt: 1,
  updatedAt: 1,
})

const copia = (category: string) =>
  JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: '2026-09-01T00:00:00.000Z', config: null, movements: [movimiento(category)], objectives: [], positions: [] })

describe('categorías de ingreso · «Paga» sustituye a «Trabajo»', () => {
  it('la lista que se ofrece al usuario tiene «Paga» y ya no «Trabajo»', () => {
    assert.deepEqual([...INCOME_CATEGORIES], ['Paga', 'Regalos', 'Otros'])
    assert.equal(INCOME_CATEGORIES.includes('Trabajo' as never), false)
    assert.deepEqual([...categoriesFor('ingreso')], ['Paga', 'Regalos', 'Otros'])
    assert.equal(categoriesFor('gasto').includes('Paga' as never), false, 'sigue siendo una categoría solo de ingreso')
  })

  it('«Trabajo» se traduce a «Paga»; el resto de categorías no se tocan', () => {
    assert.equal(currentCategory('Trabajo'), 'Paga')
    assert.deepEqual(LEGACY_CATEGORIES, { Trabajo: 'Paga' })
    for (const c of [...INCOME_CATEGORIES, 'Comida', 'Regalos', 'Otros']) assert.equal(currentCategory(c), c, c)
    assert.equal(currentCategory('Inventada'), 'Inventada', 'una categoría desconocida se deja tal cual; la validación decide')
  })

  it('una copia de seguridad anterior al renombrado sigue importándose, ya migrada', () => {
    const backup = parseBackup(copia('Trabajo'))
    assert.equal(backup.movements[0].category, 'Paga')
    assert.equal(backup.movements[0].amountCents, 145_000, 'el importe no se toca')
    assert.equal(backup.movements[0].id, 'm1')
  })

  it('una copia con la categoría nueva se importa igual, sin cambios', () => {
    assert.equal(parseBackup(copia('Paga')).movements[0].category, 'Paga')
  })

  it('una categoría que nunca existió sigue rechazándose', () => {
    assert.throws(() => parseBackup(copia('Inventada')), /movimientos no válidos/)
    assert.throws(() => parseBackup(copia('Comida')), /movimientos no válidos/, 'una categoría de gasto no vale como ingreso')
  })
})
