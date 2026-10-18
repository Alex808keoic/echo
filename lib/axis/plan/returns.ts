/**
 * Rentabilidad real y comisiones de tus inversiones.
 *
 * - Rentabilidad: lo ganado sobre lo aportado y, si tu primera aportación
 *   tiene al menos un año, la rentabilidad ANUAL teniendo en cuenta cuándo
 *   pusiste cada euro (TIR de tus aportaciones con el valor de hoy). «Real» =
 *   descontada la inflación de referencia (plan/inflation.ts). Con menos de un
 *   año no se anualiza: un mes bueno multiplicado por doce engaña.
 * - Comisiones: la media ponderada de las que has indicado y lo que costarían
 *   a largo plazo con lo que aportas cada mes, frente a una comisión baja de
 *   referencia. Supuestos de crecimiento: los de la Guía, antes de comisiones.
 *
 * Puras; importes en céntimos. Nunca nombran productos.
 */
import { HIGH_FEE_PCT } from '../guide/fit'
import { SCENARIO_ASSUMPTIONS } from '../guide/scenarios'
import type { PositionAssetType } from '../../types'

/** Comisión anual baja de referencia (un fondo indexado global barato). */
export const LOW_FEE_PCT = 0.2
/** Años de la comparación de comisiones. */
export const FEE_YEARS = 20

type PositionLike = { investedCents: number; valueCents: number; date: string; assetType?: PositionAssetType; feeBp?: number }

const DAY_MS = 86_400_000
const dayOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

export interface PortfolioReturn {
  investedCents: number
  valueCents: number
  gainCents: number
  gainPct: number | null
  /** Años desde tu primera aportación (con un decimal). */
  years: number
  /** Rentabilidad anual (TIR), en %, con un decimal; `null` con menos de un año. */
  annualPct: number | null
  /** La anual descontando la inflación de referencia; `null` con menos de un año. */
  realAnnualPct: number | null
}

/** TIR anual de unos flujos (negativos = aportaciones, positivo = valor final) por bisección; `null` si no converge. */
function irr(flows: Array<{ t: number; cents: number }>): number | null {
  const npv = (r: number) => flows.reduce((s, f) => s + f.cents / Math.pow(1 + r, f.t), 0)
  let lo = -0.99
  let hi = 10
  if (npv(lo) * npv(hi) > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (npv(lo) * npv(mid) <= 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function portfolioReturn(positions: readonly PositionLike[], today: string, inflationPct: number): PortfolioReturn | null {
  const valid = positions.filter((p) => p.investedCents > 0 && p.valueCents >= 0 && p.date <= today)
  if (valid.length === 0) return null
  const invested = valid.reduce((t, p) => t + p.investedCents, 0)
  const value = valid.reduce((t, p) => t + p.valueCents, 0)
  const now = dayOf(today)
  const first = Math.min(...valid.map((p) => dayOf(p.date)))
  const years = (now - first) / 365.25
  let annualPct: number | null = null
  let realAnnualPct: number | null = null
  if (years >= 1) {
    const r = irr([...valid.map((p) => ({ t: (dayOf(p.date) - first) / 365.25, cents: -p.investedCents })), { t: years, cents: value }])
    if (r !== null) {
      annualPct = round1(r * 100)
      realAnnualPct = round1(((1 + r) / (1 + inflationPct / 100) - 1) * 100)
    }
  }
  return { investedCents: invested, valueCents: value, gainCents: value - invested, gainPct: invested > 0 ? round1(((value - invested) / invested) * 100) : null, years: round1(years), annualPct, realAnnualPct }
}

/* ------------------------------- comisiones ------------------------------- */

const GROWTH_OF: Partial<Record<PositionAssetType, string>> = { 'global-equity': 'fondo-indexado', bonds: 'fondo-renta-fija', risky: 'acciones', safe: 'cuenta-deposito' }
const FAMILY_OF: Partial<Record<PositionAssetType, keyof typeof HIGH_FEE_PCT>> = { 'global-equity': 'diversified-equity', bonds: 'bonds', risky: 'concentrated-equity' }

/** Comisión alta para su tipo (los mismos umbrales que la Guía); `false` si no se sabe. */
export function isHighFee(p: Pick<PositionLike, 'assetType' | 'feeBp'>): boolean {
  const family = p.assetType ? FAMILY_OF[p.assetType] : undefined
  return family !== undefined && p.feeBp !== undefined && p.feeBp / 100 > HIGH_FEE_PCT[family]
}

export interface FeeSummary {
  /** Comisión media ponderada por valor, en %, con dos decimales. */
  avgPct: number
  /** Lo que pagas al año con el valor de hoy. */
  yearlyCents: number
  /** Parte del valor (0–100) con comisión indicada. */
  coveredPct: number
  /** En `FEE_YEARS` años, con lo de hoy y `monthlyCents` al mes: lo que se llevan tus comisiones y lo que se llevaría una baja. */
  longRun: { years: number; yoursCents: number; lowCents: number } | null
  highFeeCount: number
}

/** Valor futuro de lo de hoy más una aportación mensual, creciendo a `pct` anual (capitalización mensual). */
function futureValue(todayCents: number, monthlyCents: number, pct: number, years: number): number {
  const m = Math.pow(1 + pct / 100, 1 / 12)
  let total = todayCents
  for (let i = 0; i < years * 12; i++) total = total * m + monthlyCents
  return total
}

export function feeSummary(positions: readonly PositionLike[], monthlyCents: number): FeeSummary | null {
  const valued = positions.filter((p) => p.valueCents > 0)
  const total = valued.reduce((t, p) => t + p.valueCents, 0)
  const withFee = valued.filter((p) => p.feeBp !== undefined)
  const covered = withFee.reduce((t, p) => t + p.valueCents, 0)
  if (covered <= 0 || total <= 0) return null
  const avgPct = withFee.reduce((t, p) => t + (p.valueCents * (p.feeBp ?? 0)) / 100, 0) / covered
  // Crecimiento antes de comisiones: el supuesto de cada tipo, ponderado por valor (5 % si no se sabe).
  const gross =
    valued.reduce((t, p) => {
      const a = p.assetType && GROWTH_OF[p.assetType] ? SCENARIO_ASSUMPTIONS[GROWTH_OF[p.assetType]!] : undefined
      return t + p.valueCents * (a?.kind === 'growth' ? a.mu : 5)
    }, 0) / total
  const noFee = futureValue(total, monthlyCents, gross, FEE_YEARS)
  const cost = (fee: number) => Math.max(0, Math.round((noFee - futureValue(total, monthlyCents, gross - fee, FEE_YEARS)) / 100) * 100)
  return {
    avgPct: Math.round(avgPct * 100) / 100,
    yearlyCents: Math.round((total * avgPct) / 100 / 100) * 100,
    coveredPct: Math.round((covered / total) * 100),
    longRun: avgPct > 0 ? { years: FEE_YEARS, yoursCents: cost(avgPct), lowCents: cost(Math.min(avgPct, LOW_FEE_PCT)) } : null,
    highFeeCount: valued.filter(isHighFee).length,
  }
}
