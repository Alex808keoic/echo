/**
 * «¿Y si…?»: simula una decisión antes de tomarla. Se aplica el cambio a una
 * COPIA de tus datos y se recalculan la decisión de AXIS, el plan y la
 * proyección con las mismas reglas de siempre; nada se guarda. Sirve también
 * para las grandes decisiones (comprar vivienda, independizarte, cambiar de
 * trabajo), con lo que conviene tener en cuenta en cada una.
 *
 *   Compra puntual / meses sin ingresos / entrada de una vivienda / mudanza
 *       → un gasto puntual hoy (baja el líquido; no cuenta como habitual).
 *   Cambio de sueldo / gasto fijo nuevo / cuota de un préstamo
 *       → se suma a los ingresos o gastos de cada mes cerrado (cambia lo habitual).
 *   Préstamo / hipoteca → además, una deuda nueva en tu lista.
 *
 * Supuestos (dichos en pantalla): vivienda con un 20 % de entrada y un 10 %
 * de gastos de compra (impuestos, notaría, registro); préstamos con cuota fija.
 * Pura y determinista.
 */
import { buildFinancialContext, type FinancialSnapshot } from '../context'
import { decide } from '../core/decision'
import { formatCents } from '../../money'
import { annuityPaymentCents, DEBT_LOAD_MAX_PCT } from '../../finance/debts'
import type { AxisMemory, FinancialContext } from '../types'
import type { Debt, Movement } from '../../types'
import { buildAllocationPlan, CUSHION_MONTHS, type AllocationPlan } from './allocation'
import { describeStep, durationText } from './describe'
import { projectWealth } from './projection'
import type { InflationRef } from './inflation'

export type ScenarioKind = 'purchase' | 'loan' | 'income' | 'expense' | 'no-income' | 'home' | 'job' | 'move-out'

export type Scenario =
  | { kind: 'purchase'; cents: number }
  | { kind: 'loan'; cents: number; aprPct: number; months: number }
  | { kind: 'income'; monthlyDeltaCents: number }
  | { kind: 'expense'; monthlyCents: number }
  | { kind: 'no-income'; months: number }
  | { kind: 'home'; priceCents: number; aprPct: number; years: number; rentSavedCents: number }
  | { kind: 'job'; newIncomeCents: number; gapMonths: number }
  | { kind: 'move-out'; rentCents: number; otherMonthlyCents: number; upfrontCents: number }

/** Entrada que suele pedir el banco y gastos de compra de una vivienda (impuestos, notaría, registro), en % del precio. */
export const HOME_DOWN_PCT = 20
export const HOME_COSTS_PCT = 10
/** Alquiler sano: como mucho este % de tus ingresos. */
export const RENT_MAX_PCT = 30
/** Años de la proyección que se comparan. */
export const SIMULATION_YEARS = 10

export interface SimSide {
  plan: AllocationPlan
  liquidCents: number
  /** Ahorro habitual al mes (`null` si el plan no lo sabe). */
  savingsCents: number | null
  /** Meses de gasto que cubre tu líquido. */
  cushionMonths: number | null
  investCents: number
  firstStep: string
  /** Objetivos con fecha que no llegan a tiempo con tu ahorro. */
  lateObjectives: string[]
  /** Proyección a `SIMULATION_YEARS` años (escenario normal), si el plan reparte. */
  projectionCents: number | null
}

export type SimVerdict = 'ok' | 'careful' | 'not-now'

export type SimulationResult =
  | { status: 'insufficient-data' }
  | {
      status: 'ok'
      before: SimSide
      after: SimSide
      /** Cifras del escenario (cuota, intereses, entrada…). */
      facts: string[]
      checks: Array<{ ok: boolean; text: string }>
      verdict: SimVerdict
      summary: string
    }

