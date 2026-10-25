/**
 * «Cómo debería repartirse tu dinero» (decidido por el usuario el 2026-10-25):
 * todo tu patrimonio de hoy (líquido + inversiones) repartido como lo haría tu
 * plan, comparado con cómo lo tienes. Sin reglas nuevas: el colchón y su meta,
 * lo que el reparto da a cada objetivo, la deuda cara y la mezcla por tipos
 * salen de `buildAllocationPlan` y de la decisión. Siempre tipos, nunca productos.
 *
 * Orden en que se llena el patrimonio: colchón, objetivos por prioridad (los
 * lejanos, invertidos a largo plazo sin parte arriesgada; los demás, en cuenta
 * o ahorro seguro), la deuda cara que el plan manda devolver y, lo que quede,
 * con tu mezcla (o en ahorro seguro si necesitas el dinero en menos de 2 años).
 */
import { roundedShares } from '../../finance/summary'
import { LONG_GOAL_MONTHS } from '../../finance/objectives'
import type { AxisDecision } from '../types'
import { isCushionObjective, planRisk, planSleeves, type AllocationPlan } from './allocation'
import { guessAssetType, mixWeights, type SleeveKey } from './mix'
import type { RiskAttitude } from '../profile/types'

export type SplitGroup = 'safe' | SleeveKey | 'debt' | 'other'
export type SplitPartKey = 'cushion' | 'objectives' | 'safe-savings' | SleeveKey | 'debt'

export interface SplitPart {
  key: SplitPartKey
  label: string
  /** Con qué se compara en «cómo lo tienes». */
  group: SplitGroup
  cents: number
  pct: number
}

export interface SplitComparison {
  group: SplitGroup
  label: string
  idealPct: number
  actualPct: number
  actualCents: number
}

export type IdealSplit =
  | { kind: 'empty' }
  | { kind: 'no-profile' }
  | { kind: 'no-data' }
  | { kind: 'ready'; totalCents: number; parts: SplitPart[]; comparison: SplitComparison[]; headline: string }

const PART_LABEL: Record<SplitPartKey, string> = {
  cushion: 'Colchón',
  objectives: 'Objetivos cercanos',
  'safe-savings': 'Ahorro seguro',
  'global-equity': 'Renta variable global',
  bonds: 'Renta fija',
  risky: 'Parte arriesgada',
  debt: 'Devolver deuda',
}

const GROUP_LABEL: Record<SplitGroup, string> = {
  safe: 'En cuenta y ahorro seguro',
  'global-equity': 'Renta variable global',
  bonds: 'Renta fija',
  risky: 'Parte arriesgada',
  debt: 'Devolver deuda',
  other: 'Otras inversiones',
}

/** «Tienes el 40 % …»: dónde está cada grupo, para la frase de AXIS. */
const GROUP_IN: Record<SplitGroup, string> = {
  safe: 'tu cuenta y en ahorro seguro',
  'global-equity': 'renta variable global',
  bonds: 'renta fija',
  risky: 'la parte arriesgada',
  debt: 'devolver deuda',
  other: 'inversiones de tipo desconocido',
}

const PART_GROUP: Record<SplitPartKey, SplitGroup> = {
  cushion: 'safe',
  objectives: 'safe',
  'safe-savings': 'safe',
  'global-equity': 'global-equity',
  bonds: 'bonds',
  risky: 'risky',
  debt: 'debt',
}

const PART_ORDER: readonly SplitPartKey[] = ['cushion', 'objectives', 'safe-savings', 'debt', 'global-equity', 'bonds', 'risky']
const GROUP_ORDER: readonly SplitGroup[] = ['safe', 'debt', 'global-equity', 'bonds', 'risky', 'other']
/** Diferencia (puntos) a partir de la cual AXIS la menciona. */
export const SPLIT_GAP_POINTS = 5

