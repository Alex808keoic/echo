/**
 * Plan de reparto en la conversación (fase 2d). El plan no viaja desde el
 * cliente: se recalcula en cada lado con `decide` sobre el mismo contexto y la
 * misma memoria que ya recibe el chat, así que no sale ningún dato nuevo.
 *
 * - `planForPrompt`: lo que ve el modelo, con los MISMOS textos que la
 *   pantalla «Tu plan» (`describeStep`), para que no haya dos versiones.
 * - `planFigures`: las cifras de esos textos, que el chat puede citar.
 * - `planLocalReply`: el plan en texto, para la respuesta sin IA.
 */
import type { AllowedFigure } from '../core/figures'
import { extractFigures } from '../core/figures'
import type { AxisDecision } from '../types'
import { buildAllocationPlan, type AllocationPlan } from './allocation'
import { describeStep, PLAN_DISCLAIMER } from './describe'

export interface ChatPlan {
  plan: AllocationPlan
  /** Pasos del plan con sus textos, en orden. */
  steps: Array<{ title: string; detail?: string; warning?: string; note?: string }>
}

export function chatPlanOf(decision: AxisDecision): ChatPlan {
  const plan = buildAllocationPlan(decision)
  const steps = plan.steps.map((s) => {
    const v = describeStep(s, plan, decision.context.objectives)
    return { title: v.title, ...(v.detail ? { detail: v.detail } : {}), ...(v.warning ? { warning: v.warning } : {}), ...(v.note ? { note: v.note } : {}) }
  })
  return { plan, steps }
}

/** Bloque `plan_de_reparto` del prompt del chat. */
export function planForPrompt({ plan, steps }: ChatPlan) {
  return {
    estado: plan.status === 'ready' ? 'listo' : 'bloqueado',
    ...(plan.monthly ? { ahorro_habitual_al_mes: plan.monthly.savingsCents / 100, gasto_habitual_al_mes: plan.monthly.spendingCents / 100 } : {}),
    invierte_este_mes: plan.longTerm.monthlyCents > 0,
    pasos: steps.map((s, i) => ({
      orden: i + 1,
      titulo: s.title,
      ...(s.detail ? { detalle: s.detail } : {}),
      ...(s.warning ? { aviso: s.warning } : {}),
      ...(s.note ? { nota: s.note } : {}),
    })),
  }
}

/** Cifras de los textos del plan (las mismas que ve el usuario en «Tu plan»): el chat puede citarlas. */
export function planFigures({ steps }: ChatPlan): AllowedFigure[] {
  const texts = steps.flatMap((s) => [s.title, s.detail ?? '', s.warning ?? '', s.note ?? ''])
  return texts.flatMap((t) =>
    extractFigures(t).flatMap((f): AllowedFigure[] => {
      const n = Number(f.key.slice(2))
      if (f.kind === 'money') return [{ key: f.key, kind: 'money', cents: Math.round(n * 100), text: f.raw.trim(), label: 'Plan de reparto', source: 'decision-text' }]
      if (f.kind === 'percent' || f.kind === 'count') return [{ key: f.key, kind: f.kind, value: n, text: f.raw.trim(), label: 'Plan de reparto', source: 'decision-text' }]
      return []
    }),
  )
}

/** Preguntas sobre qué hacer con el dinero: la respuesta local enseña el plan. */
/**
 * Solo las explícitas («mi plan», «¿cuánto invierto?», «¿qué hago con mi
 * dinero?»). Una pregunta sobre el ahorro de un objetivo («¿cuánto tendría que
 * ahorrar al mes?») la responde mejor la lectura de AXIS.
 */
export const PLAN_QUESTION =
  /(?:\b(?:mi|tu|el|este) plan\b|\bplan de reparto\b|\brepart\w*|\binvert\w*|\binviert\w*|\binversi[oó]n\w*|\bfondo de emergencia\b|\bqu[eé] (?:hago|hacer) con (?:mi |el )?(?:dinero|ahorro)\b|\bd[oó]nde (?:meto|pongo|guardo) (?:mi |el )?(?:dinero|ahorro)\b)/i

/** El plan en texto, para la respuesta sin IA. */
export function planLocalReply({ steps }: ChatPlan): string {
  const lines = steps.map((s, i) => `${i + 1}. ${s.title}.${s.detail ? ` ${s.detail}` : ''}${s.warning ? ` ${s.warning}` : ''}${s.note ? ` ${s.note}` : ''}`)
  return `Tu plan de este mes, según tus datos:\n\n${lines.join('\n')}\n\n${PLAN_DISCLAIMER}`
}
