'use client'

/**
 * Cuándo se sincroniza la copia en la nube (`cloud-sync.ts`): al abrir la app con
 * sesión, al volver a ella, al salir y cada minuto mientras está a la vista.
 * Igual en Finax, AXTHLETICS y Mentax. Sin sesión no hace nada. Si falla (sin
 * red), no molesta: se reintenta en el siguiente momento.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import {
  deleteCloudCopy,
  isCloudSyncEnabled,
  lastCloudSyncAt,
  runCloudSync,
  setCloudSyncEnabled,
  type SyncAdapter,
  type SyncResult,
} from './cloud-sync'

export type SyncReason = 'open' | 'resume' | 'hide' | 'tick' | 'manual'

export interface CloudSyncApi {
  enabled: boolean
  syncing: boolean
  failed: boolean
  /** Última sincronización correcta en este dispositivo (ms), o `null`. */
  lastSyncAt: number | null
  syncNow(): Promise<boolean>
  /** Vuelve a activar la copia en este dispositivo y sincroniza. */
  enable(): Promise<boolean>
  /** Borra la copia de la nube y la apaga en este dispositivo. */
  removeCloudCopy(): Promise<boolean>
  /**
   * Se volvió de Google desde «¿Ya usas…? Entrar con Google» y aún no ha
   * terminado la primera sincronización: la app enseña «Recuperando tus datos…»
   * en vez de la bienvenida.
   */
  restoring: boolean
  /** Deja de esperar la recuperación (p. ej. no se llegó a entrar). */
  endRestore(): void
}

const TICK_MS = 60_000
/** Si la recuperación no acaba en este tiempo (sin red…), se sigue con la app. */
const RESTORE_TIMEOUT_MS = 30_000

const restoreKey = (app: string) => `${app}.cloudsync.restore`

/**
 * Antes de ir a Google para recuperar los datos: al volver, la app espera a la
 * primera sincronización. Activa también la copia por si estaba apagada aquí.
 */
export function markRestorePending(app: SyncAdapter['app']): void {
  setCloudSyncEnabled(app, true)
  try {
    window.sessionStorage.setItem(restoreKey(app), '1')
  } catch {
    // Sin sessionStorage se ve la bienvenida un momento; los datos llegan igual.
  }
}

/** `true` si se está volviendo de Google para recuperar los datos. */
export function isRestorePending(app: SyncAdapter['app']): boolean {
  try {
    return window.sessionStorage.getItem(restoreKey(app)) !== null
  } catch {
    return false
  }
}

function clearRestore(app: SyncAdapter['app']): void {
  try {
    window.sessionStorage.removeItem(restoreKey(app))
  } catch {
    // Nada que olvidar.
  }
}

export function useCloudSync(options: {
  adapter: SyncAdapter
  session: Session | null
  getClient: () => Promise<SupabaseClient>
  /**
   * Para apps cuya pantalla no se actualiza sola al cambiar la base: en los
   * ticks solo se sube, y aquí se decide qué hacer si ha llegado algo (recargar).
   */
  refreshesItself?: boolean
  onPulled?: (result: SyncResult, reason: SyncReason) => void
}): CloudSyncApi {
  const { adapter, session, getClient, refreshesItself = true } = options
  const [enabled, setEnabled] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const [restoring, setRestoring] = useState(false)
  const onPulled = useRef(options.onPulled)
  onPulled.current = options.onPulled

  useEffect(() => {
    setEnabled(isCloudSyncEnabled(adapter.app))
    setLastSyncAt(lastCloudSyncAt(adapter.app))
    setRestoring(isRestorePending(adapter.app))
  }, [adapter.app])

  const endRestore = useCallback(() => {
    clearRestore(adapter.app)
    setRestoring(false)
  }, [adapter.app])

  useEffect(() => {
    if (!restoring) return
    const timer = window.setTimeout(endRestore, RESTORE_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [restoring, endRestore])

  const userId = session?.user.id ?? null

  const sync = useCallback(
    async (reason: SyncReason): Promise<boolean> => {
      if (!userId || !isCloudSyncEnabled(adapter.app)) return false
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
      const mode = reason === 'hide' || (reason === 'tick' && !refreshesItself) ? 'push' : 'full'
      setSyncing(true)
      try {
        const result = await runCloudSync(adapter, await getClient(), userId, { mode })
        setLastSyncAt(result.at)
        setFailed(false)
        // Antes de avisar: si la app recarga, al volver no debe seguir esperando.
        if (reason === 'open') endRestore()
        if (result.pulled > 0) onPulled.current?.(result, reason)
        return true
      } catch {
        setFailed(true)
        if (reason === 'open') endRestore()
        return false
      } finally {
        setSyncing(false)
      }
    },
    [adapter, getClient, userId, refreshesItself, endRestore],
  )

  useEffect(() => {
    if (!userId || !enabled) return
    void sync('open')
    const onVisibility = () => void sync(document.visibilityState === 'visible' ? 'resume' : 'hide')
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void sync('tick')
    }, TICK_MS)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [userId, enabled, sync])

  const syncNow = useCallback(() => sync('manual'), [sync])

  const enable = useCallback(async () => {
    setCloudSyncEnabled(adapter.app, true)
    setEnabled(true)
    return true
  }, [adapter.app])

  const removeCloudCopy = useCallback(async () => {
    const removed = await deleteCloudCopy(adapter.app, await getClient()).catch(() => false)
    if (removed) {
      setEnabled(false)
      setLastSyncAt(null)
    }
    return removed
  }, [adapter.app, getClient])

  return useMemo(
    () => ({ enabled, syncing, failed, lastSyncAt, syncNow, enable, removeCloudCopy, restoring, endRestore }),
    [enabled, syncing, failed, lastSyncAt, syncNow, enable, removeCloudCopy, restoring, endRestore],
  )
}
