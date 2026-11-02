import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  emptyState,
  fingerprint,
  planPull,
  planPush,
  runCloudSync,
  type KeyValueStorage,
  type LocalMaps,
  type RemoteChange,
  type RemoteRow,
  type SyncAdapter,
} from '../cloud-sync'

// ── Dobles: la nube (con la regla del disparador) y un dispositivo ──

interface CloudRow extends RemoteRow {
  user_id: string
  app: string
}

/** Lo justo de supabase-js para `app_records`, con la misma regla que el SQL. */
function fakeCloud(userId: string, rows: CloudRow[] = []) {
  let clock = Date.parse('2026-11-01T00:00:00Z')
  const tick = () => new Date((clock += 1000)).toISOString()
  const client = {
    from() {
      const filters: Array<(row: CloudRow) => boolean> = [(row) => row.user_id === userId]
      let limit = Infinity
      const builder = {
        select: () => builder,
        eq: (column: keyof CloudRow, value: unknown) => (filters.push((row) => row[column] === value), builder),
        gt: (column: keyof CloudRow, value: string) => (filters.push((row) => Date.parse(String(row[column])) > Date.parse(value)), builder),
        order: () => builder,
        limit: (n: number) => ((limit = n), builder),
        then(resolve: (result: { data: CloudRow[]; error: null }) => void) {
          const data = rows
            .filter((row) => filters.every((f) => f(row)))
            .sort((a, b) => Date.parse(a.server_at) - Date.parse(b.server_at))
            .slice(0, limit)
            .map((row) => structuredClone(row))
          resolve({ data, error: null })
        },
        upsert: async (incoming: Array<Omit<CloudRow, 'user_id' | 'server_at'>>) => {
          for (const row of incoming) {
            const index = rows.findIndex((r) => r.user_id === userId && r.app === row.app && r.store === row.store && r.record_key === row.record_key)
            if (index >= 0 && row.changed_at < rows[index].changed_at) continue
            const next = { ...structuredClone(row), user_id: userId, server_at: tick() } as CloudRow
            if (index >= 0) rows[index] = next
            else rows.push(next)
          }
          return { error: null }
        },
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, rows }
}

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) }
}

/** Un dispositivo: almacenes en memoria con registros `{ id, ... }`. */
function device(initial: Record<string, Array<{ id: string } & Record<string, unknown>>> = {}) {
  const stores = new Map<string, Map<string, unknown>>()
  for (const name of ['movements', 'config']) stores.set(name, new Map((initial[name] ?? []).map((r) => [r.id, structuredClone(r)])))
  const adapter: SyncAdapter = {
    app: 'finax',
    stores: ['movements', 'config'],
    readAll: async (store) => [...(stores.get(store) ?? new Map()).entries()].map(([key, value]) => ({ key, value: structuredClone(value) })),
    apply: async (changes) => {
      for (const c of changes) {
        if (c.value === null) stores.get(c.store)!.delete(c.key)
        else stores.get(c.store)!.set(c.key, structuredClone(c.value))
      }
    },
  }
  return { adapter, stores, storage: memoryStorage(), ids: (store: string) => [...stores.get(store)!.keys()].sort() }
}

const ME = 'user-1'

describe('huella', () => {
  it('no depende del orden de las claves ni de los campos undefined', () => {
    assert.equal(fingerprint({ a: 1, b: { c: 2, d: 3 } }), fingerprint({ b: { d: 3, c: 2 }, a: 1, e: undefined }))
    assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }))
  })
})

describe('planes', () => {
  const adapter = { app: 'finax' as const, stores: ['movements'] }
  const row = (key: string, data: unknown, changed_at: number, deleted = false): RemoteRow => ({ store: 'movements', record_key: key, data, deleted, changed_at, server_at: '2026-11-01T00:00:00Z' })

  it('sube lo nuevo y lo cambiado; lo borrado sube como borrado', () => {
    const state = emptyState(ME)
    state.synced.movements = { a: { h: fingerprint({ id: 'a', v: 1 }), t: 10 }, b: { h: fingerprint({ id: 'b' }), t: 10 } }
    const local: LocalMaps = new Map([['movements', new Map<string, unknown>([['a', { id: 'a', v: 2 }], ['c', { id: 'c' }]])]])
    const { rows } = planPush(adapter, local, state, 100)
    assert.deepEqual(rows.map((r) => [r.record_key, r.deleted]).sort(), [['a', false], ['b', true], ['c', false]])
  })

  it('un cambio local sin subir gana a uno de la nube, salvo en la primera sincronización', () => {
    const local = (): LocalMaps => new Map([['movements', new Map<string, unknown>([['a', { id: 'a', v: 'aquí' }]])]])
    const state = emptyState(ME)
    state.synced.movements = { a: { h: fingerprint({ id: 'a', v: 'antes' }), t: 10 } }
    assert.deepEqual(planPull(adapter, [row('a', { id: 'a', v: 'nube' }, 20)], local(), structuredClone(state), false), [])
    const first: RemoteChange[] = planPull(adapter, [row('a', { id: 'a', v: 'nube' }, 20)], local(), emptyState(ME), true)
    assert.deepEqual(first, [{ store: 'movements', key: 'a', value: { id: 'a', v: 'nube' } }])
  })

  it('tras perder contra lo local, se sube con fecha posterior a la de la nube', () => {
    const state = emptyState(ME)
    state.synced.movements = { a: { h: fingerprint({ id: 'a', v: 'antes' }), t: 10 } }
    const local: LocalMaps = new Map([['movements', new Map<string, unknown>([['a', { id: 'a', v: 'aquí' }]])]])
    planPull(adapter, [row('a', { id: 'a', v: 'nube' }, 5_000)], local, state, false)
    const { rows } = planPush(adapter, local, state, 100)
    assert.equal(rows[0].changed_at, 5_001)
  })

  it('toCloud/fromCloud: lo que no sube se conserva al bajar', () => {
    const photos = {
      ...adapter,
      toCloud: (_s: string, v: unknown) => ({ ...(v as object), photo: undefined }),
      fromCloud: (_s: string, remote: unknown, current: unknown) => ({ ...(remote as object), photo: (current as { photo?: string } | undefined)?.photo }),
    }
    const local: LocalMaps = new Map([['movements', new Map<string, unknown>([['a', { id: 'a', v: 1, photo: 'data:img' }]])]])
    const state = emptyState(ME)
    const { rows, next } = planPush(photos, local, state, 100)
    assert.equal((rows[0].data as { photo?: string }).photo, undefined)
    state.synced = next
    const changes = planPull(photos, [row('a', { id: 'a', v: 2 }, 200)], local, state, false)
    assert.deepEqual(changes[0].value, { id: 'a', v: 2, photo: 'data:img' })
  })
})

