/**
 * Plan de reparto (fase 2b): qué hacer cada mes con lo que ahorras. Pura y
 * determinista, sobre la decisión de AXIS: no decide nada que la decisión no
 * permita y nunca usa el mercado.
 *
 *   0. Bloqueos (de la decisión y de los datos): líquido negativo, gasto mayor
 *      que ingresos, ahorro habitual ≤ 0 o menos de `MIN_USUAL_EXPENSE_MONTHS` meses cerrados. El plan
 *      no reparte nada: el primer paso es ese.
 *   1. Colchón = objetivo «Fondo de emergencia», el primero del reparto. Meta:
 *      la del objetivo si existe (editable); si no, tu mínimo líquido
 *      declarado; si no, 3 meses de gasto habitual (6 con ingresos irregulares,
 *      por tu cuenta o sin trabajo; 3 más si alguien depende de ti: `cushionMonthsFor`).
 *      Hasta completarlo recibe TODO el ahorro: es lo que hace el reparto
 *      automático con el colchón en primer lugar.
 *   1b. Deudas caras (interés ≥ lo que cabe esperar de tu mezcla, o ≥ 7 % sin
 *      perfil; nunca por debajo del 3 %): con un colchón mínimo de 1 mes de
 *      gasto, TODO el ahorro va a devolverlas antes, de la más cara a la más
 *      barata; después se completa el colchón. Devolver una deuda al 8 % es
 *      ganar un 8 % seguro. Las de interés medio no frenan el plan: se explica
 *      que amortizar o invertir es elección tuya. Si las cuotas pasan del 35 %
 *      de tus ingresos, se avisa.
 *   2. Con el colchón completo: lo que necesitan al mes los objetivos con fecha
 *      en ≤ 24 meses (dinero que no se arriesga).
 *   3. De lo que sobra, un porcentaje a largo plazo según tu perfil de riesgo
 *      (20 / 40 / 60 %; 40 / 70 / 90 % si no tienes objetivos pendientes, porque
 *      ese dinero no tiene otro destino), solo si lo has indicado y tu horizonte
 *      no es corto. Si una caída te obligaría a cambiar tus planes, el riesgo es
 *      como mucho equilibrado (`planRisk`). Se reparte en TIPOS de inversión según tu perfil (plan/mix.ts),
 *      nunca en productos.
 *   4. El resto se queda en tu líquido: el reparto automático lo lleva a tus objetivos.
 *   5. Dinero parado (líquido por encima del colchón y de todos tus objetivos):
 *      el plan propone invertirlo de una vez o en 6 meses, con la misma mezcla, y
 *      eliges tú; con un plazo corto, propone dejarlo en ahorro seguro.
 *
 * Gasto: tu gasto habitual (mediana de los últimos meses), como referencia.
 * Los movimientos puntuales no entran en el gasto ni en el ahorro habituales.
 * Importes en céntimos, redondeados a euros enteros hacia abajo.
 */
import { prioritiesOf, recurringIncomesOf, regularExpenseCents, regularIncomeCents, usualExpenseMonths, usualMonthlyExpense, MIN_USUAL_EXPENSE_MONTHS } from '../rules/shared'
import type { AxisDecision, ObjectiveContext } from '../types'
import type { ReconciledProfile, RiskAttitude } from '../profile/types'
import type { InflationRef } from './inflation'
import { DRAWDOWN_NOTICE_PCT, expectedMixReturnPct, heldBySleeve, heldPct, mixWeights, needsRebalance, rebalanceSplit, riskyAllowed, splitMix, type MixPart, type SleeveKey } from './mix'
import { DEBT_CHEAP_PCT, DEBT_EXPENSIVE_PCT, DEBT_LOAD_MAX_PCT, extraPaymentEffect } from '../../finance/debts'
import type { DebtContext } from '../types'

