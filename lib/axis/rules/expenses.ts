/**
 * Reglas de gastos: gasto superior a ingresos, aumento significativo,
 * concentración en una categoría.
 */
import type { Signal } from '../types'
import { eur, pct, THRESHOLDS, type Rule } from './shared'

export const expenseRules: Rule = (ctx) => {
  const { current, previous, expenseChangePct } = ctx.flows
  const top = current.expensesByCategory[0]
  const signals: Signal[] = []
  // Con una tasa de ahorro sólida, las variaciones del gasto son informativas, no accionables.
  const tightMargin = current.savingsRatePct === null || current.savingsRatePct < THRESHOLDS.healthySavingsRatePct

  if (current.expenseCents > current.incomeCents && current.expenseCents > 0) {
    signals.push({
      id: 'expenses.over-income',
      domain: 'expenses',
      priority: 'critical',
      fact: `Este mes los gastos (${eur(current.expenseCents)}) superan a los ingresos (${eur(current.incomeCents)}): balance ${eur(current.savingsCents, true)}.`,
      interpretation: top
        ? `El patrimonio líquido está bajando. La partida que más pesa es «${top.label}», con ${eur(top.cents)} (${pct(top.pct)} del gasto).`
        : 'El patrimonio líquido está bajando mientras dure este ritmo.',
      recommendation: {
        what: top
          ? `Revisa «${top.label}» antes que ninguna otra partida: es donde un ajuste tiene más efecto.`
          : 'Revisa los gastos del mes para volver a un balance positivo.',
        why: 'Con balance negativo, cualquier objetivo o inversión se financia con patrimonio anterior, no con ahorro.',
        nextStep: { label: 'Ver gastos por categoría', to: 'estadisticas' },
      },
      alternative: {
        name: 'No cambiar nada todavía',
        summary: 'Si el mes tiene un gasto excepcional que no se repetirá, puede bastar con vigilar el mes siguiente.',
      },
    })
  }

  if (expenseChangePct !== null && expenseChangePct >= THRESHOLDS.significantChangePct) {
    const prevTop = previous.expensesByCategory[0]
    const driver =
      top && (!prevTop || top.label !== prevTop.label || top.cents > prevTop.cents)
        ? `El aumento viene sobre todo de «${top.label}» (${eur(top.cents)} este mes).`
        : 'El aumento está repartido entre varias categorías.'
    signals.push({
      id: 'expenses.increase',
      domain: 'expenses',
      priority: current.savingsCents < 0 ? 'high' : tightMargin ? 'medium' : 'low',
      fact: `Los gastos han subido un ${pct(expenseChangePct)} respecto al mes anterior: ${eur(previous.expenseCents)} → ${eur(current.expenseCents)}.`,
      interpretation: driver,
      recommendation: tightMargin
        ? {
            what: top
              ? `Revisa «${top.label}» antes de asumir nuevos compromisos.`
              : 'Revisa qué ha cambiado en el gasto antes de asumir nuevos compromisos.',
            why: 'Si la subida se consolida, el margen de ahorro del mes que viene será menor.',
            nextStep: { label: 'Ver gastos por categoría', to: 'estadisticas' },
          }
        : undefined,
      alternative: tightMargin
        ? {
            name: 'Mantener el gasto y ajustar el objetivo',
            summary: 'Aceptar el nuevo nivel de gasto y reducir temporalmente el esfuerzo destinado a objetivos.',
          }
        : undefined,
      uncertainty: {
        title: 'Un mes no es una tendencia',
        detail: 'Con dos meses comparados no se puede saber si la subida se mantiene; el mes que viene lo confirmará.',
      },
    })
  }

  // La concentración solo importa cuando el margen es ajustado.
  if (
    top &&
    tightMargin &&
    current.expensesByCategory.length >= 2 &&
    top.pct >= THRESHOLDS.categoryConcentrationPct &&
    !signals.some((s) => s.id === 'expenses.over-income')
  ) {
    signals.push({
      id: 'expenses.concentration',
      domain: 'expenses',
      priority: 'medium',
      fact: `«${top.label}» concentra el ${pct(top.pct)} del gasto del mes (${eur(top.cents)} de ${eur(current.expenseCents)}).`,
      interpretation: 'Cuando una sola partida pesa tanto, el gasto total depende casi por completo de ella.',
      recommendation: {
        what: `Decide si el peso de «${top.label}» es el que quieres; el resto de categorías apenas mueven el total.`,
        why: 'Ajustar la partida dominante cambia el resultado del mes; ajustar las pequeñas, no.',
        nextStep: { label: 'Ver estadísticas', to: 'estadisticas' },
      },
    })
  }

  return signals
}
