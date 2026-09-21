/**
 * MOTOR DE DECISIÓN — AXIS
 * ------------------------------------------------------------------
 * Convierte el contexto financiero en una `AxisDecision`: qué está pasando
 * (señales), qué tiene prioridad (señal líder), qué recomendar (una sola
 * recomendación o no actuar), qué alternativas e incertidumbres existen, con
 * qué confianza, qué falta y cuál es el siguiente paso.
 *
 * Solo reglas deterministas (`rules/`): ningún modelo de lenguaje decide aquí.
 * Redactar la decisión es responsabilidad de `render` (compose.ts) o, en
 * fases posteriores, de un modelo de lenguaje que la expresa sin alterarla.
 *
 * Perfil del usuario: `input.profile` (opcional) se reconcilia con el
 * contexto UNA sola vez aquí (`reconcileProfile`) y llega a las reglas como
 * tercer parámetro. Sin perfil, o con uno vacío, la decisión es exactamente
 * la misma; lo aplicado queda siempre en `decision.profile`.
 */
import { EMPTY_PROFILE, type DecisionProfile, type ProfileInfluence } from '../profile/types'
import { reconcileProfile } from '../profile/derive'
import { detectSignals } from '../rules'
import { eur } from '../rules/shared'
import type { AxisDecision, AxisDestination, AxisInput, AxisUncertainty, Confidence, FinancialContext, Signal } from '../types'

/** Límites de ruido: cuántos elementos de cada sección llegan a la lectura. */
export const LIMITS = {
  facts: 5,
  signals: 4,
  alternatives: 2,
  uncertainties: 3,
} as const

/* ----------------------------- Sin análisis ------------------------------ */

/** Hechos conocidos aunque no haya análisis: AXIS sigue siendo útil. */
function knownFacts(ctx: FinancialContext): string[] {
  const facts: string[] = []
  if (ctx.quality.hasInitialBalance) {
    facts.push(`Saldo inicial: ${eur(ctx.wealth.initialBalanceCents)}.`)
  }
  if (ctx.investments.positions.length > 0) {
    facts.push(`Inversiones registradas: ${eur(ctx.investments.totalValueCents)}.`)
  }
  if (ctx.objectives.length > 0) {
    facts.push(`${ctx.objectives.length} objetivo${ctx.objectives.length === 1 ? '' : 's'} definido${ctx.objectives.length === 1 ? '' : 's'}.`)
  }
  if (facts.length > 0) facts.unshift(`Patrimonio actual: ${eur(ctx.wealth.totalCents)}.`)
  return facts
}

function missingFor(ctx: FinancialContext): Array<{ label: string; to?: AxisDestination }> {
  const needs: Array<{ label: string; to?: AxisDestination }> = []
  if (!ctx.quality.hasInitialBalance) needs.push({ label: 'Tu saldo inicial, como punto de partida del patrimonio', to: 'dinero' })
  needs.push({ label: 'Ingresos y gastos registrados: sin ellos no hay situación que interpretar', to: 'movimientos' })
  if (!ctx.quality.hasObjectives) needs.push({ label: 'Un objetivo, para saber para qué es el dinero', to: 'objetivos' })
  if (!ctx.quality.hasInvestments) needs.push({ label: 'Tus inversiones, si las tienes, para leer el patrimonio completo', to: 'inversiones' })
  return needs
}

/* ------------------------------- Análisis -------------------------------- */

function baseFacts(ctx: FinancialContext): string[] {
  const { wealth, flows } = ctx
  const facts = [
    `Patrimonio: ${eur(wealth.totalCents)} (líquido ${eur(wealth.liquidCents)}${
      wealth.investedCents > 0 ? `, invertido ${eur(wealth.investedCents)}` : ''
    }).`,
  ]
  if (flows.current.movementCount > 0) {
    facts.push(
      `Este mes: ingresos ${eur(flows.current.incomeCents)}, gastos ${eur(flows.current.expenseCents)}, balance ${eur(flows.current.savingsCents, true)}.`,
    )
  }
  return facts
}

