/**
 * «Revisar una opción»: ¿encaja este TIPO de producto con tu plan? Reglas
 * deterministas sobre el plan de reparto y tu perfil. Nunca dice «cómpralo»:
 * dice si encaja con la parte del plan para la que lo miras, por qué y qué
 * comprobar. El producto concreto y la decisión son tuyos.
 */
import type { AllocationPlan } from '../plan/allocation'
import type { ReconciledProfile } from '../profile/types'
import { LONG_TERM_CATEGORY } from '../plan/allocation'
import type { ProductType } from './products'

export type FitVerdict = 'fits' | 'fits-short-term' | 'not-now' | 'not-for-horizon' | 'partial' | 'outside-plan'

export interface ProductFit {
  product: string
  verdict: FitVerdict
  /** Una frase con el veredicto. */
  headline: string
  reasons: string[]
  /** Qué comprobar antes de decidir (de la guía y, si la has dado, la comisión). */
  checks: string[]
}

/** Comisión anual a partir de la cual merece una alerta, por familia (orientativo, información general). */
export const HIGH_FEE_PCT = { 'diversified-equity': 0.5, 'concentrated-equity': 1.5, 'short-debt': 0.5, bonds: 1, cash: 0, speculative: 1 } as const

export const FIT_LABEL: Record<FitVerdict, string> = {
  fits: 'Encaja con tu parte a largo plazo',
  'fits-short-term': 'Encaja con tu colchón u objetivos cercanos',
  'not-now': 'Todavía no es el momento en tu plan',
  'not-for-horizon': 'No es para dinero que vas a necesitar pronto',
  partial: 'Encaja solo en parte con tu plan',
  'outside-plan': 'Queda fuera de tu plan',
}

export function productFit(product: ProductType, plan: AllocationPlan, profile: Pick<ReconciledProfile, 'horizon' | 'adult'>, annualFeePct?: number): ProductFit {
  const reasons: string[] = []
  const checks = [...product.compare]
  let verdict: FitVerdict
  const equity = product.family === 'diversified-equity' || product.family === 'concentrated-equity'
  const safe = product.family === 'cash' || product.family === 'short-debt'

  if (plan.status === 'blocked') {
    verdict = safe && plan.blocker === 'insufficient-data' ? 'fits-short-term' : 'not-now'
    reasons.push(plan.blocker === 'insufficient-data' ? 'Todavía no hay datos suficientes para preparar tu plan.' : 'Tu plan dice que primero hay que resolver otra cosa (mira el primer paso de «Tu plan»).')
  } else if (safe) {
    verdict = 'fits-short-term'
    reasons.push('Es una opción de poco riesgo: la que encaja con tu colchón y con los objetivos que necesitas pronto.')
  } else if (profile.horizon === 'short') {
    verdict = 'not-for-horizon'
    reasons.push('Indicaste que necesitarás tu dinero en menos de 2 años, y este tipo de producto puede estar en pérdidas justo entonces.')
  } else if (plan.longTerm.reason === 'cushion-incomplete') {
    verdict = 'not-now'
    reasons.push('Tu plan dice que primero conviene completar el colchón; después, una parte puede ir a largo plazo.')
  } else if (product.family === 'speculative') {
    verdict = 'outside-plan'
    reasons.push(`La parte a largo plazo de tu plan es ${LONG_TERM_CATEGORY.label.toLowerCase()}; este tipo de producto no lo es.`)
    reasons.push('Si aun así lo consideras, que sea solo dinero que podrías perder entero.')
  } else if (product.family === 'concentrated-equity') {
    verdict = 'partial'
    reasons.push(`Es renta variable, como la parte a largo plazo de tu plan, pero no es ${LONG_TERM_CATEGORY.label.toLowerCase()}: depende de menos empresas o de un gestor, y suele costar más.`)
  } else if (product.family === 'bonds') {
    verdict = 'partial'
    reasons.push('Tiene menos riesgo que la parte a largo plazo de tu plan; puede servir para equilibrar, según el plazo del bono.')
  } else if (plan.longTerm.reason === 'no-profile') {
    verdict = 'not-now'
    reasons.push('Responde «Tu perfil» para saber qué parte de tu ahorro tendría sentido a largo plazo.')
  } else if (plan.longTerm.monthlyCents > 0) {
    verdict = 'fits'
    reasons.push(`Es del tipo que indica tu plan para el largo plazo: ${LONG_TERM_CATEGORY.label.toLowerCase()}.`)
  } else {
    verdict = 'not-now'
    reasons.push('Este mes tu plan no deja margen para el largo plazo (tus objetivos cercanos lo necesitan).')
  }

  if (equity) checks.push('Que solo inviertas dinero que no vas a necesitar en más de 5 años')
  if (annualFeePct !== undefined && Number.isFinite(annualFeePct) && annualFeePct >= 0) {
    const limit = HIGH_FEE_PCT[product.family]
    if (limit > 0 && annualFeePct > limit) reasons.push(`Una comisión anual del ${String(annualFeePct).replace('.', ',')} % es alta para este tipo de producto: a largo plazo se come una parte importante de lo que ganes.`)
  }
  if (profile.adult === false && !safe) reasons.push('Como eres menor de edad, tendría que hacerlo un adulto a tu nombre.')
  checks.push('Que la entidad esté registrada en la CNMV o el Banco de España')

  return { product: product.name, verdict, headline: FIT_LABEL[verdict], reasons, checks }
}
