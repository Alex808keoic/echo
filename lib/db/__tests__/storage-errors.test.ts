/**
 * Escrituras que fallan en el almacenamiento: se comunican, no se dan por
 * buenas, se pueden reintentar y no se confunden con una validación.
 * Fallo real de Dexie: base cerrada sin reapertura automática.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db'
import { addMovement, listMovements } from '../movements'
import { addObjective, listObjectives, markObjectiveAchieved } from '../objectives'
import { parseBackup } from '../backup'
import { attemptWrite, exportErrorMessage, isStorageError, writeErrorMessage } from '../storage-errors'
import { requestObjectiveAchievement, type AchievementPrompt } from '../../objectives/confirm-achievement'

const STORAGE_MESSAGE = /el almacenamiento de este navegador ha fallado/
const gasto = { type: 'gasto' as const, amountCents: 1_250, date: '2026-10-01', category: 'Comida' as const, motivo: '', nota: '' }

/** Silencia el console.error esperado de attemptWrite (el error no se oculta: se registra). */
function captureConsole() {
  const original = console.error
  const logged: unknown[][] = []
  console.error = (...args: unknown[]) => void logged.push(args)
  return { logged, restore: () => (console.error = original) }
}

describe('escrituras · fallos de almacenamiento', () => {
  let consoleCapture: ReturnType<typeof captureConsole>
  beforeEach(async () => {
    consoleCapture = captureConsole()
    await db.delete()
    await db.open()
  })
  afterEach(async () => {
    consoleCapture.restore()
    if (!db.isOpen()) await db.open()
  })

  it('sin errores, igual que siempre: se guarda y se informa de éxito', async () => {
    const result = await attemptWrite(() => addMovement(gasto))
    assert.deepEqual(result, { ok: true })
    assert.equal((await listMovements()).length, 1)
  })

  it('si la base falla, la escritura se comunica como error de almacenamiento, nunca como éxito', async () => {
    await addMovement(gasto)
    db.close({ disableAutoOpen: true })
    const result = await attemptWrite(() => addMovement({ ...gasto, amountCents: 9_999 }))
    assert.equal(result.ok, false)
    assert.ok(!result.ok && isStorageError(result.error), 'es un error de Dexie')
    assert.ok(!result.ok && STORAGE_MESSAGE.test(result.message), !result.ok ? result.message : '')
    assert.equal(consoleCapture.logged.length, 1, 'el error no se oculta: queda registrado')
    await db.open()
    assert.deepEqual((await listMovements()).map((m) => m.amountCents), [1_250], 'los datos anteriores siguen intactos')
  })

  it('reintentar vuelve a ejecutar la operación y, si el almacenamiento responde, se guarda', async () => {
    let calls = 0
    const write = () => {
      calls++
      return addMovement(gasto)
    }
    db.close({ disableAutoOpen: true })
    assert.equal((await attemptWrite(write)).ok, false)
    await db.open()
    assert.deepEqual(await attemptWrite(write), { ok: true })
    assert.equal(calls, 2)
    assert.equal((await listMovements()).length, 1)
  })

  it('un error que no es del almacenamiento no se presenta como tal', async () => {
    const result = await attemptWrite(() => markObjectiveAchieved('no-existe'))
    assert.equal(result.ok, false)
    assert.ok(!result.ok && !isStorageError(result.error))
    assert.ok(!result.ok && !STORAGE_MESSAGE.test(result.message), !result.ok ? result.message : '')
    assert.throws(() => parseBackup('no es json'), (e: unknown) => !isStorageError(e), 'la validación de una copia sigue siendo su propio error')
  })

  it('confirmación (Confirm): si confirmar falla, no se cierra ni se marca nada', async () => {
    const objective = await addObjective({ name: 'Viaje', targetCents: 100_000 })
    let prompt: AchievementPrompt | null = null
    let closed = 0
    requestObjectiveAchievement(objective, { show: (p) => (prompt = p), close: () => closed++ })
    db.close({ disableAutoOpen: true })
    const result = await attemptWrite(() => prompt!.onConfirm())
    assert.equal(result.ok, false)
    assert.equal(closed, 0, 'la hoja sigue abierta para reintentar o cancelar')
    await db.open()
    assert.equal((await listObjectives())[0].achievedAt, undefined)
  })

  it('mensajes: escritura y exportación, según el tipo de error', () => {
    assert.doesNotMatch(writeErrorMessage(new Error('x')), STORAGE_MESSAGE)
    assert.match(writeErrorMessage(new DOMException('cuota', 'QuotaExceededError')), STORAGE_MESSAGE)
    assert.match(exportErrorMessage(new DOMException('cuota', 'QuotaExceededError')), /no responde\. Tus datos no han cambiado/)
    assert.doesNotMatch(exportErrorMessage(new Error('x')), /almacenamiento/)
  })
})
