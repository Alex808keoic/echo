'use client'

import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { monthChecklist, type ChecklistItem } from '@/lib/axis/plan/checklist'
import type { AllocationPlan } from '@/lib/axis/plan/allocation'
import type { ObjectiveContext } from '@/lib/axis/types'
import { todayISO } from '@/lib/dates'
import { getPlanChecks, setPlanCheck } from '@/lib/db/plan-checks'

export interface PlanChecklist {
  items: ChecklistItem[]
  done: Set<string>
  /** Hechos entre los pasos de ESTE plan (lo marcado de pasos que ya no están no cuenta). */
  doneCount: number
  toggle: (id: string) => Promise<void>
}

/** «Tu decisión del mes» del plan actual y lo que llevas hecho este mes. `undefined` mientras carga. */
export function usePlanChecklist(plan: AllocationPlan | undefined, objectives: readonly ObjectiveContext[] | undefined): PlanChecklist | undefined {
  const month = todayISO().slice(0, 7)
  const stored = useLiveQuery(() => getPlanChecks(month), [month], undefined)
  return useMemo(() => {
    if (!plan || !objectives || stored === undefined) return undefined
    const items = monthChecklist(plan, objectives)
    const done = new Set(stored)
    return {
      items,
      done,
      doneCount: items.filter((i) => done.has(i.id)).length,
      toggle: (id: string) => setPlanCheck(month, id, !done.has(id)),
    }
  }, [plan, objectives, stored, month])
}
