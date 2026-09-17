/**
 * Prompt conversacional de AXIS.
 *
 * El modelo NO recibe solo el mensaje del usuario: recibe un contexto
 * estructurado en cuatro niveles que nunca se mezclan:
 *
 *   DATOS ACTUALES        verdad objetiva calculada por Finax (+ señales, + mercado)
 *   MEMORIA               lo que el usuario aceptó que AXIS recordara (+ conclusiones previas)
 *   CONVERSACIÓN ACTUAL   resumen de lo antiguo + últimos mensajes
 *   CONSULTA ACTUAL       el mensaje que acaba de escribir
 *
 * El prompt de sistema (`AXIS_CHAT_SYSTEM_PROMPT`, ensamblado por bloques en
 * lib/axis/prompts) es estable (cacheable); todo lo variable va en el mensaje
 * de usuario como JSON.
 */
import { detectSignals } from '../rules'
import { AXIS_CHAT_SYSTEM_PROMPT } from '../prompts'
import type { AIRequest } from '../ai/provider'
import type { FinancialContext, Signal } from '../types'
import { AXIS_CHAT_SCHEMA } from './schema'
import type { ChatInput } from './types'

export { AXIS_CHAT_SYSTEM_PROMPT }

/**
 * Mismo contexto mínimo que el análisis: sin la serie diaria (abulta y no
 * aporta a la conversación). `historyDays` sale de `quality`, que conserva el
 * valor real aunque el transporte ya no envíe `flows.history`.
 */
function minimalContext(ctx: FinancialContext) {
  const { history: _history, ...flows } = ctx.flows
  void _history
  return { ...ctx, flows: { ...flows, historyDays: ctx.quality.historyDays } }
}

function signalSummary(signals: Signal[]) {
  return signals.map(({ id, priority, fact, interpretation }) => ({ id, priority, fact, interpretation }))
}

export function buildChatRequest(input: ChatInput): AIRequest {
  const { context, market, memory, conversation, message } = input
  const signals = detectSignals(context, market ?? null)
  const payload = {
    datos_actuales: {
      contexto_financiero: minimalContext(context),
      senales_detectadas_por_finax: signalSummary(signals),
      ...(market ? { contexto_de_mercado: market } : {}),
    },
    memoria: {
      memorias_del_usuario: memory?.userMemories ?? [],
      conclusiones_anteriores: memory?.previousConclusions ?? [],
    },
    conversacion_actual: {
      resumen_de_lo_anterior: conversation.summary,
      ultimos_mensajes: conversation.recent,
    },
    consulta_actual: message,
  }
  return {
    system: AXIS_CHAT_SYSTEM_PROMPT,
    user: `Responde a «consulta_actual» y devuelve el JSON de la respuesta.\n\n${JSON.stringify(payload)}`,
    schema: AXIS_CHAT_SCHEMA as unknown as Record<string, unknown>,
  }
}
