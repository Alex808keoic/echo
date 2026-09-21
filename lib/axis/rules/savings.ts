/**
 * Reglas de ahorro: tasa del mes, evolución vs. mes anterior, mes sin datos.
 * El caso «gasto mayor que ingreso» lo cubre `expenses.over-income`.
 *
 * Perfil:
 *   - `minLiquidityCents`: si la liquidez está por debajo del mínimo declarado
 *     (`liquidityShortfall`), `savings.healthy` deja de ofrecer «Mantener
 *     liquidez» como alternativa, porque completar el colchón ya es la
 *     recomendación de `liquidity.below-min`.
 *   - `irregularIncome`: `savings.falling` baja de high a medium SOLO cuando la
 *     caída viene de unos ingresos menores, y su incertidumbre lo explica.
 *   - `priorities`: cuando `savings.healthy` recomienda aportar a un objetivo
 *     pendiente, elige el primero según las prioridades declaradas (sin ellas,
 *     el primero del contexto). Solo cambia el destino; nunca el verbo.
 * Nada más cambia (`savings.tight` y `savings.no-period-data` no leen el perfil).
 */
import type { Signal } from '../types'
import { eur, irregularIncomeOf, liquidityShortfall, pct, prioritiesOf, rankByPriorities, THRESHOLDS, type Rule } from './shared'

export const savingsRules: Rule = (ctx, _market, profile) => {
  const { current, previous } = ctx.flows
  const signals: Signal[] = []
  const shortfall = liquidityShortfall(ctx, profile)
  const irregular = irregularIncomeOf(profile)
  const priorities = prioritiesOf(profile)

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
        action: { verb: 'register', target: 'data' },
      },
    })
    return signals
  }

  const rate = current.savingsRatePct
  if (rate !== null && current.savingsCents >= 0) {
    const healthy = rate >= THRESHOLDS.healthySavingsRatePct
    // Destino de la recomendación: el primer objetivo pendiente; con prioridades declaradas, el primero de ellas.
    const defaultPending = ctx.objectives.find((o) => !o.completed)
    const pendingObjective = priorities ? rankByPriorities(ctx.objectives, priorities.ids).find((o) => !o.completed) : defaultPending
    const targetSelected = healthy && priorities !== null && pendingObjective !== undefined && defaultPending !== undefined && pendingObjective.id !== defaultPending.id
    const influence: Signal['profileInfluence'] = [
      ...(healthy && shortfall ? [{ field: 'minLiquidityCents' as const, sourceMemoryId: shortfall.sourceMemoryId, signalId: 'savings.healthy', effect: 'alternative-removed' as const }] : []),
      ...(targetSelected ? [{ field: 'priorities' as const, sourceMemoryId: priorities.sourceMemoryId, signalId: 'savings.healthy', effect: 'target-selected' as const, from: defaultPending.id, to: pendingObjective.id }] : []),
    ]
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
              action: { verb: 'allocate', target: 'objective', targetId: pendingObjective.id },
            }
          : ctx.objectives.length === 0
            ? {
                what: 'Define un objetivo para dar destino a lo que ahorras.',
                why: 'Sin un objetivo no hay forma de saber si el ahorro es suficiente ni para qué sirve.',
                nextStep: { label: 'Crear objetivo', to: 'objetivos' },
                action: { verb: 'define', target: 'objective' },
              }
            : undefined
        : undefined,
      alternative:
        healthy && !shortfall
          ? {
              name: 'Mantener liquidez',
              summary: 'Conservar el excedente como colchón si todavía no tienes un fondo de emergencia claro.',
            }
          : undefined,
      ...(influence.length > 0 ? { profileInfluence: influence } : {}),
    })
  }

  if (
    previous.movementCount > 0 &&
    previous.savingsCents > 0 &&
    current.savingsCents < previous.savingsCents * 0.5
  ) {
    const fromIncome = current.incomeCents < previous.incomeCents
    // Con ingresos irregulares solo se rebaja la caída que viene de los ingresos; la que viene del gasto, no.
    const lowered = irregular !== null && fromIncome
    signals.push({
      id: 'savings.falling',
      domain: 'savings',
      priority: lowered ? 'medium' : 'high',
      fact: `El ahorro del mes ha caído de ${eur(previous.savingsCents)} a ${eur(current.savingsCents)}.`,
      interpretation: fromIncome ? 'La caída viene, al menos en parte, de unos ingresos menores.' : 'Los ingresos se mantienen; la caída viene del gasto.',
      uncertainty: lowered
        ? {
            title: 'Ingresos irregulares',
            detail: 'Has indicado que tus ingresos son irregulares: un mes con menos ahorro por menos ingresos no marca tendencia por sí solo.',
          }
        : {
            title: 'Puede ser un mes atípico',
            detail: 'Un solo mes con menos ahorro no marca tendencia; dos seguidos, sí.',
          },
      ...(lowered
        ? {
            profileInfluence: [
              { field: 'irregularIncome', sourceMemoryId: irregular.sourceMemoryId, signalId: 'savings.falling', effect: 'priority-lowered', from: 'high', to: 'medium' },
              { field: 'irregularIncome', sourceMemoryId: irregular.sourceMemoryId, signalId: 'savings.falling', effect: 'uncertainty' },
            ],
          }
        : {}),
    })
  }

  return signals
}
