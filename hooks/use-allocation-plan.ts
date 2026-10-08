'use client'

import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { buildFinancialContext } from '@/lib/axis/context'
import { decide } from '@/lib/axis/core/decision'
import { buildAllocationPlan, type AllocationPlan } from '@/lib/axis/plan/allocation'
import type { AxisDecision } from '@/lib/axis/types'
import { getAxisMemory } from '@/lib/db/axis-memory'
import type { FinancialOverview } from './use-financial-overview'

/**
 * Plan de reparto calculado en el dispositivo: la misma decisión que AXIS
 * (datos locales y memorias de perfil) y `buildAllocationPlan` encima. No usa
 * el mercado ni la IA y no envía nada fuera. `undefined` mientras carga.
 */
export function useAllocationPlan(overview: FinancialOverview | undefined): { plan: AllocationPlan; decision: AxisDecision } | undefined {
  const memory = useLiveQuery(getAxisMemory, [], undefined)
  return useMemo(() => {
    if (!overview || memory === undefined) return undefined
    const decision = decide({ context: buildFinancialContext(overview.axisSnapshot), ...(memory ? { memory } : {}) })
    return { plan: buildAllocationPlan(decision), decision }
  }, [overview, memory])
}
