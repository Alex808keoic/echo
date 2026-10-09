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
import { decide } from '../core/decision'
import { chatPlanOf, planForPrompt } from '../plan/chat'
import { coachingTone, TONE_GUIDE } from '../coaching'
import { profileFromMemory, reconcileProfile } from '../profile/derive'
import { AXIS_CHAT_SYSTEM_PROMPT } from '../prompts'
import type { AIRequest } from '../ai/provider'
import type { FinancialContext, Signal } from '../types'
import { AXIS_CHAT_SCHEMA } from './schema'
import { historyForPrompt } from './financial-history'
import type { ChatInput } from './types'

export { AXIS_CHAT_SYSTEM_PROMPT }

/**
 * Mismo contexto mínimo que el análisis: sin la serie diaria (abulta y no
 * aporta a la conversación). `historyDays` sale de `quality`, que conserva el
 * valor real aunque el transporte ya no envíe `flows.history`.
 */
function minimalContext(ctx: FinancialContext) {
  // `closedMonths` es dato interno de las previsiones: el modelo no lo recibe como cifra.
  const { history: _history, closedMonths: _closed, ...flows } = ctx.flows
  void _history
  void _closed
  return { ...ctx, flows: { ...flows, historyDays: ctx.quality.historyDays } }
}

function signalSummary(signals: Signal[]) {
  return signals.map(({ id, priority, fact, interpretation }) => ({ id, priority, fact, interpretation }))
}

export function buildChatRequest(input: ChatInput): AIRequest {
  const { context, market, memory, conversation, message, history } = input
  const signals = detectSignals(context, market ?? null, reconcileProfile(profileFromMemory(memory), context))
  // La misma decisión que el análisis y la validación: de ella salen el plan y el tono.
  const decision = decide({ context, market: market ?? null, memory })
  const payload = {
    datos_actuales: {
      contexto_financiero: minimalContext(context),
      senales_detectadas_por_finax: signalSummary(signals),
      ...(market ? { contexto_de_mercado: market } : {}),
      // Movimientos reales ya resumidos por Finax: para preguntas sobre meses anteriores o el mayor gasto.
      ...(history ? { historico_de_movimientos: historyForPrompt(history) } : {}),
      // Plan de reparto de Finax (fase 2d): recalculado aquí con los mismos datos; ningún dato nuevo.
      plan_de_reparto: planForPrompt(chatPlanOf(decision)),
      // Tono de coach decidido por Finax (coaching.ts), no por el modelo.
      tono_sugerido: TONE_GUIDE[coachingTone(decision).tone],
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
