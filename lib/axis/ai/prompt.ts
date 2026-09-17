/**
 * Prompt de AXIS para el proveedor de IA.
 *
 * La IA es una capa de interpretación sobre el motor local: recibe el
 * `FinancialContext` ya calculado y las señales detectadas por las reglas, y
 * debe razonar sobre ellos sin recalcular ni inventar. El prompt de sistema
 * (`AXIS_SYSTEM_PROMPT`, ensamblado por bloques en lib/axis/prompts) es
 * estable (cacheable); el contexto va en el mensaje de usuario.
 */
import { detectSignals } from '../rules'
import { AXIS_SYSTEM_PROMPT } from '../prompts'
import type { AxisInput, FinancialContext, Signal } from '../types'
import type { AIRequest } from './provider'
import { AXIS_OUTPUT_SCHEMA } from './schema'

export { AXIS_SYSTEM_PROMPT }

/**
 * Contexto mínimo que se envía: el `FinancialContext` sin la serie diaria (no
 * aporta a la lectura y abulta). `historyDays` sale de `quality`, que conserva
 * el valor real aunque el transporte ya no envíe `flows.history`.
 */
function minimalContext(ctx: FinancialContext) {
  const { history: _history, ...flows } = ctx.flows
  void _history
  return {
    ...ctx,
    flows: { ...flows, historyDays: ctx.quality.historyDays },
  }
}

function signalSummary(signals: Signal[]) {
  return signals.map(({ id, priority, fact, interpretation, recommendation }) => ({
    id,
    priority,
    fact,
    interpretation,
    recommendation: recommendation ? { what: recommendation.what, why: recommendation.why, to: recommendation.nextStep?.to } : null,
  }))
}

export function buildAIRequest(input: AxisInput): AIRequest {
  const { context, memory, market } = input
  const signals = detectSignals(context, market ?? null)
  const payload = {
    contexto_financiero: minimalContext(context),
    senales_detectadas_por_finax: signalSummary(signals),
    ...(market ? { contexto_de_mercado: market } : {}),
    ...(memory ? { memoria: memory } : {}),
  }
  return {
    system: AXIS_SYSTEM_PROMPT,
    user: `Analiza este contexto y devuelve el JSON del análisis.\n\n${JSON.stringify(payload)}`,
    schema: AXIS_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
  }
}
