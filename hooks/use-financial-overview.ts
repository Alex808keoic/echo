'use client'

/**
 * Panorama financiero compartido.
 *
 * Inicio, Mi Dinero, Estadísticas y AXIS leen el mismo patrimonio, la misma
 * variación y la misma evolución desde aquí, para que no puedan divergir.
 * Todo se deriva de los datos locales (Dexie) y se recalcula en vivo.
 */
import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getConfig } from '@/lib/db/config'
import { listMovements } from '@/lib/db/movements'
import { listObjectives } from '@/lib/db/objectives'
import { listPositions } from '@/lib/db/positions'
import {
  buildPatrimonioSeries,
  computeLiquidCents,
  liquidBeforeMonth,
  type PatrimonioPoint,
} from '@/lib/finance/patrimonio'
import { inMonth, onDate, pctChange, summarize, type PeriodSummary } from '@/lib/finance/summary'
import { summarizeObjectives, totalValueCents, type ObjectivesTotals } from '@/lib/finance/objectives'
import { currentMonthKey, shiftedMonthKey, todayISO } from '@/lib/dates'
import type { AppConfig, Movement, Objective, Position } from '@/lib/types'

export interface FinancialOverview {
  config: AppConfig | null
  movements: Movement[]
  objectives: Objective[]
  positions: Position[]
  initialBalanceCents: number
  /** Saldo inicial + movimientos. */
  liquidCents: number
  /** Valor actual de las inversiones (manual). */
  investedCents: number
  /** Líquido + invertido. */
  patrimonioCents: number
  /** Variación del patrimonio líquido en el mes en curso. `null` sin datos. */
  monthChangeCents: number | null
  monthChangePct: number | null
  month: PeriodSummary
  previousMonth: PeriodSummary
  today: PeriodSummary
  series: PatrimonioPoint[]
  objectivesTotals: ObjectivesTotals
  isEmpty: boolean
}

/** `undefined` mientras cargan los datos locales. */
export function useFinancialOverview(): FinancialOverview | undefined {
  const config = useLiveQuery(getConfig, [])
  const movements = useLiveQuery(listMovements, [])
  const objectives = useLiveQuery(listObjectives, [])
  const positions = useLiveQuery(listPositions, [])

  // Identidad estable mientras no cambien los datos: evita recalcular (y
  // relanzar el análisis de AXIS) en cada render del shell.
  return useMemo(() => {
    if (
      config === undefined ||
      movements === undefined ||
      objectives === undefined ||
      positions === undefined
    ) {
      return undefined
    }
    return buildOverview(config, movements, objectives, positions)
  }, [config, movements, objectives, positions])
}

function buildOverview(
  config: AppConfig | null,
  movements: Movement[],
  objectives: Objective[],
  positions: Position[],
): FinancialOverview {
  const initialBalanceCents = config?.initialBalanceCents ?? 0
  const liquidCents = computeLiquidCents(initialBalanceCents, movements)
  const investedCents = totalValueCents(positions)

  const monthKey = currentMonthKey()
  const month = summarize(inMonth(movements, monthKey))
  const previousMonth = summarize(inMonth(movements, shiftedMonthKey(-1)))
  const baseCents = liquidBeforeMonth(initialBalanceCents, movements, monthKey)
  const monthChangeCents = month.movementCount > 0 ? liquidCents - baseCents : null
  const monthChangePct = monthChangeCents !== null ? pctChange(liquidCents, baseCents) : null

  return {
    config,
    movements,
    objectives,
    positions,
    initialBalanceCents,
    liquidCents,
    investedCents,
    patrimonioCents: liquidCents + investedCents,
    monthChangeCents,
    monthChangePct,
    month,
    previousMonth,
    today: summarize(onDate(movements, todayISO())),
    series: buildPatrimonioSeries(initialBalanceCents, movements),
    objectivesTotals: summarizeObjectives(objectives),
    isEmpty: movements.length === 0 && config === null,
  }
}
