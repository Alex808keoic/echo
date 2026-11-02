/**
 * Copia en la nube: los mismos datos en cualquier dispositivo donde se entre con
 * la misma cuenta de Google del ecosistema.
 *
 * Cada registro local (almacén + clave) es una fila de `app_records` en el
 * proyecto Supabase compartido (UE, RLS: cada usuario solo ve sus filas).
 * Este archivo es igual en Finax, AXTHLETICS y Mentax; lo propio de cada app
 * va en su `SyncAdapter`.
 *
 * Cómo se sincroniza (`runCloudSync`):
 * 1. Se trae lo que ha cambiado en la nube desde la última vez y se aplica en
 *    local. Si un registro también cambió aquí desde la última sincronización,
 *    gana el de este dispositivo, salvo en la primera sincronización de este
 *    dispositivo con esta cuenta, en la que manda la nube.
 * 2. Se sube lo que ha cambiado aquí. «Cambiado» se sabe comparando la huella
 *    de cada registro con la que tenía al sincronizar, así que no hace falta
 *    tocar ningún sitio donde la app escribe. Lo que ya no está en local se sube
 *    como borrado.
 *
 * Red de seguridad: si la base local aparece vacía entera pero había datos
 * sincronizados (base borrada, móvil nuevo con el mismo navegador…), no se
 * borra nada en la nube: se vuelve a descargar todo.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type CloudApp = 'finax' | 'axthletics' | 'mentax'

export interface LocalRecord {
  key: string
  value: unknown
}

/** Un cambio llegado de la nube; `value: null` es borrar. */
export interface RemoteChange {
  store: string
  key: string
  value: unknown
}

export interface SyncAdapter {
  app: CloudApp
  /** Almacenes que viajan. Cachés y datos propios del dispositivo se quedan fuera. */
  stores: readonly string[]
  readAll(store: string): Promise<LocalRecord[]>
  apply(changes: readonly RemoteChange[]): Promise<void>
  /** Lo que sube de un registro (p. ej. sin fotos). Por defecto, el registro tal cual. */
  toCloud?(store: string, value: unknown): unknown
  /** Cómo se guarda en local lo que baja, sabiendo lo que había (p. ej. conservar las fotos). */
  fromCloud?(store: string, remote: unknown, local: unknown): unknown
}

/** Huella y fecha de cambio de cada registro en la última sincronización. `h: ''` = borrado. */
export interface SyncedEntry {
  h: string
  t: number
}

export interface SyncState {
  userId: string | null
  cursor: string | null
  synced: Record<string, Record<string, SyncedEntry>>
  lastSyncAt: number | null
}

export interface RemoteRow {
  store: string
  record_key: string
  data: unknown
  deleted: boolean
  changed_at: number
  server_at: string
}

export interface PushRow {
  app: CloudApp
  store: string
  record_key: string
  data: unknown
  deleted: boolean
  changed_at: number
}

export type LocalMaps = Map<string, Map<string, unknown>>

export const emptyState = (userId: string | null): SyncState => ({ userId, cursor: null, synced: {}, lastSyncAt: null })

// ── Huellas ─────────────────────────────────────────────

