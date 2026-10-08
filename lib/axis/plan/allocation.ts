/**
 * Plan de reparto (fase 2b): qué hacer cada mes con lo que ahorras. Pura y
 * determinista, sobre la decisión de AXIS: no decide nada que la decisión no
 * permita y nunca usa el mercado.
 *
 *   0. Bloqueos (de la decisión y de los datos): líquido negativo, gasto mayor
 *      que ingresos, ahorro habitual ≤ 0 o menos de 3 meses cerrados. El plan
 *      no reparte nada: el primer paso es ese.
 *   1. Colchón = objetivo «Fondo de emergencia», el primero del reparto. Meta:
 *      la del objetivo si existe (editable); si no, tu mínimo líquido
 *      declarado; si no, 3 meses de gasto habitual (6 con ingresos irregulares).
 *      Hasta completarlo recibe TODO el ahorro: es lo que hace el reparto
 *      automático con el colchón en primer lugar.
 *   2. Con el colchón completo: lo que necesitan al mes los objetivos con fecha
 *      en ≤ 24 meses (dinero que no se arriesga).
 *   3. De lo que sobra, un porcentaje a largo plazo según tu perfil de riesgo
 *      (20 / 40 / 60 %), solo si lo has indicado y tu horizonte no es corto.
 *      Solo una CATEGORÍA (renta variable global diversificada), nunca un producto.
 *   4. El resto se queda en tu líquido: el reparto automático lo lleva a tus objetivos.
 *
 * Gasto: tu gasto habitual (mediana de los últimos meses), como referencia.
 * Importes en céntimos, redondeados a euros enteros hacia abajo.
 */
import { usualExpenseMonths, usualMonthlyExpense, MIN_USUAL_EXPENSE_MONTHS } from '../rules/shared'
import type { AxisDecision, ObjectiveContext } from '../types'
import type { RiskAttitude } from '../profile/types'

export const CUSHION_OBJECTIVE_NAME = 'Fondo de emergencia'
export const CUSHION_MONTHS = { regular: 3, irregular: 6 } as const
/** Objetivos con fecha a este plazo o menos: corto plazo (su dinero no se invierte). */
export const SHORT_TERM_MONTHS = 24
export const LONG_TERM_PCT: Record<RiskAttitude, number> = { conservative: 20, balanced: 40, dynamic: 60 }
/** La única categoría de inversión del plan. Nunca un producto concreto. */
export const LONG_TERM_CATEGORY = { key: 'global-diversified-equity', label: 'Renta variable global diversificada y de bajo coste' } as const

export type PlanBlocker = 'negative-liquidity' | 'overspending' | 'no-surplus' | 'insufficient-data'

export type LongTermReason =
  | 'ok'
  /** Hasta completar el colchón no se invierte. */
  | 'cushion-incomplete'
  /** Sin perfil de riesgo u horizonte: hay que responder «Tu perfil». */
  | 'no-profile'
  /** Necesitas el dinero en menos de 2 años. */
  | 'short-horizon'
  /** Los objetivos a corto plazo ya se llevan todo el ahorro. */
  | 'no-room'

export type PlanStep =
  | { kind: 'fix-negative-liquidity' }
  | { kind: 'reduce-spending' }
  | { kind: 'register-data'; monthsNeeded: number }
  | { kind: 'create-cushion'; targetCents: number }
  | { kind: 'move-cushion-first'; objectiveId: string }
  | { kind: 'fill-cushion'; monthlyCents: number; remainingCents: number; months: number }
  | { kind: 'short-term-objectives'; monthlyCents: number; objectiveIds: string[]; atRisk: boolean }
  | { kind: 'invest-long-term'; monthlyCents: number; pct: number; category: typeof LONG_TERM_CATEGORY; adult: boolean | null }
  | { kind: 'rest-to-objectives'; monthlyCents: number }
  | { kind: 'answer-profile' }

