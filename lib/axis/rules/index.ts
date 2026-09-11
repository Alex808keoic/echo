/**
 * Registro de reglas y priorización.
 *
 * Para añadir una regla: crear una función `Rule` en este directorio que
 * devuelva `Signal[]` a partir del `FinancialContext` y añadirla a `RULES`.
 * Cada señal debe llevar un dato real (con cifras), su interpretación y, si
 * procede, una recomendación conectada con ese dato.
 */
import type { FinancialContext, Priority, Signal, SignalDomain } from '../types'
import { incomeRules } from './income'
import { expenseRules } from './expenses'
import { savingsRules } from './savings'
import { objectiveRules } from './objectives'
import { investmentRules } from './investments'
import type { Rule } from './shared'

export const RULES: Rule[] = [incomeRules, expenseRules, savingsRules, objectiveRules, investmentRules]

export const PRIORITY_ORDER: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 }

/** A igual prioridad, qué dominio lidera la lectura (el ahorro resume mejor la situación). */
const DOMAIN_ORDER: Record<SignalDomain, number> = { savings: 0, objectives: 1, expenses: 2, income: 3, investments: 4 }

/** Ejecuta todas las reglas y devuelve las señales ordenadas por relevancia. */
export function detectSignals(ctx: FinancialContext, rules: Rule[] = RULES): Signal[] {
  const signals = rules.flatMap((rule) => rule(ctx))
  return signals.sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || DOMAIN_ORDER[a.domain] - DOMAIN_ORDER[b.domain],
  )
}