/** JSON con las claves ordenadas: la nube (jsonb) no conserva el orden. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map((item) => (item === undefined ? 'null' : stableStringify(item))).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

/** cyrb53: rápida y suficiente para saber si un registro cambió (no es criptográfica). */
export function fingerprint(value: unknown): string {
  const text = stableStringify(value)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** Lo que sube, ya en forma JSON (lo que la nube devolverá). */
function cloudForm(adapter: Pick<SyncAdapter, 'toCloud'>, store: string, value: unknown): unknown {
  const shaped = adapter.toCloud ? adapter.toCloud(store, value) : value
  return JSON.parse(JSON.stringify(shaped ?? null))
}

const hashOf = (adapter: Pick<SyncAdapter, 'toCloud'>, store: string, value: unknown) => fingerprint(cloudForm(adapter, store, value))

// ── Planes (puros, probados) ────────────────────────────

/** `true` si no hay nada en local pero sí había registros sincronizados. */
export function looksWiped(local: LocalMaps, state: SyncState): boolean {
  for (const records of local.values()) if (records.size > 0) return false
  return Object.values(state.synced).some((entries) => Object.values(entries).some((entry) => entry.h !== ''))
}

/**
 * Decide qué cambios de la nube se aplican en local. Modifica `local` y
 * `state.synced` como si ya se hubieran aplicado.
 */
export function planPull(
  adapter: Pick<SyncAdapter, 'stores' | 'toCloud' | 'fromCloud'>,
  rows: readonly RemoteRow[],
  local: LocalMaps,
  state: SyncState,
  firstSync: boolean,
): RemoteChange[] {
  const changes = new Map<string, RemoteChange>()
  for (const row of rows) {
    if (!adapter.stores.includes(row.store)) continue
    const synced = (state.synced[row.store] ??= {})
    const records = local.get(row.store) ?? new Map<string, unknown>()
    local.set(row.store, records)
    const entry = synced[row.record_key]
    const changedAt = Number(row.changed_at)
    if (entry && changedAt <= entry.t) continue

    const current = records.get(row.record_key)
    const currentHash = current === undefined ? '' : hashOf(adapter, row.store, current)
    const dirty = entry ? currentHash !== entry.h : currentHash !== ''

    if (dirty && !firstSync) {
      // Gana lo de este dispositivo; se subirá con una fecha posterior a la de la nube.
      synced[row.record_key] = { h: entry?.h ?? '', t: changedAt }
      continue
    }

    const id = `${row.store}\u0000${row.record_key}`
    if (row.deleted || row.data === null) {
      if (current !== undefined) changes.set(id, { store: row.store, key: row.record_key, value: null })
      records.delete(row.record_key)
      synced[row.record_key] = { h: '', t: changedAt }
      continue
    }
    const next = adapter.fromCloud ? adapter.fromCloud(row.store, row.data, current) : row.data
    const nextHash = hashOf(adapter, row.store, next)
    if (nextHash !== currentHash) changes.set(id, { store: row.store, key: row.record_key, value: next })
    records.set(row.record_key, next)
    synced[row.record_key] = { h: nextHash, t: changedAt }
  }
  return [...changes.values()]
}

/** Lo que hay que subir y cómo queda `synced` si la subida sale bien. */
export function planPush(
  adapter: Pick<SyncAdapter, 'app' | 'stores' | 'toCloud'>,
  local: LocalMaps,
  state: SyncState,
  now: number,
): { rows: PushRow[]; next: Record<string, Record<string, SyncedEntry>> } {
  const rows: PushRow[] = []
  const next: Record<string, Record<string, SyncedEntry>> = {}
  for (const store of adapter.stores) {
    const synced = state.synced[store] ?? {}
    const records = local.get(store) ?? new Map<string, unknown>()
    const out: Record<string, SyncedEntry> = { ...synced }
    for (const [key, value] of records) {
      const data = cloudForm(adapter, store, value)
      const h = fingerprint(data)
      const entry = synced[key]
      if (entry && entry.h === h) continue
      const t = Math.max(now, (entry?.t ?? 0) + 1)
      rows.push({ app: adapter.app, store, record_key: key, data, deleted: false, changed_at: t })
      out[key] = { h, t }
    }
    for (const [key, entry] of Object.entries(synced)) {
      if (entry.h === '' || records.has(key)) continue
      const t = Math.max(now, entry.t + 1)
      rows.push({ app: adapter.app, store, record_key: key, data: null, deleted: true, changed_at: t })
      out[key] = { h: '', t }
    }
    next[store] = out
  }
  return { rows, next }
}

// ── Motor ───────────────────────────────────────────────

const TABLE = 'app_records'
const PAGE = 500
const PUSH_CHUNK = 200
/** Margen al pedir «desde la última vez», por si una escritura confirmó tarde. */
const OVERLAP_MS = 60_000

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const stateKey = (app: CloudApp) => `${app}.cloudsync.v1`
const offKey = (app: CloudApp) => `${app}.cloudsync.off`

export function loadState(storage: KeyValueStorage, app: CloudApp): SyncState | null {
  try {
    const raw = storage.getItem(stateKey(app))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SyncState>
    return { userId: parsed.userId ?? null, cursor: parsed.cursor ?? null, synced: parsed.synced ?? {}, lastSyncAt: parsed.lastSyncAt ?? null }
  } catch {
    return null
  }
}

function saveState(storage: KeyValueStorage, app: CloudApp, state: SyncState): void {
  storage.setItem(stateKey(app), JSON.stringify(state))
}

async function readLocal(adapter: SyncAdapter): Promise<LocalMaps> {
  const local: LocalMaps = new Map()
  for (const store of adapter.stores) {
    const records = await adapter.readAll(store)
    local.set(store, new Map(records.map((record) => [record.key, record.value])))
  }
  return local
}

export interface SyncResult {
  /** Registros que han cambiado en este dispositivo por llegar de la nube. */
  pulled: number
  pushed: number
  at: number
}

let running: Promise<SyncResult> | null = null

/**
 * Sincroniza ya. Si hay una sincronización en marcha, espera a esa.
 * Con `mode: 'push'` solo sube: para cuando bajar obligaría a recargar la pantalla.
 */
export function runCloudSync(
  adapter: SyncAdapter,
  supabase: SupabaseClient,
  userId: string,
  options: { mode?: 'full' | 'push'; storage?: KeyValueStorage } = {},
): Promise<SyncResult> {
  const storage = options.storage ?? window.localStorage
  running ??= syncOnce(adapter, supabase, userId, storage, options.mode ?? 'full').finally(() => {
    running = null
  })
  return running
}

async function syncOnce(
  adapter: SyncAdapter,
  supabase: SupabaseClient,
  userId: string,
  storage: KeyValueStorage,
  mode: 'full' | 'push',
): Promise<SyncResult> {
  let state = loadState(storage, adapter.app)
  if (!state || state.userId !== userId) state = emptyState(userId)

  let local = await readLocal(adapter)
  if (looksWiped(local, state)) state = emptyState(userId)
  const firstSync = state.cursor === null
  // Sin haber bajado nunca, subir podría pisar la nube con lo de un móvil recién instalado.
  if (mode === 'push' && firstSync) return { pulled: 0, pushed: 0, at: Date.now() }

  let changes: RemoteChange[] = []
  if (mode === 'full') {
    changes = await pull(adapter, supabase, local, state, firstSync)
    saveState(storage, adapter.app, state)
    local = await readLocal(adapter)
  }

  // 2. Subir lo que ha cambiado aquí (incluido lo que la app escribió mientras tanto).
  const now = Date.now()
  const { rows, next } = planPush(adapter, local, state, now)
  for (let i = 0; i < rows.length; i += PUSH_CHUNK) {
    const { error } = await supabase.from(TABLE).upsert(rows.slice(i, i + PUSH_CHUNK), { onConflict: 'user_id,app,store,record_key' })
    if (error) throw new Error(error.message)
  }
  state.synced = { ...state.synced, ...next }
  state.lastSyncAt = now
  saveState(storage, adapter.app, state)
  return { pulled: changes.length, pushed: rows.length, at: now }
}

/** 1. Bajar lo que ha cambiado en la nube desde la última vez y aplicarlo en local. */
async function pull(adapter: SyncAdapter, supabase: SupabaseClient, local: LocalMaps, state: SyncState, firstSync: boolean): Promise<RemoteChange[]> {
  const rows: RemoteRow[] = []
  let since = state.cursor ? new Date(Date.parse(state.cursor) - OVERLAP_MS).toISOString() : null
  let cursor = state.cursor
  for (;;) {
    let query = supabase
      .from(TABLE)
      .select('store, record_key, data, deleted, changed_at, server_at')
      .eq('app', adapter.app)
      .order('server_at', { ascending: true })
      .limit(PAGE)
    if (since) query = query.gt('server_at', since)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const page = (data ?? []) as RemoteRow[]
    rows.push(...page)
    if (page.length > 0) {
      since = page[page.length - 1].server_at
      if (!cursor || Date.parse(since) > Date.parse(cursor)) cursor = since
    }
    if (page.length < PAGE) break
  }

  const changes = planPull(adapter, rows, local, state, firstSync)
  if (changes.length > 0) await adapter.apply(changes)
  state.cursor = cursor ?? new Date(0).toISOString()
  return changes
}

// ── Interruptor y borrado ───────────────────────────────

/** La copia está activada salvo que se haya apagado en este dispositivo. */
export function isCloudSyncEnabled(app: CloudApp): boolean {
  try {
    return window.localStorage.getItem(offKey(app)) === null
  } catch {
    return true
  }
}

export function setCloudSyncEnabled(app: CloudApp, enabled: boolean): void {
  try {
    if (enabled) window.localStorage.removeItem(offKey(app))
    else window.localStorage.setItem(offKey(app), '1')
  } catch {
    // Sin almacenamiento no se recuerda la elección; no impide nada.
  }
}

/**
 * Borra la copia de la nube de esta app y la apaga en este dispositivo (si no,
 * se volvería a subir todo al momento). Los datos del dispositivo no se tocan.
 */
export async function deleteCloudCopy(app: CloudApp, supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from(TABLE).delete().eq('app', app)
  if (error) return false
  setCloudSyncEnabled(app, false)
  try {
    window.localStorage.removeItem(stateKey(app))
  } catch {
    // Nada que olvidar.
  }
  return true
}

/** Cuándo se sincronizó por última vez en este dispositivo (ms), o `null`. */
export function lastCloudSyncAt(app: CloudApp): number | null {
  try {
    return loadState(window.localStorage, app)?.lastSyncAt ?? null
  } catch {
    return null
  }
}
