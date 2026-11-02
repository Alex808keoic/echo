'use client'

/**
 * Estado de la conexión con la app AXIS del ecosistema y envío automático.
 *
 * Funciona aunque nunca se conecte: sin sesión guardada no carga la librería ni
 * hace ninguna petición. Con sesión y consentimiento, envía los resúmenes al abrir
 * la app y al salir de ella (como mucho cada pocos minutos). Si falla, no molesta:
 * se vuelve a intentar la próxima vez. Finax nunca espera a AXIS.
 *
 * Con sesión, además, la copia en la nube (`cloud`): tus datos en cualquier
 * dispositivo donde entres con la misma cuenta.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Session } from '@supabase/supabase-js'
import { db } from '@/lib/db/db'
import { getConfig, setEcosystemSharing } from '@/lib/db/config'
import { todayISO } from '@/lib/dates'
import { buildWeeklySnapshots } from '@/lib/ecosystem/snapshot'
import type { FinaxMetric } from '@/lib/ecosystem/sharing'
import { deleteSharedData, ecosystemClient, hasEcosystemSignal, pushSnapshots, signInWithGoogle, signOutOfEcosystem, watchEcosystemSession } from '@/lib/ecosystem/client'
import { finaxSyncAdapter } from '@/lib/ecosystem/finax-sync'
import { markRestorePending, useCloudSync, type CloudSyncApi } from '@/lib/ecosystem/use-cloud-sync'

export type EcosystemAccount = { status: 'checking' } | { status: 'signedOut' } | { status: 'signedIn'; email: string | null }

export interface EcosystemApi {
  account: EcosystemAccount
  /** Métricas que se comparten, o `null` si no se comparte nada. */
  sharedMetrics: FinaxMetric[] | null
  /** Último envío correcto en esta sesión de la app, o `null`. */
  lastSentAt: string | null
  /** El último envío falló (sin red o AXIS no responde). */
  failed: boolean
  signIn(): Promise<string | null>
  /** «¿Ya usas la app?»: entra con Google y, al volver, recupera los datos de la nube. */
  restoreWithGoogle(): Promise<string | null>
  /** Confirma qué se comparte y envía la historia completa. */
  share(metrics: FinaxMetric[]): Promise<boolean>
  /** Deja de compartir y borra en AXIS todo lo recibido de Finax. */
  stopSharing(): Promise<boolean>
  signOut(): Promise<void>
  /** Copia en la nube de tus datos (independiente de lo que se comparte con AXIS). */
  cloud: CloudSyncApi
}

const APP_VERSION = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'

const EcosystemContext = createContext<EcosystemApi | null>(null)

async function snapshotsFor(metrics: readonly FinaxMetric[]) {
  const [config, movements, positions, objectives, debts] = await Promise.all([
    getConfig(),
    db.movements.toArray(),
    db.positions.toArray(),
    db.objectives.toArray(),
    db.debts.toArray(),
  ])
  return buildWeeklySnapshots({
    data: { initialBalanceCents: config?.initialBalanceCents ?? 0, movements, positions, objectives, debts },
    metrics,
    today: todayISO(),
    generatedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
  })
}

export function EcosystemProvider({ children }: { children: ReactNode }) {
  const config = useLiveQuery(() => getConfig(), [])
  const [session, setSession] = useState<Session | null>(null)
  const [account, setAccount] = useState<EcosystemAccount>({ status: 'checking' })
  const [lastSentAt, setLastSentAt] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const sharedMetrics = config?.ecosystem?.metrics ?? null
  const cloud = useCloudSync({ adapter: finaxSyncAdapter, session, getClient: ecosystemClient })

  useEffect(() => {
    if (!hasEcosystemSignal()) {
      setAccount({ status: 'signedOut' })
      return
    }
    let active = true
    let stop: (() => void) | undefined
    void watchEcosystemSession((next) => {
      setSession(next)
      setAccount(next ? { status: 'signedIn', email: next.user.email ?? null } : { status: 'signedOut' })
    })
      .then((unsubscribe) => {
        if (active) stop = unsubscribe
        else unsubscribe()
      })
      .catch(() => setAccount({ status: 'signedOut' }))
    return () => {
      active = false
      stop?.()
    }
  }, [])

  const push = useCallback(async (metrics: readonly FinaxMetric[], force: boolean) => {
    const result = await pushSnapshots(await snapshotsFor(metrics), { force })
    if (result === 'sent') {
      setLastSentAt(new Date().toISOString())
      setFailed(false)
    } else if (result === 'failed') {
      setFailed(true)
    }
    return result !== 'failed'
  }, [])

  // Envío automático: al abrir con sesión y consentimiento, y al salir de la app.
  const autoMetrics = session ? sharedMetrics : null
  const autoKey = autoMetrics?.join(',')
  useEffect(() => {
    if (!autoMetrics) return
    void push(autoMetrics, false).catch(() => setFailed(true))
    const onHide = () => {
      if (document.visibilityState === 'hidden') void push(autoMetrics, false).catch(() => setFailed(true))
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey, push])

  // Navega a Google; la sesión se recoge al volver (`hasEcosystemSignal` ve el `?code=`).
  const signIn = useCallback(() => signInWithGoogle(), [])

  const restoreWithGoogle = useCallback(async () => {
    markRestorePending('finax')
    const failure = await signInWithGoogle()
    if (failure) cloud.endRestore()
    return failure
  }, [cloud])

  // Si se esperaba recuperar pero al final no hay sesión (se canceló en Google), se sigue.
  const { restoring, endRestore } = cloud
  useEffect(() => {
    if (restoring && account.status === 'signedOut') endRestore()
  }, [restoring, account.status, endRestore])

  const share = useCallback(
    async (metrics: FinaxMetric[]) => {
      await setEcosystemSharing({ metrics, since: new Date().toISOString() })
      return push(metrics, true).catch(() => {
        setFailed(true)
        return false
      })
    },
    [push],
  )

  const stopSharing = useCallback(async () => {
    const deleted = await deleteSharedData().catch(() => false)
    if (!deleted) return false
    await setEcosystemSharing(null)
    setLastSentAt(null)
    return true
  }, [])

  const signOut = useCallback(() => signOutOfEcosystem(), [])

  const value = useMemo<EcosystemApi>(
    () => ({ account, sharedMetrics, lastSentAt, failed, signIn, restoreWithGoogle, share, stopSharing, signOut, cloud }),
    [account, sharedMetrics, lastSentAt, failed, signIn, restoreWithGoogle, share, stopSharing, signOut, cloud],
  )
  return <EcosystemContext.Provider value={value}>{children}</EcosystemContext.Provider>
}

export function useEcosystem(): EcosystemApi {
  const api = useContext(EcosystemContext)
  if (!api) throw new Error('useEcosystem fuera de EcosystemProvider')
  return api
}