export function idealSplit(plan: AllocationPlan, decision: AxisDecision): IdealSplit {
  const ctx = decision.context
  const profile = decision.profile.fields
  const positions = ctx.investments.positions
  const totalCents = Math.max(0, ctx.wealth.liquidCents) + positions.reduce((t, p) => t + Math.max(0, p.valueCents), 0)
  if (totalCents <= 0) return { kind: 'empty' }
  const risk = planRisk(profile)
  if (risk === undefined || profile.horizon === undefined) return { kind: 'no-profile' }
  if (!plan.cushion) return { kind: 'no-data' }

  const amounts = new Map<SplitPartKey, number>()
  let left = totalCents
  const take = (key: SplitPartKey, cents: number) => {
    const c = Math.min(left, Math.max(0, cents))
    if (c <= 0) return
    amounts.set(key, (amounts.get(key) ?? 0) + c)
    left -= c
  }
  const spread = (cents: number, weights: Record<SleeveKey, number>) => {
    const c = Math.min(left, Math.max(0, cents))
    const keys = (['global-equity', 'bonds', 'risky'] as const).filter((k) => weights[k] > 0)
    let given = 0
    keys.forEach((k, i) => {
      // La última parte se lleva el redondeo: el total cuadra siempre.
      const part = i === keys.length - 1 ? c - given : Math.floor((c * weights[k]) / 100)
      given += part
      take(k, part)
    })
  }

  take('cushion', plan.cushion.targetCents)
  const goals = ctx.objectives
    .filter((o) => o.status !== 'achieved' && !isCushionObjective(o))
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
  const farWeights = mixWeights(risk, 'long', false)
  for (const o of goals) {
    if (o.monthsLeft !== undefined && o.monthsLeft > LONG_GOAL_MONTHS) spread(o.currentCents, farWeights)
    else take('objectives', o.currentCents)
  }
  const payDebt = plan.steps.find((s) => s.kind === 'pay-debt')
  if (payDebt?.kind === 'pay-debt') take('debt', payDebt.balanceCents)
  if (profile.horizon === 'short') take('safe-savings', left)
  else spread(left, mixWeights(risk as RiskAttitude, profile.horizon, planSleeves(plan).has('risky')))

  const keys = PART_ORDER.filter((k) => (amounts.get(k) ?? 0) > 0)
  const shares = roundedShares(keys.map((k) => amounts.get(k)!))
  const parts = keys.map((key, i): SplitPart => ({ key, label: PART_LABEL[key], group: PART_GROUP[key], cents: amounts.get(key)!, pct: shares[i] }))

  // Cómo lo tienes hoy, por los mismos grupos.
  const actual = new Map<SplitGroup, number>([['safe', Math.max(0, ctx.wealth.liquidCents)]])
  for (const p of positions) {
    const type = p.assetType ?? guessAssetType(p.name)
    const group: SplitGroup = type === 'safe' ? 'safe' : type === 'other' ? 'other' : type
    actual.set(group, (actual.get(group) ?? 0) + Math.max(0, p.valueCents))
  }
  const ideal = new Map<SplitGroup, number>()
  for (const p of parts) ideal.set(p.group, (ideal.get(p.group) ?? 0) + p.pct)
  const groups = GROUP_ORDER.filter((g) => (ideal.get(g) ?? 0) > 0 || (actual.get(g) ?? 0) > 0)
  const actualShares = roundedShares(groups.map((g) => actual.get(g) ?? 0))
  const comparison = groups.map((group, i): SplitComparison => ({
    group,
    label: GROUP_LABEL[group],
    idealPct: ideal.get(group) ?? 0,
    actualPct: actualShares[i],
    actualCents: actual.get(group) ?? 0,
  }))

  return { kind: 'ready', totalCents, parts, comparison, headline: splitHeadline(comparison) }
}

/** Una frase de AXIS: la parte que más se aleja de lo recomendado, o que está bien repartido. */
export function splitHeadline(comparison: readonly SplitComparison[]): string {
  const gaps = comparison.map((c) => ({ c, gap: c.actualPct - c.idealPct })).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
  const top = gaps[0]
  if (!top || Math.abs(top.gap) < SPLIT_GAP_POINTS) return 'Lo tienes bien repartido: ninguna parte se aleja más de 5 puntos de lo recomendado.'
  const { c, gap } = top
  const facts =
    c.group === 'debt'
      ? `Lo recomendado es dedicar el ${c.idealPct} % de lo que tienes a devolver deuda.`
      : `Tienes el ${c.actualPct} % en ${GROUP_IN[c.group]}; lo recomendado es el ${c.idealPct} %.`
  if (c.group === 'safe' && gap > 0) return `${facts} Tienes más dinero quieto del que necesitas: tu plan te dice cuánto invertir y cómo, poco a poco.`
  if (c.group === 'safe') return `${facts} Te falta colchón o dinero para tus objetivos cercanos: tu plan lo llena primero.`
  if (c.group === 'debt') return `${facts} Tu deuda cuesta más de lo que cabe esperar de invertir: tu plan te propone devolverla antes.`
  if (c.group === 'other') return `${facts} No sé de qué tipo son esas inversiones: dímelo en Inversiones y podré compararlas.`
  if (gap > 0) return `${facts} No hace falta vender: lo nuevo que inviertas irá a lo que falta.`
  return `${facts} Lo nuevo que inviertas irá antes a esta parte.`
}