export interface AllocationPlan {
  status: 'ready' | 'blocked'
  blocker: PlanBlocker | null
  /** Ahorro habitual al mes (mediana de los meses cerrados) y gasto habitual; `null` sin datos suficientes. */
  monthly: { savingsCents: number; spendingCents: number; months: number } | null
  cushion: {
    /** Objetivo «Fondo de emergencia» activo, si existe. */
    objectiveId: string | null
    isFirst: boolean
    targetCents: number
    /** De dónde sale la meta. */
    source: 'objective' | 'min-liquidity' | 'months'
    /** Meses de gasto que cubre la meta sugerida (con `source: 'months'`). */
    months: number | null
    /** Lo que falta con el colchón el primero del reparto. */
    remainingCents: number
  } | null
  longTerm: { pct: number; monthlyCents: number; reason: LongTermReason }
  /** Pasos en orden: el primero es lo primero que hacer. */
  steps: PlanStep[]
}

const euros = (cents: number) => Math.max(0, Math.floor(cents / 100) * 100)
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
export const isCushionObjective = (o: Pick<ObjectiveContext, 'name'>) => normalize(o.name) === normalize(CUSHION_OBJECTIVE_NAME)

/** Mediana del ahorro (ingresos − gastos) de los mismos meses que el gasto habitual. */
function usualMonthlySavings(months: ReturnType<typeof usualExpenseMonths>): number | null {
  if (months.length < MIN_USUAL_EXPENSE_MONTHS) return null
  const values = months.map((m) => m.incomeCents - m.expenseCents).sort((a, b) => a - b)
  const mid = Math.floor(values.length / 2)
  return values.length % 2 === 1 ? values[mid] : Math.floor((values[mid - 1] + values[mid]) / 2)
}

