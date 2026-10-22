/**
 * La guía con TUS números (2026-10-21): cuánto deberías invertir según lo que
 * tienes, qué tipos sirven para cada parte de tu mezcla y cuánto te cuesta la
 * diferencia de comisión entre dos opciones. Todo sale de «Tu plan» con reglas
 * fijas y siempre por TIPO de producto: nunca un producto, una entidad ni un
 * momento de compra. Los importes, en céntimos.
 */
import { buildAllocationPlan, type AllocationPlan, type PlanStep } from '../plan/allocation'
import { SLEEVES, type MixPart, type SleeveKey } from '../plan/mix'
import { futureValue } from '../plan/returns'
import type { ReconciledProfile } from '../profile/types'
import type { AxisDecision } from '../types'
import { HIGH_FEE_PCT, productFit } from './fit'
import { PRODUCT_TYPES, type ProductType } from './products'
import { isRecommended, type TypeFit } from './recommend'
import { SCENARIO_ASSUMPTIONS } from './scenarios'

const stepOf = <K extends PlanStep['kind']>(plan: AllocationPlan, kind: K) => plan.steps.find((s): s is Extract<PlanStep, { kind: K }> => s.kind === kind)

/* ------------------------------ cuánto invertir ------------------------------ */

export type InvestEstimate =
  | {
      kind: 'now'
      /** Lo que tu plan invierte cada mes de lo que ahorras. */
      monthlyCents: number
      /** Dinero sin destino que se puede invertir ya (de una vez o en `spreadMonths` meses). */
      lumpCents: number
      spreadMonths: number
      lumpPerMonthCents: number
      /** En un año: 12 meses de aportación más el dinero sin destino. */
      yearCents: number
      /** Tu dinero líquido y la parte que se queda para el colchón y los objetivos. */
      liquidCents: number
      keptCents: number
    }
  | {
      kind: 'later'
      reason: 'cushion' | 'debt'
      /** Meses que faltan para completar el colchón o devolver la deuda, si se saben. */
      months: number | null
      /** Lo que invertirías cada mes con el colchón completo (con tus datos de hoy), si se sabe. */
      thenMonthlyCents: number | null
    }
  | { kind: 'none'; reason: 'blocked' | 'no-profile' | 'short-horizon' | 'no-room' }

/**
 * Lo que tu plan invertiría con el colchón ya completo: el mismo plan con ese
 * dinero en el líquido y apartado (así no cuenta como dinero sin destino).
 */
function monthlyWithCushionDone(decision: AxisDecision, remainingCents: number): number | null {
  const w = decision.context.wealth
  const context = { ...decision.context, wealth: { ...w, liquidCents: w.liquidCents + remainingCents, reservedForObjectivesCents: Math.max(0, w.reservedForObjectivesCents) + remainingCents } }
  const invest = stepOf(buildAllocationPlan({ ...decision, context }), 'invest-long-term')
  return invest ? invest.monthlyCents : null
}

export function investEstimate(decision: AxisDecision, plan: AllocationPlan): InvestEstimate {
  if (plan.status === 'blocked') return { kind: 'none', reason: 'blocked' }
  const invest = stepOf(plan, 'invest-long-term')
  const idle = stepOf(plan, 'idle-money')
  const monthlyCents = invest?.monthlyCents ?? 0
  const lumpCents = idle && !idle.safe ? idle.idleCents : 0
  if (monthlyCents > 0 || lumpCents > 0) {
    const liquidCents = Math.max(0, decision.context.wealth.liquidCents)
    return {
      kind: 'now',
      monthlyCents,
      lumpCents,
      spreadMonths: idle?.spreadMonths ?? 0,
      lumpPerMonthCents: idle && lumpCents > 0 ? idle.perMonthCents : 0,
      yearCents: monthlyCents * 12 + lumpCents,
      liquidCents,
      keptCents: Math.max(0, liquidCents - lumpCents),
    }
  }
  switch (plan.longTerm.reason) {
    case 'debt-first': {
      const debt = stepOf(plan, 'pay-debt')
      return { kind: 'later', reason: 'debt', months: debt?.months ?? null, thenMonthlyCents: null }
    }
    case 'cushion-incomplete': {
      const fill = stepOf(plan, 'fill-cushion')
      if (fill?.starter) return { kind: 'later', reason: 'debt', months: null, thenMonthlyCents: null }
      const remaining = plan.cushion?.remainingCents ?? 0
      return { kind: 'later', reason: 'cushion', months: fill?.months ?? null, thenMonthlyCents: remaining > 0 ? monthlyWithCushionDone(decision, remaining) : null }
    }
    case 'no-profile':
      return { kind: 'none', reason: 'no-profile' }
    case 'short-horizon':
      return { kind: 'none', reason: 'short-horizon' }
    default:
      return { kind: 'none', reason: 'no-room' }
  }
}

/* ------------------------- tu mezcla, parte por parte ------------------------- */

/** Tipos que se enseñan para cada parte, en este orden (si encajan con tu plan). */
const SLEEVE_TYPES: Record<SleeveKey, readonly string[]> = {
  'global-equity': ['fondo-indexado', 'etf'],
  bonds: ['fondo-renta-fija', 'etf-bonos', 'bonos-estado'],
  risky: ['acciones', 'etf-region', 'etf-sector'],
}

