/**
 * Reglas de objetivos: conseguido, cubierto, cerca, retrasado respecto a su
 * fecha, esfuerzo mensual necesario, sin dinero disponible.
 *
 * El progreso viene del reparto automático (`allocateObjectives`, vía el
 * contexto); estas reglas no recalculan la cascada:
 *   - conseguido (`achieved`, marcado a mano): fuera del reparto, al 100 %;
 *   - cubierto (`covered`): el reparto actual llega a la meta, pero sigue
 *     activo y puede volver a «en curso» si baja el líquido;
 *   - ritmo (`pace`): `requiredMonthlyCents` ya incluye lo que falta a los
 *     objetivos anteriores en la cascada (el ahorro llega antes a ellos);
 *   - sin dinero (`stale`): solo el objetivo que debería recibir dinero ahora
 *     (nada pendiente por delante) y no recibe nada; esperar turno no lo es;
 *   - cerca (`near`): describe lo que falta y su lugar en el orden; no hay
 *     acción manual (el dinero se asigna solo);
 *   - previsión (`forecast`): encadenada con la misma cascada
 *     (`forecastObjectiveAllocation`).
 *
 * Orden: siempre el del reparto (`ctx.objectives`, por prioridad del objetivo
 * en Finax). La memoria `priorities` de AXIS ya no reordena nada: AXIS nunca
 * pone por delante un objetivo distinto del que Finax alimenta primero.
 *
 * Perfil:
 *   - `irregularIncome`: `objectives.pace` compara el ritmo necesario con el
 *     ahorro de un solo mes; con ingresos irregulares, su incertidumbre lo
 *     dice. Solo cambia ese texto: ni prioridad, ni recomendación, ni alternativa.
 */
import type { ObjectiveContext, ObjectiveStatus, Signal } from '../types'
import {
  describeRecurringIncomes,
  eur,
  forecastMonthsText,
  irregularIncomeOf,
  pct,
  recurringForecasts,
  recurringIncomesOf,
  THRESHOLDS,
  type RecurringForecast,
  type Rule,
} from './shared'

/** Estado en el reparto; un contexto anterior a la fase B1 no lo trae y `completed` no distingue: se trata como cubierto. */
const statusOf = (o: ObjectiveContext): ObjectiveStatus => o.status ?? (o.completed ? 'covered' : 'in-progress')

