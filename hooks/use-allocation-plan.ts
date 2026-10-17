'use client'

import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { buildFinancialContext } from '@/lib/axis/context'
import { decide } from '@/lib/axis/core/decision'
import { pendingPlanNotes } from '@/lib/axis/chat/memory'
import { buildAllocationPlan, type AllocationPlan } from '@/lib/axis/plan/allocation'
import type { AxisDecision } from '@/lib/axis/types'
import { getAxisMemory } from '@/lib/db/axis-memory'
import { listUserMemories } from '@/lib/db/axis-memories'
import type { FinancialOverview } from './use-financial-overview'
import { useMarketContext } from './use-market-context'
import { inflationFrom } from '@/lib/axis/plan/inflation'

/**
 * Plan de reparto calculado en el dispositivo: la misma decisión que AXIS
 * (datos locales y memorias de perfil) y `buildAllocationPlan` encima, con las
 * notas que el plan aún no puede usar. Del mercado solo toma la inflación para
 * los textos; no usa la IA y no envía nada fuera. `undefined` mientras carga.
 */
export function useAllocationPlan(overview: FinancialOverview | undefined): { plan: AllocationPlan; decision: AxisDecision } | undefined {
  const memory = useLiveQuery(getAxisMemory, [], undefined)
  const memories = useLiveQuery(listUserMemories, [], undefined)
  // Solo para la inflación de los textos (IPC vigente o el objetivo del BCE); los importes no usan el mercado.
  const { market } = useMarketContext(overview)
  return useMemo(() => {
    if (!overview || memory === undefined || memories === undefined) return undefined
    const decision = decide({ context: buildFinancialContext(overview.axisSnapshot), ...(memory ? { memory } : {}) })
    return { plan: buildAllocationPlan(decision, { pendingNotes: pendingPlanNotes(memories).length, inflation: inflationFrom(market) }), decision }
  }, [overview, memory, memories, market])
}
