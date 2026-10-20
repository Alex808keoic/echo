/**
 * Historial del valor en la base local: se apunta al crear, al cambiar el
 * valor y desde «Actualizar valores»; cambiar otro dato no lo toca, y entra
 * en la copia de seguridad.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db'
import { clearAllData, exportBackup, parseBackup } from '../backup'
import { addPosition, listPositions, setPositionValues, updatePosition } from '../positions'
import { todayISO } from '../../dates'
import type { PositionInput } from '../../types'

const FONDO: PositionInput = { name: 'Fondo', investedCents: 100_000, valueCents: 100_000, date: '2026-01-10', fromLiquid: true, assetType: 'global-equity' }

beforeEach(async () => {
  if (!db.isOpen()) await db.open()
  await clearAllData()
})

describe('posiciones · historial del valor', () => {
  it('al crear se apunta el valor de hoy', async () => {
    const p = await addPosition(FONDO)
    assert.deepEqual(p.valueHistory, [{ date: todayISO(), valueCents: 100_000 }])
  })

  it('cambiar el valor lo apunta (uno por día); cambiar otro dato, no', async () => {
    const p = await addPosition(FONDO)
    await updatePosition(p.id, { ...FONDO, name: 'Fondo global' })
    assert.equal((await listPositions())[0].valueHistory?.length, 1)
    await updatePosition(p.id, { ...FONDO, valueCents: 104_000 })
    await updatePosition(p.id, { ...FONDO, valueCents: 105_000 })
    assert.deepEqual((await listPositions())[0].valueHistory, [{ date: todayISO(), valueCents: 105_000 }])
  })

  it('«Actualizar valores» cambia varias a la vez y las marca al día', async () => {
    const a = await addPosition(FONDO)
    const b = await addPosition({ ...FONDO, name: 'Bonos', assetType: 'bonds' })
    await db.positions.update(b.id, { updatedAt: 1 })
    await setPositionValues([
      { id: a.id, valueCents: 98_000 },
      { id: b.id, valueCents: 100_000 },
    ])
    const list = await listPositions()
    assert.equal(list.find((x) => x.id === a.id)?.valueCents, 98_000)
    assert.ok((list.find((x) => x.id === b.id)?.updatedAt ?? 0) > 1, 'sin cambiar el valor, también queda al día')
  })

  it('la copia de seguridad lleva el historial y lo valida', async () => {
    await addPosition(FONDO)
    const backup = await exportBackup()
    assert.equal(parseBackup(JSON.stringify(backup)).positions[0].valueHistory?.length, 1)
    const bad = { ...backup, positions: [{ ...backup.positions[0], valueHistory: [{ date: 'ayer', valueCents: 1 }] }] }
    assert.throws(() => parseBackup(JSON.stringify(bad)), /inversiones no válidas/)
  })
})
