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
import { prioritiesOf, recurringIncomesOf, regularExpenseCents, regularIncomeCents, habitualIncomeCents, usualExpenseMonths, usualMonthlyExpense, usualMonthlySavings, MIN_USUAL_EXPENSE_MONTHS } from '../rules/shared'
import type { AxisDecision, ClosedMonth, ObjectiveContext, PeriodStats } from '../types'
import type { ReconciledProfile, RiskAttitude } from '../profile/types'
import type { InflationRef } from './inflation'
import { MARKET_MOVES, type EquityMove } from '../../market/moves'
import { DRAWDOWN_NOTICE_PCT, expectedMixReturnPct, heldBySleeve, heldPct, mixWeights, needsRebalance, rebalanceSplit, riskyAllowed, sellProposals, splitMix, type MixPart, type SleeveKey } from './mix'
import { DEBT_CHEAP_PCT, DEBT_EXPENSIVE_PCT, DEBT_LOAD_MAX_PCT, extraPaymentEffect } from '../../finance/debts'
import { INVESTED_GOAL_MIN_MONTHS, LONG_GOAL_MONTHS, TO_SAFE_MONTHS, isLongGoal } from '../../finance/objectives'
import type { DebtContext } from '../types'
import { RISKY_DROP_PCT, STALE_VALUE_DAYS } from './performance'
import type { DataIssue } from './data-checks'

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
/** Por debajo de esta parte de lo que pide tu gasto, la meta del colchón se queda corta y el plan propone subirla. */
export const CUSHION_SHORT_RATIO = 0.9
/** Un extra por debajo de esto no se invierte suelto: se junta con el siguiente. */
export const EXTRAS_MIN_CENTS = 5_000
/** Meses en los que se propone repartir el dinero parado. */
export const IDLE_SPREAD_MONTHS = 6
/** Dinero parado mínimo para mencionarlo: 100 € y al menos un mes de gasto habitual. */
export const IDLE_MIN_CENTS = 10_000
/** Un objetivo a menos de estos meses se va a gastar ya: no se propone moverlo a ahorro seguro. */
export const SAFE_GOAL_MIN_MONTHS = 3
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
  /** `withSavings`: no te sobra nada al mes, pero el plan reparte lo que ya tienes (colchón completo). */
  | { kind: 'reduce-spending'; withSavings?: true }
  | { kind: 'register-data'; monthsNeeded: number }
  | { kind: 'create-cushion'; targetCents: number }
  | { kind: 'move-cushion-first'; objectiveId: string }
  /** La meta del «Fondo de emergencia» se queda corta para tu gasto de ahora: `suggestedCents` = `months` × `spendingCents`. */
  /**
   * Ingresos irregulares: qué hacer con cada extra (trabajo, regalo). Colchón primero; el resto, con estos pesos.
   * Por debajo de `minCents`, se junta con el siguiente (invertir importes pequeños no compensa).
   */
  /** `toSafe`: el plan no invierte (objetivos cercanos): lo demás va a ellos, en ahorro seguro. `weights` vacío. */
  | { kind: 'extras-split'; weights: Array<Pick<MixPart, 'key' | 'label' | 'pct'>>; minCents: number; adult: boolean | null; toSafe?: true }
  | { kind: 'raise-cushion'; objectiveId: string; targetCents: number; suggestedCents: number; months: number; spendingCents: number }
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
      /** Tu perfil dice que necesitarás el dinero en 2 a 5 años: el título no dice «largo plazo». */
      mediumHorizon?: true
      /** Solo si tu mezcla real se aleja de la del plan: el reparto de este mes la acerca, sin vender. */
      rebalance?: { heldPct: Record<SleeveKey, number>; targetPct: Record<SleeveKey, number> }
      /** Solo si tus inversiones valen al menos un `DRAWDOWN_NOTICE_PCT` % menos de lo que aportaste. */
      drawdownPct?: number
    }
  /** Dinero sin destino (por encima del colchón y de todos tus objetivos): de una vez o repartido; eliges tú. */
  | {
      kind: 'idle-money'
      idleCents: number
      safe: boolean
      mix: MixPart[]
      spreadMonths: number
      perMonthCents: number
      adult: boolean | null
      /**
       * La bolsa ha caído con fuerza en el último mes (decidido con el usuario el 2026-11-02: aprovechar las caídas):
       * se propone invertir ya la mitad (`nowCents`, repartida en `mix`) y el resto en `spreadMonths` meses.
       */
      boost?: { dropPct: number; label: string; nowCents: number; mix: MixPart[]; restPerMonthCents: number }
    }
  /**
   * Ahorro del mes para objetivos a más de `LONG_GOAL_MONTHS`, invertido (sin parte arriesgada): lo que falta
   * entre los meses que quedan, sin contar con la rentabilidad. `atRisk`: no cabe entero en tu ahorro.
   */
  /** `mediumHorizon`: la mezcla es la de un plazo medio (objetivo «sigue creciendo» cercano y tu perfil dice 2–5 años). */
  | { kind: 'invest-for-goals'; monthlyCents: number; objectiveIds: string[]; mix: MixPart[]; atRisk: boolean; adult: boolean | null; keepGrowing?: true; mediumHorizon?: true; mixedGoals?: true }
  /**
   * Tu perfil dice que necesitarás el dinero en 2–5 años, pero estos objetivos (fecha a 5 años o menos) están
   * marcados «sigue creciendo». El plan no adivina: usa la mezcla de tu plazo (más renta fija) y te pregunta.
   * Si de verdad no lo vas a tocar, cambias tu plazo a «más de 5 años» y la mezcla pasa a la de largo plazo.
   */
  | { kind: 'confirm-horizon'; objectiveIds: string[]; shortProfile?: true }
  /**
   * Objetivo a `TO_SAFE_MONTHS` o menos con parte invertida: pásala poco a poco a ahorro seguro, en
   * `spreadMonths` (hasta un año antes de la fecha, cuando lo invertido deja de contar).
   */
  | { kind: 'move-goal-to-safe'; objectiveId: string; investedCents: number; monthsLeft: number; spreadMonths: number; perMonthCents: number }
  /** Líquido apartado para objetivos a más de `LONG_GOAL_MONTHS`: puede invertirse (sin parte arriesgada) y seguir contando para ellos. */
  /** `keepGrowing`: todos sus objetivos son para seguir creciendo (no se gastan en la fecha). */
  | { kind: 'invest-goal-money'; cents: number; objectiveIds: string[]; mix: MixPart[]; spreadMonths: number; perMonthCents: number; adult: boolean | null; keepGrowing?: true; mediumHorizon?: true; mixedGoals?: true }
  /**
   * Lo que tienen en la cuenta los objetivos que no se invierten (a 5 años o menos, o «sigue creciendo» con un
   * plazo de menos de 2 años): a ahorro seguro, que no baja y sigue contando para ellos (2026-11-11, QA: 961 €
   * para un objetivo a 32 meses, quietos en la cuenta y sin ningún consejo).
   */
  | { kind: 'goal-cash-to-safe'; cents: number; objectiveIds: string[]; adult: boolean | null }
  /** La fecha del objetivo ya pasó y no está conseguido: ¿ya lo usaste o le pones otra fecha? */
  | { kind: 'overdue-goal'; objectiveId: string }
  /** `noObjectives` solo existe (true) si no hay objetivos pendientes: el resto se queda en el líquido sin destino. */
  | { kind: 'rest-to-objectives'; monthlyCents: number; noObjectives?: true }
  | { kind: 'answer-profile' }
  /** Plan provisional: el ahorro sale del ingreso fijo previsto, no de meses registrados. */
  /** `lastMonthIncomeCents`: lo que ingresaste en tu último mes completo, cuando fue más que el ingreso fijo (y es lo que se usa). */
  /**
   * `spendingFrom`: el gasto no es el de tu último mes completo porque se quedaba corto: son tus gastos fijos de
   * «Fijos» (`fixed`) o lo que llevas gastado este mes sin lo puntual (`current-month`).
   */
  /**
   * `lastMonthSavingsCents`: solo con `spendingFrom: 'pace'`, cuando el ritmo dejaba el ahorro en cero pero tu último
   * mes completo ahorró: lo que te sobra es eso (el ritmo sigue valiendo para el colchón).
   */
  | {
      kind: 'forecast-basis'
      recurringIncomeCents: number
      spendingCents: number
      monthsNeeded: number
      lastMonthIncomeCents?: number
      spendingFrom?: 'fixed' | 'current-month' | 'pace'
      lastMonthSavingsCents?: number
    }
  /** La prioridad que declaraste no va la primera del reparto (después del colchón). */
  | { kind: 'follow-priority'; objectiveId: string; rank: number; aheadIds: string[] }
  /** Notas de AXIS que el plan todavía no puede usar: hay que convertirlas en datos o descartarlas. */
  | { kind: 'review-notes'; count: number }
  /** Datos que parecen mal apuntados (`plan/data-checks.ts`): se avisa y decide el usuario; nunca cambia importes. */
  | { kind: 'check-data'; issues: DataIssue[] }
  /**
   * Inversión de la parte arriesgada que vale un `RISKY_DROP_PCT` % o menos de lo aportado: puede no recuperarse.
   * Mientras esté así, la parte arriesgada no recibe dinero nuevo (decidido el 2026-11-02).
   */
  | { kind: 'risky-drop'; positionId: string; name: string; changePct: number }
  /** Inversiones con el valor de hace más de `STALE_VALUE_DAYS` días: sus caídas y subidas no cuentan hasta que lo actualices. */
  | { kind: 'stale-values'; count: number; oldestDays: number }
  /**
   * Vender para volver a tu mezcla (decidido el 2026-11-02), solo con un descuadre grande (`sellProposals`):
   * `trim-risky`, la parte arriesgada vuelve a su tope (`gainCents`: lo que ha ganado sobre lo aportado);
   * `rebalance-sell`, lo que más sobra de renta variable o renta fija pasa al otro tipo.
   */
  | { kind: 'trim-risky'; sellCents: number; to: MixPart[]; heldPct: Record<SleeveKey, number>; targetPct: Record<SleeveKey, number>; gainCents: number }
  | { kind: 'rebalance-sell'; from: SleeveKey; sellCents: number; to: MixPart[]; heldPct: Record<SleeveKey, number>; targetPct: Record<SleeveKey, number> }

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
  /**
   * Solo si el colchón que propone el plan (crearlo, ponerlo el primero o subirlo) se lleva dinero que hoy está
   * apartado para tus objetivos: los objetivos como quedan con el colchón el primero del reparto. Los textos de
   * los pasos usan estos en lugar de los del contexto, para no contar con un dinero que irá al colchón.
   */
  objectivesAfterCushion?: ObjectiveContext[]
}