export const CUSHION_OBJECTIVE_NAME = 'Fondo de emergencia'
/**
 * Meses de gasto del colchón: 3 con ingresos estables; 6 si cambian, si
 * trabajas por tu cuenta o si ahora no trabajas; y 3 más si alguien depende de
 * tu dinero (respuestas de «Tu perfil»).
 */
export const CUSHION_MONTHS = { regular: 3, irregular: 6, dependentsExtra: 3 } as const

export function cushionMonthsFor(profile: Pick<ReconciledProfile, 'irregularIncome' | 'work' | 'dependents'>): number {
  const unsteady = profile.irregularIncome === true || profile.work === 'self-employed' || profile.work === 'unemployed'
  return (unsteady ? CUSHION_MONTHS.irregular : CUSHION_MONTHS.regular) + (profile.dependents === true ? CUSHION_MONTHS.dependentsExtra : 0)
}

/**
 * Riesgo con el que se invierte: el que dices llevar, pero como mucho
 * equilibrado si una caída te obligaría a cambiar tus planes (lo que puedes
 * permitirte manda sobre lo que te gustaría).
 */
export function planRisk(profile: Pick<ReconciledProfile, 'riskAttitude' | 'lossCapacity'>): RiskAttitude | undefined {
  if (profile.riskAttitude === 'dynamic' && profile.lossCapacity === 'low') return 'balanced'
  return profile.riskAttitude
}
/** Objetivos con fecha a este plazo o menos: corto plazo (su dinero no se invierte). */
export const SHORT_TERM_MONTHS = 24
export const LONG_TERM_PCT: Record<RiskAttitude, number> = { conservative: 20, balanced: 40, dynamic: 60 }
/** Sin objetivos pendientes (aparte del colchón), lo que sobra no tiene otro destino: se invierte más. */
export const LONG_TERM_PCT_NO_OBJECTIVES: Record<RiskAttitude, number> = { conservative: 40, balanced: 70, dynamic: 90 }
/** Meses en los que se propone repartir el dinero parado. */
export const IDLE_SPREAD_MONTHS = 6
/** Dinero parado mínimo para mencionarlo: 100 € y al menos un mes de gasto habitual. */
export const IDLE_MIN_CENTS = 10_000
/** Con deudas caras, el colchón mínimo antes de ir a por ellas: meses de gasto habitual. */
export const DEBT_STARTER_CUSHION_MONTHS = 1
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
  /** Primero, devolver deudas caras. */
  | 'debt-first'