/** Cómo elegir entre los tipos de cada parte: información general, la misma para todos. */
export const SLEEVE_CHOICE: Record<SleeveKey, string> = {
  'global-equity':
    'Un fondo indexado y un ETF global hacen lo mismo: repartir tu dinero entre miles de empresas de todo el mundo. En España, el fondo se puede pasar a otro sin pagar impuestos (traspaso) y es fácil programar una aportación cada mes; el ETF se compra en bolsa, suele costar algo menos y cada venta tributa.',
  bonds:
    'Un fondo o un ETF de renta fija reparten entre muchos bonos y no vencen nunca; un bono suelto vence en una fecha y, si lo mantienes hasta entonces, sabes lo que cobras. Para una parte de tu mezcla que va a durar años, lo repartido entre muchos bonos es lo más sencillo.',
  risky:
    'Es la parte que podrías perder entera, y como mucho una de cada diez partes de lo que inviertes. Cualquiera de estos tipos cabe aquí; si dudas, ponla también en renta variable global.',
}

export interface SleeveGuide {
  key: SleeveKey
  label: string
  /** Peso de esta parte en tu mezcla (no en la aportación de este mes, que puede reequilibrar). */
  pct: number
  /** Este mes la aportación se reparte distinto para acercar lo que ya tienes a tu mezcla. */
  rebalancing: boolean
  /** Lo que va a esta parte cada mes y de una vez (dinero sin destino). */
  monthlyCents: number
  lumpCents: number
  choice: string
  types: TypeFit[]
}

export function sleeveGuide(plan: AllocationPlan, profile: Pick<ReconciledProfile, 'horizon' | 'adult'>): SleeveGuide[] {
  const invest = stepOf(plan, 'invest-long-term')
  const idle = stepOf(plan, 'idle-money')
  const monthly = invest?.mix ?? []
  const lump = idle && !idle.safe ? idle.mix : []
  const keys = (['global-equity', 'bonds', 'risky'] as const).filter((k) => monthly.some((p) => p.key === k && p.cents > 0) || lump.some((p) => p.key === k && p.cents > 0))
  const cents = (parts: readonly MixPart[], k: SleeveKey) => parts.find((p) => p.key === k)?.cents ?? 0
  return keys.map((key) => {
    const part = monthly.find((p) => p.key === key) ?? lump.find((p) => p.key === key)!
    const types = SLEEVE_TYPES[key]
      .map((id) => PRODUCT_TYPES.find((t) => t.id === id))
      .filter((t): t is ProductType => t !== undefined)
      .map((type) => ({ type, fit: productFit(type, plan, profile) }))
      .filter((t) => isRecommended(t.fit.verdict))
    const rebalancing = invest?.rebalance !== undefined
    return {
      key,
      label: SLEEVES[key].label,
      pct: invest?.rebalance?.targetPct[key] ?? part.pct,
      rebalancing,
      monthlyCents: cents(monthly, key),
      lumpCents: cents(lump, key),
      choice: SLEEVE_CHOICE[key],
      types,
    }
  })
}

/** Lo que tu plan pone cada mes en la parte a la que pertenece este tipo; `null` si no la usa. */
export function monthlyForType(type: ProductType, plan: AllocationPlan): number | null {
  const invest = stepOf(plan, 'invest-long-term')
  const part = invest?.mix.find((p) => SLEEVES[p.key].families.includes(type.family) && p.cents > 0)
  return part ? part.cents : null
}

/* ----------------------------- comparar comisiones ----------------------------- */

/** Aportación con la que se compara si tu plan no pone nada en este tipo. */
export const COMPARE_DEFAULT_MONTHLY_CENTS = 10_000
export const COMPARE_YEARS = 20

export interface FeeComparison {
  years: number
  monthlyCents: number
  /** Lo que habrías puesto. */
  contributedCents: number
  aCents: number
  bCents: number
  /** Lo que se lleva de más la opción más cara (euros enteros). */
  diffCents: number
  cheaper: 'a' | 'b' | null
  aHigh: boolean
  bHigh: boolean
}

/**
 * Dos opciones del mismo tipo con comisiones distintas: con la misma aportación
 * y el mismo crecimiento supuesto del tipo (guía), cuánto te dejaría cada una.
 * Las comisiones las pone el usuario; Finax solo hace la cuenta.
 */
export function feeComparison(type: ProductType, monthlyCents: number, aPct: number, bPct: number, years = COMPARE_YEARS): FeeComparison | null {
  const a = SCENARIO_ASSUMPTIONS[type.id]
  if (a?.kind !== 'growth' || monthlyCents <= 0 || !(aPct >= 0) || !(bPct >= 0) || aPct > 10 || bPct > 10) return null
  const value = (fee: number) => Math.round(futureValue(0, monthlyCents, a.mu - fee, years) / 100) * 100
  const aCents = value(aPct)
  const bCents = value(bPct)
  const limit = HIGH_FEE_PCT[type.family]
  return {
    years,
    monthlyCents,
    contributedCents: monthlyCents * 12 * years,
    aCents,
    bCents,
    diffCents: Math.abs(aCents - bCents),
    cheaper: aPct === bPct ? null : aPct < bPct ? 'a' : 'b',
    aHigh: limit > 0 && aPct > limit,
    bHigh: limit > 0 && bPct > limit,
  }
}