const euros = (cents: number) => Math.max(0, Math.floor(cents / 100) * 100)
/** Días por mes, como en el contexto (`requiredMonthlyCents`). */
const MONTH_DAYS = 30.44

/**
 * Los objetivos con el colchón el primero del reparto (2026-11-11). Crear el «Fondo de emergencia» lo pone el
 * primero (`addObjectiveFirst`), igual que «ponerlo el primero» o subir su meta: el dinero que le falta y no está
 * libre sale de lo apartado para tus objetivos, empezando por el de menor prioridad (el reparto va por prioridad).
 * Sin esto, el plan veía «Coche» y «Viaje» cubiertos, decía «no tienes objetivos pendientes» y proponía invertir;
 * al pulsar «Crear» cambiaba de opinión. Solo se mueve dinero líquido (no lo invertido ni lo del ahorro seguro).
 */
function goalsWithCushionFirst(active: readonly ObjectiveContext[], deficitCents: number): ObjectiveContext[] {
  if (deficitCents <= 0) return [...active]
  let left = deficitCents
  const byRankDesc = active
    .filter((o) => !isCushionObjective(o) && o.status !== 'achieved')
    .sort((a, b) => (b.rank ?? Infinity) - (a.rank ?? Infinity) || 0)
  const taken = new Map<string, number>()
  for (const o of byRankDesc) {
    if (left <= 0) break
    const liquidPart = Math.max(0, o.currentCents - (o.investedCents ?? 0) - (o.safeCents ?? 0))
    const take = Math.min(liquidPart, left)
    if (take > 0) taken.set(o.id, take)
    left -= take
  }
  if (taken.size === 0) return [...active]
  const adjusted = active.map((o) => {
    const take = taken.get(o.id)
    if (!take) return o
    const currentCents = o.currentCents - take
    const remainingCents = Math.max(0, o.targetCents - currentCents)
    return {
      ...o,
      currentCents,
      remainingCents,
      progressPct: o.targetCents > 0 ? Math.floor((currentCents / o.targetCents) * 100) : o.progressPct,
      ...(remainingCents > 0 ? { completed: false, status: 'in-progress' as const } : {}),
    }
  })
  // Lo que hace falta al mes, en cascada por prioridad como en el contexto.
  let ahead = 0
  const ranked = [...adjusted].filter((o) => !isCushionObjective(o) && !o.completed).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
  const required = new Map<string, { requiredMonthlyCents?: number; aheadRemainingCents: number }>()
  for (const o of ranked) {
    const monthsLeft = o.monthsLeft
    required.set(o.id, {
      aheadRemainingCents: ahead,
      ...(monthsLeft !== undefined && monthsLeft > 0 ? { requiredMonthlyCents: Math.ceil((ahead + o.remainingCents) / Math.max(monthsLeft, 1 / MONTH_DAYS) / 100) * 100 } : {}),
    })
    ahead += o.remainingCents
  }
  return adjusted.map((o) => (required.has(o.id) ? { ...o, ...required.get(o.id) } : o))
}
/** Céntimos enteros no negativos; cualquier otra cosa cuenta como 0 (el contexto puede llegar del cliente). */
const validCents = (n: unknown): number => (typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : 0)
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
/** Lo que el plan invierte cada mes: el largo plazo y el ahorro de los objetivos lejanos. */
export function monthlyInvestCents(plan: AllocationPlan): number {
  return plan.steps.reduce((t, s) => t + (s.kind === 'invest-long-term' || s.kind === 'invest-for-goals' ? s.monthlyCents : 0), 0)
}