export type PlanStep =
  | { kind: 'fix-negative-liquidity' }
  | { kind: 'reduce-spending' }
  | { kind: 'register-data'; monthsNeeded: number }
  | { kind: 'create-cushion'; targetCents: number }
  | { kind: 'move-cushion-first'; objectiveId: string }
  /** `starter`: con deudas caras, solo el colchón mínimo (1 mes de gasto) antes de ir a por ellas. */
  | { kind: 'fill-cushion'; monthlyCents: number; remainingCents: number; months: number; starter?: true }
  /**
   * Deuda cara: todo el ahorro del mes a devolverla antes (además de la cuota).
   * `lumpSumCents`: líquido por encima del colchón completo y de tus objetivos cercanos, para devolverla de una vez. `expectedReturnPct`: lo que cabe
   * esperar de tu mezcla (`null` sin perfil). `objectivesWaiting`: tus objetivos no reciben ahorro nuevo mientras tanto.
   */
  | {
      kind: 'pay-debt'
      debtId: string
      name: string
      aprPct: number
      monthlyCents: number
      balanceCents: number
      /** Meses hasta terminarla pagando además `monthlyCents` (`null` si no se puede calcular). */
      months: number | null
      monthsSaved: number | null
      interestSavedCents: number | null
      lumpSumCents: number
      expectedReturnPct: number | null
      otherDebts: number
      objectivesWaiting: boolean
    }
  /** Deuda de interés medio con inversión a largo plazo: amortizar o invertir, decides tú. */
  | { kind: 'debt-choice'; debtId: string; name: string; aprPct: number; investMonthlyCents: number; expectedReturnPct: number }
  /** Las cuotas de tus deudas se llevan demasiado de tus ingresos. */
  | { kind: 'debt-load'; paymentsCents: number; incomeCents: number; pct: number }
  | { kind: 'short-term-objectives'; monthlyCents: number; objectiveIds: string[]; atRisk: boolean }
  | {
      kind: 'invest-long-term'
      monthlyCents: number
      pct: number
      category: typeof LONG_TERM_CATEGORY
      adult: boolean | null
      /** En qué tipos se reparte (suma `monthlyCents`). */
      mix: MixPart[]
      /** Sin objetivos pendientes: por eso el porcentaje es mayor. */
      noObjectives: boolean
      /** Solo si tu mezcla real se aleja de la del plan: el reparto de este mes la acerca, sin vender. */
      rebalance?: { heldPct: Record<SleeveKey, number>; targetPct: Record<SleeveKey, number> }
      /** Solo si tus inversiones valen al menos un `DRAWDOWN_NOTICE_PCT` % menos de lo que aportaste. */
      drawdownPct?: number
    }
  /** Dinero sin destino (por encima del colchón y de todos tus objetivos): de una vez o repartido; eliges tú. */
  | { kind: 'idle-money'; idleCents: number; safe: boolean; mix: MixPart[]; spreadMonths: number; perMonthCents: number; adult: boolean | null }
  /** `noObjectives` solo existe (true) si no hay objetivos pendientes: el resto se queda en el líquido sin destino. */
  | { kind: 'rest-to-objectives'; monthlyCents: number; noObjectives?: true }
  | { kind: 'answer-profile' }
  /** Plan provisional: el ahorro sale del ingreso fijo previsto, no de meses registrados. */
  | { kind: 'forecast-basis'; recurringIncomeCents: number; spendingCents: number; monthsNeeded: number }
  /** La prioridad que declaraste no va la primera del reparto (después del colchón). */
  | { kind: 'follow-priority'; objectiveId: string; rank: number; aheadIds: string[] }
  /** Notas de AXIS que el plan todavía no puede usar: hay que convertirlas en datos o descartarlas. */
  | { kind: 'review-notes'; count: number }

export interface AllocationPlan {
  status: 'ready' | 'blocked'
  blocker: PlanBlocker | null
  /**
   * Ahorro habitual al mes (mediana de los meses cerrados) y gasto habitual; `null` sin datos suficientes.
   * `forecast` solo existe en un plan provisional: el ahorro es el ingreso fijo previsto menos el gasto
   * del único mes cerrado. `recurringIncomeCents` solo existe si has declarado un ingreso fijo.
   */
  monthly: { savingsCents: number; spendingCents: number; months: number; forecast?: true; recurringIncomeCents?: number } | null
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
  /** Inflación de referencia, si se ha dado (solo para los textos). */
  inflation?: InflationRef
}

const euros = (cents: number) => Math.max(0, Math.floor(cents / 100) * 100)
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
export const isCushionObjective = (o: Pick<ObjectiveContext, 'name'>) => normalize(o.name) === normalize(CUSHION_OBJECTIVE_NAME)

/** Deudas con forma válida y algo pendiente (el contexto puede venir de fuera: nunca se confía en su forma). */
function debtsOf(debts: unknown): DebtContext[] {
  if (!Array.isArray(debts)) return []
  return debts
    .filter(
      (d): d is DebtContext =>
        typeof d === 'object' &&
        d !== null &&
        typeof d.id === 'string' &&
        typeof d.name === 'string' &&
        Number.isSafeInteger(d.balanceCents) &&
        d.balanceCents > 0 &&
        typeof d.aprPct === 'number' &&
        Number.isFinite(d.aprPct) &&
        d.aprPct >= 0 &&
        d.aprPct <= 100 &&
        Number.isSafeInteger(d.monthlyPaymentCents) &&
        d.monthlyPaymentCents >= 0,
    )
    .sort((a, b) => b.aprPct - a.aprPct)
}

