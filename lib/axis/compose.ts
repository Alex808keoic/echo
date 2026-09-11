/**
 * Composición del análisis a partir de las señales priorizadas.
 *
 * Aquí se decide qué merece atención: pocas señales, las más relevantes, y
 * una única recomendación principal conectada con la señal de mayor prioridad.
 * El resto de secciones (alternativas, incertidumbre, conclusión) se derivan
 * de las mismas señales y de la calidad del contexto; nunca se rellenan por
 * rellenar.
 */
import { eur, pct } from './rules/shared'
import type {
  AxisAlternative,
  AxisAnalysis,
  AxisDestination,
  AxisEngineInfo,
  AxisResult,
  AxisUncertainty,
  Confidence,
  FinancialContext,
  Signal,
} from './types'

/** Límites de ruido: cuántos elementos de cada sección llegan a la UI. */
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

export function composeNoAnalysis(ctx: FinancialContext, engine: AxisEngineInfo): AxisResult {
  const needs: Array<{ label: string; to?: AxisDestination }> = []
  if (!ctx.quality.hasInitialBalance) needs.push({ label: 'Tu saldo inicial, como punto de partida del patrimonio', to: 'dinero' })
  needs.push({ label: 'Ingresos y gastos registrados: sin ellos no hay situación que interpretar', to: 'movimientos' })
  if (!ctx.quality.hasObjectives) needs.push({ label: 'Un objetivo, para saber para qué es el dinero', to: 'objetivos' })
  if (!ctx.quality.hasInvestments) needs.push({ label: 'Tus inversiones, si las tienes, para leer el patrimonio completo', to: 'inversiones' })
  return {
    status: 'no-analysis',
    message: 'AXIS todavía no puede hacer un análisis útil de tu situación.',
    facts: knownFacts(ctx),
    needs,
    nextStep: ctx.quality.hasInitialBalance
      ? { label: 'Registrar un movimiento', to: 'movimientos' }
      : { label: 'Configurar saldo inicial', to: 'dinero' },
    engine,
  }
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

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function summaryFor(top: Signal | undefined, ctx: FinancialContext): string {
  if (!top) {
    return 'No hay ninguna señal que requiera atención: la situación es estable con los datos disponibles.'
  }
  const rate = ctx.flows.current.savingsRatePct
  const tone =
    top.priority === 'critical'
      ? 'Lo prioritario ahora mismo: '
      : top.priority === 'high'
        ? 'Lo que más merece atención: '
        : top.priority === 'medium'
          ? 'A tener en cuenta: '
          : rate !== null && rate >= 20
            ? 'La situación es sólida. '
            : ''
  return `${tone}${top.interpretation}`
}

function headlineFor(top: Signal | undefined, ctx: FinancialContext): string {
  if (top?.priority === 'critical' || top?.priority === 'high') return top.fact
  const { current } = ctx.flows
  if (current.movementCount === 0) return 'Aún no hay movimientos este mes: registra ingresos y gastos para una lectura actual.'
  if (current.savingsRatePct !== null && current.savingsCents >= 0) {
    return `Este mes ahorras el ${pct(current.savingsRatePct)} de tus ingresos (${eur(current.savingsCents)}).`
  }
  return top?.fact ?? 'Situación estable con los datos disponibles.'
}

function conclusionFor(top: Signal | undefined, ctx: FinancialContext): string {
  if (!top) return 'Nada que cambiar por ahora. Sigue registrando movimientos y vuelve a consultar el mes que viene.'
  switch (top.priority) {
    case 'critical':
      return 'Prioridad: volver a un balance mensual positivo antes de plantear ahorro o inversión.'
    case 'high':
      return top.recommendation
        ? 'Conviene actuar sobre este punto este mes; el resto puede esperar.'
        : 'Conviene vigilar este punto el mes que viene antes de hacer cambios importantes.'
    case 'medium':
      return ctx.quality.level === 'limited'
        ? 'Situación razonable, pero con poco histórico: conviene observar el siguiente periodo antes de un cambio importante.'
        : 'Situación estable. Un ajuste moderado en el punto señalado mejoraría tu margen.'
    default:
      return 'Situación estable con los datos disponibles. No hace falta actuar; mantén el ritmo.'
  }
}

export function composeAnalysis(
  ctx: FinancialContext,
  signals: Signal[],
  engine: AxisEngineInfo,
  now: Date = new Date(),
): AxisAnalysis {
  const top = signals[0]
  const relevant = signals.slice(0, LIMITS.signals)
  const withRecommendation = signals.find((s) => s.recommendation)

  const facts = dedupe([...baseFacts(ctx), ...relevant.map((s) => s.fact)], (f) => f).slice(0, LIMITS.facts)

  const alternatives: AxisAlternative[] = dedupe(
    relevant.flatMap((s) => (s.alternative ? [s.alternative] : [])),
    (a) => a.name,
  ).slice(0, LIMITS.alternatives)

  const uncertainties = dedupe(
    [...qualityUncertainties(ctx), ...signals.flatMap((s) => (s.uncertainty ? [s.uncertainty] : []))],
    (u) => u.title,
  ).slice(0, LIMITS.uncertainties)

  const recommendation = withRecommendation?.recommendation ?? null

  return {
    headline: headlineFor(top, ctx),
    data: { facts },
    interpretation: {
      summary: summaryFor(top, ctx),
      signals: relevant.map((s) => ({ id: s.id, priority: s.priority, text: s.interpretation })),
    },
    recommendation,
    alternatives,
    uncertainty: {
      items:
        uncertainties.length > 0
          ? uncertainties
          : [{ title: 'Sin incertidumbre relevante', detail: 'Los datos disponibles bastan para esta lectura.' }],
      confidence: confidenceFor(ctx),
    },
    conclusion: {
      summary: conclusionFor(top, ctx),
      nextStep: recommendation?.nextStep ?? (top ? undefined : { label: 'Registrar un movimiento', to: 'movimientos' }),
    },
    basedOnDemoData: ctx.quality.isDemo,
    generatedAt: now.toISOString(),
    engine,
  }
}
