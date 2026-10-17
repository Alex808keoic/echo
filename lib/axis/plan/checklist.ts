/**
 * «Tu decisión del mes»: el plan convertido en una lista corta de cosas
 * concretas que hacer, con importes, en el mismo orden que «Tu plan». Pura:
 * sale solo del plan. Los ids son estables dentro del mes (por paso y por
 * tipo de inversión), para que lo marcado siga marcado aunque cambie un importe.
 */
import { formatCents } from '../../money'
import type { ObjectiveContext } from '../types'
import { CUSHION_OBJECTIVE_NAME, type AllocationPlan } from './allocation'
import type { SleeveKey } from './mix'

export interface ChecklistItem {
  id: string
  text: string
  /** Para un paso de invertir: el tipo y el importe, para apuntarlo en Inversiones. */
  invest?: { sleeve: SleeveKey; cents: number }
}

const eur = (cents: number) => formatCents(cents)
const lower = (s: string) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`

export function monthChecklist(plan: AllocationPlan, objectives: readonly ObjectiveContext[]): ChecklistItem[] {
  const name = (id: string) => objectives.find((o) => o.id === id)?.name ?? 'tu objetivo'
  const items: ChecklistItem[] = []
  for (const s of plan.steps) {
    switch (s.kind) {
      case 'fix-negative-liquidity':
        items.push({ id: s.kind, text: 'Revisa tu saldo inicial y tus movimientos hasta volver a tener dinero en positivo' })
        break
      case 'reduce-spending':
        items.push({ id: s.kind, text: 'Revisa en qué se va tu dinero y gasta menos de lo que ingresas' })
        break
      case 'register-data':
        items.push({ id: s.kind, text: 'Registra todos tus movimientos del mes' })
        break
      case 'create-cushion':
        items.push({ id: s.kind, text: `Crea tu «${CUSHION_OBJECTIVE_NAME}» de ${eur(s.targetCents)}` })
        break
      case 'move-cushion-first':
        items.push({ id: s.kind, text: `Pon tu «${CUSHION_OBJECTIVE_NAME}» el primero de tus objetivos` })
        break
      case 'fill-cushion':
        items.push({ id: s.kind, text: `Deja ${eur(s.monthlyCents)} en tu cuenta para el colchón, sin gastarlos` })
        break
      case 'short-term-objectives':
        items.push({ id: s.kind, text: `Deja ${eur(s.monthlyCents)} en tu cuenta para ${s.objectiveIds.map((id) => `«${name(id)}»`).join(', ')}` })
        break
      case 'invest-long-term':
        for (const p of s.mix)
          if (p.cents > 0) items.push({ id: `invest:${p.key}`, text: `Invierte ${eur(p.cents)} en ${p.key === 'risky' ? 'la ' : ''}${lower(p.label)}`, invest: { sleeve: p.key, cents: p.cents } })
        break
      case 'rest-to-objectives':
        items.push({ id: s.kind, text: s.noObjectives ? `Deja ${eur(s.monthlyCents)} en tu cuenta` : `Deja ${eur(s.monthlyCents)} en tu cuenta para tus objetivos` })
        break
      case 'idle-money':
        items.push({
          id: s.kind,
          text: s.safe
            ? `Pasa ${eur(s.idleCents)} a ahorro seguro (cuenta remunerada, depósito o Letras del Tesoro)`
            : `Decide qué hacer con tus ${eur(s.idleCents)} sin destino: de una vez o ${eur(s.perMonthCents)} al mes durante ${s.spreadMonths} meses`,
        })
        break
      case 'follow-priority':
        items.push({ id: s.kind, text: `Decide si «${name(s.objectiveId)}» va el primero en Objetivos` })
        break
      case 'answer-profile':
        items.push({ id: s.kind, text: 'Responde «Tu perfil» (4 preguntas)' })
        break
      case 'review-notes':
        items.push({ id: s.kind, text: s.count === 1 ? 'Convierte tu nota en un dato o márcala como que no cuenta' : `Convierte tus ${s.count} notas en datos o márcalas como que no cuentan` })
        break
      case 'forecast-basis':
        break
    }
  }
  return items
}
