/**
 * Reglas de ahorro: tasa del mes, evolución vs. mes anterior, mes sin datos.
 * El caso «gasto mayor que ingreso» lo cubre `expenses.over-income`.
 */
import type { Signal } from '../types'
import { eur, pct, THRESHOLDS, type Rule } from './shared'

export const savingsRules: Rule = (ctx) => {
  const { current, previous } = ctx.flows
  const signals: Signal[] = []

  if (current.movementCount === 0) {
    signals.push({
      id: 'savings.no-period-data',
      domain: 'savings',
      priority: 'medium',
      fact: 'Este mes todavía no hay movimientos registrados.',
      interpretation: 'Sin datos del mes en curso, la lectura se apoya solo en el histórico anterior.',
      recommendation: {
        what: 'Registra los ingresos y gastos del mes para que la lectura sea actual.',
        why: 'El ahorro y el ritmo de gasto solo pueden valorarse con los movimientos del periodo.',
        nextStep: { label: 'Registrar un movimiento', to: 'movimientos' },
      },
    })
    return signals
  }

  const rate = current.savingsRatePct
  if (rate !== null && current.savingsCents >= 0) {
    const healthy = rate >= THRESHOLDS.healthySavingsRatePct
    const pendingObjective = ctx.objectives.find((o) => !o.completed)
    signals.push({
      id: healthy ? 'savings.healthy' : 'savings.tight',
      domain: 'savings',
      priority: healthy ? 'low' : 'medium',
      fact: `Este mes ahorras ${eur(current.savingsCents)}: un ${pct(rate)} de tus ingresos (${eur(current.incomeCents)}).`,
      interpretation: healthy
        ? 'Cubres el gasto con margen y queda excedente real.'
        : 'El balance es positivo pero ajustado: un gasto imprevisto lo dejaría en negativo.',
      recommendation: healthy
        ? pendingObjective
          ? {
              what: `Destina parte del excedente a «${pendingObjective.name}».`,
              why: `Te faltan ${eur(pendingObjective.remainingCents)} y el balance del mes lo permite sin forzar.`,
              nextStep: { label: 'Ver objetivos', to: 'objetivos' },
            }
          : ctx.objectives.length === 0
            ? {
                what: 'Define un objetivo para dar destino a lo que ahorras.',
                why: 'Sin un objetivo no hay forma de saber si el ahorro es suficiente ni para qué sirve.',
                nextStep: { label: 'Crear objetivo', to: 'objetivos' },
              }
            : undefined
        : undefined,
      alternative: healthy
        ? {
            name: 'Mantener liquidez',
            summary: 'Conservar el excedente como colchón si todavía no tienes un fondo de emergencia claro.',
          }
        : undefined,
    })
  }

  if (
    previous.movementCount > 0 &&
    previous.savingsCents > 0 &&
    current.savingsCents < previous.savingsCents * 0.5
  ) {
    signals.push({
      id: 'savings.falling',
      domain: 'savings',
      priority: 'high',
      fact: `El ahorro del mes ha caído de ${eur(previous.savingsCents)} a ${eur(current.savingsCents)}.`,
      interpretation:
        current.incomeCents < previous.incomeCents
          ? 'La caída viene, al menos en parte, de unos ingresos menores.'
          : 'Los ingresos se mantienen; la caída viene del gasto.',
      uncertainty: {
        title: 'Puede ser un mes atípico',
        detail: 'Un solo mes con menos ahorro no marca tendencia; dos seguidos, sí.',
      },
    })
  }

  return signals
}
