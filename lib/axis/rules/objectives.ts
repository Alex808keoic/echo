/**
 * Reglas de objetivos: conseguido, cerca, retrasado respecto a su fecha,
 * esfuerzo mensual necesario, sin progreso.
 *
 * Perfil:
 *   - `irregularIncome`: `objectives.pace` compara el ritmo necesario con el
 *     ahorro de un solo mes; con ingresos irregulares, su incertidumbre lo
 *     dice. Solo cambia ese texto: ni prioridad, ni recomendación, ni alternativa.
 *   - `priorities`: los objetivos se recorren con los priorizados primero, en
 *     su orden; así, a igual prioridad de señal, la del objetivo priorizado
 *     lidera (y su recomendación es la elegida). Cada objetivo produce la
 *     misma señal que sin prioridades: ninguna aparece, desaparece ni cambia
 *     de prioridad; un objetivo vencido sigue vencido esté o no priorizado.
 */
import type { Signal } from '../types'
import { eur, irregularIncomeOf, pct, prioritiesOf, rankByPriorities, THRESHOLDS, type Rule } from './shared'

/** Objetivo al que pertenece una señal `objectives.<tipo>:<id>`. */
const objectiveIdOf = (s: Signal) => s.id.slice(s.id.indexOf(':') + 1)

