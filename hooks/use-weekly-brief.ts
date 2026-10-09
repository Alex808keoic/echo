'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { buildFinancialContext } from '@/lib/axis/context'
import { decide } from '@/lib/axis/core/decision'
import { weeklyBriefSignature, type WeeklyBriefPhrasing } from '@/lib/axis/brief/phrasing'
import { weeklyBriefPhrasingCache } from '@/lib/axis/brief/transport'
import { briefView, type BriefView } from '@/lib/axis/brief/view'
import { buildWeeklyBrief, type WeeklyBrief } from '@/lib/axis/brief/weekly'
import type { MarketContext } from '@/lib/axis/types'
import { getAxisMemory } from '@/lib/db/axis-memory'
import type { FinancialOverview } from './use-financial-overview'

export interface WeeklyBriefState {
  brief: WeeklyBrief
  view: BriefView
  /** Redacción con IA validada, o `null` (sin IA, falló o aún no ha llegado): entonces se usa `view`. */
  phrasing: WeeklyBriefPhrasing | null
  /** Esperando la redacción (solo con `phrase`). */
  phrasingPending: boolean
}

/**
 * Resumen semanal (parte 5a): el Brief determinista con la misma decisión que
 * AXIS (datos locales, memorias de perfil y mercado) y, con `phrase`, su
 * redacción con IA a través de la caché (una por Brief). `undefined` mientras carga.
 */
export function useWeeklyBrief(overview: FinancialOverview | undefined, market: MarketContext | null, { phrase = false }: { phrase?: boolean } = {}): WeeklyBriefState | undefined {
  const memory = useLiveQuery(getAxisMemory, [], undefined)
  const brief = useMemo(() => {
    if (!overview || memory === undefined) return undefined
    const decision = decide({ context: buildFinancialContext(overview.axisSnapshot), market, ...(memory ? { memory } : {}) })
    return buildWeeklyBrief(decision, market, new Date())
  }, [overview, market, memory])
  const signature = brief ? weeklyBriefSignature(brief) : null
  const [result, setResult] = useState<{ signature: string; phrasing: WeeklyBriefPhrasing | null } | null>(null)

  useEffect(() => {
    if (!phrase || !brief || !signature) return
    let cancelled = false
    void weeklyBriefPhrasingCache.resultFor(brief).then((r) => {
      if (!cancelled) setResult({ signature, phrasing: r.phrasing })
    })
    return () => {
      cancelled = true
    }
    // La firma resume el contenido: el Brief cambia de identidad en cada cálculo, la firma no.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase, signature])

  if (!brief) return undefined
  const current = result?.signature === signature ? result.phrasing : null
  return { brief, view: briefView(brief), phrasing: current, phrasingPending: phrase && result?.signature !== signature }
}
