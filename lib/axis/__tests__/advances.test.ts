/**
 * «Adelanto» (2026-11-11): pagas 20 € en Restaurantes y un amigo te devolverá 10 €. Sale todo de tu dinero,
 * pero la parte que te devuelven nunca es gasto tuyo; cuando te la devuelven («Ya me lo ha devuelto») es un
 * ingreso de «Deuda» enlazado con `devolucionDe`, que vuelve a tu dinero sin contar como ingreso nuevo.
 */
import 'fake-indexeddb/auto'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { checkData } from '../plan/data-checks'
import { reimbursedExpenses, summarize } from '../../finance/summary'
import { advanceCents, isAdvance, pendingAdvances, returnedByAdvance, type Movement } from '../../types'
import { parseBackup, BACKUP_FORMAT } from '../../db/backup'
import { movement, snapshot } from './fixtures'

const ASOF = '2026-11-20'
const adelanto = (date: string, amountCents: number, cents: number, quien?: string, motivo?: string): Movement =>
  movement({ type: 'gasto', amountCents, date, category: motivo ? 'Otros' : 'Restaurantes', motivo, porDevolver: { cents, ...(quien ? { quien } : {}) } })
const devolucion = (of: Movement, date: string, amountCents: number): Movement =>
  movement({ type: 'ingreso', amountCents, date, category: 'Deuda', nota: `Devolución: ${of.category}`, devolucionDe: of.id })

describe('adelantos', () => {
  it('es un gasto con algo que devolver, y nunca más de lo pagado', () => {
    const a = adelanto('2026-11-10', 2_000, 1_000, 'Lucas')
    assert.ok(isAdvance(a))
    assert.equal(advanceCents(a), 1_000)
    assert.equal(advanceCents({ ...a, porDevolver: { cents: 5_000 } }), 2_000)
    assert.ok(!isAdvance(movement({ type: 'gasto', amountCents: 2_000, date: '2026-11-10', category: 'Restaurantes' })))
  })

  it('salen los 20 € de tu dinero; hasta que te devuelven, te deben 10 €', () => {
    const a = adelanto('2026-11-10', 2_000, 1_000, 'Lucas')
    assert.equal(summarize([a]).balanceCents, -2_000)
    assert.deepEqual(pendingAdvances([a]).map((p) => p.pendingCents), [1_000])
  })

  it('«Ya me lo ha devuelto» suma los 10 € y deja de deberse; una devolución parcial deja el resto pendiente', () => {
    const a = adelanto('2026-11-10', 2_000, 1_000)
    const parte = devolucion(a, '2026-11-12', 400)
    assert.deepEqual(pendingAdvances([a, parte]).map((p) => p.pendingCents), [600])
    const resto = devolucion(a, '2026-11-15', 600)
    assert.equal(returnedByAdvance([a, parte, resto]).get(a.id), 1_000)
    assert.deepEqual(pendingAdvances([a, parte, resto]), [])
    assert.equal(summarize([a, parte, resto]).balanceCents, -1_000)
  })

  it('la parte que te devuelven no es gasto habitual, ni antes ni después de devolverla', () => {
    const a = adelanto('2026-11-10', 2_000, 1_000)
    assert.equal(reimbursedExpenses([a]).get(a.id), 1_000)
    const ctxBefore = buildFinancialContext(snapshot({ movements: [a] }), ASOF)
    assert.equal(ctxBefore.flows.current.expenseCents, 2_000)
    assert.equal(ctxBefore.flows.current.oneOffExpenseCents, 1_000)

    const back = devolucion(a, '2026-11-12', 1_000)
    // Enlazada: no se empareja otra vez por texto, así que no cubre más de lo que toca.
    assert.equal(reimbursedExpenses([a, back]).get(a.id), 1_000)
    const ctxAfter = buildFinancialContext(snapshot({ movements: [a, back] }), ASOF)
    assert.equal(ctxAfter.flows.current.oneOffExpenseCents, 1_000)
    assert.equal(ctxAfter.flows.current.oneOffIncomeCents, 1_000, 'lo devuelto no es un ingreso nuevo')
  })

  it('un adelanto no sale como «préstamo apuntado como gasto»', () => {
    const issues = checkData({ movements: [adelanto('2026-11-10', 2_000, 2_000, 'Juan', 'Le presté a Juan')], recurring: [], objectives: [], memories: [], asOf: ASOF })
    assert.deepEqual(issues, [])
  })

  it('la copia de seguridad acepta adelantos y devoluciones', () => {
    const a = adelanto('2026-11-10', 2_000, 1_000, 'Lucas')
    // v1: lo mínimo (sin memorias ni deudas); los movimientos se validan igual en todas las versiones.
    const text = JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: ASOF, config: null, movements: [a, devolucion(a, '2026-11-12', 1_000)], objectives: [], positions: [] })
    const parsed = parseBackup(text)
    assert.equal(parsed.movements.length, 2)
    assert.deepEqual(parsed.movements[0].porDevolver, { cents: 1_000, quien: 'Lucas' })
    assert.equal(parsed.movements[1].devolucionDe, a.id)
  })
})
