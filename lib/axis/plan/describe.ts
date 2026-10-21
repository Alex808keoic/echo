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
import { idleLossSentence, inflationPhrase } from './inflation'

/** Lo que la pantalla puede hacer desde un paso. */
export type StepAction = 'create-cushion' | 'move-cushion-first' | 'answer-profile' | 'register-data' | 'review-spending' | 'review-money' | 'review-objectives' | 'review-memories' | 'review-debts'

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
/** «8,5 %» */
export const pctText = (pct: number) => `${String(Math.round(pct * 10) / 10).replace('.', ',')} %`
/** «2 años y 3 meses», «8 meses». */
export function durationText(months: number): string {
  if (months < 12) return plural(months, 'mes', 'meses')
  const y = Math.floor(months / 12)
  const m = months % 12
  return m === 0 ? plural(y, 'año', 'años') : `${plural(y, 'año', 'años')} y ${plural(m, 'mes', 'meses')}`
}
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

/** «70 % renta variable global y 30 % renta fija» (solo los tipos con peso). */
function pctSentence(pct: Record<SleeveKey, number>): string {
  const parts = (Object.keys(SEGMENT_OF) as SleeveKey[]).filter((k) => pct[k] > 0).map((k) => `${pct[k]} % ${SEGMENT_OF[k].label.toLowerCase()}`)
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}

