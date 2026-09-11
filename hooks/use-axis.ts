'use client'

/**
 * Estado de AXIS a partir del panorama financiero.
 *
 * Coste y rendimiento:
 * - Los resultados se recuerdan por identidad del `overview` (estable mientras
 *   no cambian los datos locales): navegar no vuelve a analizar; editar, sí.
 * - Solo quien pide `ai: true` (la pantalla AXIS) provoca una llamada al
 *   proveedor. Las tarjetas de Inicio/Mi Dinero/Estadísticas usan el motor
 *   local, salvo que ya exista un análisis con IA para la misma instantánea.
 * - `refresh()` descarta el resultado cacheado y vuelve a analizar a petición
 *   del usuario.
 */
import { useCallback, useEffect, useState } from 'react'
import { analyzeSnapshot } from '@/lib/axis/engine'
import type { AxisResult } from '@/lib/axis/types'
import type { FinancialOverview } from './use-financial-overview'

export type AxisState = { status: 'loading' } | AxisResult

interface CacheEntry {
  local?: Promise<AxisResult>
  ai?: Promise<AxisResult>
}

const cache = new WeakMap<FinancialOverview, CacheEntry>()

function resultFor(overview: FinancialOverview, ai: boolean): Promise<AxisResult> {
  const entry = cache.get(overview) ?? {}
  cache.set(overview, entry)
  if (entry.ai) return entry.ai
  const kind = ai ? 'ai' : 'local'
  if (!entry[kind]) {
    const { config, movements, objectives, positions } = overview
    entry[kind] = analyzeSnapshot({ config, movements, objectives, positions }, kind)
  }
  return entry[kind]
}

export interface UseAxisOptions {
  /** Intentar el análisis con IA (con fallback local). Por defecto, solo local. */
  ai?: boolean
}

export function useAxis(overview: FinancialOverview | undefined, { ai = false }: UseAxisOptions = {}) {
  const [state, setState] = useState<AxisState>({ status: 'loading' })
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    if (!overview) return
    let cancelled = false
    void resultFor(overview, ai).then((result) => {
      if (!cancelled) setState(result)
    })
    return () => {
      cancelled = true
    }
  }, [overview, ai, generation])

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
