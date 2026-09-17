/**
 * Redacción local del análisis: `AxisDecision` → `AxisResult`.
 *
 * Aquí no se decide nada. Lo que merece atención, la recomendación, las
 * alternativas, las incertidumbres y la confianza vienen ya fijadas por
 * `decide()` (core/decision.ts); esta capa solo pone palabras: titular,
 * resumen de la interpretación y conclusión, con el tono de AXIS.
 */
import { eur, pct } from './rules/shared'
import type { AxisDecision, AxisEngineInfo, AxisResult, FinancialContext, Signal } from './types'

function summaryFor(top: Signal | null, ctx: FinancialContext): string {
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

function headlineFor(top: Signal | null, ctx: FinancialContext): string {
  if (top?.priority === 'critical' || top?.priority === 'high') return top.fact
  const { current } = ctx.flows
  if (current.movementCount === 0) return 'Aún no hay movimientos este mes: registra ingresos y gastos para una lectura actual.'
  if (current.savingsRatePct !== null && current.savingsCents >= 0) {
    return `Este mes ahorras el ${pct(current.savingsRatePct)} de tus ingresos (${eur(current.savingsCents)}).`
  }
  return top?.fact ?? 'Situación estable con los datos disponibles.'
}

function conclusionFor(top: Signal | null, ctx: FinancialContext): string {
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

/** Redacta una decisión con el motor indicado. No altera la decisión. */
export function render(decision: AxisDecision, engine: AxisEngineInfo, now: Date = new Date()): AxisResult {
  const ctx = decision.context

  if (decision.level === 'none') {
    return {
      status: 'no-analysis',
      message: 'AXIS todavía no puede hacer un análisis útil de tu situación.',
      facts: decision.facts,
      needs: decision.missing,
      nextStep: decision.nextStep ?? { label: 'Registrar un movimiento', to: 'movimientos' },
      engine,
    }
  }

  const { lead, relevant, recommendation } = decision
  return {
    status: 'analysis',
    analysis: {
      headline: headlineFor(lead, ctx),
      data: { facts: decision.facts },
      interpretation: {
        summary: summaryFor(lead, ctx),
        signals: relevant.map((s) => ({ id: s.id, priority: s.priority, text: s.interpretation })),
      },
      recommendation,
      alternatives: decision.alternatives,
      uncertainty: {
        items:
          decision.uncertainties.length > 0
            ? decision.uncertainties
            : [{ title: 'Sin incertidumbre relevante', detail: 'Los datos disponibles bastan para esta lectura.' }],
        confidence: decision.confidence,
      },
      conclusion: {
        summary: conclusionFor(lead, ctx),
        nextStep: decision.nextStep,
      },
      basedOnDemoData: decision.basedOnDemoData,
      generatedAt: now.toISOString(),
      engine,
    },
  }
}
