/**
 * Qué viaja en la copia en la nube de Finax (`cloud-sync.ts`).
 *
 * Todo lo que es tuyo: movimientos, objetivos, inversiones, deudas, fijos,
 * efectivo, configuración y lo que AXIS recuerda de ti. Se quedan en el
 * dispositivo la caché del mercado (`market`, se vuelve a pedir) y `meta`
 * (cuándo hiciste la copia en este móvil, tarjetas cerradas aquí).
 *
 * Al aplicar lo que llega se escribe en Dexie, así que las pantallas con
 * `useLiveQuery` se actualizan solas.
 */
import type { Table } from 'dexie'
import { db } from '../db/db'
import type { RemoteChange, SyncAdapter } from './cloud-sync'

const SYNCED_TABLES = [
  'movements',
  'objectives',
  'positions',
  'config',
  'axisMemory',
  'axisMemories',
  'axisConversation',
  'planChecks',
  'debts',
  'recurring',
  'cashTransfers',
] as const

const table = (name: string) => db.table(name) as Table<Record<string, unknown>, string>

export const finaxSyncAdapter: SyncAdapter = {
  app: 'finax',
  stores: SYNCED_TABLES,
  async readAll(store) {
    const t = table(store)
    const keyPath = t.schema.primKey.keyPath as string
    const rows = await t.toArray()
    return rows.flatMap((value) => (typeof value[keyPath] === 'string' ? [{ key: value[keyPath] as string, value }] : []))
  },
  async apply(changes: readonly RemoteChange[]) {
    const stores = [...new Set(changes.map((c) => c.store))]
    await db.transaction('rw', stores.map(table), async () => {
      for (const change of changes) {
        if (change.value === null) await table(change.store).delete(change.key)
        else await table(change.store).put(change.value as Record<string, unknown>)
      }
    })
  },
}
