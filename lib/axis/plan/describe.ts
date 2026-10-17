/**
 * Textos del plan de reparto (pantalla «Tu plan» y tarjeta de Inicio). Solo
 * presentación: los importes y el orden son los de `buildAllocationPlan`.
 * Nunca nombra productos: la inversión es una categoría.
 */
import { formatCents } from '../../money'
import { MIN_USUAL_EXPENSE_MONTHS } from '../rules/shared'
import type { ObjectiveContext } from '../types'
import { CUSHION_OBJECTIVE_NAME, type AllocationPlan, type PlanStep } from './allocation'
import { RISKY_MAX_PCT, type MixPart, type SleeveKey } from './mix'

/** Lo que la pantalla puede hacer desde un paso. */
export type StepAction = 'create-cushion' | 'move-cushion-first' | 'answer-profile' | 'register-data' | 'review-spending' | 'review-money' | 'review-objectives' | 'review-memories'

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

/** Qué es cada tipo de la mezcla (pantalla «Tu plan»). */
export const SLEEVE_EXPLANATION: Record<SleeveKey, string> = {
  'global-equity': LONG_TERM_EXPLANATION,
  bonds: 'Préstamos a estados y empresas que pagan un interés (por ejemplo, fondos de renta fija). Se mueven menos que las acciones: dan estabilidad a la mezcla.',
  risky: `Acciones de empresas concretas, sectores, criptomonedas… Pueden subir mucho o perderlo casi todo: solo dinero que podrías perder entero, y nunca más del ${RISKY_MAX_PCT} % de lo que inviertes.`,
}

/** «a renta variable global…», «a la parte arriesgada…». */
const toPart = (p: MixPart) => `${p.key === 'risky' ? 'a la' : 'a'} ${p.label.charAt(0).toLowerCase()}${p.label.slice(1)}`
const mixAmounts = (mix: readonly MixPart[]) => mix.map((p) => `${eur(p.cents)} ${toPart(p)}`).join(', ')

/** «Repartido así: …» (una sola parte: «Todo a …»). */
function mixSentence(mix: readonly MixPart[]): string {
  if (mix.length === 1) return `Todo ${toPart(mix[0])}.`
  return `Repartido así: ${mixAmounts(mix)}.`
}

function riskyWarning(mix: readonly MixPart[]): { warning?: string } {
  const risky = mix.find((p) => p.key === 'risky')
  return risky ? { warning: `La parte arriesgada (${eur(risky.cents)}) es dinero que podrías perder entero. Tu perfil lo permite, pero no hace falta: puedes ponerla también en renta variable global.` } : {}
}

