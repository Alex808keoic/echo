/**
 * Eliminar un movimiento desde su detalle: abrir la confirmación no borra,
 * cancelar vuelve atrás sin borrar, confirmar borra; si el almacenamiento
 * falla, no se cierra ni se da por borrado.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../../db/db'
import { addMovement, listMovements } from '../../db/movements'
import { attemptWrite } from '../../db/storage-errors'
import { deletionConfirmation, requestMovementDeletion, type DeletionPrompt } from '../confirm-deletion'
import type { Movement } from '../../types'

function fakeSheet() {
  const state = { prompt: null as DeletionPrompt | null, done: 0, back: 0 }
  return {
    state,
    ui: {
      show: (p: DeletionPrompt) => void (state.prompt = p),
      done: () => void ((state.prompt = null), state.done++),
      back: () => void ((state.prompt = null), state.back++),
    },
  }
}

const gasto = { type: 'gasto' as const, amountCents: 8_640, date: '2026-10-06', category: 'Comida' as const, motivo: '', nota: '' }

describe('Eliminar movimiento · confirmación', () => {
  let movement: Movement
  const originalError = console.error
  beforeEach(async () => {
    await db.delete()
    await db.open()
    movement = await addMovement(gasto)
    console.error = () => {}
  })
  afterEach(async () => {
    console.error = originalError
    if (!db.isOpen()) await db.open()
  })

  it('abrir la confirmación no borra nada', async () => {
    const sheet = fakeSheet()
    requestMovementDeletion(movement, sheet.ui)
    assert.ok(sheet.state.prompt)
    assert.equal((await listMovements()).length, 1)
  })

  it('cancelar vuelve a la vista anterior y no borra', async () => {
    const sheet = fakeSheet()
    requestMovementDeletion(movement, sheet.ui)
    sheet.state.prompt!.onCancel()
    assert.deepEqual([sheet.state.back, sheet.state.done], [1, 0])
    assert.equal((await listMovements()).length, 1)
  })

  it('confirmar borra el movimiento y cierra', async () => {
    const sheet = fakeSheet()
    requestMovementDeletion(movement, sheet.ui)
    await sheet.state.prompt!.onConfirm()
    assert.equal(sheet.state.done, 1)
    assert.equal((await listMovements()).length, 0)
  })

  it('si el almacenamiento falla, no se cierra ni se da por borrado (Confirm muestra el error)', async () => {
    const sheet = fakeSheet()
    requestMovementDeletion(movement, sheet.ui)
    db.close({ disableAutoOpen: true })
    const result = await attemptWrite(() => sheet.state.prompt!.onConfirm())
    assert.equal(result.ok, false)
    assert.equal(sheet.state.done, 0, 'la hoja sigue abierta para reintentar o cancelar')
    await db.open()
    assert.equal((await listMovements()).length, 1, 'el movimiento sigue ahí')
  })

  it('el texto dice qué se borra (concepto, importe con signo y fecha) y que no se puede deshacer', () => {
    const c = deletionConfirmation(movement)
    assert.equal(c.title, 'Eliminar movimiento')
    assert.equal(c.confirmLabel, 'Eliminar')
    assert.match(c.message, /^¿Eliminar «Comida» \(-86,40 €, /)
    assert.match(c.message, /6 de octubre de 2026|6 oct/)
    assert.match(c.message, /no se puede deshacer/)
    assert.match(deletionConfirmation({ ...movement, type: 'ingreso' }).message, /\(\+86,40 €, /)
  })
})
