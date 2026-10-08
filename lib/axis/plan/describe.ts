/**
 * Textos del plan de reparto (pantalla «Tu plan» y tarjeta de Inicio). Solo
 * presentación: los importes y el orden son los de `buildAllocationPlan`.
 * Nunca nombra productos: la inversión es una categoría.
 */
import { formatCents } from '../../money'
import type { ObjectiveContext } from '../types'
import { CUSHION_OBJECTIVE_NAME, LONG_TERM_CATEGORY, type AllocationPlan, type PlanStep } from './allocation'

/** Lo que la pantalla puede hacer desde un paso. */
export type StepAction = 'create-cushion' | 'move-cushion-first' | 'answer-profile' | 'register-data' | 'review-spending' | 'review-money'

export interface StepView {
  title: string
  detail?: string
  /** Aviso destacado (p. ej. objetivos que no llegan a tiempo). */
  warning?: string
  /** Nota informativa (no es un problema). */
  note?: string
  action?: { kind: StepAction; label: string }
}

const eur = (cents: number) => formatCents(cents)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const LONG_TERM_EXPLANATION =
  'Fondos que reparten tu dinero entre muchas empresas de todo el mundo, con comisiones bajas (por ejemplo, fondos indexados globales). Pueden bajar mucho en un año malo: solo son para dinero que no vayas a necesitar en más de 5 años.'

export const PLAN_DISCLAIMER =
  'Es un plan orientativo con reglas generales, no asesoramiento financiero personalizado. Finax no recomienda productos concretos ni el momento de comprar o vender.'

export function describeStep(step: PlanStep, plan: AllocationPlan, objectives: readonly ObjectiveContext[]): StepView {
  switch (step.kind) {
    case 'fix-negative-liquidity':
      return {
        title: 'Primero, vuelve a tener dinero líquido en positivo',
        detail: 'Con el líquido por debajo de cero no hay nada que repartir. Comprueba tu saldo inicial y tus movimientos.',
        action: { kind: 'review-money', label: 'Ver Mi Dinero' },
      }
    case 'reduce-spending':
      return {
        title: plan.blocker === 'no-surplus' ? 'Primero, consigue que te sobre algo cada mes' : 'Primero, gasta menos de lo que ingresas',
        detail: 'Mientras no ahorres, no hay nada que repartir. Mira en qué se va tu dinero.',
        action: { kind: 'review-spending', label: 'Ver estadísticas' },
      }
    case 'register-data':
      return {
        title: 'Faltan datos para preparar tu plan',
        detail: `Necesito al menos 3 meses completos con movimientos para saber cuánto gastas y ahorras. Faltan ${plural(step.monthsNeeded, 'mes', 'meses')}.`,
        action: { kind: 'register-data', label: 'Registrar movimientos' },
      }
    case 'create-cushion':
      return {
        title: `Crea tu «${CUSHION_OBJECTIVE_NAME}» de ${eur(step.targetCents)}`,
        detail:
          plan.cushion?.source === 'months'
            ? `Son ${plural(plan.cushion.months ?? 0, 'mes', 'meses')} de tu gasto habitual: dinero para imprevistos que no se toca. Podrás cambiar la cantidad.`
            : 'Es el mínimo de dinero líquido que quieres tener siempre. Podrás cambiar la cantidad.',
        action: { kind: 'create-cushion', label: 'Crearlo y ponerlo primero' },
      }
    case 'move-cushion-first':
      return {
        title: `Pon tu «${CUSHION_OBJECTIVE_NAME}» el primero`,
        detail: 'Así recibe tu dinero antes que tus otros objetivos.',
        action: { kind: 'move-cushion-first', label: 'Ponerlo primero' },
      }
    case 'fill-cushion':
      return {
        title: `${eur(step.monthlyCents)} al mes a tu colchón`,
        detail: `Te faltan ${eur(step.remainingCents)}: unos ${plural(step.months, 'mes', 'meses')} a tu ritmo de ahorro. Hasta tenerlo completo, no conviene invertir.`,
      }
    case 'short-term-objectives': {
      const names = step.objectiveIds.map((id) => objectives.find((o) => o.id === id)?.name).filter((n): n is string => Boolean(n))
      return {
        title: `${eur(step.monthlyCents)} al mes a tus objetivos cercanos`,
        detail: `${names.map((n) => `«${n}»`).join(', ')}: los necesitas en 2 años o menos, así que ese dinero no se arriesga.`,
        ...(step.atRisk ? { warning: 'Con tu ahorro actual no llegas a tiempo a todos. Plantéate ajustar la fecha o la meta.' } : {}),
      }
    }
    case 'invest-long-term':
      return {
        title: `${eur(step.monthlyCents)} al mes a largo plazo`,
        detail: `El ${step.pct} % de lo que te sobra, según tu perfil. Categoría: ${LONG_TERM_CATEGORY.label.toLowerCase()}.`,
        ...(step.adult === false ? { note: 'Como eres menor de edad, esta parte tendría que hacerla un adulto a tu nombre (por ejemplo, tus padres o tutores).' } : {}),
      }
    case 'rest-to-objectives':
      return {
        title: `${eur(step.monthlyCents)} al mes a tus objetivos`,
        detail: 'Se queda en tu dinero líquido y el reparto automático lo lleva a tus objetivos, en su orden.',
      }
    case 'answer-profile':
      return {
        title: 'Responde «Tu perfil» para saber qué parte invertir',
        detail: 'Con tus plazos y cómo llevas el riesgo, el plan puede proponerte una parte para el largo plazo.',
        action: { kind: 'answer-profile', label: 'Responder' },
      }
  }
}

export type SegmentKind = 'cushion' | 'short-term' | 'long-term' | 'objectives'

/** Reparto del ahorro mensual para la barra: solo pasos con importe. */
export function planSegments(plan: AllocationPlan): Array<{ kind: SegmentKind; label: string; cents: number }> {
  const out: Array<{ kind: SegmentKind; label: string; cents: number }> = []
  for (const s of plan.steps) {
    if (s.kind === 'fill-cushion') out.push({ kind: 'cushion', label: 'Colchón', cents: s.monthlyCents })
    else if (s.kind === 'short-term-objectives') out.push({ kind: 'short-term', label: 'Objetivos cercanos', cents: s.monthlyCents })
    else if (s.kind === 'invest-long-term') out.push({ kind: 'long-term', label: 'Largo plazo', cents: s.monthlyCents })
    else if (s.kind === 'rest-to-objectives') out.push({ kind: 'objectives', label: 'Tus objetivos', cents: s.monthlyCents })
  }
  return out.filter((s) => s.cents > 0)
}

/** Una línea para la tarjeta de Inicio: el primer paso. */
export function planHeadline(plan: AllocationPlan, objectives: readonly ObjectiveContext[]): string {
  const first = plan.steps[0]
  return first ? describeStep(first, plan, objectives).title : 'Tu plan está al día.'
}
