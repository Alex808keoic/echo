'use client'

/**
 * Estado de AXIS a partir del panorama financiero. Ejecuta el motor
 * configurado cada vez que cambian los datos locales.
 */
import { useEffect, useState } from 'react'
import { buildAxisContext, getAxisEngine, hasMinimumContext, missingContext } from '@/lib/axis/engine'
import type { AxisState } from '@/lib/axis/types'
import type { FinancialOverview } from './use-financial-overview'

export function useAxis(overview: FinancialOverview | undefined): AxisState {
  const [state, setState] = useState<AxisState>({ status: 'loading' })

  useEffect(() => {
    if (!overview) return
    const context = buildAxisContext(overview)
    if (!hasMinimumContext(context)) {
      setState({ status: 'insufficient-context', context, missing: missingContext(context) })
      return
    }
    let cancelled = false
    getAxisEngine()
      .analyze(context)
      .then((analysis) => {
        if (!cancelled) setState({ status: 'ready', context, analysis })
      })
    return () => {
      cancelled = true
    }
  }, [overview])

  return state
}
