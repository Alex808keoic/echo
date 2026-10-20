/**
 * Dexie v9: al abrir una base v8, «Comida» pasa a «Supermercado» y «Salidas»
 * a «Restaurantes» en movimientos y en fijos. Importes, fechas y el resto no
 * se tocan.
 */
import 'fake-indexeddb/auto'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import Dexie from 'dexie'

describe('migración v9 de categorías', () => {
  it('traduce las categorías antiguas al abrir la base', async () => {
    // Base como la dejaba la v8 (mismas tablas, sin la migración).
    const old = new Dexie('finax')
    old.version(8).stores({
      movements: 'id, date, type, category',
      objectives: 'id',
      positions: 'id, date',
      config: 'key',
      market: 'key',
      axisMemory: 'key',
      axisMemories: 'id, updatedAt',
      axisConversation: 'key',
      planChecks: 'key',
      debts: 'id',
      meta: 'key',
      recurring: 'id',
    })
    await old.open()
    const base = { type: 'gasto', date: '2026-10-01', createdAt: 1, updatedAt: 1 }
    await old.table('movements').bulkAdd([
      { ...base, id: 'a', amountCents: 4_500, category: 'Comida' },
      { ...base, id: 'b', amountCents: 2_000, category: 'Salidas' },
      { ...base, id: 'c', amountCents: 1_000, category: 'Ropa' },
    ])
    await old.table('recurring').add({ id: 'r', name: 'Compra semanal', type: 'gasto', amountCents: 6_000, category: 'Comida', frequency: 'monthly', startDate: '2026-10-05', createdAt: 1, updatedAt: 1 })
    old.close()

    const { db } = await import('../db')
    await db.open()
    const movements = await db.movements.orderBy('id').toArray()
    assert.deepEqual(movements.map((m) => [m.id, m.category, m.amountCents]), [
      ['a', 'Supermercado', 4_500],
      ['b', 'Restaurantes', 2_000],
      ['c', 'Ropa', 1_000],
    ])
    assert.equal((await db.recurring.get('r'))?.category, 'Supermercado')
    db.close()
  })
})