function minorNote(adult: boolean | null, mix: readonly MixPart[]): { note?: string } {
  if (adult !== false) return {}
  const risky = mix.some((p) => p.key === 'risky') ? ' Las plataformas de acciones sueltas y de criptomonedas suelen exigir tener 18 años.' : ''
  return { note: `Como eres menor de edad, esta parte tendría que hacerla un adulto a tu nombre (por ejemplo, tus padres o tutores).${risky}` }
}

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
        detail: `Necesito al menos ${plural(MIN_USUAL_EXPENSE_MONTHS, 'mes completo', 'meses completos')} con movimientos para saber cuánto gastas y ahorras. ${step.monthsNeeded === 1 ? 'Falta' : 'Faltan'} ${plural(step.monthsNeeded, 'mes', 'meses')}.`,
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
    case 'invest-long-term': {
      const why = step.noObjectives ? ', según tu perfil y porque no tienes objetivos pendientes: ese dinero no tiene otro destino' : ', según tu perfil'
      return {
        title: `${eur(step.monthlyCents)} al mes a largo plazo`,
        detail: `El ${step.pct} % de lo que te sobra${why}. ${mixSentence(step.mix)}`,
        ...riskyWarning(step.mix),
        ...minorNote(step.adult, step.mix),
      }
    }
    case 'idle-money':
      if (step.safe)
        return {
          title: `Tienes ${eur(step.idleCents)} sin destino`,
          detail:
            'No lo necesitan ni tu colchón ni tus objetivos. Como esperas necesitar tu dinero en menos de 2 años, mejor en ahorro seguro: una cuenta remunerada, un depósito o Letras del Tesoro (mira «Ahorro seguro» en la Guía).',
        }
      return {
        title: `Tienes ${eur(step.idleCents)} sin destino`,
        detail: `No lo necesitan ni tu colchón ni tus objetivos. Puedes invertirlo con la misma mezcla, como prefieras: de una vez o poco a poco, ${eur(step.perMonthCents)} al mes durante ${plural(step.spreadMonths, 'mes', 'meses')}. Poco a poco reduce el riesgo de entrar justo antes de una caída; de una vez, el dinero empieza antes a trabajar. Tú eliges. De una vez sería: ${mixAmounts(step.mix)}.`,
        ...riskyWarning(step.mix),
        ...minorNote(step.adult, step.mix),
      }
    case 'rest-to-objectives':
      if (step.noObjectives)
        return {
          title: `${eur(step.monthlyCents)} al mes se quedan en tu dinero líquido`,
          detail: 'No tienes objetivos pendientes. Si creas uno, el reparto automático le llevará este dinero; si no, cuando se acumule, tu plan te propondrá qué hacer con él.',
        }
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
    case 'forecast-basis':
      return {
        title: 'Plan provisional con tu ingreso previsto',
        detail: `Aún no tienes ${plural(MIN_USUAL_EXPENSE_MONTHS, 'mes completo', 'meses completos')} con movimientos, así que uso tu ingreso fijo previsto (${eur(step.recurringIncomeCents)} al mes) menos lo que gastaste en tu último mes completo (${eur(step.spendingCents)}). Es una previsión: no se suma a tu dinero.`,
        note: `${step.monthsNeeded === 1 ? 'Falta' : 'Faltan'} ${plural(step.monthsNeeded, 'mes', 'meses')} para que el plan salga de tus datos reales.`,
        action: { kind: 'register-data', label: 'Registrar movimientos' },
      }
    case 'follow-priority': {
      const name = (id: string) => objectives.find((o) => o.id === id)?.name ?? 'otro objetivo'
      const ahead = step.aheadIds.map((id) => `«${name(id)}»`)
      return {
        title: `Dijiste que «${name(step.objectiveId)}» es tu prioridad`,
        detail: `En el reparto va en el ${step.rank}.º lugar: antes recibe${ahead.length === 1 ? '' : 'n'} dinero ${ahead.join(', ')}. Si sigue siendo lo primero para ti, súbelo en Objetivos.`,
        action: { kind: 'review-objectives', label: 'Ordenar objetivos' },
      }
    }
    case 'review-notes':
      return {
        title: step.count === 1 ? 'Tienes 1 nota que tu plan todavía no usa' : `Tienes ${step.count} notas que tu plan todavía no usa`,
        detail:
          'El plan solo cambia con datos concretos, no con texto libre. Convierte cada nota en un dato (ingreso, mínimo líquido, plazo, riesgo…) o en un objetivo para que cuente; si alguna no tiene que ver con tu dinero, márcala como que no cuenta.',
        action: { kind: 'review-memories', label: 'Revisar notas' },
      }
  }
}

export type SegmentKind = 'cushion' | 'short-term' | 'long-term' | 'long-term-bonds' | 'long-term-risky' | 'objectives'

const SEGMENT_OF: Record<SleeveKey, { kind: SegmentKind; label: string }> = {
  'global-equity': { kind: 'long-term', label: 'Renta variable global' },
  bonds: { kind: 'long-term-bonds', label: 'Renta fija' },
  risky: { kind: 'long-term-risky', label: 'Parte arriesgada' },
}

/** Reparto del ahorro mensual para la barra: solo pasos con importe. */
export function planSegments(plan: AllocationPlan): Array<{ kind: SegmentKind; label: string; cents: number }> {
  const out: Array<{ kind: SegmentKind; label: string; cents: number }> = []
  for (const s of plan.steps) {
    if (s.kind === 'fill-cushion') out.push({ kind: 'cushion', label: 'Colchón', cents: s.monthlyCents })
    else if (s.kind === 'short-term-objectives') out.push({ kind: 'short-term', label: 'Objetivos cercanos', cents: s.monthlyCents })
    else if (s.kind === 'invest-long-term') for (const p of s.mix) out.push({ ...SEGMENT_OF[p.key], cents: p.cents })
    else if (s.kind === 'rest-to-objectives') out.push({ kind: 'objectives', label: s.noObjectives ? 'Se queda en tu líquido' : 'Tus objetivos', cents: s.monthlyCents })
  }
  return out.filter((s) => s.cents > 0)
}

/** Una línea para la tarjeta de Inicio: el primer paso. */
export function planHeadline(plan: AllocationPlan, objectives: readonly ObjectiveContext[]): string {
  const first = plan.steps[0]
  return first ? describeStep(first, plan, objectives).title : 'Tu plan está al día.'
}
