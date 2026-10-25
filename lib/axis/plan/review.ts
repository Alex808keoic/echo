/**
 * Revisión del mes que acaba («cierre del mes»): lo que pasó frente a lo que
 * decía el plan. Como en una reunión con tu consultor: cuánto ahorraste,
 * cuánto invertiste y en qué, qué pasos marcaste, cómo cambió tu dinero
 * líquido y cuánto le costó la inflación. Pura y determinista: sale de tus
 * datos y de la foto del plan de ese mes (`PlannedMonth`); sin foto, compara
 * con lo que propone el plan ahora y lo dice.
 */
import { formatCents } from '../../money'
import { formatMonthYear } from '../../dates'
import { computeLiquidCents } from '../../finance/patrimonio'
import type { AppConfig, Debt, Movement, Position } from '../../types'
import { inMonth, totalsByCategory } from '../../finance/summary'
import { closedMonthsOf, monthKeyOf } from '../context'
import { regularExpenseCents, regularIncomeCents } from '../rules/shared'
import { monthlyInvestCents, type AllocationPlan } from './allocation'
import { inflationPhrase, type InflationRef } from './inflation'

export interface PlannedSnapshot {
  savingsCents: number
  investCents: number
  items: number
}

export type ReviewVerdict = 'on-track' | 'partial' | 'off-track'

export interface MonthReview {
  /** `YYYY-MM` del mes revisado. */
  month: string
  label: string
  verdict: ReviewVerdict
  /** Frases de la revisión, en orden. */
  lines: string[]
  /** Lo que conviene hacer distinto este mes (una frase). */
  next: string
  /** Si la comparación es con el plan de ahora (no había foto de ese mes). */
  usesCurrentPlan: boolean
}

const eur = (cents: number) => formatCents(cents)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Planificado del plan actual, cuando no hay foto del mes revisado. */
export function plannedFromPlan(plan: AllocationPlan, items: number): PlannedSnapshot {
  return { savingsCents: plan.monthly?.savingsCents ?? 0, investCents: monthlyInvestCents(plan), items }
}

export function reviewMonth(input: {
  snapshot: { config: AppConfig | null; movements: Movement[]; positions: Position[]; debts?: Debt[] }
  asOf: string
  planned: PlannedSnapshot | null
  currentPlanned: PlannedSnapshot
  doneCount: number
  inflation: InflationRef
}): MonthReview | null {
  const month = monthKeyOf(input.asOf, -1)
  const closed = closedMonthsOf(input.snapshot.movements, input.asOf).find((m) => m.key === month)
  if (!closed) return null
  const planned = input.planned ?? input.currentPlanned
  const usesCurrentPlan = input.planned === null
  const lines: string[] = []

  // Ahorro (sin lo puntual) frente a lo habitual del plan.
  const saved = regularIncomeCents(closed) - regularExpenseCents(closed)
  const oneOff = (closed.oneOffIncomeCents ?? 0) - (closed.oneOffExpenseCents ?? 0)
  const savedOk = planned.savingsCents <= 0 || saved >= planned.savingsCents * 0.9
  lines.push(
    saved >= 0
      ? `Ahorraste ${eur(saved)}${planned.savingsCents > 0 ? `; tu plan contaba con unos ${eur(planned.savingsCents)}` : ''}.`
      : `Gastaste ${eur(-saved)} más de lo que ingresaste.`,
  )
  if (oneOff !== 0) lines.push(`Aparte, lo puntual del mes ${oneOff > 0 ? `sumó ${eur(oneOff)}` : `restó ${eur(-oneOff)}`}.`)
  const top = totalsByCategory(inMonth(input.snapshot.movements, month), 'gasto')[0]
  if (top) lines.push(`Donde más gastaste: «${top.label}», ${eur(top.cents)} (el ${top.pct} % de tus gastos).`)

  // Inversiones apuntadas con fecha de ese mes, por tipo.
  const investedThere = input.snapshot.positions.filter((p) => p.date.startsWith(month)).reduce((t, p) => t + Math.max(0, p.investedCents), 0)
  const investOk = planned.investCents <= 0 || investedThere >= planned.investCents * 0.9
  if (planned.investCents > 0)
    lines.push(
      investedThere > 0
        ? `Invertiste ${eur(investedThere)} de los ${eur(planned.investCents)} que proponía el plan.`
        : `No apuntaste ninguna inversión; el plan proponía ${eur(planned.investCents)}.`,
    )
  else if (investedThere > 0) lines.push(`Invertiste ${eur(investedThere)}.`)

  if (planned.items > 0) lines.push(`Marcaste ${input.doneCount} de ${plural(planned.items, 'paso', 'pasos')} de «Tu decisión del mes».`)

  // Dinero líquido al empezar y al acabar el mes.
  const initial = input.snapshot.config?.initialBalanceCents ?? 0
  const liquidAt = (lastDay: string) =>
    computeLiquidCents(
      initial,
      input.snapshot.movements.filter((m) => m.date <= lastDay),
      input.snapshot.positions.filter((p) => p.date <= lastDay),
    )
  const before = liquidAt(`${monthKeyOf(`${month}-01`, -1)}-31`)
  const after = liquidAt(`${month}-31`)
  lines.push(`Tu dinero líquido pasó de ${eur(before)} a ${eur(after)}.`)

  // Inflación: lo que perdió en un mes el dinero quieto (la media del mes).
  const idle = Math.max(0, Math.round((before + after) / 2))
  const loss = Math.round((idle * input.inflation.pct) / 100 / 12 / 100) * 100
  if (loss > 0) lines.push(`Con ${inflationPhrase(input.inflation)}, tu dinero quieto perdió unos ${eur(loss)} de poder de compra este mes.`)

  const owed = (input.snapshot.debts ?? []).reduce((t, d) => t + Math.max(0, d.balanceCents), 0)
  if (owed > 0) lines.push(`Debes ${eur(owed)} en total: actualiza lo que queda de cada deuda.`)

  const verdict: ReviewVerdict = savedOk && investOk ? 'on-track' : savedOk || investOk ? 'partial' : 'off-track'
  const next =
    verdict === 'on-track'
      ? 'Vas según tu plan: sigue igual este mes.'
      : !savedOk
        ? 'Este mes, lo primero es volver a tu ritmo de ahorro: mira en qué se fue el dinero en «Tu dinero».'
        : 'Este mes, intenta hacer la inversión que propone el plan (y apúntala en Inversiones).'
  return { month, label: formatMonthYear(month), verdict, lines, next, usesCurrentPlan }
}
