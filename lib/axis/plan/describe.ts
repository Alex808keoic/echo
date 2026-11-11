/**
 * Textos del plan de reparto (pantalla «Tu plan» y tarjeta de Inicio). Solo
 * presentación: los importes y el orden son los de `buildAllocationPlan`.
 * Nunca nombra productos: la inversión es una categoría.
 */
import { formatCents } from '../../money'
import { MIN_USUAL_EXPENSE_MONTHS } from '../rules/shared'
import type { ObjectiveContext } from '../types'
import { CUSHION_OBJECTIVE_NAME, type AllocationPlan, type PlanStep } from './allocation'
import { RISKY_MAX_PCT, REBALANCE_SELL_MONTHS, isSmallSplit, type MixPart, type SleeveKey } from './mix'
import { idleLossSentence, inflationPhrase } from './inflation'
import type { DataIssue } from './data-checks'

/** Lo que la pantalla puede hacer desde un paso. */
export type StepAction = 'create-cushion' | 'move-cushion-first' | 'raise-cushion' | 'answer-profile' | 'register-data' | 'review-spending' | 'review-money' | 'review-objectives' | 'review-memories' | 'review-debts' | 'review-investments'

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

/**
 * De una vez frente a poco a poco, sin presentarlas como iguales (decidido el 2026-11-02): con los datos
 * históricos, de una vez sale mejor unas 2 de cada 3 veces; poco a poco sirve sobre todo para estar tranquilo.
 */
export const LUMP_SUM_NOTE =
  'Con los datos históricos, invertir de una vez ha salido mejor unas 2 de cada 3 veces: el dinero empieza antes a trabajar y la bolsa sube más años de los que baja. Poco a poco sirve sobre todo para estar más tranquilo, porque si llega una caída justo después te pilla con menos dentro. Las dos opciones son razonables y ninguna garantiza nada.'

export const LONG_TERM_EXPLANATION =
  'Fondos que reparten tu dinero entre muchas empresas de todo el mundo, con comisiones bajas (por ejemplo, fondos indexados globales). Pueden bajar mucho en un año malo: solo son para dinero que no vayas a necesitar en más de 5 años.'

