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
 * perfil dinámico (y que una caída no te obligue a cambiar tus planes:
 * `planRisk`), algo de experiencia invirtiendo, plazo largo, colchón completo,
 * ningún objetivo cercano con retraso y dinero parado de al menos 3 meses de gasto. Es dinero que se puede
 * perder entero, y así se dice siempre. (Ser mayor de edad no es condición por
 * decisión del usuario, 2026-10-17: si no lo eres, se explica que lo haría un adulto.)
 */
import type { Horizon, RiskAttitude } from '../profile/types'
import type { Position, PositionAssetType } from '../../types'
import type { InvestedPool } from '../../finance/objectives'
import { matchProductTypes, type ProductFamily } from '../guide/products'
import { SCENARIO_ASSUMPTIONS } from '../guide/scenarios'

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
  /** Respondió que no ha invertido nunca: se empieza por lo diversificado. */
  noExperience?: boolean
  /** Alguna inversión de la parte arriesgada ha caído mucho (plan/performance.ts): no recibe dinero nuevo hasta revisarla. */
  paused?: boolean
}

export function riskyAllowed(c: RiskyConditions): boolean {
  return (
    c.riskAttitude === 'dynamic' &&
    c.noExperience !== true &&
    c.paused !== true &&
    c.horizon === 'long' &&
    c.cushionComplete &&
    !c.shortTermAtRisk &&
    c.spendingCents > 0 &&
    c.idleCents >= c.spendingCents * RISKY_MIN_IDLE_MONTHS
  )
}

const TYPE_OF_FAMILY: Record<ProductFamily, PositionAssetType> = {
  'diversified-equity': 'global-equity',
  bonds: 'bonds',
  'concentrated-equity': 'risky',
  speculative: 'risky',
  cash: 'safe',
  'short-debt': 'safe',
}

/**
 * Lo invertido que puede contar para tus objetivos (`allocateObjectives`): lo
 * que tienes en ahorro seguro por un lado y todo lo demás (puede bajar) por otro.
 */
export function goalInvestedPool(positions: ReadonlyArray<Pick<Position, 'name' | 'valueCents' | 'assetType'>>, asOf: string): InvestedPool {
  let cents = 0
  let safeCents = 0
  for (const p of positions) {
    const value = Number.isSafeInteger(p.valueCents) ? Math.max(0, p.valueCents) : 0
    if ((p.assetType ?? guessAssetType(p.name)) === 'safe') safeCents += value
    else cents += value
  }
  return { cents, safeCents, asOf }
}

/** Tipo de una inversión por su nombre («MSCI World indexado» → renta variable global); sin pistas, «other». */
export function guessAssetType(name: string): PositionAssetType {
  const [first] = matchProductTypes(name)
  return first ? (first.assetType ?? TYPE_OF_FAMILY[first.family]) : 'other'
}

/** Porcentajes de cada parte (suman 100). */
export function mixWeights(riskAttitude: RiskAttitude, horizon: Exclude<Horizon, 'short'>, risky: boolean): Record<SleeveKey, number> {
  const bonds = BONDS_PCT[horizon][riskAttitude]
  const riskyPct = risky ? RISKY_MAX_PCT : 0
  return { 'global-equity': 100 - bonds - riskyPct, bonds, risky: riskyPct }
}

const SLEEVE_ASSUMPTION: Record<SleeveKey, string> = { 'global-equity': 'fondo-indexado', bonds: 'fondo-renta-fija', risky: 'acciones' }

/**
 * Rentabilidad anual que cabe esperar de una mezcla a largo plazo, con los
 * supuestos generales de la Guía (antes de comisiones, impuestos e
 * inflación), con un decimal. Es un orden de magnitud, nunca una promesa.
 */
