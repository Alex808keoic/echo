/**
 * Reglas de asesor que TODO plan tiene que cumplir (2026-11-08, revisión como asesor de un caso real).
 * No deciden nada: comprueban que lo que deciden el plan, la Guía y «Cómo debería repartirse» es
 * coherente entre sí y con el perfil. Se ejecutan en los tests sobre cientos de perfiles generados al
 * azar (plan-invariants.test.ts) y, en desarrollo, sobre el plan real del usuario (useAllocationPlan).
 *
 * Cada fallo que se encuentre revisando casos reales debe acabar aquí como una regla nueva.
 */
import { investEstimate } from '../guide/invest'
import { recommendGuide } from '../guide/recommend'
import type { AxisDecision } from '../types'
import { horizonInDoubt, isCushionObjective, planInvestment, planRisk, type AllocationPlan, type PlanStep } from './allocation'
import { describeStep } from './describe'
import { idealSplit } from './ideal-split'
import { BONDS_PCT, RISKY_MAX_PCT, SLEEVES, type MixPart, type SleeveKey } from './mix'
import { LONG_GOAL_MONTHS } from '../../finance/objectives'

export type InvariantRule =
  | 'guide-matches-plan'
  | 'monthly-within-savings'
  | 'mix-adds-up'
  | 'risky-cap'
  | 'short-horizon-no-invest'
  | 'equity-fits-horizon'
  | 'cushion-not-invested'
  | 'lead-is-heaviest'
  | 'split-adds-up'
  | 'minor-needs-adult'
  | 'text-matches-dates'

export interface Violation {
  rule: InvariantRule
  message: string
}

/** Redondeos a euros enteros: hasta 1 € de diferencia por paso no es un fallo. */
const TOLERANCE_CENTS = 100

type InvestStep = Extract<PlanStep, { kind: 'invest-long-term' | 'invest-for-goals' | 'idle-money' | 'invest-goal-money' }>
const isInvestStep = (s: PlanStep): s is InvestStep => s.kind === 'invest-long-term' || s.kind === 'invest-for-goals' || s.kind === 'idle-money' || s.kind === 'invest-goal-money'
const stepAmount = (s: InvestStep): number => (s.kind === 'idle-money' ? (s.safe ? 0 : s.idleCents) : s.kind === 'invest-goal-money' ? s.cents : s.monthlyCents)
const pctOf = (mix: readonly MixPart[], key: SleeveKey) => mix.find((p) => p.key === key)?.pct ?? 0

