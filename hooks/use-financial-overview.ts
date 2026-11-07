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
import { listDebts } from '@/lib/db/debts'
import { listCashTransfers } from '@/lib/db/cash'
import { listRecurring } from '@/lib/db/recurring'
import { walletBalances, type WalletBalances } from '@/lib/finance/wallets'
import {
  buildWealthSeries,
  computeLiquidCents,
  wealthBeforeMonth,
  type PatrimonioPoint,
} from '@/lib/finance/patrimonio'
import { inMonth, onDate, pctChange, summarize, type PeriodSummary } from '@/lib/finance/summary'
import { allocateObjectives, totalValueCents, type ObjectivesAllocation } from '@/lib/finance/objectives'
import type { FinancialSnapshot } from '@/lib/axis/context'
import { goalInvestedPool } from '@/lib/axis/plan/mix'
import { currentMonthKey, shiftedMonthKey, todayISO } from '@/lib/dates'
import type { AppConfig, CashTransfer, Debt, Movement, Objective, Position, RecurringMovement } from '@/lib/types'

export interface FinancialOverview {
  config: AppConfig | null
  movements: Movement[]
  objectives: Objective[]
  positions: Position[]
  /** Deudas, de la más cara a la más barata. */
  debts: Debt[]
  initialBalanceCents: number
  /** Saldo inicial + movimientos − inversiones que salieron del líquido. */
  liquidCents: number
  /** El líquido partido entre banco (tarjeta) y efectivo. Suman `liquidCents`. */
  wallets: WalletBalances
  /** Traspasos banco ↔ efectivo, del más reciente al más antiguo. */
  cashTransfers: CashTransfer[]
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
  /** Reparto automático del líquido entre los objetivos: la única fuente del progreso. */
  objectivesAllocation: ObjectivesAllocation
  /**
   * Instantánea para AXIS (identidad estable con el overview). Los objetivos van
   * tal cual: `buildFinancialContext` calcula el reparto con `allocateObjectives`
   * (la misma fuente que esta pantalla) e ignora el `currentCents` guardado.
   */
  axisSnapshot: FinancialSnapshot
  isEmpty: boolean
}

/** `undefined` mientras cargan los datos locales. */
export function useFinancialOverview(): FinancialOverview | undefined {
  const config = useLiveQuery(getConfig, [])
  const movements = useLiveQuery(listMovements, [])
  const objectives = useLiveQuery(listObjectives, [])
  const positions = useLiveQuery(listPositions, [])
  const debts = useLiveQuery(listDebts, [])
  const cashTransfers = useLiveQuery(listCashTransfers, [])
  // Los fijos solo los usa AXIS: una paga pendiente de confirmar cuenta para lo que te sobra cada mes.
  const recurring = useLiveQuery(listRecurring, [])

  // Identidad estable mientras no cambien los datos: evita recalcular (y
  // relanzar el análisis de AXIS) en cada render del shell.
  return useMemo(() => {
    if (
      config === undefined ||
      movements === undefined ||
      objectives === undefined ||
      positions === undefined ||
      debts === undefined ||
      cashTransfers === undefined ||
      recurring === undefined
    ) {
      return undefined
    }
    return buildOverview(config, movements, objectives, positions, debts, cashTransfers, recurring)
  }, [config, movements, objectives, positions, debts, cashTransfers, recurring])
}

function buildOverview(
  config: AppConfig | null,
  movements: Movement[],
  objectives: Objective[],
  positions: Position[],
  debts: Debt[],
  cashTransfers: CashTransfer[],
  recurring: RecurringMovement[],
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
    debts,
    initialBalanceCents,
    liquidCents,
    wallets: walletBalances(liquidCents, config?.initialCashCents ?? 0, movements, cashTransfers),
    cashTransfers,
    investedCents,
    patrimonioCents,
    monthChangeCents,
    monthChangePct,
    month,
    previousMonth,
    today: summarize(onDate(movements, todayISO())),
    series,
    objectivesAllocation: allocateObjectives(objectives, liquidCents, goalInvestedPool(positions, todayISO())),
    axisSnapshot: { config, movements, objectives, positions, debts, recurring },
    isEmpty: movements.length === 0 && config === null,
  }
}
