/**
 * Reglas de ingresos: ausencia, caída, subida extraordinaria.
 */
import { eur, pct, THRESHOLDS, type Rule } from './shared'

export const incomeRules: Rule = (ctx) => {
  const { current, previous, incomeChangePct } = ctx.flows
  const signals = []

  if (current.incomeCents === 0 && current.expenseCents > 0) {
    signals.push({
      id: 'income.none',
      domain: 'income' as const,
      priority: previous.incomeCents > 0 ? ('high' as const) : ('medium' as const),
      fact: `Este mes no hay ingresos registrados y sí ${eur(current.expenseCents)} de gastos.`,
      interpretation:
        previous.incomeCents > 0
          ? 'El mes pasado sí hubo ingresos, así que o todavía no han llegado o falta registrarlos.'
          : 'Sin ingresos registrados, todo el gasto sale del patrimonio acumulado.',
      recommendation: {
        what: 'Comprueba si falta registrar algún ingreso de este mes.',
        why: 'Sin ingresos en el registro, la lectura del ahorro y del ritmo de gasto queda incompleta.',
        nextStep: { label: 'Registrar un movimiento', to: 'movimientos' as const },
      },
    })
  }

  if (incomeChangePct !== null && incomeChangePct <= -THRESHOLDS.significantChangePct) {
    signals.push({
      id: 'income.drop',
      domain: 'income' as const,
      priority: 'high' as const,
      fact: `Los ingresos de este mes (${eur(current.incomeCents)}) son un ${pct(Math.abs(incomeChangePct))} menores que los del anterior (${eur(previous.incomeCents)}).`,
      interpretation:
        'Con menos ingresos, mantener el mismo nivel de gasto reduce el margen de ahorro o lo hace negativo.',
      recommendation: {
        what: 'Ajusta el gasto de este mes al nuevo nivel de ingresos antes de asumir nuevos compromisos.',
        why: 'Un mes con menos ingresos no es un problema si el gasto se adapta; lo es si el gasto sigue igual.',
        nextStep: { label: 'Ver gastos por categoría', to: 'estadisticas' as const },
      },
      uncertainty: {
        title: 'Puede ser temporal',
        detail: 'Con un solo mes de comparación no se puede saber si la caída de ingresos es puntual o estable.',
      },
    })
  }

  if (incomeChangePct !== null && incomeChangePct >= THRESHOLDS.extraordinaryIncomePct) {
    signals.push({
      id: 'income.extraordinary',
      domain: 'income' as const,
      priority: 'low' as const,
      fact: `Los ingresos de este mes (${eur(current.incomeCents)}) superan en un ${pct(incomeChangePct)} a los del anterior.`,
      interpretation:
        'Parte de ese ingreso puede ser extraordinario; conviene no tomarlo como el nivel habitual.',
      alternative: {
        name: 'Tratarlo como excedente',
        summary: 'Si es un ingreso puntual, destinarlo a un objetivo o al colchón evita que se diluya en gasto corriente.',
      },
    })
  }

  return signals
}
