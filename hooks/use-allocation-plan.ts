'use client'

import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { buildFinancialContext } from '@/lib/axis/context'
import { decide } from '@/lib/axis/core/decision'
import { pendingPlanNotes } from '@/lib/axis/chat/memory'
import { buildAllocationPlan, type AllocationPlan } from '@/lib/axis/plan/allocation'
import { checkPlan } from '@/lib/axis/plan/invariants'
import { checkData } from '@/lib/axis/plan/data-checks'
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
    // Datos que parecen mal apuntados: solo el dispositivo tiene los movimientos (el contexto no los lleva).
    const { movements, recurring, objectives } = overview.axisSnapshot
    const dataIssues = checkData({ movements, recurring, objectives, memories, asOf: decision.context.asOf })
    const plan = buildAllocationPlan(decision, { pendingNotes: pendingPlanNotes(memories).length, dataIssues, inflation: inflationFrom(market), equityMove: market?.equityMove ?? null })
    // En desarrollo, las reglas de asesor sobre el plan real: cualquier incoherencia sale en la consola.
    if (process.env.NODE_ENV !== 'production') {
      const violations = checkPlan(plan, decision)
      if (violations.length > 0) console.warn('[Finax] El plan incumple reglas de asesor:', violations)
    }
    return { plan, decision }
  }, [overview, memory, memories, market])
}
