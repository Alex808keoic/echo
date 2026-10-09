/**
 * Respuesta local de la conversación (sin IA).
 *
 * Cuando la IA no está disponible, falla, no hay conexión o no hay cupo,
 * AXIS no finge: responde con el motor local de reglas y lo dice. No
 * interpreta la pregunta (no hay modelo de lenguaje): ofrece la lectura
 * determinista de los datos actuales. Nunca usa la memoria como dato; solo
 * aplica el perfil que el usuario declaró (`profileFromMemory`), como el análisis.
 */
import { analyzeLocally, LOCAL_RULES_ENGINE_INFO } from '../local-engine'
import { profileFromMemory } from '../profile/derive'
import { decide } from '../core/decision'
import { chatPlanOf, planLocalReply, PLAN_QUESTION } from '../plan/chat'
import { coachingTone, TONE_OPENER } from '../coaching'
import type { ChatInput, ChatReply, FallbackReason } from './types'

const REASON_INTRO: Record<FallbackReason, string> = {
  unavailable: 'Ahora mismo no tengo IA disponible, así que no puedo razonar sobre tu pregunta ni usar lo que me has contado.',
  offline: 'Sin conexión no puedo razonar sobre tu pregunta ni usar lo que me has contado.',
  'rate-limited': 'He agotado por ahora el cupo de consultas con IA; no puedo razonar sobre tu pregunta ni usar lo que me has contado.',
  error: 'No he podido completar la consulta con IA; no puedo razonar sobre tu pregunta ni usar lo que me has contado.',
  'no-data': 'Todavía no tengo datos suficientes para razonar sobre tu situación.',
}

export function composeLocalReply(input: ChatInput, reason: FallbackReason, now: Date = new Date()): ChatReply {
  const result = analyzeLocally({ context: input.context, market: input.market ?? null, profile: profileFromMemory(input.memory) }, now)
  const base = { confidence: 'baja' as const, memoryProposal: null, engine: LOCAL_RULES_ENGINE_INFO, fallbackReason: reason, generatedAt: now.toISOString() }

  if (result.status === 'no-analysis') {
    const needs = result.needs.map((n) => n.label.toLowerCase()).join(', ')
    return {
      ...base,
      text: `${REASON_INTRO['no-data']} ${result.message}${needs ? `\n\nPara empezar necesito: ${needs}.` : ''}`,
      nextStep: result.nextStep,
    }
  }

  // Preguntas sobre qué hacer con el dinero: el plan de reparto (determinista, como en «Tu plan»).
  if (PLAN_QUESTION.test(input.message)) {
    const plan = chatPlanOf(decide({ context: input.context, market: input.market ?? null, memory: input.memory }))
    return { ...base, text: `${REASON_INTRO[reason]} Esto es lo que dice tu plan:\n\n${planLocalReply(plan)}`, nextStep: { label: 'Ver tu plan', to: 'plan' } }
  }

  const { headline, interpretation, recommendation, conclusion } = result.analysis
  // Tono de coach (coaching.ts): la misma decisión que usa el chat con IA.
  const opener = TONE_OPENER[coachingTone(decide({ context: input.context, market: input.market ?? null, memory: input.memory })).tone]
  const parts = [
    `${REASON_INTRO[reason]} Con mis reglas locales, esto es lo que veo hoy en tus datos:`,
    ...(opener ? [opener] : []),
    `${headline.replace(/[.!?]$/, '')}. ${interpretation.summary}`,
    recommendation ? `${recommendation.what} ${recommendation.why}` : conclusion.summary,
  ]
  return { ...base, text: parts.join('\n\n'), nextStep: recommendation?.nextStep ?? conclusion.nextStep }
}