/** El colchón no se invierte, pero puede protegerse algo de la inflación sin dejar de estar disponible. */
function cushionInflationNote(plan: AllocationPlan): { note?: string } {
  if (!plan.inflation) return {}
  return { note: `Puede estar en una cuenta remunerada o en Letras del Tesoro: sigue disponible y le afecta menos ${inflationPhrase(plan.inflation)}.` }
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
        action: { kind: 'review-money', label: 'Ver tu dinero' },
      }
    case 'reduce-spending':
      return {
        title: plan.blocker === 'no-surplus' ? 'Primero, consigue que te sobre algo cada mes' : 'Primero, gasta menos de lo que ingresas',
        detail: 'Mientras no ahorres, no hay nada que repartir. Mira en qué se va tu dinero.',
        action: { kind: 'review-spending', label: 'Ver tus gastos' },
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
        ...cushionInflationNote(plan),
        action: { kind: 'create-cushion', label: 'Crearlo y ponerlo primero' },
      }
    case 'move-cushion-first':
      return {
        title: `Pon tu «${CUSHION_OBJECTIVE_NAME}» el primero`,
        detail: 'Así recibe tu dinero antes que tus otros objetivos.',
        action: { kind: 'move-cushion-first', label: 'Ponerlo primero' },
      }
    case 'fill-cushion':
      if (step.starter)
        return {
          title: `${eur(step.monthlyCents)} al mes a un colchón mínimo`,
          detail: `Te faltan ${eur(step.remainingCents)} para tener un mes de gasto apartado: unos ${plural(step.months, 'mes', 'meses')}. Con eso cubierto, tu ahorro irá a devolver tus deudas caras; el colchón completo, después.`,
        }
      return {
        title: `${eur(step.monthlyCents)} al mes a tu colchón`,
        detail: `Te faltan ${eur(step.remainingCents)}: unos ${plural(step.months, 'mes', 'meses')} a tu ritmo de ahorro. Hasta tenerlo completo, no conviene invertir.`,
        ...cushionInflationNote(plan),
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
      const rebalance = step.rebalance
        ? ` Ahora tienes ${pctSentence(step.rebalance.heldPct)}, y tu mezcla es ${pctSentence(step.rebalance.targetPct)}: por eso este mes va a lo que falta, sin vender nada.`
        : ''
      const drawdown =
        step.drawdownPct !== undefined
          ? `Tus inversiones valen un ${step.drawdownPct} % menos de lo que aportaste. Con un plazo largo es normal pasar por años malos: el plan no cambia por una caída.`
          : null
      const notes = [drawdown, minorNote(step.adult, step.mix).note].filter((n): n is string => Boolean(n))
      return {
        title: `${eur(step.monthlyCents)} al mes a largo plazo`,
        detail: `El ${step.pct} % de lo que te sobra${why}. ${mixSentence(step.mix)}${rebalance}`,
        ...riskyWarning(step.mix),
        ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
      }
    }
    case 'idle-money':
      if (step.safe)
        return {
          title: `Tienes ${eur(step.idleCents)} sin destino`,
          detail:
            'No lo necesitan ni tu colchón ni tus objetivos. Como esperas necesitar tu dinero en menos de 2 años, mejor en ahorro seguro: una cuenta remunerada, un depósito o Letras del Tesoro (mira «Ahorro seguro» en la Guía).' +
            (plan.inflation ? ` Ahí rinde algo y compensa en parte ${inflationPhrase(plan.inflation)}.` : ''),
        }
    {
      const loss = plan.inflation ? idleLossSentence(step.idleCents, plan.inflation) : null
      return {
        title: `Tienes ${eur(step.idleCents)} sin destino`,
        detail: `No lo necesitan ni tu colchón ni tus objetivos. Puedes invertirlo con la misma mezcla, como prefieras: de una vez o poco a poco, ${eur(step.perMonthCents)} al mes durante ${plural(step.spreadMonths, 'mes', 'meses')}. Poco a poco reduce el riesgo de entrar justo antes de una caída; de una vez, el dinero empieza antes a trabajar. Tú eliges. De una vez sería: ${mixAmounts(step.mix)}.${loss ? ` ${loss}` : ''}`,
        ...riskyWarning(step.mix),
        ...minorNote(step.adult, step.mix),
      }
    }
    case 'rest-to-objectives':
      if (step.noObjectives)
        return {
          title: `${eur(step.monthlyCents)} al mes se quedan en tu dinero líquido`,
          detail:
            'No tienes objetivos pendientes. Si creas uno, el reparto automático le llevará este dinero; si no, cuando se acumule, tu plan te propondrá qué hacer con él.' +
            (plan.inflation ? ` Mientras tanto, quieto en la cuenta pierde valor con ${inflationPhrase(plan.inflation)}.` : ''),
        }
      return {
        title: `${eur(step.monthlyCents)} al mes a tus objetivos`,
        detail: 'Se queda en tu dinero líquido y el reparto automático lo lleva a tus objetivos, en su orden.',
      }
    case 'pay-debt': {
      const vs =
        step.expectedReturnPct !== null
          ? `más de lo que cabe esperar de tu mezcla de inversión (unos ${pctText(step.expectedReturnPct)} al año, y sin garantía)`
          : 'más de lo que suele rendir una inversión razonable, y sin garantía'
      const effect =
        step.months !== null
          ? ` Así la terminas en unos ${durationText(step.months)}${step.monthsSaved ? ` (${durationText(step.monthsSaved)} antes que solo con la cuota)` : ''}${step.interestSavedCents ? `, y te ahorras unos ${eur(step.interestSavedCents)} en intereses` : ''}.`
          : ''
      const notes = [
        step.lumpSumCents > 0
          ? `Mejor aún: podrías devolver ${eur(step.lumpSumCents)} de una vez con tu dinero líquido, sin tocar tu colchón ni lo apartado para objetivos cercanos. Lo de tus objetivos lejanos rinde menos de lo que te cuesta esta deuda.`
          : null,
        step.otherDebts > 0 ? `Cuando termines, el plan irá a por la siguiente deuda cara (${plural(step.otherDebts, 'te queda otra', 'te quedan otras')}).` : null,
      ].filter((n): n is string => Boolean(n))
      return {
        title: `${eur(step.monthlyCents)} al mes para devolver antes «${step.name}»`,
        detail: `Además de la cuota. Te cuesta un ${pctText(step.aprPct)} al año: devolverla es ganar ese ${pctText(step.aprPct)} seguro, ${vs}. Quedan ${eur(step.balanceCents)}.${effect} Pregunta a tu banco si amortizar antes tiene comisión.`,
        ...(step.objectivesWaiting ? { warning: 'Mientras tanto, tus objetivos no reciben ahorro nuevo y no se invierte: es lo que más te rinde ahora.' } : {}),
        ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
        action: { kind: 'review-debts', label: 'Ver mis deudas' },
      }
    }
    case 'debt-choice':
      return {
        title: `¿Invertir o devolver antes «${step.name}»?`,
        detail: `Tu deuda cuesta un ${pctText(step.aprPct)} al año y tu mezcla podría rendir unos ${pctText(step.expectedReturnPct)}, sin garantía. Por eso el plan sigue invirtiendo, pero si prefieres lo seguro, puedes usar los ${eur(step.investMonthlyCents)} al mes del largo plazo para devolverla antes: es ganar un ${pctText(step.aprPct)} seguro. Las dos opciones son razonables.`,
        action: { kind: 'review-debts', label: 'Ver mis deudas' },
      }
    case 'debt-load':
      return {
        title: `Tus cuotas se llevan el ${step.pct} % de tus ingresos`,
        detail: `Pagas ${eur(step.paymentsCents)} al mes de cuotas con unos ingresos de ${eur(step.incomeCents)}. Por encima del 35 % es mucha carga: antes de pedir otro préstamo o financiar una compra, conviene bajarla.`,
        warning: 'No pidas más préstamos mientras tanto.',
        action: { kind: 'review-debts', label: 'Ver mis deudas' },
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

export type SegmentKind = 'cushion' | 'short-term' | 'long-term' | 'long-term-bonds' | 'long-term-risky' | 'objectives' | 'debt'

const SEGMENT_OF: Record<SleeveKey, { kind: SegmentKind; label: string }> = {
  'global-equity': { kind: 'long-term', label: 'Renta variable global' },
  bonds: { kind: 'long-term-bonds', label: 'Renta fija' },
  risky: { kind: 'long-term-risky', label: 'Parte arriesgada' },
}

/** Reparto del ahorro mensual para la barra: solo pasos con importe. */
export function planSegments(plan: AllocationPlan): Array<{ kind: SegmentKind; label: string; cents: number }> {
  const out: Array<{ kind: SegmentKind; label: string; cents: number }> = []
  for (const s of plan.steps) {
    if (s.kind === 'fill-cushion') out.push({ kind: 'cushion', label: s.starter ? 'Colchón mínimo' : 'Colchón', cents: s.monthlyCents })
    else if (s.kind === 'pay-debt') out.push({ kind: 'debt', label: 'Devolver deudas', cents: s.monthlyCents })
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