/**
 * Objetivo «sigue creciendo» cuyo plazo choca con tu perfil (2026-11-08, revisión como asesor): su fecha
 * está a 5 años o menos (o no tiene) y tu perfil no dice «más de 5 años». Su plazo real no se sabe: el
 * plan usa el de tu perfil y te lo pregunta (paso `confirm-horizon`), en vez de suponer el largo plazo.
 */
export function horizonInDoubt(o: Pick<ObjectiveContext, 'keepGrowing' | 'monthsLeft'>, profileHorizon: ReconciledProfile['horizon']): boolean {
  const longByDate = o.monthsLeft !== undefined && o.monthsLeft > LONG_GOAL_MONTHS
  return o.keepGrowing === true && !longByDate && profileHorizon !== 'long'
}

/**
 * El dinero de este objetivo puede invertirse: es lejano («sigue creciendo» o a más de 5 años) y, si su plazo
 * está en duda, tu perfil no dice «menos de 2 años» (2026-11-11, QA: con plazo corto el plan invertía al 50/50
 * el dinero de alguien que lo necesita antes de 2 años). Con plazo corto y en duda, se trata como cercano.
 */
export function investableGoal(o: Pick<ObjectiveContext, 'keepGrowing' | 'monthsLeft'>, profileHorizon: ReconciledProfile['horizon']): boolean {
  return isLongGoal(o) && !(profileHorizon === 'short' && horizonInDoubt(o, profileHorizon))
}

/**
 * Lo que el plan invierte, sumando TODOS sus pasos de inversión: el largo plazo, el ahorro de los
 * objetivos lejanos, el dinero sin destino y el apartado para objetivos lejanos. Es la única fuente
 * para las pantallas (Guía, Inversiones, señales, foto del mes): ninguna vuelve a deducirlo por su
 * cuenta (2026-11-08: la Guía solo miraba `invest-long-term` y decía «este mes, nada» mientras el
 * plan proponía invertir).
 */
export interface PlanInvestment {
  /** Cada mes, de lo que ahorras. */
  monthlyCents: number
  monthlyMix: MixPart[]
  /** Ahora, de una vez o repartido en `spreadMonths` meses. */
  lumpCents: number
  lumpMix: MixPart[]
  spreadMonths: number
  lumpPerMonthCents: number
  /** Parte de `lumpCents` que es dinero apartado para objetivos lejanos (el resto no tiene destino). */
  goalLumpCents: number
}

/** Suma mezclas por tipo; el peso es la media de los pesos ponderada por lo que lleva cada paso. */
function mergeMixes(mixes: readonly (readonly MixPart[])[]): MixPart[] {
  const out = new Map<SleeveKey, MixPart & { weighted: number }>()
  for (const mix of mixes) {
    const total = mix.reduce((t, p) => t + p.cents, 0)
    for (const p of mix) {
      const prev = out.get(p.key) ?? { ...p, cents: 0, pct: 0, weighted: 0 }
      out.set(p.key, { ...prev, cents: prev.cents + p.cents, weighted: prev.weighted + p.pct * total })
    }
  }
  const totals = mixes.reduce((t, mix) => t + mix.reduce((s, p) => s + p.cents, 0), 0)
  return [...out.values()].map(({ weighted, ...p }) => ({ ...p, pct: totals > 0 ? Math.round(weighted / totals) : p.pct }))
}