/** Qué es cada tipo de la mezcla (pantalla «Tu plan»). */
export const SLEEVE_EXPLANATION: Record<SleeveKey, string> = {
  'global-equity': LONG_TERM_EXPLANATION,
  bonds: 'Préstamos a estados y empresas que pagan un interés (por ejemplo, fondos de renta fija). Se mueven menos que las acciones: dan estabilidad a la mezcla. Si puedes necesitar el dinero en menos de 5 años, mejor de corto plazo (bonos que vencen en 1 a 3 años): se mueven aún menos cuando cambian los tipos de interés.',
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

/** Aportación pequeña repartida en varias partes (`isSmallSplit`): un solo fondo o juntar meses. La Guía dice lo mismo. */
export const SMALL_SPLIT_NOTE =
  'Con importes tan pequeños no hace falta un fondo para cada parte: un solo fondo mixto (o perfilado) que ya combine acciones y bonos en una proporción parecida a la tuya hace el reparto por ti y se reequilibra solo. Compara su comisión total con la de dos fondos indexados por separado; si sale mucho más cara, otra opción es juntar varios meses y aportar a cada parte de una vez.'

export function smallSplitNote(mix: readonly MixPart[]): string | null {
  return isSmallSplit(mix) ? SMALL_SPLIT_NOTE : null
}

/** Junta las notas de un paso de invertir (menor de edad, importes pequeños…) en una sola. */
function joinNotes(...notes: Array<string | null | undefined>): { note?: string } {
  const list = notes.filter((n): n is string => Boolean(n))
  return list.length > 0 ? { note: list.join(' ') } : {}
}

/** Objetivo «sigue creciendo» cercano con un perfil de plazo medio: la mezcla lleva más renta fija hasta que lo aclares. */
const MEDIUM_HORIZON_NOTE = ' Como en tu perfil dijiste que necesitarás tu dinero en 2 a 5 años, la mezcla lleva más renta fija hasta que lo aclares (mira el paso «¿Vas a usar el dinero…?»).'

/**
 * «No llega», con cifras (2026-11-08, revisión como asesor): a dónde llegarías al ritmo de hoy, sin contar
 * lo que rinda, y cuánto haría falta al mes. Solo con fecha en todos los objetivos del paso; si no, la frase general.
 */
export function goalGapWarning(step: { monthlyCents: number; objectiveIds: readonly string[] }, objectives: readonly ObjectiveContext[]): string {
  const generic = 'Con tu ahorro de ahora no llega para lo que haría falta cada mes: tendrás menos de lo previsto en la fecha o tendrás que moverla.'
  const goals = objectives.filter((o) => step.objectiveIds.includes(o.id))
  if (goals.length === 0 || goals.some((o) => o.monthsLeft === undefined || o.monthsLeft <= 0)) return generic
  const months = Math.max(...goals.map((o) => Math.floor(o.monthsLeft as number)))
  const target = goals.reduce((t, o) => t + o.targetCents, 0)
  const reached = Math.min(target, goals.reduce((t, o) => t + Math.max(0, o.currentCents), 0) + step.monthlyCents * months)
  // Con los meses exactos que quedan, como `requiredMonthlyCents` del contexto: así dice lo mismo que AXIS
  // (2026-11-11: el plan decía 131 € al mes y AXIS 129 € para el mismo objetivo, por dividir entre 31 y no 31,6).
  const needed = goals.reduce((t, o) => t + Math.ceil(o.remainingCents / Math.max(1, o.monthsLeft as number) / 100) * 100, 0)
  const round = (c: number) => Math.round(c / 1_000) * 1_000
  if (reached >= target) return generic
  return `Con tu ahorro de ahora llegarías a la fecha con unos ${eur(round(reached))} de ${eur(target)}, sin contar lo que rinda. Para llegar harían falta unos ${eur(needed)} al mes: lo que ahorres de más (una paga más alta, un trabajo puntual) acerca la meta; si no, tendrás menos o tendrás que mover la fecha.`
}

/** Por qué ese dinero puede invertirse; con objetivos de los dos tipos, sin decir de todos lo que solo vale para unos. */
function goalLead(step: { keepGrowing?: true; mixedGoals?: true }): string {
  if (step.keepGrowing) return 'No lo vas a gastar al llegar la fecha, sino que sigue creciendo'
  if (step.mixedGoals) return 'Unos no los vas a gastar en su fecha y a los otros les faltan más de 5 años'
  return 'Faltan más de 5 años'
}

/**
 * Debajo de «Ahorras al mes» y «Para gastar» en un plan provisional: de dónde sale cada cifra, la misma cuenta
 * que el paso «Plan provisional» (2026-11-11, QA: decía «ingreso menos lo gastado en tu último mes» con 35 € de
 * ingreso, 37 € de gasto y 11 € de ahorro, porque el ahorro salía del último mes y el gasto del ritmo).
 */
export function forecastCaption(plan: Pick<AllocationPlan, 'steps'>): string {
  const basis = plan.steps.find((s): s is Extract<PlanStep, { kind: 'forecast-basis' }> => s.kind === 'forecast-basis')
  if (!basis) return 'Previsión: tu ingreso fijo previsto menos lo que gastaste en tu último mes completo.'
  if (basis.lastMonthSavingsCents !== undefined)
    return 'Previsión: lo que te sobra es lo que ahorraste de verdad en tu último mes completo. «Para gastar» es tu ritmo de gasto de todos los días, algo más alto por prudencia: solo se usa para tu colchón.'
  const income = basis.lastMonthIncomeCents !== undefined ? 'lo que ingresaste en tu último mes completo' : 'tu ingreso fijo previsto'
  const spending =
    basis.spendingFrom === 'pace'
      ? 'tu ritmo de gasto de todos los días que llevas apuntando'
      : basis.spendingFrom === 'fixed'
        ? 'tus gastos fijos de «Fijos»'
        : basis.spendingFrom === 'current-month'
          ? 'lo que llevas gastado este mes (sin lo puntual)'
          : 'lo que gastaste en tu último mes completo'
  return `Previsión: ${income} menos ${spending}.`
}

export const PLAN_DISCLAIMER =
  'Es un plan orientativo con reglas generales, no asesoramiento financiero personalizado. Finax no recomienda productos concretos: cuando propone vender o adelantar dinero, es por tipos de inversión y con reglas fijas, nunca una predicción del mercado.'

/** Impuestos al mover dinero entre inversiones en España (regla general, a nivel de tipo). */
export const SELL_TAX_NOTE =
  'Si son fondos de inversión, hazlo con un traspaso de un fondo a otro: en España no pagas impuestos al cambiar. Si son ETF, acciones o criptomonedas, vender tributa por lo que hayas ganado (del 19 % al 30 %).'

/** «la renta variable global», «la renta fija», «la parte arriesgada». */
const sleeveName = (key: SleeveKey) => `la ${SEGMENT_OF[key].label.toLowerCase()}`

export function describeStep(step: PlanStep, plan: AllocationPlan, contextObjectives: readonly ObjectiveContext[]): StepView {
  // Con el colchón que propone el plan, los objetivos como quedarán (`objectivesAfterCushion`).
  const objectives = plan.objectivesAfterCushion ?? contextObjectives
  switch (step.kind) {
    case 'fix-negative-liquidity':
      return {
        title: 'Primero, vuelve a tener dinero líquido en positivo',
        detail: 'Con el líquido por debajo de cero no hay nada que repartir. Comprueba tu saldo inicial y tus movimientos.',
        action: { kind: 'review-money', label: 'Ver tu dinero' },
      }
    case 'reduce-spending':
      if (step.withSavings)
        return {
          title: 'Este mes no te sobra nada, pero ya tienes dinero que repartir',
          detail: 'Tu ingreso habitual no cubre tu gasto habitual, así que no hay ahorro nuevo cada mes. Lo que ya tienes sí: abajo te digo qué hacer con ello. Los extras (trabajos, regalos) entran en tu dinero y el plan los reparte igual.',
          note: 'Si gastas un poco menos de lo que ingresas cada mes, el plan también repartirá ese ahorro.',
          action: { kind: 'review-spending', label: 'Ver tus gastos' },
        }
      return {
        title: plan.blocker === 'no-surplus' ? 'Primero, consigue que te sobre algo cada mes' : 'Primero, gasta menos de lo que ingresas',
        detail: plan.steps.some((s) => s.kind === 'create-cushion' || s.kind === 'move-cushion-first' || s.kind === 'raise-cushion')
          ? 'Mientras no ahorres, no hay ahorro nuevo que repartir. Con lo que ya tienes, lo primero es tu colchón para imprevistos (abajo). Mira en qué se va tu dinero.'
          : 'Mientras no ahorres, no hay nada que repartir. Mira en qué se va tu dinero.',
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
    case 'extras-split': {
      const parts = step.weights.map((w) => `${w.pct} % a ${w.label.charAt(0).toLowerCase()}${w.label.slice(1)}`).join(', ')
      return {
        title: 'Cada vez que cobres un extra',
        detail: `Tus ingresos cambian, así que la mayor parte de tu ahorro llegará con extras (trabajos, regalos). Con cada uno: apúntalo en Movimientos; si tu colchón no está completo, va primero ahí; lo demás, ${parts}. Si es menos de ${eur(step.minCents)}, déjalo en la cuenta y júntalo con el siguiente: invertir importes tan pequeños no compensa.`,
        ...(step.adult === false ? { note: 'Como eres menor de edad, la parte de invertir tendría que hacerla un adulto a tu nombre (por ejemplo, tus padres o tutores).' } : {}),
      }
    }
    case 'raise-cushion':
      return {
        title: `Sube tu «${CUSHION_OBJECTIVE_NAME}» a ${eur(step.suggestedCents)}`,
        detail: `Ahora es de ${eur(step.targetCents)}, pero tu gasto es de unos ${eur(step.spendingCents)} al mes: ${plural(step.months, 'mes', 'meses')} de gasto son ${eur(step.suggestedCents)}. Con una meta más baja, un imprevisto te haría tocar el dinero de tus objetivos.`,
        note: 'El dinero de la diferencia sale de tus otros objetivos: no gastas nada, solo cambia para qué está apartado.',
        action: { kind: 'raise-cushion', label: `Subirlo a ${eur(step.suggestedCents)}` },
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
        detail: `${names.map((n) => `«${n}»`).join(', ')}: los necesitas en 5 años o menos, así que ese dinero no se arriesga: mejor en ahorro seguro (cuenta remunerada, depósito o Letras del Tesoro).`,
        ...(step.atRisk ? { warning: goalGapWarning(step, objectives) } : {}),
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
      return {
        title: `${eur(step.monthlyCents)} al mes a largo plazo`,
        detail: `El ${step.pct} % de lo que te sobra${why}. ${mixSentence(step.mix)}${rebalance}`,
        ...riskyWarning(step.mix),
        ...joinNotes(drawdown, minorNote(step.adult, step.mix).note, smallSplitNote(step.mix)),
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
    if (step.boost) {
      const b = step.boost
      return {
        title: `La bolsa ha caído: invierte ya ${eur(b.nowCents)} de tus ${eur(step.idleCents)} sin destino`,
        detail: `No lo necesitan ni tu colchón ni tus objetivos. El ${b.label} ha caído un ${pctText(Math.abs(b.dropPct))} en un mes y decidiste aprovechar las caídas: con la bolsa más barata, el mismo dinero compra más. Tu plan propone adelantar la mitad ahora y el resto, ${eur(b.restPerMonthCents)} al mes durante ${plural(step.spreadMonths, 'mes', 'meses')}. Ahora sería: ${mixAmounts(b.mix)}.`,
        warning: 'Que haya caído no garantiza que no siga bajando: por eso solo se adelanta la mitad y nunca el colchón ni el dinero de tus objetivos.',
        ...minorNote(step.adult, b.mix),
      }
    }
    {
      const loss = plan.inflation ? idleLossSentence(step.idleCents, plan.inflation) : null
      return {
        title: `Tienes ${eur(step.idleCents)} sin destino`,
        detail: `No lo necesitan ni tu colchón ni tus objetivos. Puedes invertirlo con la misma mezcla, de una vez o poco a poco: ${eur(step.perMonthCents)} al mes durante ${plural(step.spreadMonths, 'mes', 'meses')}. ${LUMP_SUM_NOTE} Tú eliges. De una vez sería: ${mixAmounts(step.mix)}.${loss ? ` ${loss}` : ''}`,
        ...riskyWarning(step.mix),
        ...minorNote(step.adult, step.mix),
      }
    }
    case 'invest-for-goals': {
      const names = step.objectiveIds.map((id) => objectives.find((o) => o.id === id)?.name).filter((n): n is string => Boolean(n))
      const list = names.length > 0 ? names.map((n) => `«${n}»`).join(', ') : 'tus objetivos lejanos'
      return {
        title: `Para ${list}, invierte ${eur(step.monthlyCents)} al mes`,
        detail: `${goalLead(step)}: este ahorro va invertido y cuenta para ${names.length === 1 ? 'ese objetivo' : 'esos objetivos'} desde el primer día. Es lo que falta repartido entre los meses que quedan, sin contar con lo que rinda: si rinde, llegas antes. Sería: ${mixAmounts(step.mix)}.${step.mediumHorizon ? MEDIUM_HORIZON_NOTE : ''}`,
        ...(step.atRisk ? { warning: goalGapWarning(step, objectives) } : {}),
        ...joinNotes(minorNote(step.adult, step.mix).note, smallSplitNote(step.mix)),
      }
    }
    case 'move-goal-to-safe': {
      const name = objectives.find((o) => o.id === step.objectiveId)?.name ?? 'tu objetivo'
      return {
        title: `Pasa a ahorro seguro lo invertido para «${name}»`,
        detail:
          step.spreadMonths > 1
            ? `Faltan unos ${plural(step.monthsLeft, 'mes', 'meses')} y tienes ${eur(step.investedCents)} invertidos para este objetivo. Una caída ahora ya no tendría tiempo de recuperarse: pásalos poco a poco, unos ${eur(step.perMonthCents)} al mes durante ${plural(step.spreadMonths, 'mes', 'meses')}, a ahorro seguro (cuenta remunerada, depósito o Letras del Tesoro). Apúntalo en Inversiones con el tipo «Ahorro seguro»: así sigue contando para el objetivo.`
            : `Faltan unos ${plural(step.monthsLeft, 'mes', 'meses')} y tienes ${eur(step.investedCents)} invertidos para este objetivo. Ya no hay tiempo de recuperarse de una caída: pásalos a ahorro seguro (cuenta remunerada, depósito o Letras del Tesoro) y apúntalo en Inversiones con el tipo «Ahorro seguro». A menos de un año de la fecha, lo invertido que pueda bajar deja de contar para el objetivo.`,
        action: { kind: 'review-investments', label: 'Ir a Inversiones' },
      }
    }
    case 'goal-cash-to-safe': {
      const names = step.objectiveIds.map((id) => objectives.find((o) => o.id === id)?.name).filter((n): n is string => Boolean(n))
      const list = names.length > 0 ? names.map((n) => `«${n}»`).join(', ') : 'tus objetivos'
      return {
        title: `Pasa a ahorro seguro los ${eur(step.cents)} de ${list}`,
        detail: `Es dinero que no conviene invertir en bolsa, porque lo necesitarás en pocos años, pero quieto en la cuenta pierde frente a la inflación. En ahorro seguro (cuenta remunerada, depósito, Letras del Tesoro o un fondo monetario) no baja y da algo de interés. Apúntalo en Inversiones con el tipo «Ahorro seguro»: sigue contando para ${names.length === 1 ? 'ese objetivo' : 'esos objetivos'}.`,
        ...(step.adult === false ? { note: 'Como eres menor de edad, la cuenta o el depósito tendría que abrirlo un adulto a tu nombre (por ejemplo, tus padres o tutores).' } : {}),
        action: { kind: 'review-investments', label: 'Ir a Inversiones' },
      }
    }
    case 'overdue-goal': {
      const goal = objectives.find((o) => o.id === step.objectiveId)
      const name = goal?.name ?? 'tu objetivo'
      return {
        title: `La fecha de «${name}» ya pasó`,
        detail: `Si ya lo usaste, márcalo como conseguido en Objetivos: lo que tiene apartado${goal && goal.currentCents > 0 ? ` (${eur(goal.currentCents)})` : ''} quedará libre para lo demás. Si todavía no, ponle una fecha nueva para que el plan sepa cuánto apartar cada mes.`,
        action: { kind: 'review-objectives', label: 'Ir a Objetivos' },
      }
    }
    case 'invest-goal-money': {
      const names = step.objectiveIds.map((id) => objectives.find((o) => o.id === id)?.name).filter((n): n is string => Boolean(n))
      const list = names.length > 0 ? names.map((n) => `«${n}»`).join(', ') : 'tus objetivos lejanos'
      return {
        title: `Puedes invertir los ${eur(step.cents)} de ${list}`,
        detail: `${goalLead(step)}, así que no hace falta tenerlos en la cuenta: invertidos siguen contando para ${names.length === 1 ? 'ese objetivo' : 'esos objetivos'} y tienen tiempo de crecer más que la inflación. Puede ser de una vez o poco a poco, ${eur(step.perMonthCents)} al mes durante ${plural(step.spreadMonths, 'mes', 'meses')}. ${LUMP_SUM_NOTE} Tú eliges. De una vez sería: ${mixAmounts(step.mix)}.${step.mediumHorizon ? MEDIUM_HORIZON_NOTE : ''} ${step.keepGrowing ? 'Lo invertido puede bajar, pero como no lo necesitas en la fecha, tiene tiempo de recuperarse. Tu colchón cubre los imprevistos y crece solo si tus gastos suben.' : step.mixedGoals ? 'Lo invertido puede bajar; para los que sí gastarás en su fecha, unos 3 años antes tu plan te propondrá pasarlo poco a poco a ahorro seguro.' : 'Lo invertido puede bajar; unos 3 años antes de la fecha, tu plan te propondrá pasarlo poco a poco a ahorro seguro.'}`,
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
    case 'confirm-horizon': {
      const names = step.objectiveIds.map((id) => objectives.find((o) => o.id === id)?.name).filter((n): n is string => Boolean(n))
      const list = names.length > 0 ? names.map((n) => `«${n}»`).join(', ') : 'tu objetivo'
      return {
        title: `¿Vas a usar el dinero de ${list} en su fecha?`,
        detail: step.shortProfile
          ? `Lo marcaste como «sigue creciendo», pero en tu perfil dijiste que necesitarás tu dinero en menos de 2 años. Las dos cosas no encajan, y cambian mucho cuánto conviene arriesgar: la bolsa ha tardado a veces de 2 a 6 años en recuperarse de una caída. Mientras no lo aclares, tu plan no lo invierte: lo trata como dinero que vas a usar pronto.`
          : `Lo marcaste como «sigue creciendo», pero en tu perfil dijiste que necesitarás tu dinero en 2 a 5 años. Las dos cosas no encajan, y cambian mucho cuánto conviene arriesgar: la bolsa ha tardado a veces de 2 a 6 años en recuperarse de una caída. Mientras no lo aclares, tu plan usa la mezcla de tu plazo, con más renta fija.`,
        note: 'Si de verdad no lo vas a tocar, cambia en «Tu perfil» cuándo necesitarás el dinero a «más de 5 años» y la mezcla pasará a la de largo plazo. Si sí lo vas a usar en la fecha, quítale la marca «sigue creciendo» en Objetivos.',
        action: { kind: 'answer-profile', label: 'Revisar tu plazo' },
      }
    }
    case 'answer-profile':
      return {
        title: 'Responde «Tu perfil» para saber qué parte invertir',
        detail: 'Con tus plazos y cómo llevas el riesgo, el plan puede proponerte una parte para el largo plazo.',
        action: { kind: 'answer-profile', label: 'Responder' },
      }
    case 'forecast-basis': {
      // De dónde sale el gasto: el último mes completo, o algo más alto si ese mes se quedaba corto.
      const spent =
        step.spendingFrom === 'fixed'
          ? `tus gastos fijos de «Fijos» (${eur(step.spendingCents)} al mes, más que lo que apuntaste en tu último mes completo)`
          : step.spendingFrom === 'current-month'
            ? `lo que llevas gastado este mes (${eur(step.spendingCents)}, ya más que en tu último mes completo)`
            : step.spendingFrom === 'pace'
              ? `tu ritmo de gasto de todos los días que llevas apuntando (${eur(step.spendingCents)} al mes, más que en tu último mes completo)`
              : null
      return {
        title: 'Plan provisional con tu ingreso previsto',
        detail:
          step.lastMonthIncomeCents !== undefined
            ? `Aún no tienes ${plural(MIN_USUAL_EXPENSE_MONTHS, 'mes completo', 'meses completos')} con movimientos, así que uso lo que ingresaste en tu último mes completo (${eur(step.lastMonthIncomeCents)}, más que tu ingreso fijo de ${eur(step.recurringIncomeCents)}) menos ${spent ?? `lo que gastaste ese mes (${eur(step.spendingCents)})`}. Es una previsión: no se suma a tu dinero.`
            : `Aún no tienes ${plural(MIN_USUAL_EXPENSE_MONTHS, 'mes completo', 'meses completos')} con movimientos, así que uso tu ingreso fijo previsto (${eur(step.recurringIncomeCents)} al mes) menos ${spent ?? `lo que gastaste en tu último mes completo (${eur(step.spendingCents)})`}. Es una previsión: no se suma a tu dinero.`,
        note: [
          step.lastMonthSavingsCents !== undefined
            ? `Ese ritmo solo lo uso para tu colchón, por prudencia. Lo que te sobra cada mes (${eur(step.lastMonthSavingsCents)}) sale de lo que de verdad ahorraste en tu último mes completo: los primeros días que apuntaste, estirados a un mes entero, dirían que no ahorras, y tus datos dicen que sí.`
            : null,
          `${step.monthsNeeded === 1 ? 'Falta' : 'Faltan'} ${plural(step.monthsNeeded, 'mes', 'meses')} para que el plan salga de tus datos reales.`,
        ]
          .filter(Boolean)
          .join(' '),
        action: { kind: 'register-data', label: 'Registrar movimientos' },
      }
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
    case 'trim-risky':
      return {
        title: `Tu parte arriesgada ya es el ${step.heldPct.risky} % de lo invertido`,
        detail: `${step.gainCents > 0 ? `Ha subido mucho (ganas ${eur(step.gainCents)} sobre lo que pusiste) y es buen momento para recoger beneficios. ` : ''}El tope es el ${Math.max(RISKY_MAX_PCT, step.targetPct.risky)} %: tu plan propone vender unos ${eur(step.sellCents)} de la parte arriesgada y pasarlos ${step.to.length === 1 ? toPart(step.to[0]) : `a lo diversificado: ${mixAmounts(step.to)}`}. Así, si se da la vuelta, no arrastra a todo lo demás.`,
        note: SELL_TAX_NOTE,
        action: { kind: 'review-investments', label: 'Ver mis inversiones' },
      }
    case 'rebalance-sell': {
      const to = step.to[0]
      return {
        title: `Pasa ${eur(step.sellCents)} de ${sleeveName(step.from)} a ${to ? sleeveName(to.key) : 'lo que falta'}`,
        detail: `Ahora tienes ${pctSentence(step.heldPct)}, y tu mezcla es ${pctSentence(step.targetPct)}. Con lo que inviertes cada mes tardarías más de ${plural(REBALANCE_SELL_MONTHS / 12, 'año', 'años')} en corregirlo, así que tu plan propone mover ese dinero. Es la forma disciplinada de vender caro y comprar barato: lo que más ha subido paga lo que se ha quedado atrás, y vuelves al riesgo que elegiste.`,
        note: SELL_TAX_NOTE,
        action: { kind: 'review-investments', label: 'Ver mis inversiones' },
      }
    }
    case 'stale-values':
      return {
        title: step.count === 1 ? 'Actualiza el valor de tu inversión' : `Actualiza el valor de tus ${step.count} inversiones`,
        detail: `Finax no consulta cotizaciones: las caídas y subidas solo cuentan si apuntas el valor. ${step.count === 1 ? 'Es' : 'El más antiguo es'} de hace ${plural(step.oldestDays, 'día', 'días')}: con valores viejos, tu plan puede no ver una caída o una subida que ya ha pasado.`,
        action: { kind: 'review-investments', label: 'Ver mis inversiones' },
      }
    case 'risky-drop':
      return {
        title: `«${step.name}» ha caído un ${pctText(Math.abs(step.changePct))}`,
        detail:
          'Es de tu parte arriesgada: una acción concreta, un sector o una criptomoneda. A diferencia de un fondo que reparte tu dinero entre miles de empresas de todo el mundo, puede no recuperarse nunca. Antes de meterle más dinero, revisa por qué ha caído: si es toda la bolsa o algo de esa inversión en concreto.',
        note: 'Mientras tanto, tu plan no mete dinero nuevo en la parte arriesgada. Lo diversificado sigue igual.',
        action: { kind: 'review-investments', label: 'Ver mis inversiones' },
      }
    case 'review-notes':
      return {
        title: step.count === 1 ? 'Tienes 1 nota que tu plan todavía no usa' : `Tienes ${step.count} notas que tu plan todavía no usa`,
        detail:
          'El plan solo cambia con datos concretos, no con texto libre. Convierte cada nota en un dato (ingreso, mínimo líquido, plazo, riesgo…) o en un objetivo para que cuente; si alguna no tiene que ver con tu dinero, márcala como que no cuenta.',
        action: { kind: 'review-memories', label: 'Revisar notas' },
      }
    case 'check-data': {
      const n = step.issues.length
      const movementsFirst = step.issues.some((i) => i.kind !== 'goal-differs-from-memory')
      return {
        title: n === 1 ? 'Revisa un dato que parece mal apuntado' : `Revisa ${n} datos que parecen mal apuntados`,
        detail: step.issues.map(dataIssueSentence).join(' '),
        note: 'Finax no cambia nada por su cuenta: si está bien así, déjalo. Tu plan sale de lo que apuntas, así que un dato mal puesto cambia lo que te propone.',
        action: movementsFirst ? { kind: 'register-data', label: 'Ver movimientos' } : { kind: 'review-objectives', label: 'Ver objetivos' },
      }
    }
  }
}

/** «12/10» */
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`

/** Una frase por dato que parece mal apuntado: qué se ve, por qué importa y qué hacer. */
export function dataIssueSentence(issue: DataIssue): string {
  switch (issue.kind) {
    case 'loan-as-expense':
      return `«${issue.label}» (${eur(issue.cents)}, el ${shortDate(issue.date)}) parece dinero que dejaste a alguien: si es así, edítalo y cámbialo a «Adelanto», porque no es un gasto tuyo y ahora sube tu gasto habitual. Cuando te lo devuelvan, pulsa «Ya me lo ha devuelto» en el movimiento.`
    case 'habitual-marked-one-off': {
      const why = issue.reason === 'subscription' ? 'es una suscripción' : issue.reason === 'fixed' ? 'sale de uno de tus fijos' : 'se repite en otros meses'
      return `«${issue.label}» (${eur(issue.cents)}, el ${shortDate(issue.date)}) está marcado como puntual, pero ${why}: si lo pagas cada mes, quítale la marca. Si no, tu plan cree que gastas menos de lo que gastas.`
    }
    case 'goal-differs-from-memory':
      return issue.closest
        ? `Le contaste a AXIS «${issue.said}», pero tu objetivo «${issue.closest.name}» es de ${eur(issue.closest.targetCents)}: cambia el objetivo o la nota para que digan lo mismo.`
        : `Le contaste a AXIS «${issue.said}», pero no tienes ningún objetivo de ${eur(issue.saidCents)}: créalo para que tu plan lo tenga en cuenta, o cambia la nota.`
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
    else if (s.kind === 'invest-long-term' || s.kind === 'invest-for-goals') for (const p of s.mix) out.push({ ...SEGMENT_OF[p.key], cents: p.cents })
    else if (s.kind === 'rest-to-objectives') out.push({ kind: 'objectives', label: s.noObjectives ? 'Se queda en tu líquido' : 'Tus objetivos', cents: s.monthlyCents })
  }
  return out.filter((s) => s.cents > 0)
}

/** Una línea para la tarjeta de Inicio: el primer paso. */
export function planHeadline(plan: AllocationPlan, objectives: readonly ObjectiveContext[]): string {
  const first = plan.steps[0]
  return first ? describeStep(first, plan, objectives).title : 'Tu plan está al día.'
}
