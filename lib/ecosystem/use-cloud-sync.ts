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
}

const TICK_MS = 60_000

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
  const onPulled = useRef(options.onPulled)
  onPulled.current = options.onPulled

  useEffect(() => {
    setEnabled(isCloudSyncEnabled(adapter.app))
    setLastSyncAt(lastCloudSyncAt(adapter.app))
  }, [adapter.app])

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
        if (result.pulled > 0) onPulled.current?.(result, reason)
        return true
      } catch {
        setFailed(true)
        return false
      } finally {
        setSyncing(false)
      }
    },
    [adapter, getClient, userId, refreshesItself],
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
    () => ({ enabled, syncing, failed, lastSyncAt, syncNow, enable, removeCloudCopy }),
    [enabled, syncing, failed, lastSyncAt, syncNow, enable, removeCloudCopy],
  )
}
