/**
 * Qué familia y qué tipo de la guía encajan mejor con TU plan. Reutiliza el
 * encaje por tipo (guide/fit.ts) y solo ordena: el mejor veredicto gana y, a
 * igualdad, el de menos riesgo y después el orden de la guía. Determinista y
 * siempre por tipo de producto, nunca por un producto o una empresa concretos.
 */
import type { AllocationPlan } from '../plan/allocation'
import type { ReconciledProfile } from '../profile/types'
import { productFit, type FitVerdict, type ProductFit } from './fit'
import { INVESTMENT_GROUPS, PRODUCT_TYPES, type InvestmentGroup, type ProductRisk, type ProductType } from './products'

/** De mejor a peor encaje. */
export const VERDICT_ORDER: readonly FitVerdict[] = ['fits', 'fits-short-term', 'partial', 'not-now', 'not-for-horizon', 'outside-plan']

/** Etiqueta corta para las listas. */
export const VERDICT_SHORT: Record<FitVerdict, string> = {
  fits: 'Encaja contigo',
  'fits-short-term': 'Para tu colchón',
  partial: 'En parte',
  'not-now': 'Aún no',
  'not-for-horizon': 'No para tu plazo',
  'outside-plan': 'Fuera de tu plan',
}

const RISK_RANK: Record<ProductRisk, number> = { 'muy-bajo': 0, bajo: 1, medio: 2, alto: 3, 'muy-alto': 4 }

export interface TypeFit {
  type: ProductType
  fit: ProductFit
}

export interface GroupFit {
  group: InvestmentGroup
  types: TypeFit[]
  /** El tipo de la familia que mejor encaja. */
  best: TypeFit
}

export interface GuideRecommendation {
  groups: GroupFit[]
  /** Lo que mejor encaja de toda la guía (su veredicto puede ser «aún no»). */
  lead: TypeFit & { group: InvestmentGroup }
  /** Si lo mejor es para el largo plazo: lo que encaja con el colchón y lo cercano. */
  shortTerm: (TypeFit & { group: InvestmentGroup }) | null
}

/** Solo un encaje «fits» o «fits-short-term» es una recomendación; el resto, una explicación. */
export const isRecommended = (v: FitVerdict): boolean => v === 'fits' || v === 'fits-short-term'

function better(a: TypeFit, b: TypeFit): TypeFit {
  const va = VERDICT_ORDER.indexOf(a.fit.verdict)
  const vb = VERDICT_ORDER.indexOf(b.fit.verdict)
  if (va !== vb) return va < vb ? a : b
  if (RISK_RANK[a.type.risk] !== RISK_RANK[b.type.risk]) return RISK_RANK[a.type.risk] < RISK_RANK[b.type.risk] ? a : b
  return PRODUCT_TYPES.indexOf(a.type) <= PRODUCT_TYPES.indexOf(b.type) ? a : b
}

export function recommendGuide(plan: AllocationPlan, profile: Pick<ReconciledProfile, 'horizon' | 'adult'>): GuideRecommendation {
  const groups = INVESTMENT_GROUPS.map((group): GroupFit => {
    const types = PRODUCT_TYPES.filter((t) => t.group === group.id).map((type) => ({ type, fit: productFit(type, plan, profile) }))
    return { group, types, best: types.reduce(better) }
  })
  const leadGroup = groups.map((g) => g.best).reduce(better)
  const groupOf = (t: TypeFit) => ({ ...t, group: groups.find((g) => g.types.includes(t))!.group })
  const short = groups.flatMap((g) => g.types).filter((t) => t.fit.verdict === 'fits-short-term')
  return {
    groups,
    lead: groupOf(leadGroup),
    shortTerm: leadGroup.fit.verdict === 'fits' && short.length > 0 ? groupOf(short.reduce(better)) : null,
  }
}
