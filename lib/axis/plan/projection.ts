/**
 * «Cómo podría crecer tu patrimonio»: proyección ILUSTRATIVA a varios años con
 * lo que tienes hoy y lo que el plan te propone aportar cada mes. No es una
 * previsión: usa los mismos supuestos generales que la Guía (guide/scenarios.ts),
 * sin comisiones ni impuestos.
 *
 * Modelo: cada aportación crece con el supuesto de su tipo durante el tiempo
 * que le queda; «si va mal / normal / bien» son los percentiles 10 / 50 / 90 de
 * cada tipo, aplicados a la vez a todo (como si todo fuera mal o bien a la vez:
 * un abanico prudente). El dinero líquido no crece (cuenta corriente al 0 %).
 * «En euros de hoy» descuenta la inflación de referencia (plan/inflation.ts).
 * Comparación: lo mismo, pero todo quieto en la cuenta.
 */
import { SCENARIO_ASSUMPTIONS, type GrowthAssumption } from '../guide/scenarios'
import type { FinancialContext } from '../types'
import type { PositionAssetType } from '../../types'
import type { AllocationPlan } from './allocation'
import { todayValueCents, type InflationRef } from './inflation'

export const PROJECTION_YEARS = [5, 10, 20] as const
export type ProjectionYears = (typeof PROJECTION_YEARS)[number]

const Z90 = 1.2816
const growth = (key: string) => SCENARIO_ASSUMPTIONS[key] as GrowthAssumption
/** Supuesto de cada tipo: el de su producto de referencia en la Guía. «other» y el líquido no crecen. */
const ASSUMPTION: Record<PositionAssetType | 'liquid', GrowthAssumption> = {
  'global-equity': growth('fondo-indexado'),
  bonds: growth('fondo-renta-fija'),
  risky: growth('acciones'),
  safe: growth('cuenta-deposito'),
  other: { kind: 'growth', mu: 0, sigma: 0, badYearPct: 0 },
  liquid: { kind: 'growth', mu: 0, sigma: 0, badYearPct: 0 },
}

function grow(cents: number, a: GrowthAssumption, years: number, z: number): number {
  if (cents <= 0 || years <= 0) return Math.max(0, cents)
  return cents * Math.exp(Math.log(1 + a.mu / 100) * years + z * (a.sigma / 100) * Math.sqrt(years))
}

/** Valor dentro de `years` años de lo que hay hoy más una aportación mensual constante. */
function future(todayCents: number, monthlyCents: number, a: GrowthAssumption, years: number, z: number): number {
  let total = grow(todayCents, a, years, z)
  for (let m = 1; m <= years * 12; m++) total += grow(monthlyCents, a, years - m / 12, z)
  return total
}

export interface Projection {
  years: number
  /** Lo que tendrías (nominal) si va mal / normal / bien. */
  badCents: number
  midCents: number
  goodCents: number
  /** El escenario normal en euros de hoy. */
  midTodayCents: number
  /** Lo que habrías puesto tú: lo de hoy más todas las aportaciones. */
  contributedCents: number
  /** Comparación: todo quieto en la cuenta (nominal = lo aportado) y su valor en euros de hoy. */
  stillTodayCents: number
}

const euros = (cents: number) => Math.round(cents / 100) * 100

/**
 * Proyección del plan. `null` si el plan no reparte (bloqueado o sin ahorro):
 * sin un ritmo de ahorro no hay nada que proyectar. `safeRatePct`: lo que
 * paga hoy el ahorro seguro (el tipo del BCE, si está vigente); sin él, el
 * supuesto de la Guía.
 */
export function projectWealth(plan: AllocationPlan, ctx: Pick<FinancialContext, 'wealth' | 'investments'>, years: number, inflation: InflationRef, safeRatePct?: number): Projection | null {
  const assumption: Record<PositionAssetType | 'liquid', GrowthAssumption> =
    safeRatePct !== undefined && Number.isFinite(safeRatePct) && safeRatePct >= 0 && safeRatePct < 15
      ? { ...ASSUMPTION, safe: { kind: 'growth', mu: safeRatePct, sigma: 0, badYearPct: 0 } }
      : ASSUMPTION
  if (plan.status !== 'ready' || !plan.monthly) return null
  const today: Record<PositionAssetType | 'liquid', number> = { 'global-equity': 0, bonds: 0, risky: 0, safe: 0, other: 0, liquid: Math.max(0, ctx.wealth.liquidCents) }
  for (const p of ctx.investments.positions) today[p.assetType ?? 'other'] += Math.max(0, p.valueCents)
  const monthly: Record<PositionAssetType | 'liquid', number> = { 'global-equity': 0, bonds: 0, risky: 0, safe: 0, other: 0, liquid: 0 }
  // Lo que se invierte cada mes: el largo plazo y el ahorro de los objetivos lejanos.
  let invested = 0
  for (const s of plan.steps) if (s.kind === 'invest-long-term' || s.kind === 'invest-for-goals') for (const p of s.mix) ((monthly[p.key] += p.cents), (invested += p.cents))
  monthly.liquid = Math.max(0, plan.monthly.savingsCents - invested)

  const keys = Object.keys(today) as Array<PositionAssetType | 'liquid'>
  const at = (z: number) => keys.reduce((t, k) => t + future(today[k], monthly[k], assumption[k], years, z), 0)
  const contributed = keys.reduce((t, k) => t + today[k] + monthly[k] * years * 12, 0)
  const mid = at(0)
  return {
    years,
    badCents: euros(at(-Z90)),
    midCents: euros(mid),
    goodCents: euros(at(Z90)),
    midTodayCents: euros(todayValueCents(mid, years, inflation)),
    contributedCents: euros(contributed),
    stillTodayCents: euros(todayValueCents(contributed, years, inflation)),
  }
}