/** Paso «cuotas demasiado altas», si lo son. Ingresos habituales = ahorro + gasto habituales. */
function debtLoadStep(debts: readonly DebtContext[], monthly: { savingsCents: number; spendingCents: number }): PlanStep[] {
  const payments = debts.reduce((t, d) => t + d.monthlyPaymentCents, 0)
  const income = monthly.savingsCents + monthly.spendingCents
  if (payments <= 0 || income <= 0) return []
  const pct = Math.round((payments / income) * 100)
  return pct > DEBT_LOAD_MAX_PCT ? [{ kind: 'debt-load', paymentsCents: payments, incomeCents: income, pct }] : []
}

const sameMix = (a: readonly MixPart[], b: readonly MixPart[]) => a.length === b.length && a.every((p, i) => p.key === b[i].key && p.cents === b[i].cents)

/** Tipos de inversión que el plan propone este mes (largo plazo y dinero parado). */
export function planSleeves(plan: AllocationPlan): Set<SleeveKey> {
  const keys = new Set<SleeveKey>()
  for (const s of plan.steps) if (s.kind === 'invest-long-term' || s.kind === 'idle-money') for (const p of s.mix) if (p.cents > 0) keys.add(p.key)
  return keys
}

/**
 * Prioridad declarada (memoria `priorities`): si su primer objetivo no es el
 * primero del reparto después del colchón, el plan lo dice. Nunca reordena: el
 * orden lo cambia el usuario en Objetivos.
 */
function priorityStep(decision: AxisDecision, active: readonly ObjectiveContext[]): PlanStep[] {
  const declared = prioritiesOf(decision.profile.fields)
  if (!declared) return []
  const order = active.filter((o) => !isCushionObjective(o) && !o.completed).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
  const index = order.findIndex((o) => o.id === declared.ids[0])
  if (index <= 0) return []
  const target = order[index]
  return [{ kind: 'follow-priority', objectiveId: target.id, rank: target.rank ?? index + 1, aheadIds: order.slice(0, index).map((o) => o.id) }]
}

/** Mediana del ahorro (ingresos − gastos) de los mismos meses que el gasto habitual. */
function usualMonthlySavings(months: ReturnType<typeof usualExpenseMonths>): number | null {
  if (months.length < MIN_USUAL_EXPENSE_MONTHS) return null
  const values = months.map((m) => regularIncomeCents(m) - regularExpenseCents(m)).sort((a, b) => a - b)
  const mid = Math.floor(values.length / 2)
  return values.length % 2 === 1 ? values[mid] : Math.floor((values[mid - 1] + values[mid]) / 2)
}

export interface PlanOptions {
  /** Notas de AXIS (memorias sin dato) que el usuario no ha convertido ni descartado. Solo las conoce el dispositivo. */
  pendingNotes?: number
  /** Inflación de referencia (plan/inflation.ts): solo cambia textos, nunca importes. */
  inflation?: InflationRef
}

export function buildAllocationPlan(decision: AxisDecision, options: PlanOptions = {}): AllocationPlan {
  const plan = buildPlanCore(decision, options)
  return options.inflation ? { ...plan, inflation: options.inflation } : plan
}