/** Qué conviene tener en cuenta en cada decisión (texto general, sin productos). */
export const SCENARIO_TIPS: Record<ScenarioKind, string[]> = {
  purchase: [
    'Si puedes esperar, ahorrar para pagarlo es más barato que financiarlo.',
    'Pagarlo con dinero de tu colchón te deja sin red para imprevistos: el plan lo volverá a llenar primero.',
    'Pregúntate si lo comprarías igual dentro de un mes.',
  ],
  loan: [
    'Compara la TAE (no solo el tipo de interés) y las comisiones de apertura y de amortización anticipada.',
    'Un préstamo para algo que pierde valor (coche, móvil, viaje) te sale más caro que ahorrar antes.',
    'Que la suma de todas tus cuotas no pase del 35 % de tus ingresos.',
  ],
  income: [
    'Si es una subida, decide antes de cobrarla qué parte va a ahorro: si no, el gasto suele subir solo.',
    'Si es una bajada, revisa primero los gastos fijos (suscripciones, seguros, tarifas).',
  ],
  expense: [
    'Un gasto fijo pesa todos los meses: 30 € al mes son 360 € al año.',
    'Mira si sustituye a otro gasto o se suma a los que ya tienes.',
  ],
  'no-income': [
    'Tu colchón está para esto: mira cuántos meses aguantarías con lo que tienes.',
    'Si te quedas sin trabajo, infórmate de la prestación por desempleo a la que tengas derecho.',
    'Mientras dure, recorta primero los gastos que no son imprescindibles.',
  ],
  home: [
    `Los bancos suelen financiar el 80 % del precio: necesitas el ${HOME_DOWN_PCT} % de entrada y alrededor de un ${HOME_COSTS_PCT} % más para impuestos, notaría y registro.`,
    `La cuota de la hipoteca no debería pasar del 30–35 % de tus ingresos.`,
    'Comprar no es siempre mejor que alquilar: cuenta también comunidad, IBI, seguros y reparaciones, y lo que dejarías de invertir.',
    'Interés fijo o variable: el fijo te da cuota estable; el variable puede subir con el euríbor.',
    'No dejes tu colchón a cero para pagar la entrada.',
  ],
  job: [
    'Antes de dejar un trabajo, ten el colchón lleno para cubrir el tiempo sin ingresos.',
    'Compara el sueldo neto, no el bruto, y fíjate en las pagas extra.',
    'Si el nuevo sueldo es variable, planifica con la parte fija.',
  ],
  'move-out': [
    `El alquiler no debería pasar del ${RENT_MAX_PCT} % de tus ingresos.`,
    'Además del alquiler: luz, agua, gas, internet, comida y la fianza (1 o 2 meses).',
    'Muebles y electrodomésticos al empezar: cuenta con ellos en el gasto inicial.',
  ],
}

const DAY = 'sim'

/** Gasto puntual de simulación (fecha de hoy): baja el líquido sin cambiar lo habitual. */
function oneOff(asOf: string, cents: number, n: number): Movement {
  return { id: `${DAY}-${n}`, type: 'gasto', amountCents: cents, date: asOf, category: 'Otros', motivo: 'Simulación', puntual: true, createdAt: 0, updatedAt: 0 }
}

/** Cambia lo habitual de cada mes cerrado: más (o menos) ingreso y más gasto. */
function withMonthly(ctx: FinancialContext, incomeDelta: number, expenseDelta: number): FinancialContext {
  if (incomeDelta === 0 && expenseDelta === 0) return ctx
  return {
    ...ctx,
    flows: {
      ...ctx.flows,
      closedMonths: ctx.flows.closedMonths.map((m) => ({ ...m, incomeCents: Math.max(0, m.incomeCents + incomeDelta), expenseCents: Math.max(0, m.expenseCents + expenseDelta) })),
    },
  }
}

function side(ctx: FinancialContext, memory: AxisMemory | undefined, inflation: InflationRef): SimSide {
  const decision = decide({ context: ctx, ...(memory ? { memory } : {}) })
  const plan = buildAllocationPlan(decision, { inflation })
  const savings = plan.monthly?.savingsCents ?? null
  const spending = plan.monthly?.spendingCents ?? null
  const late = ctx.objectives
    .filter((o) => o.status === 'in-progress' && o.monthsLeft !== undefined && o.monthsLeft > 0 && o.requiredMonthlyCents !== undefined)
    .filter((o) => plan.status !== 'ready' || savings === null || (o.requiredMonthlyCents ?? 0) > savings)
    .map((o) => o.name)
  return {
    plan,
    liquidCents: ctx.wealth.liquidCents,
    savingsCents: plan.status === 'ready' ? savings : savings !== null ? Math.min(savings, 0) : null,
    cushionMonths: spending && spending > 0 ? Math.floor((Math.max(0, ctx.wealth.liquidCents) / spending) * 10) / 10 : null,
    investCents: plan.longTerm.monthlyCents,
    firstStep: plan.steps[0] ? describeStep(plan.steps[0], plan, ctx.objectives).title : 'Tu plan está al día',
    lateObjectives: late,
    projectionCents: projectWealth(plan, ctx, SIMULATION_YEARS, inflation)?.midCents ?? null,
  }
}

