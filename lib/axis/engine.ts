/**
 * Selección del motor de AXIS y construcción del contexto.
 *
 * Para conectar un motor de IA externo: implementar `AxisEngine` (p. ej. en
 * `lib/axis/ai-engine.ts`) y devolverlo desde `getAxisEngine()`. La interfaz
 * mostrará `engine.label` y `engine.isAI` sin más cambios.
 */
import type { FinancialOverview } from '@/hooks/use-financial-overview'
import { totalsByCategory, inMonth } from '../finance/summary'
import { currentMonthKey } from '../dates'
import { localRulesEngine } from './rules-engine'
import type { AxisContext, AxisEngine } from './types'

export function getAxisEngine(): AxisEngine {
  return localRulesEngine
}

export function buildAxisContext(o: FinancialOverview): AxisContext {
  const monthMovements = inMonth(o.movements, currentMonthKey())
  const top = totalsByCategory(monthMovements, 'gasto')[0]
  return {
    patrimonioCents: o.patrimonioCents,
    liquidCents: o.liquidCents,
    investedCents: o.investedCents,
    monthIncomeCents: o.month.incomeCents,
    monthExpenseCents: o.month.expenseCents,
    previousMonthExpenseCents: o.previousMonth.expenseCents,
    movementCount: o.movements.length,
    monthTopExpense: top ? { label: top.label, cents: top.cents, pct: top.pct } : null,
    objectives: o.objectives.map(({ name, currentCents, targetCents, targetDate }) => ({
      name,
      currentCents,
      targetCents,
      targetDate,
    })),
    positions: o.positions.map(({ name, investedCents, valueCents }) => ({
      name,
      investedCents,
      valueCents,
    })),
    historyDays: o.series.length,
  }
}

/**
 * Qué le falta a AXIS para poder razonar. Son comprobaciones de hechos.
 * Sin movimientos no hay situación financiera que interpretar.
 */
export function missingContext(ctx: AxisContext): string[] {
  const missing: string[] = []
  if (ctx.movementCount === 0) {
    missing.push('No hay ingresos ni gastos registrados: no se puede analizar tu situación.')
  }
  if (ctx.objectives.length === 0) {
    missing.push('No hay objetivos definidos: sin ellos no se sabe para qué necesitas tu dinero.')
  }
  return missing
}

export function hasMinimumContext(ctx: AxisContext): boolean {
  return ctx.movementCount > 0
}