function buildPlanCore(decision: AxisDecision, options: PlanOptions): AllocationPlan {
  const ctx = decision.context
  const profile = decision.profile.fields
  const declaredIncome = recurringIncomesOf(profile)
  const debts = debtsOf(ctx.debts)
  const notesStep: PlanStep[] = options.pendingNotes && options.pendingNotes > 0 ? [{ kind: 'review-notes', count: options.pendingNotes }] : []
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
  const monthsNeeded = Math.max(1, MIN_USUAL_EXPENSE_MONTHS - months.length)
  const leading: PlanStep[] = []
  let monthly: NonNullable<AllocationPlan['monthly']>
  if (decision.level === 'none' || spending === null || savings === null) {
    // Con un ingreso fijo declarado y al menos un mes cerrado, plan provisional: ese ingreso menos el gasto
    // de ese mes. Es una previsión: se dice en el plan y nunca se suma al dinero real.
    const last = months[0]
    if (decision.level === 'none' || !declaredIncome || !last) {
      return blocked('insufficient-data', [{ kind: 'register-data', monthsNeeded }, ...notesStep])
    }
    const lastSpending = Math.ceil(regularExpenseCents(last) / 100) * 100
    monthly = { savingsCents: euros(declaredIncome.monthlyCents - lastSpending), spendingCents: lastSpending, months: months.length, forecast: true, recurringIncomeCents: declaredIncome.monthlyCents }
    leading.push({ kind: 'forecast-basis', recurringIncomeCents: declaredIncome.monthlyCents, spendingCents: lastSpending, monthsNeeded })
  } else {
    monthly = { savingsCents: euros(savings), spendingCents: spending, months: months.length, ...(declaredIncome ? { recurringIncomeCents: declaredIncome.monthlyCents } : {}) }
  }
  if (monthly.savingsCents <= 0) return blocked('no-surplus', [{ kind: 'reduce-spending' }, ...debtLoadStep(debts, monthly), ...leading, ...notesStep], monthly)

  // 1. Colchón.
  const active = ctx.objectives.filter((o) => o.status !== 'achieved')
  const cushionObjective = active.filter(isCushionObjective).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))[0] ?? null
  const cushionMonths = cushionMonthsFor(profile)
  // Un mínimo líquido declarado nunca se rebaja: si es mayor que la meta del objetivo, manda (es lo que exige `liquidity.below-min`).
  const declaredMin = profile.minLiquidityCents ?? 0
  const objectiveTarget = cushionObjective?.targetCents ?? 0
  const source: NonNullable<AllocationPlan['cushion']>['source'] =
    cushionObjective && objectiveTarget >= declaredMin ? 'objective' : profile.minLiquidityCents !== undefined ? 'min-liquidity' : 'months'
  const targetCents = source === 'objective' ? objectiveTarget : source === 'min-liquidity' ? declaredMin : monthly.spendingCents * cushionMonths
  const isFirst = cushionObjective !== null && cushionObjective.rank === 1
  // Con el colchón el primero del reparto, recibe el líquido antes que nada.
  const remainingCents = Math.max(0, targetCents - Math.max(0, ctx.wealth.liquidCents))
  const cushion = { objectiveId: cushionObjective?.id ?? null, isFirst, targetCents, source, months: source === 'months' ? cushionMonths : null, remainingCents }

  const steps: PlanStep[] = []
  if (!cushionObjective) steps.push({ kind: 'create-cushion', targetCents })
  else if (!isFirst) steps.push({ kind: 'move-cushion-first', objectiveId: cushionObjective.id })

  const needsProfile = profile.riskAttitude === undefined || profile.horizon === undefined
  // Detrás de los importes: de dónde sale el plan si es provisional, tu prioridad, el perfil y las notas pendientes.
  const tail: PlanStep[] = [...debtLoadStep(debts, monthly), ...leading, ...priorityStep(decision, active), ...(needsProfile ? [{ kind: 'answer-profile' as const }] : []), ...notesStep]
  const withProfileStep = (plan: AllocationPlan): AllocationPlan => (tail.length > 0 ? { ...plan, steps: [...plan.steps, ...tail] } : plan)

  // 1b. Deudas caras: más que lo que cabe esperar de tu mezcla (o del 7 % sin perfil), nunca por debajo del 3 %.
  const investable = !needsProfile && profile.horizon !== 'short'
  const risk = planRisk(profile)
  const expectedReturnPct = investable ? expectedMixReturnPct(mixWeights(risk as RiskAttitude, profile.horizon as 'medium' | 'long', false)) : null
  const payFirstPct = expectedReturnPct === null ? DEBT_EXPENSIVE_PCT : Math.min(DEBT_EXPENSIVE_PCT, Math.max(DEBT_CHEAP_PCT, expectedReturnPct))
  const expensive = debts.filter((d) => d.aprPct >= payFirstPct)
  if (expensive.length > 0) {
    const starter = Math.min(targetCents, monthly.spendingCents * DEBT_STARTER_CUSHION_MONTHS)
    const starterRemaining = Math.max(0, starter - Math.max(0, ctx.wealth.liquidCents))
    if (starterRemaining > 0) {
      const monthlyCents = Math.min(monthly.savingsCents, euros(starterRemaining) || starterRemaining)
      steps.push({ kind: 'fill-cushion', monthlyCents, remainingCents: starterRemaining, months: Math.ceil(starterRemaining / monthly.savingsCents), starter: true })
      return withProfileStep({ status: 'ready', blocker: null, monthly, cushion, longTerm: noLongTerm('debt-first'), steps })
    }
    const debt = expensive[0]
    const effect = extraPaymentEffect(debt.balanceCents, debt.aprPct, debt.monthlyPaymentCents, monthly.savingsCents)
    // Líquido por encima del colchón COMPLETO y de lo apartado para objetivos cercanos (≤ 24 meses): podría ir a
    // la deuda de una vez. Lo apartado para objetivos lejanos sí cuenta: rinde menos de lo que cuesta la deuda.
    const nearReserved = active
      .filter((o) => !isCushionObjective(o) && o.monthsLeft !== undefined && o.monthsLeft <= SHORT_TERM_MONTHS)
      .reduce((t, o) => t + Math.max(0, o.currentCents), 0)
    const spare = euros(ctx.wealth.liquidCents - targetCents - nearReserved)
    steps.push({
      kind: 'pay-debt',
      debtId: debt.id,
      name: debt.name,
      aprPct: debt.aprPct,
      monthlyCents: monthly.savingsCents,
      balanceCents: debt.balanceCents,
      months: effect?.months ?? null,
      monthsSaved: effect?.monthsSaved ?? null,
      interestSavedCents: effect?.interestSavedCents ?? null,
      lumpSumCents: Math.max(0, Math.min(spare, euros(debt.balanceCents))),
      expectedReturnPct,
      otherDebts: expensive.length - 1,
      objectivesWaiting: active.some((o) => !isCushionObjective(o) && !o.completed),
    })
    return withProfileStep({ status: 'ready', blocker: null, monthly, cushion, longTerm: noLongTerm('debt-first'), steps })
  }

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

  // Dinero parado: el líquido que no necesitan ni el colchón ni ningún objetivo activo.
  const idleCents = euros(ctx.wealth.liquidCents - Math.max(0, ctx.wealth.reservedForObjectivesCents) - (cushionObjective ? 0 : targetCents))
  const pendingObjectives = active.filter((o) => !isCushionObjective(o) && !o.completed)
  const noObjectives = pendingObjectives.length === 0
  const atRisk = shortTerm.length > 0 && shortNeed > monthly.savingsCents

  // 3. Largo plazo, repartido en TIPOS de inversión según el perfil.
  let longTerm: AllocationPlan['longTerm']
  let mixFor: ((cents: number) => MixPart[]) | null = null
  let rebalance: { heldPct: Record<SleeveKey, number>; targetPct: Record<SleeveKey, number> } | null = null
  let plainFor: ((cents: number) => MixPart[]) | null = null
  const held = heldBySleeve(ctx.investments.positions)
  if (needsProfile) longTerm = noLongTerm('no-profile')
  else if (profile.horizon === 'short') longTerm = noLongTerm('short-horizon')
  else {
    const horizon = profile.horizon as 'medium' | 'long'
    const risky = riskyAllowed({
      riskAttitude: risk as RiskAttitude,
      horizon,
      cushionComplete: true,
      shortTermAtRisk: atRisk,
      idleCents,
      spendingCents: monthly.spendingCents,
      noExperience: profile.investingExperience === 'none',
    })
    const weights = mixWeights(risk as RiskAttitude, horizon, risky)
    // Si tu mezcla real se ha alejado de la del plan, lo nuevo va a lo que falta (sin vender nada).
    const current = heldPct(held)
    if (current && needsRebalance(held, weights)) rebalance = { heldPct: current, targetPct: weights }
    mixFor = (cents) => (rebalance ? rebalanceSplit(cents, weights, held) : splitMix(cents, weights))
    plainFor = (cents) => splitMix(cents, weights)
    if (room <= 0) longTerm = noLongTerm('no-room')
    else {
      const pct = (noObjectives ? LONG_TERM_PCT_NO_OBJECTIVES : LONG_TERM_PCT)[risk as RiskAttitude]
      longTerm = { pct, monthlyCents: euros((room * pct) / 100), reason: 'ok' }
    }
  }
  if (longTerm.monthlyCents > 0 && mixFor) {
    const invested = ctx.investments.positions.reduce((t, p) => t + Math.max(0, p.investedCents), 0)
    const value = ctx.investments.positions.reduce((t, p) => t + Math.max(0, p.valueCents), 0)
    const drawdownPct = invested > 0 ? Math.round((1 - value / invested) * 100) : 0
    const mix = mixFor(longTerm.monthlyCents)
    steps.push({
      kind: 'invest-long-term',
      monthlyCents: longTerm.monthlyCents,
      pct: longTerm.pct,
      category: LONG_TERM_CATEGORY,
      adult: profile.adult ?? null,
      mix,
      noObjectives,
      // Solo se explica el reequilibrio si de verdad cambia el reparto de este mes.
      ...(rebalance && plainFor && !sameMix(mix, plainFor(longTerm.monthlyCents)) ? { rebalance } : {}),
      ...(drawdownPct >= DRAWDOWN_NOTICE_PCT ? { drawdownPct } : {}),
    })
  }

  // Deuda de interés medio: el plan sigue invirtiendo, pero amortizar es una opción segura que eliges tú.
  const moderate = debts.find((d) => d.aprPct >= DEBT_CHEAP_PCT)
  if (moderate && longTerm.monthlyCents > 0 && expectedReturnPct !== null) {
    steps.push({ kind: 'debt-choice', debtId: moderate.id, name: moderate.name, aprPct: moderate.aprPct, investMonthlyCents: longTerm.monthlyCents, expectedReturnPct })
  }

  // 4. El resto se queda en el líquido y el reparto automático lo lleva a los objetivos.
  const rest = room - longTerm.monthlyCents
  if (rest > 0) steps.push({ kind: 'rest-to-objectives', monthlyCents: rest, ...(noObjectives ? { noObjectives: true as const } : {}) })

  // 5. Dinero parado: de una vez o repartido en meses (eliges tú); con plazo corto, a ahorro seguro.
  if (!needsProfile && idleCents >= Math.max(IDLE_MIN_CENTS, monthly.spendingCents)) {
    const safe = profile.horizon === 'short'
    steps.push({
      kind: 'idle-money',
      idleCents,
      safe,
      mix: !safe && mixFor ? mixFor(idleCents) : [],
      spreadMonths: IDLE_SPREAD_MONTHS,
      perMonthCents: euros(idleCents / IDLE_SPREAD_MONTHS),
      adult: profile.adult ?? null,
    })
  }

  return withProfileStep({ status: 'ready', blocker: null, monthly, cushion, longTerm, steps })
}
