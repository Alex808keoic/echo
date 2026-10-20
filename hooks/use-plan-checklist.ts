'use client'

import { useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { investmentsUpToDate, monthChecklist, UPDATE_INVESTMENTS_ID, UPDATE_INVESTMENTS_ITEM, type ChecklistItem } from '@/lib/axis/plan/checklist'
import type { Position } from '@/lib/types'
import type { AllocationPlan } from '@/lib/axis/plan/allocation'
import { plannedFromPlan, reviewMonth, type MonthReview } from '@/lib/axis/plan/review'
import { inflationFrom } from '@/lib/axis/plan/inflation'
import type { FinancialSnapshot } from '@/lib/axis/context'
import { monthKeyOf } from '@/lib/axis/context'
import type { ObjectiveContext } from '@/lib/axis/types'
import { todayISO } from '@/lib/dates'
import { getPlanMonth, savePlannedMonth, setMonthCheckIn, setPlanCheck } from '@/lib/db/plan-checks'

export interface PlanChecklist {
  items: ChecklistItem[]
  done: Set<string>
  /** Hechos entre los pasos de ESTE plan (lo marcado de pasos que ya no están no cuenta). */
  doneCount: number
  toggle: (id: string) => Promise<void>
  /** Ya has respondido «¿Ha cambiado algo este mes?». */
  checkedIn: boolean
  checkIn: () => Promise<void>
}

/**
 * «Tu decisión del mes» del plan actual y lo que llevas hecho este mes. De paso
 * guarda la foto del plan del mes, que usará la revisión cuando el mes acabe.
 * Con inversiones, añade «Actualiza el valor de tus inversiones», que se marca
 * solo cuando todas tienen un valor apuntado este mes.
 * `undefined` mientras carga.
 */
export function usePlanChecklist(
  plan: AllocationPlan | undefined,
  objectives: readonly ObjectiveContext[] | undefined,
  positions: readonly Position[] | undefined,
): PlanChecklist | undefined {
  const month = todayISO().slice(0, 7)
  const entry = useLiveQuery(async () => (await getPlanMonth(month)) ?? null, [month], undefined)
  const checklist = useMemo(() => {
    if (!plan || !objectives || !positions || entry === undefined) return undefined
    const items = [...monthChecklist(plan, objectives), ...(positions.length > 0 ? [UPDATE_INVESTMENTS_ITEM] : [])]
    const done = new Set(entry?.done ?? [])
    if (investmentsUpToDate(positions, month)) done.add(UPDATE_INVESTMENTS_ID)
    return {
      items,
      done,
      doneCount: items.filter((i) => done.has(i.id)).length,
      toggle: (id: string) => setPlanCheck(month, id, !done.has(id)),
      checkedIn: entry?.checkIn !== undefined,
      checkIn: () => setMonthCheckIn(month),
    }
  }, [plan, objectives, positions, entry, month])

  // Foto del plan de este mes (solo se escribe si cambia).
  useEffect(() => {
    if (!plan || !checklist || plan.status !== 'ready') return
    const invest = plan.steps.find((s) => s.kind === 'invest-long-term')
    void savePlannedMonth(month, {
      savingsCents: plan.monthly?.savingsCents ?? 0,
      investCents: invest?.kind === 'invest-long-term' ? invest.monthlyCents : 0,
      mix: invest?.kind === 'invest-long-term' ? invest.mix.map((p) => ({ key: p.key, cents: p.cents })) : [],
      items: checklist.items.length,
    })
  }, [plan, checklist, month])

  return checklist
}

/** Revisión del mes anterior (lo que pasó frente a lo que decía el plan). `null` si no hay datos de ese mes. */
export function useMonthReview(snapshot: FinancialSnapshot | undefined, plan: AllocationPlan | undefined, checklist: PlanChecklist | undefined): MonthReview | null | undefined {
  const today = todayISO()
  const previous = monthKeyOf(today, -1)
  const entry = useLiveQuery(async () => (await getPlanMonth(previous)) ?? null, [previous], undefined)
  return useMemo(() => {
    if (!snapshot || !plan || !checklist || entry === undefined) return undefined
    const planned = entry?.planned ? { savingsCents: entry.planned.savingsCents, investCents: entry.planned.investCents, items: entry.planned.items } : null
    return reviewMonth({
      snapshot,
      asOf: today,
      planned,
      currentPlanned: plannedFromPlan(plan, checklist.items.length),
      doneCount: entry?.done.length ?? 0,
      inflation: plan.inflation ?? inflationFrom(null),
    })
  }, [snapshot, plan, checklist, entry, today])
}
