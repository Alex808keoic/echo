'use client'

/**
 * Estado de AXIS a partir del panorama financiero.
 *
 * El análisis se calcula una vez por instantánea de datos y se recuerda por
 * identidad del `overview` (que ya es estable mientras no cambian los datos
 * locales): navegar entre pantallas no vuelve a analizar; editar datos, sí.
 */
import { useEffect, useState } from 'react'
import { analyzeSnapshot } from '@/lib/axis/engine'
import type { AxisResult } from '@/lib/axis/types'
import type { FinancialOverview } from './use-financial-overview'

export type AxisState = { status: 'loading' } | AxisResult

const cache = new WeakMap<FinancialOverview, Promise<AxisResult>>()

function resultFor(overview: FinancialOverview): Promise<AxisResult> {
  let pending = cache.get(overview)
  if (!pending) {
    const { config, movements, objectives, positions } = overview
    pending = analyzeSnapshot({ config, movements, objectives, positions })
    cache.set(overview, pending)
  }
  return pending
}

export function useAxis(overview: FinancialOverview | undefined): AxisState {
  const [state, setState] = useState<AxisState>({ status: 'loading' })

  useEffect(() => {
    if (!overview) return
    let cancelled = false
    void resultFor(overview).then((result) => {
      if (!cancelled) setState(result)
    })
    return () => {
      cancelled = true
    }
  }, [overview])

  return state
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