export function expectedMixReturnPct(weights: Record<SleeveKey, number>): number {
  const total = ORDER.reduce((t, k) => {
    const a = SCENARIO_ASSUMPTIONS[SLEEVE_ASSUMPTION[k]]
    return t + (a?.kind === 'growth' ? (weights[k] * a.mu) / 100 : 0)
  }, 0)
  return Math.round(total * 10) / 10
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

/* -------------------------- tu mezcla real (reequilibrar) -------------------------- */

/** Desviación (puntos porcentuales) a partir de la cual el plan reequilibra con las aportaciones. */
export const REBALANCE_THRESHOLD_PP = 5
/** Caída del valor de tus inversiones (respecto a lo aportado) a partir de la cual el plan lo comenta. */
export const DRAWDOWN_NOTICE_PCT = 15

const SLEEVE_KEYS: readonly SleeveKey[] = ORDER

/** Valor actual por tipo del plan; el ahorro seguro y «otro» no cuentan en la mezcla. */
export function heldBySleeve(positions: ReadonlyArray<{ valueCents: number; assetType?: PositionAssetType }>): Record<SleeveKey, number> {
  const held: Record<SleeveKey, number> = { 'global-equity': 0, bonds: 0, risky: 0 }
  for (const p of positions) {
    const key = p.assetType as SleeveKey
    if (SLEEVE_KEYS.includes(key) && Number.isSafeInteger(p.valueCents) && p.valueCents > 0) held[key] += p.valueCents
  }
  return held
}

/** Porcentaje real de cada tipo sobre lo invertido en ellos (enteros); `null` sin nada invertido. */
export function heldPct(held: Record<SleeveKey, number>): Record<SleeveKey, number> | null {
  const total = SLEEVE_KEYS.reduce((t, k) => t + held[k], 0)
  if (total <= 0) return null
  return { 'global-equity': Math.round((held['global-equity'] / total) * 100), bonds: Math.round((held.bonds / total) * 100), risky: Math.round((held.risky / total) * 100) }
}

/** ¿Tu mezcla real se aleja de la del plan en algún tipo al menos `REBALANCE_THRESHOLD_PP` puntos? */
export function needsRebalance(held: Record<SleeveKey, number>, weights: Record<SleeveKey, number>): boolean {
  const pct = heldPct(held)
  return pct !== null && SLEEVE_KEYS.some((k) => Math.abs(pct[k] - weights[k]) >= REBALANCE_THRESHOLD_PP)
}

/**
 * Reparte `totalCents` para acercar tu mezcla real a la del plan SIN vender:
 * cada tipo recibe en proporción a lo que le falta para su peso después de
 * aportar. Lo que ya está por encima de su peso no recibe nada. Euros enteros;
 * el redondeo va al tipo que más necesita.
 */
export function rebalanceSplit(totalCents: number, weights: Record<SleeveKey, number>, held: Record<SleeveKey, number>): MixPart[] {
  const after = SLEEVE_KEYS.reduce((t, k) => t + held[k], 0) + totalCents
  const need = Object.fromEntries(SLEEVE_KEYS.map((k) => [k, Math.max(0, (after * weights[k]) / 100 - held[k])])) as Record<SleeveKey, number>
  const totalNeed = SLEEVE_KEYS.reduce((t, k) => t + need[k], 0)
  if (totalNeed <= 0) return splitMix(totalCents, weights)
  const keys = SLEEVE_KEYS.filter((k) => need[k] > 0)
  const parts = keys.map((key) => {
    const cents = Math.floor((totalCents * need[key]) / totalNeed / 100) * 100
    return { key, label: SLEEVES[key].label, pct: 0, cents }
  })
  const rest = totalCents - parts.reduce((t, p) => t + p.cents, 0)
  const neediest = parts.reduce((a, b) => (need[b.key] > need[a.key] ? b : a), parts[0])
  if (neediest && rest > 0) neediest.cents += rest
  // La parte arriesgada nunca recibe más que su peso de ESTA aportación, aunque vaya por detrás: el exceso va a lo diversificado.
  const risky = parts.find((p) => p.key === 'risky')
  const cap = Math.floor((totalCents * weights.risky) / 100 / 100) * 100
  if (risky && risky.cents > cap) {
    const excess = risky.cents - cap
    risky.cents = cap
    const safer = parts.filter((p) => p.key !== 'risky').reduce<MixPart | undefined>((a, b) => (!a || need[b.key] > need[a.key] ? b : a), undefined)
    if (safer) safer.cents += excess
    else parts.push({ key: 'global-equity', label: SLEEVES['global-equity'].label, pct: 0, cents: excess })
  }
  // `pct` es el peso de cada parte en ESTA aportación.
  return parts.filter((p) => p.cents > 0).map((p) => ({ ...p, pct: Math.round((p.cents / totalCents) * 100) }))
}

/* ------------------------- vender para volver a tu mezcla ------------------------- */

/** Parte arriesgada (en % de lo invertido en los tipos del plan) a partir de la cual se propone recoger beneficios. */
export const RISKY_TRIM_PCT = 15
/** Meses de aportaciones con los que el dinero nuevo debería poder corregir un descuadre; si no, se propone vender. */
export const REBALANCE_SELL_MONTHS = 12

export interface SellProposal {
  /** `trim-risky`: la parte arriesgada vuelve a su tope. `rebalance`: lo que más sobra pasa a lo que falta. */
  kind: 'trim-risky' | 'rebalance'
  from: SleeveKey
  sellCents: number
  /** A dónde va lo vendido (nunca a la parte arriesgada). */
  to: MixPart[]
  /** Peso real antes de vender y el del plan, en % enteros. */
  heldPct: Record<SleeveKey, number>
  targetPct: Record<SleeveKey, number>
}

const euroFloor = (cents: number) => Math.max(0, Math.floor(cents / 100) * 100)

/**
 * Propuestas de venta (decidido con el usuario el 2026-11-02), solo cuando el descuadre es grande:
 *   1. La parte arriesgada pasa del `RISKY_TRIM_PCT` %: se vende hasta su tope (`RISKY_MAX_PCT` %, o su peso
 *      si es mayor) y va a lo diversificado con tu mezcla.
 *   2. Renta variable o renta fija sobran al menos `REBALANCE_THRESHOLD_PP` puntos y lo que inviertes en
 *      `REBALANCE_SELL_MONTHS` meses no bastaría para corregirlo sin vender: lo que sobra pasa al otro tipo.
 * Devuelve también cómo queda tu mezcla después, para repartir el dinero nuevo del mes.
 */
export function sellProposals(
  held: Record<SleeveKey, number>,
  weights: Record<SleeveKey, number>,
  monthlyInvestCents: number,
): { proposals: SellProposal[]; heldAfter: Record<SleeveKey, number> } {
  const total = SLEEVE_KEYS.reduce((t, k) => t + held[k], 0)
  const proposals: SellProposal[] = []
  const after = { ...held }
  const before = heldPct(held)
  if (total <= 0 || !before) return { proposals, heldAfter: after }
  const diversified = weights['global-equity'] + weights.bonds
  const plainWeights: Record<SleeveKey, number> =
    diversified > 0
      ? { 'global-equity': (weights['global-equity'] / diversified) * 100, bonds: (weights.bonds / diversified) * 100, risky: 0 }
      : { 'global-equity': 100, bonds: 0, risky: 0 }

  // 1. Parte arriesgada demasiado grande.
  const riskyCap = Math.max(RISKY_MAX_PCT, weights.risky)
  if ((held.risky / total) * 100 > RISKY_TRIM_PCT) {
    const sellCents = euroFloor(held.risky - (total * riskyCap) / 100)
    if (sellCents > 0) {
      const to = splitMix(sellCents, plainWeights).map((p) => ({ ...p, pct: Math.round(plainWeights[p.key]) }))
      proposals.push({ kind: 'trim-risky', from: 'risky', sellCents, to, heldPct: before, targetPct: weights })
      after.risky -= sellCents
      for (const p of to) after[p.key] += p.cents
    }
  }

  // 2. Renta variable o renta fija: el tipo que más sobra, si el dinero nuevo de un año no lo corrige.
  const over = (['global-equity', 'bonds'] as const)
    .map((k) => ({ k, gap: (after[k] / total) * 100 - weights[k] }))
    .filter((x) => x.gap >= REBALANCE_THRESHOLD_PP)
    .sort((a, b) => b.gap - a.gap)[0]
  if (over) {
    const w = weights[over.k]
    // Lo que habría que invertir de nuevo, sin vender, para que este tipo bajara a su peso.
    const extraNeeded = w > 0 ? (after[over.k] * 100) / w - total : Infinity
    if (extraNeeded > monthlyInvestCents * REBALANCE_SELL_MONTHS) {
      const other: SleeveKey = over.k === 'global-equity' ? 'bonds' : 'global-equity'
      const sellCents = euroFloor(after[over.k] - (total * w) / 100)
      if (sellCents > 0) {
        proposals.push({ kind: 'rebalance', from: over.k, sellCents, to: [{ key: other, label: SLEEVES[other].label, pct: 100, cents: sellCents }], heldPct: before, targetPct: weights })
        after[over.k] -= sellCents
        after[other] += sellCents
      }
    }
  }
  return { proposals, heldAfter: after }
}
