'use client'

/**
 * ¿Dijo en «Tu perfil» que es menor de edad? Solo entonces se quitan las
 * categorías de gasto de adulto y la división en necesario/prescindible. Sin
 * respuesta (o mientras carga) cuenta como mayor de edad (decisión del
 * usuario, 2026-10-20).
 */
import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listUserMemories } from '@/lib/db/axis-memories'
import { deriveProfile } from '@/lib/axis/profile/derive'

export function useIsMinor(): boolean {
  const memories = useLiveQuery(listUserMemories, [], undefined)
  return useMemo(() => (memories ? deriveProfile(memories).adult === false : false), [memories])
}
