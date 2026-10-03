'use client'

/**
 * Estado de AXIS a partir del panorama financiero y del contexto de mercado.
 *
 * Coste y rendimiento:
 * - Los resultados se recuerdan por identidad del `overview` (estable mientras
 *   no cambian los datos locales), por `researchId` del contexto de mercado y
 *   por la firma del perfil (`lib/axis/analysis-cache.ts`): navegar no vuelve
 *   a analizar; editar datos, recibir una investigación nueva o aceptar u
 *   olvidar un dato del perfil, sí.
 * - Solo quien pide `ai: true` (la pantalla AXIS) provoca una llamada al
 *   proveedor de AXIS (hoy inexistente → motor local). Las tarjetas usan el
 *   motor local, salvo que ya exista un análisis con IA para la misma instantánea.
 * - `refresh()` descarta el resultado cacheado y vuelve a analizar.
 */
import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { analysisCache } from '@/lib/axis/analysis-cache'
import { profileSignature } from '@/lib/axis/profile/derive'
import { getAxisMemory, rememberConclusion } from '@/lib/db/axis-memory'
import type { AxisResult, MarketContext } from '@/lib/axis/types'
import type { FinancialOverview } from './use-financial-overview'

export type AxisState = { status: 'loading' } | AxisResult

export interface UseAxisOptions {
  /** Intentar el análisis con IA (con fallback local). Por defecto, solo local. */
  ai?: boolean
  /** Contexto de mercado reducido, construido en el dispositivo. */
  market?: MarketContext | null
  /** Guardar la conclusión del análisis en la memoria de AXIS (solo la pantalla AXIS). */
  remember?: boolean
}

export function useAxis(overview: FinancialOverview | undefined, { ai = false, market = null, remember = false }: UseAxisOptions = {}) {
  const [state, setState] = useState<AxisState>({ status: 'loading' })
  const [generation, setGeneration] = useState(0)
  // La memoria se lee en vivo, pero solo su perfil (`profileSignature`) relanza
  // el análisis: recordar la propia conclusión cambia la memoria y no debe reanalizar.
  const memory = useLiveQuery(getAxisMemory, [], undefined)
  const profileKey = memory === undefined ? undefined : profileSignature(memory)

  useEffect(() => {
    if (!overview || memory === undefined) return
    let cancelled = false
    void analysisCache.resultFor(overview, ai, market, memory).then((result) => {
      if (cancelled) return
      setState(result)
      if (remember && result.status === 'analysis') void rememberConclusion(result.analysis)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview, ai, market, generation, profileKey])

  /** Vuelve a analizar la instantánea actual (a petición del usuario). */
  const refresh = useCallback(() => {
    if (!overview) return
    analysisCache.invalidate(overview)
    setState({ status: 'loading' })
    setGeneration((g) => g + 1)
  }, [overview])

  return { state, refresh }
}

/** Frase corta para las tarjetas de AXIS en Inicio, Mi Dinero y Estadísticas. */
export function axisHeadline(state: AxisState): string {
  switch (state.status) {
    case 'analysis':
      return state.analysis.headline
    case 'no-analysis':
      return 'Registra tus primeros movimientos para que AXIS pueda leer tu situación.'
    default:
      return 'Preparando la lectura de tus datos…'
  }
}
