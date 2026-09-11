/**
 * Utilidades comunes de las reglas de AXIS.
 */
import { formatCents } from '../../money'
import { formatPct } from '../../format'
import type { FinancialContext, Signal } from '../types'

export type Rule = (ctx: FinancialContext) => Signal[]

export const eur = (cents: number, withSign = false) => formatCents(cents, withSign)
export const pct = (value: number, withSign = false) => formatPct(Math.round(value), withSign)

/** Umbrales de las reglas, en un solo sitio para poder ajustarlos y documentarlos. */
export const THRESHOLDS = {
  /** Variación de ingresos o gastos que se considera significativa. */
  significantChangePct: 20,
  /** Subida de ingresos que sugiere un ingreso extraordinario. */
  extraordinaryIncomePct: 50,
  /** Peso de una categoría sobre el gasto del mes que se considera concentración. */
  categoryConcentrationPct: 50,
  /** Tasa de ahorro considerada sólida. */
  healthySavingsRatePct: 20,
  /** Progreso a partir del cual un objetivo está «cerca». */
  objectiveNearPct: 90,
  /** Días de vida de un objetivo sin progreso antes de señalarlo. */
  objectiveStaleDays: 30,
  /** Peso de una posición sobre la cartera que se considera concentración. */
  positionConcentrationPct: 70,
  /** Peso de las inversiones sobre el patrimonio a partir del cual la liquidez es escasa. */
  lowLiquidityInvestedPct: 80,
} as const
