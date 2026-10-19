'use client'

/**
 * Movimientos fijos y lo que queda por confirmar hoy. Aparte del panorama
 * financiero a propósito: una plantilla no es dinero, y cambiarla no debe
 * relanzar el análisis de AXIS.
 */
import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listRecurring } from '@/lib/db/recurring'
import { pendingRecurring, type PendingOccurrence } from '@/lib/finance/recurring'
import { todayISO } from '@/lib/dates'
import type { RecurringMovement } from '@/lib/types'

export interface RecurringState {
  recurring: RecurringMovement[]
  pending: PendingOccurrence[]
}

/** `undefined` mientras cargan. */
export function useRecurring(): RecurringState | undefined {
  const recurring = useLiveQuery(listRecurring, [])
  return useMemo(() => (recurring === undefined ? undefined : { recurring, pending: pendingRecurring(recurring, todayISO()) }), [recurring])
}
