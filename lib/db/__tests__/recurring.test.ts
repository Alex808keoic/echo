/**
 * Movimientos fijos en la base local: confirmar crea un único movimiento,
 * omitir no crea ninguno, reprogramar no propone lo anterior y la copia v4
 * los incluye (las anteriores conservan los del dispositivo).
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db'
import { clearAllData, exportBackup, parseBackup, restoreBackup } from '../backup'
import { addRecurring, confirmOccurrence, deleteRecurring, listRecurring, skipOccurrence, updateRecurring } from '../recurring'
import { listMovements } from '../movements'
import { pendingOccurrences } from '../../finance/recurring'
import type { RecurringMovementInput } from '../../types'

const NOMINA: RecurringMovementInput = { name: ' Nómina ', type: 'ingreso', amountCents: 150_000, category: 'Paga', frequency: 'monthly', startDate: '2026-08-28' }
const TODAY = '2026-10-19'

beforeEach(async () => {
  if (!db.isOpen()) await db.open()
  await clearAllData()
})

describe('fijos · alta y pendientes', () => {
  it('guarda el nombre limpio y no crea ningún movimiento hasta confirmar', async () => {
    const r = await addRecurring(NOMINA)
    assert.equal(r.name, 'Nómina')
    assert.deepEqual(pendingOccurrences(r, TODAY), ['2026-08-28', '2026-09-28'])
    assert.equal((await listMovements()).length, 0)
  })
})

describe('fijos · confirmar y omitir', () => {
  it('confirmar crea el movimiento previsto y lo quita de pendientes', async () => {
    const r = await addRecurring(NOMINA)
    assert.equal(await confirmOccurrence(r.id, '2026-08-28'), true)
    const [m] = await listMovements()
    assert.equal(m.amountCents, 150_000)
    assert.equal(m.date, '2026-08-28')
    assert.equal(m.recurringId, r.id)
    assert.equal(m.occurrence, '2026-08-28')
    const [saved] = await listRecurring()
    assert.deepEqual(pendingOccurrences(saved, TODAY), ['2026-09-28'])
  })

  it('confirmar dos veces la misma no duplica el movimiento', async () => {
    const r = await addRecurring(NOMINA)
    const results = await Promise.all([confirmOccurrence(r.id, '2026-09-28'), confirmOccurrence(r.id, '2026-09-28')])
    assert.deepEqual(results.sort(), [false, true])
    assert.equal((await listMovements()).length, 1)
  })

  it('confirmar con cambios guarda lo cambiado, pero sigue enlazado a su vez', async () => {
    const r = await addRecurring(NOMINA)
    await confirmOccurrence(r.id, '2026-09-28', { type: 'ingreso', amountCents: 162_000, date: '2026-09-30', category: 'Paga' })
    const [m] = await listMovements()
    assert.equal(m.amountCents, 162_000)
    assert.equal(m.date, '2026-09-30')
    assert.equal(m.occurrence, '2026-09-28')
  })

  it('omitir no crea movimiento y no vuelve a proponerse', async () => {
    const r = await addRecurring(NOMINA)
    await skipOccurrence(r.id, '2026-08-28')
    assert.equal((await listMovements()).length, 0)
    const [saved] = await listRecurring()
    assert.deepEqual(pendingOccurrences(saved, TODAY), ['2026-09-28'])
  })

  it('borrar el fijo deja en el historial lo ya confirmado', async () => {
    const r = await addRecurring(NOMINA)
    await confirmOccurrence(r.id, '2026-08-28')
    await deleteRecurring(r.id)
    assert.equal((await listRecurring()).length, 0)
    assert.equal((await listMovements()).length, 1)
  })
})

describe('fijos · editar', () => {
  it('cambiar el importe no toca el calendario', async () => {
    const r = await addRecurring(NOMINA)
    await updateRecurring(r.id, { ...NOMINA, amountCents: 160_000, startDate: '2026-08-28' })
    const [saved] = await listRecurring()
    assert.equal(saved.amountCents, 160_000)
    assert.deepEqual(pendingOccurrences(saved, TODAY), ['2026-08-28', '2026-09-28'])
  })

  it('cambiar la próxima vez reprograma: lo anterior deja de proponerse', async () => {
    const r = await addRecurring(NOMINA)
    await updateRecurring(r.id, { ...NOMINA, startDate: '2026-10-01' })
    const [saved] = await listRecurring()
    assert.deepEqual(pendingOccurrences(saved, TODAY), ['2026-10-01'])
    assert.deepEqual(pendingOccurrences(saved, '2026-11-02'), ['2026-10-01', '2026-11-01'])
  })
})

describe('fijos · copia de seguridad', () => {
  it('la v4 los lleva y restaurarla los sustituye', async () => {
    const r = await addRecurring(NOMINA)
    await confirmOccurrence(r.id, '2026-08-28')
    const text = JSON.stringify(await exportBackup())
    await clearAllData()
    await addRecurring({ ...NOMINA, name: 'Otro' })
    await restoreBackup(parseBackup(text))
    const list = await listRecurring()
    assert.deepEqual(list.map((x) => x.name), ['Nómina'])
    assert.equal(list[0].doneThrough, '2026-08-28')
    assert.equal((await listMovements())[0].recurringId, r.id)
  })

  it('una copia anterior a la v4 conserva los fijos del dispositivo', async () => {
    await addRecurring(NOMINA)
    const backup = { ...(await exportBackup()), version: 3 } as Record<string, unknown>
    delete backup.recurring
    await restoreBackup(parseBackup(JSON.stringify(backup)))
    assert.equal((await listRecurring()).length, 1)
  })

  it('un fijo no válido rechaza la copia entera', async () => {
    const backup = { ...(await exportBackup()), recurring: [{ id: 'x', name: 'Mal', type: 'gasto', amountCents: 0 }] }
    assert.throws(() => parseBackup(JSON.stringify(backup)), /movimientos fijos no válidos/)
  })

  it('borrar todos los datos también los borra', async () => {
    await addRecurring(NOMINA)
    await clearAllData()
    assert.equal((await listRecurring()).length, 0)
  })
})