function qualityUncertainties(ctx: FinancialContext): AxisUncertainty[] {
  const items: AxisUncertainty[] = []
  const q = ctx.quality
  if (q.isDemo) {
    items.push({
      title: 'Datos de demostración',
      detail: 'Este análisis se ha hecho sobre datos de ejemplo, no sobre tu situación real.',
    })
  }
  if (!q.hasPreviousPeriod) {
    items.push({
      title: 'Sin mes anterior',
      detail: 'No hay movimientos del mes pasado con los que comparar; no puedo saber si este mes es normal o atípico.',
    })
  } else if (q.monthsWithData < 3) {
    items.push({
      title: 'Histórico corto',
      detail: `Solo hay ${q.monthsWithData} meses con movimientos. No tengo suficiente histórico para saber si este patrón se mantiene.`,
    })
  }
  if (!q.hasObjectives) {
    items.push({
      title: 'Sin objetivos',
      detail: 'Sin un objetivo no puedo valorar si el ahorro es suficiente ni recomendar un destino para él.',
    })
  }
  return items
}

function confidenceFor(ctx: FinancialContext): Confidence {
  const q = ctx.quality
  if (q.isDemo || q.level === 'limited') return 'baja'
  if (q.monthsWithData >= 3 && q.movementCount >= 15) return 'alta'
  return 'media'
}

/** Influencia del perfil recogida de las señales, en su orden. Sin comportamiento de perfil, vacía. */
function collectInfluence(signals: Signal[]): ProfileInfluence[] {
  return signals.flatMap((s) => s.profileInfluence ?? [])
}

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Decide sobre un contexto. Determinista: mismo contexto (mercado y perfil) → misma decisión. */
export function decide(input: AxisInput): AxisDecision {
  const ctx = input.context
  // Única reconciliación: los datos actuales mandan sobre el perfil (solo quita, nunca añade).
  const profile = reconcileProfile(input.profile ?? EMPTY_PROFILE, ctx)
  const base = { context: ctx, level: ctx.quality.level, basedOnDemoData: ctx.quality.isDemo }

  if (ctx.quality.level === 'none') {
    const applied: DecisionProfile = { fields: profile, influence: [] }
    return {
      ...base,
      signals: [],
      lead: null,
      relevant: [],
      facts: knownFacts(ctx),
      recommendation: null,
      alternatives: [],
      uncertainties: [],
      confidence: 'baja',
      missing: missingFor(ctx),
      nextStep: ctx.quality.hasInitialBalance
        ? { label: 'Registrar un movimiento', to: 'movimientos' }
        : { label: 'Configurar saldo inicial', to: 'dinero' },
      profile: applied,
    }
  }

  const signals: Signal[] = detectSignals(ctx, input.market ?? null, profile)
  const lead = signals[0] ?? null
  const relevant = signals.slice(0, LIMITS.signals)
  const recommendation = signals.find((s) => s.recommendation)?.recommendation ?? null

  // Orden: demo (honestidad) → incertidumbres concretas de las señales → genéricas de calidad.
  const quality = qualityUncertainties(ctx)
  const uncertainties = dedupe(
    [
      ...quality.filter((u) => u.title === 'Datos de demostración'),
      ...signals.flatMap((s) => (s.uncertainty ? [s.uncertainty] : [])),
      ...quality.filter((u) => u.title !== 'Datos de demostración'),
    ],
    (u) => u.title,
  ).slice(0, LIMITS.uncertainties)

  return {
    ...base,
    signals,
    lead,
    relevant,
    facts: dedupe([...baseFacts(ctx), ...relevant.map((s) => s.fact)], (f) => f).slice(0, LIMITS.facts),
    recommendation,
    alternatives: dedupe(
      relevant.flatMap((s) => (s.alternative ? [s.alternative] : [])),
      (a) => a.name,
    ).slice(0, LIMITS.alternatives),
    uncertainties,
    confidence: confidenceFor(ctx),
    missing: [],
    nextStep: recommendation?.nextStep ?? (lead ? undefined : { label: 'Registrar un movimiento', to: 'movimientos' }),
    profile: { fields: profile, influence: collectInfluence(signals) },
  }
}