export function buildAllocationPlan(decision: AxisDecision): AllocationPlan {
  const ctx = decision.context
  const profile = decision.profile.fields
  const ids = new Set(decision.signals.map((s) => s.id))
  const noLongTerm = (reason: LongTermReason) => ({ pct: 0, monthlyCents: 0, reason })
  const blocked = (blocker: PlanBlocker, steps: PlanStep[], monthly: AllocationPlan['monthly'] = null): AllocationPlan => ({
    status: 'blocked',
    blocker,
    monthly,
    cushion: null,
    longTerm: noLongTerm('cushion-incomplete'),
    steps,
  })

  // 0. Bloqueos: lo que AXIS ya ha decidido que va primero.
  if (ids.has('liquidity.negative')) return blocked('negative-liquidity', [{ kind: 'fix-negative-liquidity' }])
  if (ids.has('expenses.over-income')) return blocked('overspending', [{ kind: 'reduce-spending' }])

  const months = usualExpenseMonths(ctx.flows.closedMonths)
  const spending = usualMonthlyExpense(ctx.flows.closedMonths)
  const savings = usualMonthlySavings(months)
  if (decision.level === 'none' || spending === null || savings === null) {
    return blocked('insufficient-data', [{ kind: 'register-data', monthsNeeded: Math.max(1, MIN_USUAL_EXPENSE_MONTHS - months.length) }])
  }
  const monthly = { savingsCents: euros(savings), spendingCents: spending, months: months.length }
  if (monthly.savingsCents <= 0) return blocked('no-surplus', [{ kind: 'reduce-spending' }], monthly)

  // 1. Colchón.
  const active = ctx.objectives.filter((o) => o.status !== 'achieved')
  const cushionObjective = active.filter(isCushionObjective).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))[0] ?? null
  const irregular = profile.irregularIncome === true
  const cushionMonths = irregular ? CUSHION_MONTHS.irregular : CUSHION_MONTHS.regular
  // Un mínimo líquido declarado nunca se rebaja: si es mayor que la meta del objetivo, manda (es lo que exige `liquidity.below-min`).
  const declaredMin = profile.minLiquidityCents ?? 0
  const objectiveTarget = cushionObjective?.targetCents ?? 0
  const source: NonNullable<AllocationPlan['cushion']>['source'] =
    cushionObjective && objectiveTarget >= declaredMin ? 'objective' : profile.minLiquidityCents !== undefined ? 'min-liquidity' : 'months'
  const targetCents = source === 'objective' ? objectiveTarget : source === 'min-liquidity' ? declaredMin : spending * cushionMonths
  const isFirst = cushionObjective !== null && cushionObjective.rank === 1
  // Con el colchón el primero del reparto, recibe el líquido antes que nada.
  const remainingCents = Math.max(0, targetCents - Math.max(0, ctx.wealth.liquidCents))
  const cushion = { objectiveId: cushionObjective?.id ?? null, isFirst, targetCents, source, months: source === 'months' ? cushionMonths : null, remainingCents }

  const steps: PlanStep[] = []
  if (!cushionObjective) steps.push({ kind: 'create-cushion', targetCents })
  else if (!isFirst) steps.push({ kind: 'move-cushion-first', objectiveId: cushionObjective.id })

  const needsProfile = profile.riskAttitude === undefined || profile.horizon === undefined
  const withProfileStep = (plan: AllocationPlan): AllocationPlan => (needsProfile ? { ...plan, steps: [...plan.steps, { kind: 'answer-profile' }] } : plan)

  if (remainingCents > 0) {
    const monthlyCents = Math.min(monthly.savingsCents, euros(remainingCents) || remainingCents)
    steps.push({ kind: 'fill-cushion', monthlyCents, remainingCents, months: Math.ceil(remainingCents / monthly.savingsCents) })
    return withProfileStep({ status: 'ready', blocker: null, monthly, cushion, longTerm: noLongTerm('cushion-incomplete'), steps })
  }

  // 2. Objetivos a corto plazo (su necesidad es acumulada: basta la mayor).
  const shortTerm = active.filter((o) => !isCushionObjective(o) && o.status === 'in-progress' && o.monthsLeft !== undefined && o.monthsLeft > 0 && o.monthsLeft <= SHORT_TERM_MONTHS)
  const shortNeed = shortTerm.reduce((max, o) => Math.max(max, o.requiredMonthlyCents ?? 0), 0)
  const shortMonthly = Math.min(monthly.savingsCents, Math.ceil(shortNeed / 100) * 100)
  if (shortTerm.length > 0 && shortMonthly > 0) {
    steps.push({ kind: 'short-term-objectives', monthlyCents: shortMonthly, objectiveIds: shortTerm.map((o) => o.id), atRisk: shortNeed > monthly.savingsCents })
  }
  const room = Math.max(0, monthly.savingsCents - shortMonthly)

  // 3. Largo plazo, solo como categoría.
  let longTerm: AllocationPlan['longTerm']
  if (needsProfile) longTerm = noLongTerm('no-profile')
  else if (profile.horizon === 'short') longTerm = noLongTerm('short-horizon')
  else if (room <= 0) longTerm = noLongTerm('no-room')
  else {
    const pct = LONG_TERM_PCT[profile.riskAttitude as RiskAttitude]
    longTerm = { pct, monthlyCents: euros((room * pct) / 100), reason: 'ok' }
  }
  if (longTerm.monthlyCents > 0) {
    steps.push({ kind: 'invest-long-term', monthlyCents: longTerm.monthlyCents, pct: longTerm.pct, category: LONG_TERM_CATEGORY, adult: profile.adult ?? null })
  }

  // 4. El resto se queda en el líquido y el reparto automático lo lleva a los objetivos.
  const rest = room - longTerm.monthlyCents
  if (rest > 0) steps.push({ kind: 'rest-to-objectives', monthlyCents: rest })

  return withProfileStep({ status: 'ready', blocker: null, monthly, cushion, longTerm, steps })
}
