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
  buildWealthSeries,
  computeLiquidCents,
  wealthBeforeMonth,
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
  /** Saldo inicial + movimientos − inversiones que salieron del líquido. */
  liquidCents: number
  /** Valor actual de las inversiones (manual). */
  investedCents: number
  /** Líquido + invertido. */
  patrimonioCents: number
  /** Variación del patrimonio total en el mes en curso. `null` sin datos del mes. */
  monthChangeCents: number | null
  monthChangePct: number | null
  month: PeriodSummary
  previousMonth: PeriodSummary
  today: PeriodSummary
  /** Patrimonio total para la gráfica, desde el saldo inicial (`buildWealthSeries`). */
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
  const liquidCents = computeLiquidCents(initialBalanceCents, movements, positions)
  const investedCents = totalValueCents(positions)
  const patrimonioCents = liquidCents + investedCents
  const series = buildWealthSeries(initialBalanceCents, movements, positions, todayISO())

  // Variación del patrimonio TOTAL, como la gráfica: invertir desde el líquido no es una pérdida.
  const monthKey = currentMonthKey()
  const month = summarize(inMonth(movements, monthKey))
  const previousMonth = summarize(inMonth(movements, shiftedMonthKey(-1)))
  const hasMonthData = month.movementCount > 0 || positions.some((p) => p.date.startsWith(monthKey))
  const baseCents = wealthBeforeMonth(series, monthKey, initialBalanceCents)
  const monthChangeCents = hasMonthData ? patrimonioCents - baseCents : null
  const monthChangePct = monthChangeCents !== null ? pctChange(patrimonioCents, baseCents) : null

  return {
    config,
    movements,
    objectives,
    positions,
    initialBalanceCents,
    liquidCents,
    investedCents,
    patrimonioCents,
    monthChangeCents,
    monthChangePct,
    month,
    previousMonth,
    today: summarize(onDate(movements, todayISO())),
    series,
    objectivesTotals: summarizeObjectives(objectives),
    isEmpty: movements.length === 0 && config === null,
  }
}
