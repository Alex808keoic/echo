/**
 * Mezcla de la parte a largo plazo del plan: en qué TIPOS de inversión se
 * reparte, según tu perfil y tu situación. Reglas fijas, siempre por tipo
 * (los de la «Guía para invertir»), nunca un producto ni una entidad.
 *
 *   Plazo largo (> 5 años)   prudente 60 % renta fija / 40 % renta variable global
 *                            equilibrado 30 / 70 · dinámico 0 / 100
 *   Plazo medio (2–5 años)   prudente 80 / 20 · equilibrado 50 / 50 · dinámico 30 / 70
 *
 * Parte arriesgada (acciones concretas, sectores, criptomonedas…): como mucho
 * el 10 %, que sale de la renta variable global, y solo si TODO se cumple:
 * perfil dinámico, plazo largo, colchón completo, ningún objetivo cercano con
 * retraso y dinero parado de al menos 3 meses de gasto. Es dinero que se puede
 * perder entero, y así se dice siempre. (Ser mayor de edad no es condición por
 * decisión del usuario, 2026-10-17: si no lo eres, se explica que lo haría un adulto.)
 */
import type { Horizon, RiskAttitude } from '../profile/types'

export type SleeveKey = 'global-equity' | 'bonds' | 'risky'

export const SLEEVES: Record<SleeveKey, { label: string; families: readonly string[] }> = {
  'global-equity': { label: 'Renta variable global diversificada y de bajo coste', families: ['diversified-equity'] },
  bonds: { label: 'Renta fija (bonos de estados y empresas)', families: ['bonds'] },
  risky: { label: 'Parte arriesgada (acciones concretas, sectores, criptomonedas…)', families: ['concentrated-equity', 'speculative'] },
}

/** Orden fijo en el que se enseñan las partes. */
const ORDER: readonly SleeveKey[] = ['global-equity', 'bonds', 'risky']

/** Porcentaje de renta fija por plazo y perfil; el resto, renta variable global. */
export const BONDS_PCT: Record<Exclude<Horizon, 'short'>, Record<RiskAttitude, number>> = {
  long: { conservative: 60, balanced: 30, dynamic: 0 },
  medium: { conservative: 80, balanced: 50, dynamic: 30 },
}

/** Tope de la parte arriesgada, en % de lo que se invierte. */
export const RISKY_MAX_PCT = 10
/** Dinero parado mínimo, en meses de gasto habitual, para que haya parte arriesgada. */
export const RISKY_MIN_IDLE_MONTHS = 3

export interface MixPart {
  key: SleeveKey
  label: string
  pct: number
  cents: number
}

export interface RiskyConditions {
  riskAttitude: RiskAttitude
  horizon: Exclude<Horizon, 'short'>
  cushionComplete: boolean
  shortTermAtRisk: boolean
  idleCents: number
  spendingCents: number
}

export function riskyAllowed(c: RiskyConditions): boolean {
  return (
    c.riskAttitude === 'dynamic' &&
    c.horizon === 'long' &&
    c.cushionComplete &&
    !c.shortTermAtRisk &&
    c.spendingCents > 0 &&
    c.idleCents >= c.spendingCents * RISKY_MIN_IDLE_MONTHS
  )
}

/** Porcentajes de cada parte (suman 100). */
export function mixWeights(riskAttitude: RiskAttitude, horizon: Exclude<Horizon, 'short'>, risky: boolean): Record<SleeveKey, number> {
  const bonds = BONDS_PCT[horizon][riskAttitude]
  const riskyPct = risky ? RISKY_MAX_PCT : 0
  return { 'global-equity': 100 - bonds - riskyPct, bonds, risky: riskyPct }
}

/**
 * Reparte `totalCents` según los pesos, en euros enteros hacia abajo; lo que
 * sobra del redondeo va a la parte más grande. Solo partes con peso > 0.
 */
export function splitMix(totalCents: number, weights: Record<SleeveKey, number>): MixPart[] {
  const keys = ORDER.filter((k) => weights[k] > 0)
  const parts = keys.map((key) => ({ key, label: SLEEVES[key].label, pct: weights[key], cents: Math.floor((totalCents * weights[key]) / 100 / 100) * 100 }))
  const rest = totalCents - parts.reduce((t, p) => t + p.cents, 0)
  const largest = parts.reduce((a, b) => (b.pct > a.pct ? b : a), parts[0])
  if (largest && rest > 0) largest.cents += rest
  return parts
}
