'use client'

/**
 * Estado de AXIS a partir del panorama financiero y del contexto de mercado.
 *
 * Coste y rendimiento:
 * - Los resultados se recuerdan por identidad del `overview` (estable mientras
 *   no cambian los datos locales) y por `researchId` del contexto de mercado:
 *   navegar no vuelve a analizar; editar datos o recibir una investigación
 *   nueva, sí.
 * - Solo quien pide `ai: true` (la pantalla AXIS) provoca una llamada al
 *   proveedor de AXIS (hoy inexistente → motor local). Las tarjetas usan el
 *   motor local, salvo que ya exista un análisis con IA para la misma instantánea.
 * - `refresh()` descarta el resultado cacheado y vuelve a analizar.
 */
import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { analyzeSnapshot } from '@/lib/axis/engine'
import { getAxisMemory, rememberConclusion } from '@/lib/db/axis-memory'
import type { AxisMemory, AxisResult, MarketContext } from '@/lib/axis/types'
import type { FinancialOverview } from './use-financial-overview'

export type AxisState = { status: 'loading' } | AxisResult

type CacheEntry = Map<string, Promise<AxisResult>>

const cache = new WeakMap<FinancialOverview, CacheEntry>()

function resultFor(overview: FinancialOverview, ai: boolean, market: MarketContext | null, memory: AxisMemory | null): Promise<AxisResult> {
  const entry = cache.get(overview) ?? new Map<string, Promise<AxisResult>>()
  cache.set(overview, entry)
  const marketKey = market ? `${market.researchId}@${market.freshness}` : 'none'
  const aiKey = `ai:${marketKey}`
  const cachedAI = entry.get(aiKey)
  if (cachedAI) return cachedAI
  const key = ai ? aiKey : `local:${marketKey}`
  let pending = entry.get(key)
  if (!pending) {
    const { config, movements, objectives, positions } = overview
    pending = analyzeSnapshot({ config, movements, objectives, positions }, ai ? 'ai' : 'local', market, memory)
    entry.set(key, pending)
  }
  return pending
}

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
  // La memoria se lee una vez por montaje; no forma parte de la clave de caché
  // (es contexto, no dato), para no reanalizar por recordar la propia conclusión.
  const memory = useLiveQuery(getAxisMemory, [], undefined)

  useEffect(() => {
    if (!overview || memory === undefined) return
    let cancelled = false
    void resultFor(overview, ai, market, memory).then((result) => {
      if (cancelled) return
      setState(result)
      if (remember && result.status === 'analysis') void rememberConclusion(result.analysis)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview, ai, market, generation, memory === undefined])

  /** Vuelve a analizar la instantánea actual (a petición del usuario). */
  const refresh = useCallback(() => {
    if (!overview) return
    cache.delete(overview)
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