describe('dos dispositivos con la misma cuenta', () => {
  it('lo de un móvil aparece en el otro, también los cambios y los borrados', async () => {
    const cloud = fakeCloud(ME)
    const a = device({ movements: [{ id: 'm1', euros: 10 }, { id: 'm2', euros: 20 }], config: [{ id: 'config', balance: 100 }] })
    await runCloudSync(a.adapter, cloud.client, ME, { storage: a.storage })
    assert.equal(cloud.rows.length, 3)

    // Móvil nuevo: ha pasado la bienvenida y tiene su propia configuración.
    const b = device({ config: [{ id: 'config', balance: 0 }] })
    const restored = await runCloudSync(b.adapter, cloud.client, ME, { storage: b.storage })
    assert.ok(restored.pulled >= 2)
    assert.deepEqual(b.ids('movements'), ['m1', 'm2'])
    assert.deepEqual(b.stores.get('config')!.get('config'), { id: 'config', balance: 100 }, 'en la primera sincronización manda la nube')

    // B edita m1 y borra m2; A lo ve.
    b.stores.get('movements')!.set('m1', { id: 'm1', euros: 15 })
    b.stores.get('movements')!.delete('m2')
    await runCloudSync(b.adapter, cloud.client, ME, { storage: b.storage })
    await runCloudSync(a.adapter, cloud.client, ME, { storage: a.storage })
    assert.deepEqual(a.ids('movements'), ['m1'])
    assert.deepEqual(a.stores.get('movements')!.get('m1'), { id: 'm1', euros: 15 })

    // Cada uno añade uno distinto: se juntan.
    a.stores.get('movements')!.set('m3', { id: 'm3' })
    b.stores.get('movements')!.set('m4', { id: 'm4' })
    await runCloudSync(a.adapter, cloud.client, ME, { storage: a.storage })
    await runCloudSync(b.adapter, cloud.client, ME, { storage: b.storage })
    await runCloudSync(a.adapter, cloud.client, ME, { storage: a.storage })
    assert.deepEqual(a.ids('movements'), ['m1', 'm3', 'm4'])
    assert.deepEqual(b.ids('movements'), ['m1', 'm3', 'm4'])
  })

  it('si la base local aparece vacía, se recupera de la nube en vez de borrarla', async () => {
    const cloud = fakeCloud(ME)
    const a = device({ movements: [{ id: 'm1' }] })
    await runCloudSync(a.adapter, cloud.client, ME, { storage: a.storage })
    a.stores.get('movements')!.clear()
    await runCloudSync(a.adapter, cloud.client, ME, { storage: a.storage })
    assert.deepEqual(a.ids('movements'), ['m1'])
    assert.equal(cloud.rows.filter((r) => r.deleted).length, 0)
  })

  it('solo subir no hace nada hasta haber bajado una vez', async () => {
    const cloud = fakeCloud(ME)
    const a = device({ movements: [{ id: 'm1' }] })
    const result = await runCloudSync(a.adapter, cloud.client, ME, { storage: a.storage, mode: 'push' })
    assert.equal(result.pushed, 0)
    assert.equal(cloud.rows.length, 0)
  })

  it('otra cuenta en el mismo móvil empieza de cero', async () => {
    const cloud = fakeCloud('user-2', [])
    const a = device({ movements: [{ id: 'm1' }] })
    await runCloudSync(a.adapter, fakeCloud(ME).client, ME, { storage: a.storage })
    await runCloudSync(a.adapter, cloud.client, 'user-2', { storage: a.storage })
    assert.equal(cloud.rows.length, 1, 'sube todo a la otra cuenta, sin creer que ya lo tenía')
  })
})