const eur = (cents: number) => formatCents(cents)
const debtOf = (name: string, cents: number, aprPct: number, paymentCents: number): Debt => ({
  id: `${DAY}-debt`,
  name,
  balanceCents: cents,
  aprBp: Math.round(aprPct * 100),
  monthlyPaymentCents: paymentCents,
  createdAt: 0,
  updatedAt: 0,
})

export function simulate(input: { snapshot: FinancialSnapshot; memory?: AxisMemory; asOf: string; inflation: InflationRef; scenario: Scenario }): SimulationResult {
  const { snapshot, memory, asOf, inflation, scenario } = input
  const baseCtx = buildFinancialContext(snapshot, asOf)
  const before = side(baseCtx, memory, inflation)
  // Sin un ahorro habitual de tus datos (dos meses completos), no hay con qué comparar.
  if (!before.plan.monthly || before.plan.monthly.forecast) return { status: 'insufficient-data' }
  const spending = before.plan.monthly.spendingCents
  const income = before.plan.monthly.savingsCents + spending
  const cushionTarget = before.plan.cushion?.targetCents ?? spending * CUSHION_MONTHS.regular

  const extra: Movement[] = []
  const debts: Debt[] = [...(snapshot.debts ?? [])]
  let incomeDelta = 0
  let expenseDelta = 0
  const facts: string[] = []
  const checks: Array<{ ok: boolean; text: string }> = []
  let blocked = false
  let ratioPct: number | null = null

  switch (scenario.kind) {
    case 'purchase':
      extra.push(oneOff(asOf, scenario.cents, 1))
      break
    case 'loan': {
      const payment = annuityPaymentCents(scenario.cents, scenario.aprPct, scenario.months)
      const interest = Math.max(0, payment * scenario.months - scenario.cents)
      expenseDelta += payment
      debts.push(debtOf('Préstamo simulado', scenario.cents, scenario.aprPct, payment))
      facts.push(`Cuota: ${eur(payment)} al mes durante ${durationText(scenario.months)}.`, `Pagarías unos ${eur(Math.round(interest / 100) * 100)} de intereses.`)
      if (before.savingsCents && before.savingsCents > 0) {
        const months = Math.ceil(scenario.cents / before.savingsCents)
        facts.push(`Si en vez de pedirlo lo ahorras, a tu ritmo actual tardarías unos ${durationText(months)}, sin intereses.`)
      }
      const payments = debts.reduce((t, d) => t + d.monthlyPaymentCents, 0)
      ratioPct = income > 0 ? Math.round((payments / income) * 100) : null
      break
    }
    case 'income':
      incomeDelta += scenario.monthlyDeltaCents
      break
    case 'expense':
      expenseDelta += scenario.monthlyCents
      break
    case 'no-income':
      extra.push(oneOff(asOf, spending * scenario.months, 1))
      facts.push(`Sin ingresos, en ${durationText(scenario.months)} gastarías unos ${eur(spending * scenario.months)} (tu gasto habitual).`)
      break
    case 'home': {
      const upfront = Math.round((scenario.priceCents * (HOME_DOWN_PCT + HOME_COSTS_PCT)) / 100)
      const mortgage = Math.round((scenario.priceCents * (100 - HOME_DOWN_PCT)) / 100)
      const payment = annuityPaymentCents(mortgage, scenario.aprPct, scenario.years * 12)
      const available = Math.max(0, baseCtx.wealth.liquidCents - cushionTarget)
      extra.push(oneOff(asOf, upfront, 1))
      expenseDelta += payment - scenario.rentSavedCents
      debts.push(debtOf('Hipoteca simulada', mortgage, scenario.aprPct, payment))
      ratioPct = income > 0 ? Math.round((payment / income) * 100) : null
      facts.push(
        `Entrada y gastos de compra: unos ${eur(upfront)} (${HOME_DOWN_PCT} % + ${HOME_COSTS_PCT} % del precio).`,
        `Hipoteca de ${eur(mortgage)} a ${scenario.years} años: unos ${eur(payment)} al mes.`,
      )
      if (upfront > available) {
        blocked = true
        const missing = upfront - available
        const months = before.savingsCents && before.savingsCents > 0 ? Math.ceil(missing / before.savingsCents) : null
        checks.push({
          ok: false,
          text: `Sin tocar tu colchón tienes ${eur(available)}: te faltan ${eur(missing)}${months ? `, unos ${durationText(months)} ahorrando a tu ritmo actual` : ''}.`,
        })
      } else checks.push({ ok: true, text: `Puedes pagar la entrada y los gastos sin tocar tu colchón.` })
      break
    }
    case 'job': {
      incomeDelta += scenario.newIncomeCents - income
      if (scenario.gapMonths > 0) {
        extra.push(oneOff(asOf, spending * scenario.gapMonths, 1))
        facts.push(`Los ${durationText(scenario.gapMonths)} sin sueldo te costarían unos ${eur(spending * scenario.gapMonths)} de tu líquido.`)
      }
      facts.push(`Tus ingresos pasarían de unos ${eur(income)} a ${eur(scenario.newIncomeCents)} al mes.`)
      break
    }
    case 'move-out': {
      expenseDelta += scenario.rentCents + scenario.otherMonthlyCents
      if (scenario.upfrontCents > 0) extra.push(oneOff(asOf, scenario.upfrontCents, 1))
      ratioPct = income > 0 ? Math.round((scenario.rentCents / income) * 100) : null
      facts.push(`Gastos nuevos: ${eur(scenario.rentCents + scenario.otherMonthlyCents)} al mes${scenario.upfrontCents > 0 ? `, y ${eur(scenario.upfrontCents)} al empezar` : ''}.`)
      break
    }
  }

  const ctx = withMonthly(buildFinancialContext({ ...snapshot, movements: [...snapshot.movements, ...extra], debts }, asOf), incomeDelta, expenseDelta)
  const after = side(ctx, memory, inflation)

  // Comprobaciones comunes.
  if (after.liquidCents < 0) {
    blocked = true
    checks.push({ ok: false, text: `Tu dinero líquido quedaría en ${eur(after.liquidCents)}: no te llega.` })
  }
  if (after.savingsCents !== null) {
    checks.push(
      after.savingsCents > 0
        ? { ok: after.savingsCents >= (before.savingsCents ?? 0) * 0.5, text: `Seguirías ahorrando unos ${eur(after.savingsCents)} al mes (ahora, ${eur(before.savingsCents ?? 0)}).` }
        : { ok: false, text: 'Dejarías de ahorrar: gastarías todo lo que ingresas o más.' },
    )
    if (after.savingsCents <= 0) blocked = true
  }
  const months = after.plan.monthly && after.plan.monthly.spendingCents > 0 ? after.liquidCents / after.plan.monthly.spendingCents : null
  if (months !== null && after.liquidCents >= 0) {
    const wanted = CUSHION_MONTHS.regular
    checks.push({ ok: months >= wanted, text: `Tu líquido cubriría unos ${durationText(Math.max(0, Math.floor(months)))} de gasto${months >= wanted ? '' : ` (lo prudente son al menos ${wanted})`}.` })
  }
  if (ratioPct !== null) {
    const max = scenario.kind === 'move-out' ? RENT_MAX_PCT : DEBT_LOAD_MAX_PCT
    const what = scenario.kind === 'move-out' ? 'El alquiler' : scenario.kind === 'home' ? 'La cuota' : 'Tus cuotas'
    checks.push({ ok: ratioPct <= max, text: `${what} se llevaría${scenario.kind === 'loan' ? 'n' : ''} el ${ratioPct} % de tus ingresos (como mucho, un ${max} %).` })
  }
  const newlyLate = after.lateObjectives.filter((n) => !before.lateObjectives.includes(n))
  if (newlyLate.length > 0) checks.push({ ok: false, text: `${newlyLate.map((n) => `«${n}»`).join(', ')} dejaría${newlyLate.length === 1 ? '' : 'n'} de llegar a tiempo.` })
  else if (before.lateObjectives.length === 0 && ctx.objectives.some((o) => o.monthsLeft !== undefined && o.status === 'in-progress'))
    checks.push({ ok: true, text: 'Tus objetivos con fecha seguirían llegando a tiempo.' })

  const failed = checks.filter((c) => !c.ok).length
  const verdict: SimVerdict = blocked || (ratioPct !== null && ratioPct > DEBT_LOAD_MAX_PCT + 5) ? 'not-now' : failed > 0 ? 'careful' : 'ok'
  const summary =
    verdict === 'ok'
      ? 'Con tus datos, te lo puedes permitir sin desordenar tu plan.'
      : verdict === 'careful'
        ? 'Te lo podrías permitir, pero con riesgos: mira lo marcado en rojo antes de decidir.'
        : 'Con tus datos, ahora mismo no es buena idea: mira lo marcado en rojo.'
  return { status: 'ok', before, after, facts, checks, verdict, summary }
}
