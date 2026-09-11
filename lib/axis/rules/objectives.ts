/**
 * Reglas de objetivos: conseguido, cerca, retrasado respecto a su fecha,
 * esfuerzo mensual necesario, sin progreso.
 */
import type { Signal } from '../types'
import { eur, pct, THRESHOLDS, type Rule } from './shared'

export const objectiveRules: Rule = (ctx) => {
  const signals: Signal[] = []
  const monthlySavings = ctx.flows.current.savingsCents

  for (const o of ctx.objectives) {
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
            },
        alternative: feasible
          ? undefined
          : {
              name: 'Mantener la fecha',
              summary: 'Es posible si el ahorro mensual sube de forma estable, no solo un mes.',
            },
        uncertainty: {
          title: 'Ritmo basado en un solo mes',
          detail: 'La aportación mensual necesaria se compara con el ahorro de este mes, que puede no ser representativo.',
        },
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

  return signals
}
