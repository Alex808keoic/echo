/**
 * La conexión con la app AXIS del ecosistema: sesión de Google y envío de los
 * resúmenes semanales.
 *
 * Lo único que sale del dispositivo son los snapshots del contrato axis.snapshot.v1
 * con las métricas que el usuario activó, hacia el proyecto Supabase compartido del
 * ecosistema (UE). La librería se carga solo cuando hace falta: quien no conecta
 * AXIS no la descarga nunca.
 */
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Snapshot } from './contract'

/**
 * Proyecto compartido del ecosistema. La clave publicable es pública por diseño:
 * cada usuario solo puede leer y escribir sus propias filas (RLS). La secreta
 * nunca está en una app.
 */
const SUPABASE_URL = 'https://dfqyzqvjuarujxdftfjs.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_4v31bcOXj6y-660XNw8WEw_-cU3t8DL'
const AUTH_STORAGE_KEY = 'sb-dfqyzqvjuarujxdftfjs-auth-token'

/** Marca que se deja antes de ir a Google, para volver a abrir Ajustes al regresar. */
export const RETURN_TO_SETTINGS_KEY = 'finax.ecosystem.return'

/** Entre envíos automáticos pasan al menos estos minutos. */
const MIN_MINUTES_BETWEEN_PUSHES = 5

let clientPromise: Promise<SupabaseClient> | null = null
let lastPushAt = 0

/**
 * Candado dentro de la pestaña. El de por defecto (`navigator.locks`) lo comparten
 * todas las pestañas del origen y, si una se bloquea, cuelga a las demás.
 */
let queue: Promise<unknown> = Promise.resolve()
function tabLock<R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => undefined)
  return run
}

function client(): Promise<SupabaseClient> {
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, storageKey: AUTH_STORAGE_KEY, lock: tabLock },
    }),
  )
  return clientPromise
}

/** `true` si hay una sesión guardada o se está volviendo de Google: solo entonces se carga la librería. */
export function hasEcosystemSignal(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).has('code') || window.localStorage.getItem(AUTH_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

/**
 * Escucha la sesión. Regla de supabase-js: dentro del aviso no se llama a ningún
 * otro método del cliente (se bloquea); se usa la sesión que llega.
 */
export async function watchEcosystemSession(onChange: (session: Session | null) => void): Promise<() => void> {
  const supabase = await client()
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    // Al volver de Google, la dirección trae `?code=`: se limpia cuando ya hay sesión.
    if (session && new URLSearchParams(window.location.search).has('code')) {
      history.replaceState(history.state, '', window.location.pathname)
    }
    onChange(session)
  })
  return () => data.subscription.unsubscribe()
}

export async function signInWithGoogle(): Promise<string | null> {
  const supabase = await client()
  try {
    window.sessionStorage.setItem(RETURN_TO_SETTINGS_KEY, '1')
  } catch {
    // Sin sessionStorage se vuelve a Inicio; no impide conectar.
  }
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/` } })
  return error ? error.message : null
}

export async function signOutOfEcosystem(): Promise<void> {
  const supabase = await client()
  await supabase.auth.signOut()
}

/**
 * Envía todos los snapshots de una vez. Cada uno sustituye al de su semana, así que
 * reenviar es inofensivo y no hace falta recordar qué se mandó.
 * Con `force` no espera los minutos entre envíos (lo pide el usuario).
 */
export async function pushSnapshots(snapshots: readonly Snapshot[], options: { force?: boolean } = {}): Promise<'sent' | 'skipped' | 'failed'> {
  if (!options.force && Date.now() - lastPushAt < MIN_MINUTES_BETWEEN_PUSHES * 60_000) return 'skipped'
  const supabase = await client()
  const rows = snapshots.map((snapshot) => ({
    app: snapshot.app,
    week_start: snapshot.weekStart,
    schema: snapshot.schema,
    complete: snapshot.complete,
    generated_at: snapshot.generatedAt,
    payload: snapshot,
  }))
  const { error } = await supabase.from('snapshots').upsert(rows, { onConflict: 'user_id,app,week_start' })
  if (error) return 'failed'
  lastPushAt = Date.now()
  return 'sent'
}

/** Dejar de compartir: AXIS borra todo lo que recibió de Finax. */
export async function deleteSharedData(): Promise<boolean> {
  const supabase = await client()
  const { error } = await supabase.from('snapshots').delete().eq('app', 'finax')
  if (error) return false
  lastPushAt = 0
  return true
}