export function planInvestment(plan: AllocationPlan): PlanInvestment {
  const monthly: MixPart[][] = []
  const lump: MixPart[][] = []
  let monthlyCents = 0
  let lumpCents = 0
  let lumpPerMonthCents = 0
  let spreadMonths = 0
  let goalLumpCents = 0
  for (const s of plan.steps) {
    if ((s.kind === 'invest-long-term' || s.kind === 'invest-for-goals') && s.monthlyCents > 0) {
      monthlyCents += s.monthlyCents
      monthly.push(s.mix)
    } else if ((s.kind === 'idle-money' && !s.safe) || s.kind === 'invest-goal-money') {
      const cents = s.kind === 'idle-money' ? s.idleCents : s.cents
      if (cents <= 0) continue
      lumpCents += cents
      if (s.kind === 'invest-goal-money') goalLumpCents += cents
      lumpPerMonthCents += s.perMonthCents
      spreadMonths = Math.max(spreadMonths, s.spreadMonths)
      lump.push(s.mix)
    }
  }
  return { monthlyCents, monthlyMix: mergeMixes(monthly), lumpCents, lumpMix: mergeMixes(lump), spreadMonths, lumpPerMonthCents, goalLumpCents }
}

export function planSleeves(plan: AllocationPlan): Set<SleeveKey> {
  const keys = new Set<SleeveKey>()
  for (const s of plan.steps) if (s.kind === 'invest-long-term' || s.kind === 'idle-money' || s.kind === 'invest-goal-money' || s.kind === 'invest-for-goals') for (const p of s.mix) if (p.cents > 0) keys.add(p.key)
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

/** Valores viejos: Finax no consulta cotizaciones, así que una caída o subida sin apuntar no existe para el plan. */
function staleValuesStep(positions: AxisDecision['context']['investments']['positions']): PlanStep[] {
  const ages = positions
    .filter((p) => p.valueCents > 0 && typeof p.valueAgeDays === 'number' && Number.isFinite(p.valueAgeDays) && p.valueAgeDays > STALE_VALUE_DAYS)
    .map((p) => p.valueAgeDays as number)
  return ages.length > 0 ? [{ kind: 'stale-values', count: ages.length, oldestDays: Math.max(...ages) }] : []
}

/** Mediana del ahorro (ingresos − gastos) de los mismos meses que el gasto habitual. */

/**
 * El bloqueo `overspending` solo cuando el gasto habitual del mes en curso ya supera lo que sueles ingresar en
 * un mes (2026-11-11). A principios de mes la paga aún no ha llegado y `expenses.over-income` salta aunque los
 * meses cerrados ahorren: eso no es gastar de más. Lo que esperas ingresar es lo más alto de: lo que llevas
 * este mes (sin lo puntual), tus ingresos fijos mensuales de «Fijos» y, solo si aún no ha llegado ni la mitad
 * de lo habitual (la paga claramente no ha entrado), la mediana de los meses cerrados habituales (con los fijos
 * pendientes). Si ya cobraste menos de lo normal, no se supone que llegará el resto. Sin nada de eso, se
 * bloquea como antes.
 */
function overspendsUsualIncome(current: PeriodStats, closedMonths: readonly ClosedMonth[] | undefined, fixedMonthlyIncomeCents: number | undefined): boolean {
  const incomes = usualExpenseMonths(closedMonths).map(habitualIncomeCents).sort((a, b) => a - b)
  const mid = Math.floor(incomes.length / 2)
  const usualIncome = incomes.length === 0 ? 0 : incomes.length % 2 === 1 ? incomes[mid] : Math.floor((incomes[mid - 1] + incomes[mid]) / 2)
  const received = regularIncomeCents(current)
  const incomeStillMissing = received * 2 < usualIncome
  const expected = Math.max(received, validCents(fixedMonthlyIncomeCents), incomeStillMissing ? usualIncome : 0)
  return regularExpenseCents(current) > expected
}

export interface PlanOptions {
  /** Notas de AXIS (memorias sin dato) que el usuario no ha convertido ni descartado. Solo las conoce el dispositivo. */
  pendingNotes?: number
  /** Datos que parecen mal apuntados (`checkData`). Solo los conoce el dispositivo: el contexto no lleva los movimientos. */
  dataIssues?: DataIssue[]
  /** Inflación de referencia (plan/inflation.ts): solo cambia textos, nunca importes. */
  inflation?: InflationRef
  /** Caída o subida fuerte de la bolsa en el último mes: una caída adelanta parte del dinero parado. */
  equityMove?: EquityMove | null
}

/** Parte del dinero parado que se adelanta tras una caída fuerte de la bolsa. */
export const DROP_BOOST_SHARE = 0.5

/** Solo una caída fuerte de verdad (puede venir del cliente: nunca se confía en su forma). */
function strongDrop(move: EquityMove | null | undefined): EquityMove | null {
  if (!move || typeof move !== 'object' || move.direction !== 'drop' || typeof move.label !== 'string') return null
  return typeof move.pct === 'number' && Number.isFinite(move.pct) && move.pct <= MARKET_MOVES.DROP_PCT && move.pct > -100 ? move : null
}

/** Días que tiene que cubrir el ritmo de gasto para fiarse de él (con menos, una sola compra lo dispara). */
export const PACE_MIN_DAYS = 35
/** El ritmo solo sustituye al gasto de un mes si lo supera en más de un 10 %. */
export const PACE_MARGIN = 1.1
const DAYS_PER_MONTH = 30.44

/**
 * Ritmo de gasto (sin lo puntual) de todos los días apuntados, llevado a un mes: los meses cerrados (el del
 * comienzo, solo desde el día en que empezaste) y lo que va del mes en curso. Solo para el plan provisional,
 * cuando un único mes completo puede no ser representativo. 0 si no cubre `PACE_MIN_DAYS` días.
 */
export function spendingPaceCents(closedMonths: readonly ClosedMonth[] | undefined, current: PeriodStats | undefined, asOf: string): number {
  let cents = 0
  let days = 0
  for (const m of Array.isArray(closedMonths) ? closedMonths : []) {
    if (!(m?.movementCount > 0)) continue
    const [y, mo] = m.key.split('-').map(Number)
    const monthDays = m.partial ? (m.trackedDays ?? 0) : new Date(y, mo, 0).getDate()
    if (!(monthDays > 0)) continue
    cents += regularExpenseCents(m)
    days += monthDays
  }
  const today = Number(asOf.slice(8, 10))
  if (current && today > 0) {
    cents += validCents(current.expenseCents) > 0 ? regularExpenseCents(current) : 0
    days += today
  }
  return days >= PACE_MIN_DAYS ? Math.round((cents / days) * DAYS_PER_MONTH) : 0
}

export function buildAllocationPlan(decision: AxisDecision, options: PlanOptions = {}): AllocationPlan {
  const plan = buildPlanCore(decision, options)
  return options.inflation ? { ...plan, inflation: options.inflation } : plan
}

function buildPlanCore(decision: AxisDecision, options: PlanOptions): AllocationPlan {
  const ctx = decision.context
  const profile = decision.profile.fields
  // Ingreso fijo para el plan provisional: el que le contaste a AXIS o, si no, tus ingresos fijos mensuales de «Fijos».
  const fixedIncome = decision.context.flows.fixedMonthlyIncomeCents
  const declaredIncome = recurringIncomesOf(profile) ?? (fixedIncome !== undefined && fixedIncome > 0 ? { monthlyCents: fixedIncome } : null)
  const debts = debtsOf(ctx.debts)
  // Datos que parecen mal apuntados y notas sin convertir: van en todos los planes, también en los bloqueados.
  const notesStep: PlanStep[] = [
    ...(options.dataIssues && options.dataIssues.length > 0 ? [{ kind: 'check-data' as const, issues: options.dataIssues }] : []),
    ...(options.pendingNotes && options.pendingNotes > 0 ? [{ kind: 'review-notes' as const, count: options.pendingNotes }] : []),
  ]
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
  if (ids.has('expenses.over-income') && overspendsUsualIncome(ctx.flows.current, ctx.flows.closedMonths, ctx.flows.fixedMonthlyIncomeCents)) {
    return blocked('overspending', [{ kind: 'reduce-spending' }])
  }

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
    // Un solo mes puede quedarse corto (2026-11-08): el gasto nunca baja de tus gastos fijos de «Fijos» ni de lo
    // que llevas gastado este mes (sin lo puntual). Se usa lo más alto: es una previsión prudente.
    const lastRegular = regularExpenseCents(last)
    const fixedExpense = validCents(ctx.flows.fixedMonthlyExpenseCents)
    const currentRegular = ctx.flows.current && validCents(ctx.flows.current.expenseCents) > 0 ? regularExpenseCents(ctx.flows.current) : 0
    // Y tampoco del ritmo de todos los días que llevas apuntando (2026-11-08: 24 € de octubre ignoraban los 32 €
    // gastados en los 9 días de septiembre; el ritmo real eran ~43 € al mes y el colchón salía de la mitad).
    const pace = spendingPaceCents(ctx.flows.closedMonths, ctx.flows.current, ctx.asOf)
    // Solo si es claramente más alto: una diferencia pequeña es ruido de redondeo, no información.
    const others = Math.max(lastRegular, fixedExpense, currentRegular)
    const spendingBase = pace > others * PACE_MARGIN ? pace : others
    const spendingFrom =
      spendingBase === lastRegular ? undefined : spendingBase === currentRegular ? ('current-month' as const) : spendingBase === fixedExpense ? ('fixed' as const) : ('pace' as const)
    const lastSpending = Math.ceil(spendingBase / 100) * 100
    // Lo que ingresaste ese mes (sin lo puntual, con los fijos pendientes) si es más que el ingreso fijo: la paga
    // no suele ser el único ingreso (2026-11-07: 35 € de paga − 46 € de gasto ignoraba el resto de ingresos).
    const lastIncome = Math.floor(habitualIncomeCents(last) / 100) * 100
    const fromLastMonth = lastIncome > declaredIncome.monthlyCents
    const incomeCents = fromLastMonth ? lastIncome : declaredIncome.monthlyCents
    // El ritmo es una extrapolación prudente para el colchón, no una prueba de que no ahorras (2026-11-11: 9 días de
    // septiembre estirados a un mes daban 40 € de gasto con 35 € de paga, y el plan decía «gasta menos de lo que
    // ingresas» cuando octubre ahorró 11 €). Si solo el ritmo deja el ahorro en cero y tu último mes completo
    // ahorró de verdad, lo que te sobra es lo de ese mes; el colchón sigue con el ritmo.
    const paceSavings = euros(incomeCents - lastSpending)
    const lastMonthSavings = euros(incomeCents - Math.ceil(lastRegular / 100) * 100)
    const savingsFromLastMonth = spendingFrom === 'pace' && paceSavings <= 0 && lastMonthSavings > 0
    monthly = {
      savingsCents: savingsFromLastMonth ? lastMonthSavings : paceSavings,
      spendingCents: lastSpending,
      months: months.length,
      forecast: true,
      recurringIncomeCents: declaredIncome.monthlyCents,
    }
    leading.push({
      kind: 'forecast-basis',
      recurringIncomeCents: declaredIncome.monthlyCents,
      spendingCents: lastSpending,
      monthsNeeded,
      ...(fromLastMonth ? { lastMonthIncomeCents: lastIncome } : {}),
      ...(spendingFrom ? { spendingFrom } : {}),
      ...(savingsFromLastMonth ? { lastMonthSavingsCents: lastMonthSavings } : {}),
    })
  } else {
    monthly = { savingsCents: euros(savings), spendingCents: spending, months: months.length, ...(declaredIncome ? { recurringIncomeCents: declaredIncome.monthlyCents } : {}) }
  }
  // `cushionSetup`: crear, poner el primero o subir el colchón no necesita ahorro nuevo, sale de lo que ya tienes (2026-11-11:
  // con 2.750 € sin destino y sin colchón, el plan solo decía «no hay nada que repartir»).
  const noSurplusBlock = (cushionSetup: PlanStep[] = [], cushionInfo: AllocationPlan['cushion'] = null): AllocationPlan => ({
    ...blocked('no-surplus', [{ kind: 'reduce-spending' }, ...cushionSetup, ...debtLoadStep(debts, monthly), ...leading, ...notesStep], monthly),
    ...(cushionSetup.length > 0 ? { cushion: cushionInfo } : {}),
  })
  // Sin ahorro al mes, el plan sigue solo para repartir lo que ya tienes (2026-11-08: 1.100 € parados y el plan
  // bloqueado por 11 € de diferencia). Hace falta el perfil, el colchón completo y ninguna deuda cara.
  const noSurplus = monthly.savingsCents <= 0
  if (noSurplus) monthly = { ...monthly, savingsCents: 0 }

  // 1. Colchón.
  let active = ctx.objectives.filter((o) => o.status !== 'achieved')
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

  const steps: PlanStep[] = noSurplus ? [{ kind: 'reduce-spending', withSavings: true }] : []
  if (!cushionObjective) steps.push({ kind: 'create-cushion', targetCents })
  else if (!isFirst) steps.push({ kind: 'move-cushion-first', objectiveId: cushionObjective.id })
  // La meta del objetivo se fijó con el gasto de entonces y no se mueve sola (2026-11-08: 144 € = 6 × 24 €, con un
  // gasto real de 43 €). Si se queda corta, el plan propone subirla; decides tú (puede que la pusieras a mano).
  const suggestedCushionCents = monthly.spendingCents * cushionMonths
  const cushionShort = cushionObjective !== null && source === 'objective' && objectiveTarget < suggestedCushionCents * CUSHION_SHORT_RATIO
  const cushionShortfallCents = cushionShort ? suggestedCushionCents - objectiveTarget : 0
  if (cushionShort && cushionObjective)
    steps.push({ kind: 'raise-cushion', objectiveId: cushionObjective.id, targetCents: objectiveTarget, suggestedCents: suggestedCushionCents, months: cushionMonths, spendingCents: monthly.spendingCents })
  // Lo que el colchón (el primero, y con la meta que propone el plan) tomará de lo apartado para objetivos.
  const liquidNow = Math.max(0, ctx.wealth.liquidCents)
  const freeLiquid = Math.max(0, liquidNow - Math.max(0, ctx.wealth.reservedForObjectivesCents))
  const cushionGoalTarget = targetCents + cushionShortfallCents
  const cushionDeficit = Math.min(cushionGoalTarget, liquidNow) - (cushionObjective ? Math.max(0, cushionObjective.currentCents) : 0) - freeLiquid
  const objectivesAfterCushion = cushionDeficit > 0 ? goalsWithCushionFirst(active, cushionDeficit) : null
  const contextActive = active
  if (objectivesAfterCushion) active = objectivesAfterCushion
  // Objetivos cerca de su fecha con dinero invertido: va antes que nada nuevo, una caída ya no tendría tiempo de recuperarse.
  for (const o of active) {
    const invested = o.investedCents ?? 0
    if (o.keepGrowing || invested <= 0 || o.monthsLeft === undefined || o.monthsLeft > TO_SAFE_MONTHS) continue
    const spreadMonths = Math.max(1, Math.floor(o.monthsLeft - INVESTED_GOAL_MIN_MONTHS))
    steps.push({ kind: 'move-goal-to-safe', objectiveId: o.id, investedCents: invested, monthsLeft: Math.floor(o.monthsLeft), spreadMonths, perMonthCents: Math.ceil(invested / spreadMonths / 100) * 100 })
  }
  // Una acción concreta, un sector o una cripto que se hunde puede no recuperarse (un índice mundial, sí): se revisa
  // y, mientras tanto, la parte arriesgada no recibe dinero nuevo.
  const riskyDrops = ctx.investments.positions.filter(
    (p) => p.assetType === 'risky' && p.valueCents > 0 && typeof p.changePct === 'number' && Number.isFinite(p.changePct) && p.changePct <= -RISKY_DROP_PCT,
  )
  for (const p of riskyDrops) steps.push({ kind: 'risky-drop', positionId: p.id, name: p.name, changePct: p.changePct as number })
  // Objetivos con la fecha pasada (2026-11-11, QA): su dinero seguía apartado para siempre sin que el plan dijera nada.
  for (const o of contextActive)
    if (!isCushionObjective(o) && !o.keepGrowing && o.monthsLeft !== undefined && o.monthsLeft <= 0) steps.push({ kind: 'overdue-goal', objectiveId: o.id })

  const needsProfile = profile.riskAttitude === undefined || profile.horizon === undefined
  // Detrás de los importes: de dónde sale el plan si es provisional, tu prioridad, el perfil y las notas pendientes.
  const tail: PlanStep[] = [
    ...debtLoadStep(debts, monthly),
    ...leading,
    ...priorityStep(decision, active),
    ...(needsProfile ? [{ kind: 'answer-profile' as const }] : []),
    ...staleValuesStep(ctx.investments.positions),
    ...notesStep,
  ]
  // Con deudas caras, devolverlas va antes que subir el colchón (el mínimo de 1 mes ya lo cubre `fill-cushion`).
  const debtBeforeCushion = (list: PlanStep[]): PlanStep[] => {
    const lastDebt = list.map((s) => s.kind).lastIndexOf('pay-debt')
    const raiseAt = list.findIndex((s) => s.kind === 'raise-cushion')
    if (lastDebt < 0 || raiseAt < 0 || raiseAt > lastDebt) return list
    const rest = list.filter((_, i) => i !== raiseAt)
    rest.splice(lastDebt, 0, list[raiseAt])
    return rest
  }
  const withProfileStep = (plan: AllocationPlan): AllocationPlan => ({
    ...plan,
    steps: [...debtBeforeCushion(plan.steps), ...tail],
    ...(objectivesAfterCushion ? { objectivesAfterCushion } : {}),
  })

  // 1b. Deudas caras: más que lo que cabe esperar de tu mezcla (o del 7 % sin perfil), nunca por debajo del 3 %.
  const investable = !needsProfile && profile.horizon !== 'short'
  const risk = planRisk(profile)
  const expectedReturnPct = investable ? expectedMixReturnPct(mixWeights(risk as RiskAttitude, profile.horizon as 'medium' | 'long', false)) : null
  const payFirstPct = expectedReturnPct === null ? DEBT_EXPENSIVE_PCT : Math.min(DEBT_EXPENSIVE_PCT, Math.max(DEBT_CHEAP_PCT, expectedReturnPct))
  const expensive = debts.filter((d) => d.aprPct >= payFirstPct)
  if (noSurplus && (needsProfile || remainingCents > 0 || expensive.length > 0))
    return noSurplusBlock(ctx.wealth.liquidCents > 0 ? steps.filter((s) => s.kind === 'create-cushion' || s.kind === 'move-cushion-first' || s.kind === 'raise-cushion') : [], cushion)
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
  const shortTerm = active.filter((o) => !isCushionObjective(o) && !o.keepGrowing && o.status === 'in-progress' && o.monthsLeft !== undefined && o.monthsLeft > 0 && o.monthsLeft <= LONG_GOAL_MONTHS)
  const shortNeed = shortTerm.reduce((max, o) => Math.max(max, o.requiredMonthlyCents ?? 0), 0)
  const shortMonthly = Math.min(monthly.savingsCents, Math.ceil(shortNeed / 100) * 100)
  if (shortTerm.length > 0 && shortMonthly > 0) {
    steps.push({ kind: 'short-term-objectives', monthlyCents: shortMonthly, objectiveIds: shortTerm.map((o) => o.id), atRisk: shortNeed > monthly.savingsCents })
  }
  const afterShort = Math.max(0, monthly.savingsCents - shortMonthly)

  // 2b. Objetivos lejanos (decidido el 2026-10-25): su ahorro se invierte, a largo plazo y sin parte arriesgada.
  // Lo que falta entre los meses que quedan, sin contar con la rentabilidad (lo que rinda, adelanta la meta).
  const farGoals = needsProfile
    ? []
    : active.filter((o) => !isCushionObjective(o) && o.status === 'in-progress' && o.monthsLeft !== undefined && o.monthsLeft > 0 && investableGoal(o, profile.horizon))
  const farNeed = farGoals.reduce((t, o) => t + Math.ceil(o.remainingCents / (o.monthsLeft as number) / 100) * 100, 0)
  const farMonthly = Math.min(euros(afterShort), farNeed)
  // Plazo de la mezcla de los objetivos: largo, salvo que alguno sea «sigue creciendo» con el plazo en duda.
  const goalHorizon = (goals: readonly ObjectiveContext[]): 'medium' | 'long' => (goals.some((o) => horizonInDoubt(o, profile.horizon)) ? 'medium' : 'long')
  const doubtful = needsProfile ? [] : active.filter((o) => !isCushionObjective(o) && !o.completed && o.status !== 'achieved' && horizonInDoubt(o, profile.horizon))
  if (doubtful.length > 0) steps.push({ kind: 'confirm-horizon', objectiveIds: doubtful.map((o) => o.id), ...(profile.horizon === 'short' ? { shortProfile: true as const } : {}) })
  if (farGoals.length > 0 && farMonthly > 0) {
    const horizon = goalHorizon(farGoals)
    steps.push({
      kind: 'invest-for-goals',
      monthlyCents: farMonthly,
      objectiveIds: farGoals.map((o) => o.id),
      mix: splitMix(farMonthly, mixWeights(risk as RiskAttitude, horizon, false)),
      ...(horizon === 'medium' ? { mediumHorizon: true as const } : {}),
      atRisk: farNeed > afterShort,
      adult: profile.adult ?? null,
      ...(farGoals.every((o) => o.keepGrowing) ? { keepGrowing: true as const } : farGoals.some((o) => o.keepGrowing) ? { mixedGoals: true as const } : {}),
    })
  }
  const room = afterShort - farMonthly

  // Dinero parado: el líquido que no necesitan ni el colchón ni ningún objetivo activo.
  // Lo que le falta a un colchón que se queda corto (`raise-cushion`) nunca se invierte: sale primero del dinero
  // parado y, si no llega, de lo apartado para objetivos lejanos.
  const idleRaw = ctx.wealth.liquidCents - Math.max(0, ctx.wealth.reservedForObjectivesCents) - (cushionObjective ? 0 : targetCents)
  const idleCents = euros(idleRaw - cushionShortfallCents)
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
      paused: riskyDrops.length > 0,
    })
    const weights = mixWeights(risk as RiskAttitude, horizon, risky)
    if (room <= 0) longTerm = noLongTerm('no-room')
    else {
      const pct = (noObjectives ? LONG_TERM_PCT_NO_OBJECTIVES : LONG_TERM_PCT)[risk as RiskAttitude]
      longTerm = { pct, monthlyCents: euros((room * pct) / 100), reason: 'ok' }
    }
    // Descuadre grande (una subida o una caída fuerte): vender lo que sobra. El dinero nuevo se reparte con la mezcla de después.
    const { proposals, heldAfter } = sellProposals(held, weights, longTerm.monthlyCents)
    const riskyGain = ctx.investments.positions
      .filter((p) => p.assetType === 'risky')
      .reduce((t, p) => t + Math.max(0, p.valueCents) - Math.max(0, p.investedCents), 0)
    for (const s of proposals)
      steps.push(
        s.kind === 'trim-risky'
          ? { kind: 'trim-risky', sellCents: s.sellCents, to: s.to, heldPct: s.heldPct, targetPct: s.targetPct, gainCents: Math.max(0, riskyGain) }
          : { kind: 'rebalance-sell', from: s.from, sellCents: s.sellCents, to: s.to, heldPct: s.heldPct, targetPct: s.targetPct },
      )
    // Si tu mezcla real se ha alejado de la del plan, lo nuevo va a lo que falta (sin vender nada).
    const current = heldPct(heldAfter)
    if (current && needsRebalance(heldAfter, weights)) rebalance = { heldPct: current, targetPct: weights }
    mixFor = (cents) => (rebalance ? rebalanceSplit(cents, weights, heldAfter) : splitMix(cents, weights))
    plainFor = (cents) => splitMix(cents, weights)
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
      ...(profile.horizon === 'medium' ? { mediumHorizon: true as const } : {}),
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
    const drop = strongDrop(options.equityMove)
    const nowCents = euros(idleCents * DROP_BOOST_SHARE)
    steps.push({
      kind: 'idle-money',
      idleCents,
      safe,
      mix: !safe && mixFor ? mixFor(idleCents) : [],
      spreadMonths: IDLE_SPREAD_MONTHS,
      perMonthCents: euros(idleCents / IDLE_SPREAD_MONTHS),
      adult: profile.adult ?? null,
      // Con la bolsa más barata, se adelanta la mitad; el resto, poco a poco. Nunca el colchón ni lo de tus objetivos.
      ...(drop && !safe && mixFor && nowCents > 0
        ? { boost: { dropPct: drop.pct, label: drop.label, nowCents, mix: mixFor(nowCents), restPerMonthCents: euros((idleCents - nowCents) / IDLE_SPREAD_MONTHS) } }
        : {}),
    })
  }

  // 6. Lo apartado en la cuenta para objetivos lejanos: invertido sigue contando para ellos (decidido el 2026-10-25).
  // Su plazo es el del objetivo, no el de tu perfil; nunca la parte arriesgada.
  // También los cubiertos: lo que tienen en la cuenta puede invertirse igual.
  const longGoals = active.filter((o) => !isCushionObjective(o) && investableGoal(o, profile.horizon))
  const inCash = (o: ObjectiveContext) => Math.max(0, o.currentCents - (o.investedCents ?? 0) - (o.safeCents ?? 0))
  // `active` ya tiene los objetivos con el colchón el primero (`goalsWithCushionFirst`): lo que el colchón
  // necesita (crearlo, ponerlo el primero o subirlo) y no está libre ya no cuenta como suyo, así que nunca se invierte.
  // Y por prudencia, nunca más que el líquido menos el colchón y lo que hoy tienen los objetivos cercanos: si el
  // colchón saca dinero de un objetivo cercano de menor prioridad, eso no libera para invertir el de uno lejano.
  const nearCash = contextActive
    .filter((o) => !isCushionObjective(o) && !investableGoal(o, profile.horizon))
    .reduce((t, o) => t + inCash(o), 0)
  const goalCents = euros(Math.min(longGoals.reduce((t, o) => t + inCash(o), 0), liquidNow - cushionGoalTarget - nearCash))
  if (!needsProfile && goalCents >= IDLE_MIN_CENTS) {
    const withMoney = longGoals.filter((o) => inCash(o) > 0)
    const horizon = goalHorizon(withMoney)
    steps.push({
      kind: 'invest-goal-money',
      cents: goalCents,
      objectiveIds: withMoney.map((o) => o.id),
      mix: splitMix(goalCents, mixWeights(risk as RiskAttitude, horizon, false)),
      ...(horizon === 'medium' ? { mediumHorizon: true as const } : {}),
      spreadMonths: IDLE_SPREAD_MONTHS,
      perMonthCents: euros(goalCents / IDLE_SPREAD_MONTHS),
      adult: profile.adult ?? null,
      ...(withMoney.every((o) => o.keepGrowing) ? { keepGrowing: true as const } : withMoney.some((o) => o.keepGrowing) ? { mixedGoals: true as const } : {}),
    })
  }

  // 6b. Lo apartado en la cuenta para objetivos que no se invierten: a ahorro seguro (no baja y cuenta para ellos).
  // Solo con fecha a más de `SAFE_GOAL_MIN_MONTHS` (antes se va a gastar) o «sigue creciendo»; nunca el colchón.
  const safeGoals = active.filter(
    (o) =>
      !isCushionObjective(o) &&
      !o.completed &&
      o.status !== 'achieved' &&
      !investableGoal(o, profile.horizon) &&
      (o.keepGrowing === true || (o.monthsLeft !== undefined && o.monthsLeft > SAFE_GOAL_MIN_MONTHS)) &&
      inCash(o) > 0,
  )
  const safeCents = euros(Math.min(safeGoals.reduce((t, o) => t + inCash(o), 0), Math.max(0, liquidNow - cushionGoalTarget)))
  if (safeCents >= IDLE_MIN_CENTS) steps.push({ kind: 'goal-cash-to-safe', cents: safeCents, objectiveIds: safeGoals.map((o) => o.id), adult: profile.adult ?? null })

  // Sin ahorro al mes y sin nada que repartir de lo que ya tienes: el plan se queda en «gasta menos».
  if (noSurplus && !steps.some((s) => s.kind === 'idle-money' || s.kind === 'invest-goal-money' || s.kind === 'goal-cash-to-safe')) return noSurplusBlock()

  // Con ingresos que cambian, los extras son la mayor parte del ahorro (2026-11-08: 600 € de un trabajo frente a
  // 35 € de paga). El plan dice qué hacer con cada uno: colchón primero y el resto con la mezcla de este plan.
  if (profile.irregularIncome === true) {
    const invest = steps.find((s): s is Extract<PlanStep, { kind: 'invest-goal-money' | 'invest-for-goals' | 'invest-long-term' | 'idle-money' }> =>
      (s.kind === 'invest-goal-money' || s.kind === 'invest-for-goals' || s.kind === 'invest-long-term' || (s.kind === 'idle-money' && !s.safe)) && s.mix.length > 0,
    )
    if (invest) steps.push({ kind: 'extras-split', weights: invest.mix.map(({ key, label, pct }) => ({ key, label, pct })), minCents: EXTRAS_MIN_CENTS, adult: profile.adult ?? null })
    // Sin nada que invertir, los extras también necesitan una regla (2026-11-11: con el objetivo cercano, el plan de un
    // menor cuyos extras son casi todo su ahorro ya no decía qué hacer con ellos).
    else if (steps.some((s) => s.kind === 'short-term-objectives' || s.kind === 'goal-cash-to-safe'))
      steps.push({ kind: 'extras-split', weights: [], minCents: EXTRAS_MIN_CENTS, adult: profile.adult ?? null, toSafe: true })
  }

  return withProfileStep({ status: 'ready', blocker: null, monthly, cushion, longTerm, steps })
}