export function checkPlan(plan: AllocationPlan, decision: AxisDecision): Violation[] {
  const out: Violation[] = []
  const fail = (rule: InvariantRule, message: string) => out.push({ rule, message })
  const profile = decision.profile.fields
  const ctx = decision.context
  const objectives = ctx.objectives
  const investing = plan.steps.filter(isInvestStep)
  const inv = planInvestment(plan)

  // 1. La Guía dice lo mismo que el plan: si el plan invierte, la Guía no dice «nada» (y al revés).
  const estimate = investEstimate(decision, plan)
  const planInvests = inv.monthlyCents > 0 || inv.lumpCents > 0
  if (planInvests !== (estimate.kind === 'now')) fail('guide-matches-plan', `El plan ${planInvests ? 'invierte' : 'no invierte'} y la Guía dice «${estimate.kind}».`)
  if (estimate.kind === 'now' && (estimate.monthlyCents !== inv.monthlyCents || estimate.lumpCents !== inv.lumpCents))
    fail('guide-matches-plan', `La Guía da ${estimate.monthlyCents}/${estimate.lumpCents} y el plan ${inv.monthlyCents}/${inv.lumpCents}.`)

  // 2. Lo que el plan reparte cada mes no supera lo que ahorras.
  if (plan.status === 'ready' && plan.monthly) {
    const monthlyKinds = new Set<PlanStep['kind']>(['fill-cushion', 'short-term-objectives', 'invest-for-goals', 'invest-long-term', 'rest-to-objectives', 'pay-debt'])
    const used = plan.steps.reduce((t, s) => t + (monthlyKinds.has(s.kind) && 'monthlyCents' in s ? s.monthlyCents : 0), 0)
    if (used > plan.monthly.savingsCents + TOLERANCE_CENTS) fail('monthly-within-savings', `El plan reparte ${used} al mes con un ahorro de ${plan.monthly.savingsCents}.`)
  }

  // 3 y 4. Cada mezcla suma lo que dice su paso y sus pesos el 100 %; la parte arriesgada, con tope.
  for (const s of investing) {
    if (s.mix.length === 0) continue
    const cents = s.mix.reduce((t, p) => t + p.cents, 0)
    if (Math.abs(cents - stepAmount(s)) > TOLERANCE_CENTS) fail('mix-adds-up', `«${s.kind}»: la mezcla suma ${cents} y el paso dice ${stepAmount(s)}.`)
    const pct = s.mix.reduce((t, p) => t + p.pct, 0)
    if (pct !== 100) fail('mix-adds-up', `«${s.kind}»: los pesos suman ${pct} %.`)
    if (pctOf(s.mix, 'risky') > RISKY_MAX_PCT) fail('risky-cap', `«${s.kind}»: parte arriesgada del ${pctOf(s.mix, 'risky')} %.`)
  }

  // 5. Con un plazo de menos de 2 años, el largo plazo y el dinero sin destino no se invierten.
  if (profile.horizon === 'short')
    for (const s of investing)
      if ((s.kind === 'invest-long-term' && s.monthlyCents > 0) || (s.kind === 'idle-money' && !s.safe)) fail('short-horizon-no-invest', `«${s.kind}» invierte con un plazo de menos de 2 años.`)

  // 6. La renta variable no pasa de lo que permite el plazo real del dinero (sin contar reequilibrios).
  const risk = planRisk(profile)
  const rebalancing = plan.steps.some((s) => (s.kind === 'invest-long-term' && s.rebalance) || s.kind === 'rebalance-sell' || s.kind === 'trim-risky')
  if (risk && profile.horizon && profile.horizon !== 'short' && !rebalancing) {
    const maxEquity = (h: 'medium' | 'long') => 100 - BONDS_PCT[h][risk]
    for (const s of investing) {
      if (s.mix.length === 0 || (s.kind === 'idle-money' && s.boost)) continue
      const goals = 'objectiveIds' in s ? objectives.filter((o) => s.objectiveIds.includes(o.id)) : []
      const horizon: 'medium' | 'long' =
        s.kind === 'invest-for-goals' || s.kind === 'invest-goal-money' ? (goals.some((o) => horizonInDoubt(o, profile.horizon)) ? 'medium' : 'long') : profile.horizon
      const equity = pctOf(s.mix, 'global-equity') + pctOf(s.mix, 'risky')
      if (equity > maxEquity(horizon)) fail('equity-fits-horizon', `«${s.kind}»: ${equity} % de renta variable con un plazo ${horizon === 'medium' ? 'de 2 a 5 años' : 'largo'} (máximo ${maxEquity(horizon)} %).`)
    }
  }

  // 7. Nunca se invierte el colchón ni el dinero de objetivos cercanos.
  if (plan.cushion && inv.lumpCents > 0) {
    // Lo que tienen en la cuenta los objetivos cercanos (no «sigue creciendo» y a 5 años o menos).
    const nearReserved = objectives
      .filter((o) => o.status !== 'achieved' && !isCushionObjective(o) && !(o.keepGrowing === true || (o.monthsLeft !== undefined && o.monthsLeft > LONG_GOAL_MONTHS)))
      .reduce((t, o) => t + Math.max(0, o.currentCents - (o.investedCents ?? 0) - (o.safeCents ?? 0)), 0)
    const limit = Math.max(0, ctx.wealth.liquidCents) - plan.cushion.targetCents - nearReserved
    if (inv.lumpCents > Math.max(0, limit) + TOLERANCE_CENTS)
      fail('cushion-not-invested', `Se propone invertir ${inv.lumpCents} de un líquido de ${ctx.wealth.liquidCents} con un colchón de ${plan.cushion.targetCents} y ${nearReserved} para objetivos cercanos.`)
  }

  // 8. Lo que la Guía destaca es lo que más pesa en la mezcla del plan.
  const weights = new Map<SleeveKey, number>()
  for (const s of investing) for (const p of s.mix) if (p.cents > 0) weights.set(p.key, Math.max(weights.get(p.key) ?? 0, p.pct))
  if (weights.size > 0) {
    const lead = recommendGuide(plan, profile).lead
    const leadSleeve = (Object.keys(SLEEVES) as SleeveKey[]).find((k) => SLEEVES[k].families.includes(lead.type.family))
    const heaviest = Math.max(...weights.values())
    if (lead.fit.verdict === 'fits' && leadSleeve && (weights.get(leadSleeve) ?? 0) < heaviest)
      fail('lead-is-heaviest', `La Guía destaca «${lead.type.name}» (${weights.get(leadSleeve) ?? 0} %) y lo que más pesa es el ${heaviest} %.`)
  }

  // 9. «Cómo debería repartirse» reparte exactamente tu patrimonio.
  const split = idealSplit(plan, decision)
  if (split.kind === 'ready') {
    const sum = split.parts.reduce((t, p) => t + p.cents, 0)
    if (sum !== split.totalCents) fail('split-adds-up', `«Cómo debería repartirse» suma ${sum} de ${split.totalCents}.`)
  }

  // 10. Un menor siempre ve que tiene que hacerlo un adulto.
  if (profile.adult === false)
    for (const s of investing)
      if (stepAmount(s) > 0 && s.adult !== false) fail('minor-needs-adult', `«${s.kind}» no avisa de que un adulto tiene que hacerlo.`)

  // 11. Los textos no contradicen las fechas: «Faltan más de 5 años» solo si de verdad faltan.
  for (const s of investing) {
    if (s.kind !== 'invest-for-goals' && s.kind !== 'invest-goal-money') continue
    const detail = describeStep(s, plan, objectives).detail ?? ''
    const near = objectives.filter((o) => s.objectiveIds.includes(o.id) && !(o.monthsLeft !== undefined && o.monthsLeft > LONG_GOAL_MONTHS))
    const spent = objectives.filter((o) => s.objectiveIds.includes(o.id) && !o.keepGrowing)
    if (/No lo vas a gastar al llegar la fecha/.test(detail) && spent.length > 0) fail('text-matches-dates', `«${s.kind}» dice que no lo vas a gastar en la fecha y ${spent.map((o) => `«${o.name}»`).join(', ')} sí se gasta.`)
    if (/Faltan más de 5 años/.test(detail) && near.length > 0) fail('text-matches-dates', `«${s.kind}» dice «Faltan más de 5 años» y ${near.map((o) => `«${o.name}»`).join(', ')} no los tiene.`)
  }

  return out
}