/** Señales de objetivos de siempre (sin previsiones): idénticas con o sin ingresos recurrentes. */
const baseObjectiveRules: Rule = (ctx, _market, profile) => {
  const signals: Signal[] = []
  const monthlySavings = ctx.flows.current.savingsCents
  const irregular = irregularIncomeOf(profile)

  // El orden del reparto: el mismo en que Finax asigna el dinero.
  for (const o of ctx.objectives) {
    const status = statusOf(o)
    if (status === 'achieved') {
      signals.push({
        id: `objectives.completed:${o.id}`,
        domain: 'objectives',
        priority: 'low',
        fact: `«${o.name}» está conseguido (lo marcaste tú): meta de ${eur(o.targetCents)}.`,
        interpretation: 'Ya no forma parte del reparto: tu dinero disponible va a tus demás objetivos.',
        recommendation: {
          what: `Decide el siguiente destino de tu ahorro ahora que «${o.name}» está conseguido.`,
          why: 'Un objetivo cumplido ya no orienta el ahorro; un objetivo nuevo sí da dirección.',
          nextStep: { label: 'Ver objetivos', to: 'objetivos' },
          action: { verb: 'decide', target: 'none' },
        },
      })
      continue
    }
    if (status === 'covered') {
      signals.push({
        id: `objectives.covered:${o.id}`,
        domain: 'objectives',
        priority: 'low',
        fact: `Tu dinero disponible cubre ahora «${o.name}»: ${eur(o.currentCents)} de ${eur(o.targetCents)}.`,
        interpretation: 'Está cubierto mientras tu líquido se mantenga: si baja, volverá a estar en curso. No es lo mismo que conseguido.',
        recommendation: {
          what: `Cuando hayas conseguido «${o.name}», márcalo como conseguido para que tu dinero vaya a tus demás objetivos.`,
          why: 'Mientras siga activo, el reparto automático le sigue asignando dinero.',
          nextStep: { label: 'Ver objetivos', to: 'objetivos' },
          action: { verb: 'decide', target: 'objective', targetId: o.id },
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
        fact: `Para llegar a «${o.name}» en ${months} ${months === 1 ? 'mes' : 'meses'} harían falta unos ${eur(o.requiredMonthlyCents)} al mes (faltan ${eur(o.remainingCents)}${(o.aheadRemainingCents ?? 0) > 0 ? `, y antes ${eur(o.aheadRemainingCents ?? 0)} de los objetivos que van por delante` : ''}).`,
        interpretation: feasible
          ? `Tu ahorro de este mes (${eur(monthlySavings)}) cubre ese ritmo.`
          : monthlySavings > 0
            ? `Tu ahorro de este mes (${eur(monthlySavings)}) no llega a ese ritmo.`
            : 'Este mes no hay ahorro con el que sostener ese ritmo.',
        // Sin claves `undefined`: con un ritmo alcanzable no hay recomendación ni alternativa.
        ...(feasible
          ? {}
          : {
              recommendation: {
                what: `Elige entre aplazar la fecha de «${o.name}», reducir la meta o aumentar tu ahorro mensual.`,
                why: 'Las tres opciones son válidas; lo que no funciona es mantener un plan que las cifras no sostienen.',
                nextStep: { label: 'Editar objetivo', to: 'objetivos' },
                action: { verb: 'adjust', target: 'objective', targetId: o.id },
              },
              alternative: {
                name: 'Mantener la fecha',
                summary: 'Es posible si el ahorro mensual sube de forma estable, no solo un mes.',
              },
            }),
        uncertainty: {
          title: 'Ritmo basado en un solo mes',
          detail: irregular
            ? 'El ahorro mensual necesario se compara con el ahorro de este mes; con ingresos irregulares, un solo mes es aún menos representativo.'
            : 'El ahorro mensual necesario se compara con el ahorro de este mes, que puede no ser representativo.',
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
        // Sin acción manual: el reparto le asigna dinero solo, en el orden de tus objetivos.
        interpretation:
          (o.aheadRemainingCents ?? 0) > 0
            ? `Está cerca, pero va detrás de otros objetivos en el orden: tu dinero disponible se asigna solo y le llegará cuando estén cubiertos los anteriores.`
            : `Está a un paso y es el siguiente en recibir dinero: lo próximo que entre en tu líquido se le asigna automáticamente${o.rank ? ` (va ${o.rank}.º en el orden de tus objetivos)` : ''}.`,
      })
      continue
    }

    // Solo el objetivo al que le toca recibir dinero (nada pendiente por delante) y que no recibe nada:
    // uno con 0 € porque otro va antes está esperando su turno, no estancado. Sin historial del reparto,
    // solo se afirma la situación actual, no cuánto tiempo lleva así.
    if (o.currentCents === 0 && (o.aheadRemainingCents ?? 0) === 0 && o.ageDays >= THRESHOLDS.objectiveStaleDays) {
      signals.push({
        id: `objectives.stale:${o.id}`,
        domain: 'objectives',
        priority: 'medium',
        fact: `«${o.name}» es el siguiente en recibir dinero, pero ahora mismo no te queda dinero disponible para él (meta: ${eur(o.targetCents)}; creado hace ${o.ageDays} días).`,
        interpretation: 'El reparto automático le asigna lo que queda tras los objetivos anteriores, y ahora no queda nada. Puede ser una meta mal dimensionada o sin prioridad real.',
        recommendation: {
          what: `Decide si «${o.name}» sigue siendo prioritario; si lo es, revisa su meta o su lugar en el orden de tus objetivos.`,
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

  return signals
}

/**
 * Previsiones (fase 5): una señal `objectives.forecast:<id>` por objetivo no
 * completado cuando hay ingresos recurrentes declarados. Baja prioridad, sin
 * recomendación y en el dominio `forecast` (detrás de todo): no cambia ninguna
 * señal, prioridad, recomendación ni incertidumbre existente. Describe un
 * escenario sin verbos de consejo (nada de «aparta», «ahorra», «destina»…).
 */
const forecastRules: Rule = (ctx, _market, profile) => {
  const declared = recurringIncomesOf(profile)
  if (!declared) return []
  // Encadenadas: la misma cascada del reparto, en su orden; los cubiertos y conseguidos no tienen previsión.
  return recurringForecasts(ctx, profile).flatMap((f): Signal[] => {
    const id = `objectives.forecast:${f.objectiveId}`
    return [
      {
        id,
        domain: 'forecast',
        priority: 'low',
        fact: `Previsión (no es dinero disponible): ${forecastAllText(f)}`,
        // La interpretación es lo que se muestra de cada señal: lleva la etiqueta y los dos escenarios completos.
        interpretation: `Previsión (no es dinero disponible): ${forecastAllText(f)} ${forecastAfterExpensesText(f)}`,
        profileInfluence: declared.incomes.map((r) => ({ field: 'recurringIncomes' as const, sourceMemoryId: r.sourceMemoryId, signalId: id, effect: 'added-signal' as const })),
      },
    ]
  })
}

/** Objetivos que van antes en la cascada: «después de cubrir «A»» / «después de cubrir «A» y «B»». */
function afterText(f: RecurringForecast): string {
  if (f.after.length === 0) return ''
  const names = f.after.map((n) => `«${n}»`)
  return `, después de cubrir ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`}`
}

/** Escenario A: toda la previsión, en cascada. */
function forecastAllText(f: RecurringForecast): string {
  return `lo que falta para «${f.objectiveName}» (${eur(f.remainingCents)}) equivale a ${forecastMonthsText(f.allMonths)} de tus ingresos previstos (${describeRecurringIncomes(f.incomes)})${afterText(f)}.`
}

/** Escenario B (previsión menos gasto habitual) y supuestos. */
function forecastAfterExpensesText(f: RecurringForecast): string {
  const b = f.afterExpenses
  if (b.status === 'no-history') return 'Aún no tengo meses suficientes para estimar tu gasto habitual. Supone que recibes la previsión cada mes. No es una promesa.'
  if (b.status === 'no-margin') {
    return `Con tu gasto habitual estimado (${eur(b.usualExpenseCents)} al mes, mediana de ${b.basedOnMonths} meses) no quedaría margen de esa previsión. Supone que ese gasto se paga con la previsión. No es una promesa.`
  }
  return `Con un gasto habitual estimado de ${eur(b.usualExpenseCents)} al mes (mediana de ${b.basedOnMonths} meses), quedarían ${eur(b.marginCents)} al mes de esa previsión: serían ${forecastMonthsText(b.result)}. Supone que recibes la previsión cada mes, que tu gasto se mantiene y que se paga con esa previsión. No es una promesa.`
}

export const objectiveRules: Rule = (ctx, market, profile) => [...baseObjectiveRules(ctx, market, profile), ...forecastRules(ctx, market, profile)]
