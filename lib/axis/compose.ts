/**
 * Redacción local del análisis: `AxisDecision` → `AxisResult`.
 *
 * Aquí no se decide nada. Lo que merece atención, la recomendación, las
 * alternativas, las incertidumbres y la confianza vienen ya fijadas por
 * `decide()` (core/decision.ts); esta capa solo pone palabras: titular,
 * resumen de la interpretación y conclusión, con el tono de AXIS.
 */
import { eur, pct } from './rules/shared'
import type { AxisDecision, AxisEngineInfo, AxisResult, DecidedRecommendation, FinancialContext, Signal } from './types'

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

/** Cierre cuando AXIS recomienda algo que no sale de la señal líder: ese es el paso pendiente. */
const PENDING_STEP = 'el único paso pendiente es el que te recomiendo.'

/**
 * Conclusión coherente con la decisión: depende de la señal líder Y de la
 * recomendación (que puede venir de otra señal, la primera que recomiende).
 * Con recomendación nunca dice que no haga falta actuar; sin ella nunca
 * propone un cambio. Seguimiento (vigilar, observar) vale en ambos casos.
 */
function conclusionFor(top: Signal | null, recommendation: DecidedRecommendation | null, ctx: FinancialContext): string {
  if (!top) return 'Nada que cambiar por ahora. Sigue registrando movimientos y vuelve a consultar el mes que viene.'
  const leadRecommends = top.recommendation !== undefined
  switch (top.priority) {
    case 'critical':
      return 'Prioridad: volver a un balance mensual positivo antes de plantear ahorro o inversión.'
    case 'high':
      if (leadRecommends) return 'Conviene actuar sobre este punto este mes; el resto puede esperar.'
      return recommendation
        ? `Conviene vigilar este punto el mes que viene; ${PENDING_STEP}`
        : 'Conviene vigilar este punto el mes que viene antes de hacer cambios importantes.'
    case 'medium':
      if (ctx.quality.level === 'limited') {
        return 'Situación razonable, pero con poco histórico: conviene observar el siguiente periodo antes de un cambio importante.'
      }
      if (leadRecommends) return 'Situación estable. Un ajuste moderado en el punto señalado mejoraría tu margen.'
      return recommendation
        ? `Situación estable. Conviene seguir de cerca el punto señalado; ${PENDING_STEP}`
        : 'Situación estable. Conviene seguir de cerca el punto señalado; por ahora no hace falta cambiar nada.'
    default:
      return recommendation
        ? `Situación estable con los datos disponibles. No hay nada urgente; ${PENDING_STEP}`
        : 'Situación estable con los datos disponibles. No hace falta actuar; mantén el ritmo.'
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
        summary: conclusionFor(lead, recommendation, ctx),
        nextStep: decision.nextStep,
      },
      basedOnDemoData: decision.basedOnDemoData,
      generatedAt: now.toISOString(),
      engine,
    },
  }
}