export const objectiveRules: Rule = (ctx, _market, profile) => {
  const signals: Signal[] = []
  const monthlySavings = ctx.flows.current.savingsCents
  const irregular = irregularIncomeOf(profile)
  const priorities = prioritiesOf(profile)

  for (const o of priorities ? rankByPriorities(ctx.objectives, priorities.ids) : ctx.objectives) {
    if (o.completed) {
      signals.push({
        id: `objectives.completed:${o.id}`,
        domain: 'objectives',
        priority: 'low',
        fact: `«${o.name}» está conseguido: ${eur(o.currentCents)} de ${eur(o.targetCents)}.`,
        interpretation: 'Ya no necesita más aportaciones; lo que ahorres a partir de ahora puede tener otro destino.',
        recommendation: {
          what: `Decide el siguiente destino de tu ahorro ahora que «${o.name}» está cubierto.`,
          why: 'Seguir aportando a un objetivo cumplido no añade nada; un objetivo nuevo sí da dirección.',
          nextStep: { label: 'Ver objetivos', to: 'objetivos' },
          action: { verb: 'decide', target: 'none' },
        },
      })
      continue
    }

    if (o.targetDate !== undefined && o.monthsLeft !== undefined && o.monthsLeft <= 0) {
      signals.push({
        id: `objectives.overdue:${o.id}`,
        domain: 'objectives',
        priority: 'high',
        fact: `«${o.name}» ha pasado su fecha objetivo y va por el ${pct(o.progressPct)}: faltan ${eur(o.remainingCents)}.`,
        interpretation: 'La fecha ya no es alcanzable tal como está; el objetivo necesita una fecha o una meta nuevas.',
        recommendation: {
          what: `Ajusta la fecha o la cantidad de «${o.name}» para que vuelva a ser un plan real.`,
          why: 'Un objetivo con fecha vencida deja de orientar el ahorro.',
          nextStep: { label: 'Editar objetivo', to: 'objetivos' },
          action: { verb: 'adjust', target: 'objective', targetId: o.id },
        },
      })
      continue
    }

    if (o.requiredMonthlyCents !== undefined && o.monthsLeft !== undefined) {
      const months = Math.max(1, Math.round(o.monthsLeft))
      const feasible = monthlySavings > 0 && o.requiredMonthlyCents <= monthlySavings
      signals.push({
        id: `objectives.pace:${o.id}`,
        domain: 'objectives',
        priority: feasible ? 'low' : 'high',
        fact: `Para llegar a «${o.name}» en ${months} ${months === 1 ? 'mes' : 'meses'} harían falta unos ${eur(o.requiredMonthlyCents)} al mes (faltan ${eur(o.remainingCents)}).`,
        interpretation: feasible
          ? `Tu ahorro de este mes (${eur(monthlySavings)}) cubre ese ritmo.`
          : monthlySavings > 0
            ? `Tu ahorro de este mes (${eur(monthlySavings)}) no llega a ese ritmo.`
            : 'Este mes no hay ahorro con el que sostener ese ritmo.',
        recommendation: feasible
          ? undefined
          : {
              what: `Elige entre aplazar la fecha de «${o.name}», reducir la meta o aumentar la aportación mensual.`,
              why: 'Las tres opciones son válidas; lo que no funciona es mantener un plan que las cifras no sostienen.',
              nextStep: { label: 'Editar objetivo', to: 'objetivos' },
              action: { verb: 'adjust', target: 'objective', targetId: o.id },
            },
        alternative: feasible
          ? undefined
          : {
              name: 'Mantener la fecha',
              summary: 'Es posible si el ahorro mensual sube de forma estable, no solo un mes.',
            },
        uncertainty: {
          title: 'Ritmo basado en un solo mes',
          detail: irregular
            ? 'La aportación mensual necesaria se compara con el ahorro de este mes; con ingresos irregulares, un solo mes es aún menos representativo.'
            : 'La aportación mensual necesaria se compara con el ahorro de este mes, que puede no ser representativo.',
        },
        ...(irregular
          ? { profileInfluence: [{ field: 'irregularIncome', sourceMemoryId: irregular.sourceMemoryId, signalId: `objectives.pace:${o.id}`, effect: 'uncertainty' }] }
          : {}),
      })
      continue
    }

    if (o.progressPct >= THRESHOLDS.objectiveNearPct) {
      signals.push({
        id: `objectives.near:${o.id}`,
        domain: 'objectives',
        priority: 'medium',
        fact: `«${o.name}» está al ${pct(o.progressPct)}: faltan ${eur(o.remainingCents)}.`,
        interpretation: 'Está a un paso; un último esfuerzo lo cierra.',
        recommendation: {
          what: `Reserva los ${eur(o.remainingCents)} que faltan para cerrar «${o.name}».`,
          why: 'Cerrar un objetivo libera el ahorro siguiente para otra cosa.',
          nextStep: { label: 'Ver objetivos', to: 'objetivos' },
          action: { verb: 'reserve', target: 'objective', targetId: o.id },
        },
      })
      continue
    }

    if (o.currentCents === 0 && o.ageDays >= THRESHOLDS.objectiveStaleDays) {
      signals.push({
        id: `objectives.stale:${o.id}`,
        domain: 'objectives',
        priority: 'medium',
        fact: `«${o.name}» lleva ${o.ageDays} días sin ninguna aportación (meta: ${eur(o.targetCents)}).`,
        interpretation: 'Un objetivo sin progreso durante semanas suele ser una meta mal dimensionada o sin prioridad real.',
        recommendation: {
          what: `Decide si «${o.name}» sigue siendo prioritario; si lo es, fija una aportación mensual realista.`,
          why: 'Un objetivo que no avanza no orienta el ahorro.',
          nextStep: { label: 'Editar objetivo', to: 'objetivos' },
          action: { verb: 'decide', target: 'objective', targetId: o.id },
        },
      })
      continue
    }

    if (o.targetDate === undefined) {
      signals.push({
        id: `objectives.no-date:${o.id}`,
        domain: 'objectives',
        priority: 'low',
        fact: `«${o.name}» va por el ${pct(o.progressPct)} y le faltan ${eur(o.remainingCents)}.`,
        interpretation: 'Avanza, pero sin fecha no hay un ritmo con el que compararlo.',
        uncertainty: {
          title: `Sin fecha en «${o.name}»`,
          detail: 'No puedo valorar si el ritmo actual permite alcanzarlo a tiempo. Una fecha objetivo lo haría posible.',
        },
      })
    }
  }

  if (!priorities) return signals

  // Influencia solo donde las prioridades han cambiado algo de verdad: una señal de un objetivo
  // priorizado que, entre las de su misma prioridad, ahora va por delante de otra que sin
  // prioridades la precedía (el orden original es el del contexto).
  const originalIndex = new Map(ctx.objectives.map((o, i) => [o.id, i]))
  const originalOrder = [...signals].sort((a, b) => (originalIndex.get(objectiveIdOf(a)) ?? 0) - (originalIndex.get(objectiveIdOf(b)) ?? 0))
  const samePriority = (list: Signal[], s: Signal) => list.filter((t) => t.priority === s.priority)
  return signals.map((s) => {
    const objectiveId = objectiveIdOf(s)
    if (!priorities.ids.includes(objectiveId)) return s
    const ranked = samePriority(signals, s).findIndex((t) => t.id === s.id)
    const original = samePriority(originalOrder, s).findIndex((t) => t.id === s.id)
    if (ranked >= original) return s
    const overtaken = samePriority(originalOrder, s)[ranked]
    return { ...s, profileInfluence: [...(s.profileInfluence ?? []), { field: 'priorities', sourceMemoryId: priorities.sourceMemoryId, signalId: s.id, effect: 'target-selected', from: objectiveIdOf(overtaken), to: objectiveId }] }
  })
}
