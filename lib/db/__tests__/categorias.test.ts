/**
 * Categorías: renombrados («Trabajo» → «Paga», «Comida» → «Supermercado»,
 * «Salidas» → «Restaurantes»), las de adulto, lo necesario y lo puntual.
 *
 * Lo que se renombra es solo la ETIQUETA que ve el usuario. Los datos ya
 * guardados (base local y copias de seguridad anteriores) siguen siendo
 * válidos: se traducen al leerlos, nunca se pierden ni se rechazan.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseBackup, BACKUP_FORMAT } from '../backup'
import { ADULT_EXPENSE_CATEGORIES, categoriesFor, currentCategory, EXPENSE_CATEGORIES, expenseNeed, INCOME_CATEGORIES, isOneOff, LEGACY_CATEGORIES, type Movement } from '../../types'
import { needSplit } from '../../finance/summary'

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
  // Copia v1 (anterior al renombrado y a la v2): sin memorias de AXIS.
  JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: '2026-09-01T00:00:00.000Z', config: null, movements: [movimiento(category)], objectives: [], positions: [] })

describe('categorías de ingreso · «Paga» sustituye a «Trabajo»', () => {
  it('la lista que se ofrece al usuario tiene «Paga» y ya no «Trabajo»', () => {
    assert.deepEqual([...INCOME_CATEGORIES], ['Paga', 'Trabajos extra', 'Ventas', 'Regalos', 'Deuda', 'Otros'])
    assert.equal(INCOME_CATEGORIES.includes('Trabajo' as never), false)
    assert.deepEqual([...categoriesFor('ingreso')], [...INCOME_CATEGORIES])
    assert.deepEqual([...categoriesFor('ingreso', { minor: true })], [...INCOME_CATEGORIES], 'los ingresos son los mismos para todas las edades')
    assert.equal(categoriesFor('gasto').includes('Paga' as never), false, 'sigue siendo una categoría solo de ingreso')
  })

  it('«Trabajo» → «Paga», «Comida» → «Supermercado», «Salidas» → «Restaurantes»; el resto no se tocan', () => {
    assert.equal(currentCategory('Trabajo'), 'Paga')
    assert.equal(currentCategory('Comida'), 'Supermercado')
    assert.equal(currentCategory('Salidas'), 'Restaurantes')
    assert.deepEqual(LEGACY_CATEGORIES, { Trabajo: 'Paga', Comida: 'Supermercado', Salidas: 'Restaurantes' })
    for (const c of [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]) assert.equal(currentCategory(c), c, c)
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
    assert.throws(() => parseBackup(copia('Supermercado')), /movimientos no válidos/, 'una categoría de gasto no vale como ingreso')
  })
})

const gasto = (category: string): Movement => ({ id: category, type: 'gasto', amountCents: 10_000, date: '2026-10-01', category: category as Movement['category'], createdAt: 1, updatedAt: 1 })
const copiaGasto = (category: string) =>
  JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: '2026-09-01T00:00:00.000Z', config: null, movements: [gasto(category)], objectives: [], positions: [] })

describe('categorías de gasto (2026-10-20)', () => {
  it('una copia con «Comida» o «Salidas» se importa ya migrada', () => {
    assert.equal(parseBackup(copiaGasto('Comida')).movements[0].category, 'Supermercado')
    assert.equal(parseBackup(copiaGasto('Salidas')).movements[0].category, 'Restaurantes')
  })

  it('un menor de edad ve las básicas más Regalos; sin edad dicha, todas', () => {
    assert.deepEqual([...categoriesFor('gasto', { minor: true })], ['Supermercado', 'Restaurantes', 'Caprichos', 'Ropa', 'Regalos', 'Otros'])
    assert.deepEqual([...categoriesFor('gasto')], [...EXPENSE_CATEGORIES])
    assert.equal(EXPENSE_CATEGORIES.length, 15)
    assert.equal(EXPENSE_CATEGORIES.at(-1), 'Otros', '«Otros» siempre al final')
  })

  it('al editar, un menor sigue viendo la categoría de adulto que ya tenía el movimiento', () => {
    const list = categoriesFor('gasto', { minor: true, keep: 'Vivienda' })
    assert.ok(list.includes('Vivienda'))
    assert.ok(!list.includes('Viajes'))
  })

  it('todas las de gasto menos «Otros» son necesarias o prescindibles', () => {
    for (const c of EXPENSE_CATEGORIES) assert.equal(expenseNeed(c) === null, c === 'Otros', c)
    assert.equal(expenseNeed('Vivienda'), 'necesario')
    assert.equal(expenseNeed('Caprichos'), 'prescindible')
    assert.ok(ADULT_EXPENSE_CATEGORIES.every((c) => EXPENSE_CATEGORIES.includes(c)))
  })

  it('necesario frente a prescindible del mes; «Otros» va aparte', () => {
    const s = needSplit([gasto('Vivienda'), gasto('Supermercado'), gasto('Restaurantes'), { ...gasto('Otros'), motivo: 'Luz' }])
    assert.deepEqual([s.necesarioCents, s.prescindibleCents, s.otherCents], [20_000, 10_000, 10_000])
    assert.deepEqual(s.pcts, [50, 25, 25])
  })
})

describe('«Deuda» (te devuelven lo que te debían)', () => {
  it('cuenta siempre como puntual, aunque no se marque', () => {
    assert.equal(isOneOff({ type: 'ingreso', category: 'Deuda' }), true)
    assert.equal(isOneOff({ type: 'ingreso', category: 'Paga' }), false)
    assert.equal(isOneOff({ type: 'ingreso', category: 'Paga', puntual: true }), true)
  })
})
