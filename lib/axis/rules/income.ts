/**
 * Reglas de ingresos: ausencia, caída, subida extraordinaria.
 *
 * Perfil (`irregularIncome`, hecho declarado sobre los datos): con ingresos
 * irregulares, comparar un mes con el anterior es menos fiable. Por eso
 * `income.none` (si el mes pasado hubo ingresos) e `income.drop` bajan de
 * high a medium y explican por qué; `income.extraordinary` solo cambia su
 * lectura. Ninguna señal desaparece ni gana recomendación.
 */
import type { Signal } from '../types'
import { eur, irregularIncomeOf, pct, THRESHOLDS, type Rule } from './shared'

export const incomeRules: Rule = (ctx, _market, profile) => {
  const { current, previous, incomeChangePct } = ctx.flows
  const signals: Signal[] = []
  const irregular = irregularIncomeOf(profile)

  if (current.incomeCents === 0 && current.expenseCents > 0) {
    // Solo hay algo que rebajar cuando el mes pasado sí hubo ingresos (la señal era high).
    const lowered = irregular !== null && previous.incomeCents > 0
    signals.push({
      id: 'income.none',
      domain: 'income' as const,
      priority: lowered ? ('medium' as const) : previous.incomeCents > 0 ? ('high' as const) : ('medium' as const),
      fact: `Este mes no hay ingresos registrados y sí ${eur(current.expenseCents)} de gastos.`,
      interpretation:
        previous.incomeCents > 0
          ? lowered
            ? 'Con ingresos irregulares, un mes sin ingresos puede ser normal; aun así conviene comprobar si falta registrar alguno.'
            : 'El mes pasado sí hubo ingresos, así que o todavía no han llegado o falta registrarlos.'
          : 'Sin ingresos registrados, todo el gasto sale del patrimonio acumulado.',
      recommendation: {
        what: 'Comprueba si falta registrar algún ingreso de este mes.',
        why: 'Sin ingresos en el registro, la lectura del ahorro y del ritmo de gasto queda incompleta.',
        nextStep: { label: 'Registrar un movimiento', to: 'movimientos' as const },
        action: { verb: 'register' as const, target: 'data' as const },
      },
      ...(lowered
        ? {
            profileInfluence: [
              { field: 'irregularIncome' as const, sourceMemoryId: irregular.sourceMemoryId, signalId: 'income.none', effect: 'priority-lowered' as const, from: 'high', to: 'medium' },
              { field: 'irregularIncome' as const, sourceMemoryId: irregular.sourceMemoryId, signalId: 'income.none', effect: 'interpretation' as const },
            ],
          }
        : {}),
    })
  }

  if (incomeChangePct !== null && incomeChangePct <= -THRESHOLDS.significantChangePct) {
    signals.push({
      id: 'income.drop',
      domain: 'income' as const,
      priority: irregular ? ('medium' as const) : ('high' as const),
      fact: `Los ingresos de este mes (${eur(current.incomeCents)}) son un ${pct(Math.abs(incomeChangePct))} menores que los del anterior (${eur(previous.incomeCents)}).`,
      interpretation:
        'Con menos ingresos, mantener el mismo nivel de gasto reduce el margen de ahorro o lo hace negativo.',
      recommendation: {
        what: 'Ajusta el gasto de este mes al nuevo nivel de ingresos antes de asumir nuevos compromisos.',
        why: 'Un mes con menos ingresos no es un problema si el gasto se adapta; lo es si el gasto sigue igual.',
        nextStep: { label: 'Ver gastos por categoría', to: 'estadisticas' as const },
        action: { verb: 'adjust' as const, target: 'none' as const },
      },
      uncertainty: irregular
        ? {
            title: 'Ingresos irregulares',
            detail: 'Has indicado que tus ingresos son irregulares: un mes por debajo del anterior no indica por sí solo una caída estable.',
          }
        : {
            title: 'Puede ser temporal',
            detail: 'Con un solo mes de comparación no se puede saber si la caída de ingresos es puntual o estable.',
          },
      ...(irregular
        ? {
            profileInfluence: [
              { field: 'irregularIncome' as const, sourceMemoryId: irregular.sourceMemoryId, signalId: 'income.drop', effect: 'priority-lowered' as const, from: 'high', to: 'medium' },
              { field: 'irregularIncome' as const, sourceMemoryId: irregular.sourceMemoryId, signalId: 'income.drop', effect: 'uncertainty' as const },
            ],
          }
        : {}),
    })
  }

  if (incomeChangePct !== null && incomeChangePct >= THRESHOLDS.extraordinaryIncomePct) {
    signals.push({
      id: 'income.extraordinary',
      domain: 'income' as const,
      priority: 'low' as const,
      fact: `Los ingresos de este mes (${eur(current.incomeCents)}) superan en un ${pct(incomeChangePct)} a los del anterior.`,
      interpretation: irregular
        ? 'Con ingresos irregulares, un mes alto entra dentro de lo esperable; conviene no tomarlo como el nivel habitual.'
        : 'Parte de ese ingreso puede ser extraordinario; conviene no tomarlo como el nivel habitual.',
      alternative: {
        name: 'Tratarlo como excedente',
        summary: 'Si es un ingreso puntual, destinarlo a un objetivo o al colchón evita que se diluya en gasto corriente.',
      },
      ...(irregular
        ? { profileInfluence: [{ field: 'irregularIncome' as const, sourceMemoryId: irregular.sourceMemoryId, signalId: 'income.extraordinary', effect: 'interpretation' as const }] }
        : {}),
    })
  }

  return signals
}
