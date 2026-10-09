/**
 * Tarjetas de acción del chat (parte 4b). Las calcula Finax, nunca el modelo:
 * salen del plan de reparto y de la decisión, igual con IA que sin ella, y se
 * añaden en el dispositivo (el esquema de la IA no cambia).
 *
 * - Solo aparecen cuando la pregunta va de qué hacer con el dinero o hay algo
 *   importante que atender (señal principal crítica o alta): no en cada respuesta.
 * - Como mucho `MAX_CHAT_ACTIONS`, sin repetir el siguiente paso de la respuesta.
 * - Las que cambian datos («crear el Fondo de emergencia», «ponerlo primero»)
 *   nunca se ejecutan al tocarlas: la pantalla pide confirmación antes.
 */
import { decide } from '../core/decision'
import { buildAllocationPlan, type AllocationPlan } from '../plan/allocation'
import { PLAN_QUESTION } from '../plan/chat'
import type { AxisDecision } from '../types'
import type { ChatInput, ChatReply } from './types'

export type ChatActionTarget = 'plan' | 'memoria' | 'movimientos' | 'estadisticas' | 'dinero' | 'objetivos'

export type ChatAction =
  | { kind: 'navigate'; label: string; to: ChatActionTarget }
  /** Crea el «Fondo de emergencia» el primero del reparto (con confirmación). */
  | { kind: 'create-cushion'; label: string; targetCents: number }
  /** Pone el «Fondo de emergencia» existente el primero (con confirmación). */
  | { kind: 'move-cushion-first'; label: string; objectiveId: string }

export const MAX_CHAT_ACTIONS = 2

/** Acción del primer paso del plan, si tiene una. */
function planStepAction(plan: AllocationPlan): ChatAction | null {
  const first = plan.steps[0]
  switch (first?.kind) {
    case 'create-cushion':
      return { kind: 'create-cushion', label: 'Crear Fondo de emergencia', targetCents: first.targetCents }
    case 'move-cushion-first':
      return { kind: 'move-cushion-first', label: 'Poner el Fondo de emergencia primero', objectiveId: first.objectiveId }
    case 'answer-profile':
      return { kind: 'navigate', label: 'Responder «Tu perfil»', to: 'memoria' }
    case 'register-data':
      return { kind: 'navigate', label: 'Registrar movimientos', to: 'movimientos' }
    case 'reduce-spending':
      return { kind: 'navigate', label: 'Ver en qué gastas', to: 'estadisticas' }
    case 'fix-negative-liquidity':
      return { kind: 'navigate', label: 'Revisar Mi Dinero', to: 'dinero' }
    default:
      return null
  }
}

/** ¿Merece esta respuesta tarjetas de acción? */
function wantsActions(message: string, decision: AxisDecision): boolean {
  const lead = decision.lead?.priority
  return PLAN_QUESTION.test(message) || lead === 'critical' || lead === 'high'
}

export function chatActions(input: ChatInput, reply: Pick<ChatReply, 'nextStep'>, decision: AxisDecision = decide({ context: input.context, market: input.market ?? null, memory: input.memory })): ChatAction[] {
  if (decision.level === 'none' || !wantsActions(input.message, decision)) return []
  const plan = buildAllocationPlan(decision)
  // Además del suelto «answer-profile» al final del plan: si falta el perfil, también se ofrece.
  const answerProfile = plan.steps.some((s) => s.kind === 'answer-profile') ? ({ kind: 'navigate', label: 'Responder «Tu perfil»', to: 'memoria' } as const) : null
  const candidates: Array<ChatAction | null> = [planStepAction(plan), { kind: 'navigate', label: 'Ver tu plan', to: 'plan' }, answerProfile]
  const out: ChatAction[] = []
  for (const a of candidates) {
    if (!a || out.length >= MAX_CHAT_ACTIONS) continue
    // Sin duplicados, ni con el siguiente paso que ya trae la respuesta.
    if (a.kind === 'navigate' && (reply.nextStep?.to === a.to || out.some((o) => o.kind === 'navigate' && o.to === a.to))) continue
    if (out.some((o) => o.kind === a.kind && o.kind !== 'navigate')) continue
    out.push(a)
  }
  return out
}

/** La respuesta con sus tarjetas (si las merece). */
export function withChatActions(reply: ChatReply, input: ChatInput): ChatReply {
  const actions = chatActions(input, reply)
  return actions.length > 0 ? { ...reply, actions } : reply
}
