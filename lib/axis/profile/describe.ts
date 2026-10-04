/**
 * Texto para la interfaz de un hecho de perfil: lo que el usuario confirma
 * al aceptar una memoria con `fact`, porque es lo que cambiará las decisiones.
 */
import { formatCents } from '../../money'
import type { Horizon, MemoryFact, RecurringIncomeFrequency, RiskAttitude } from './types'

const FREQUENCY_LABEL: Record<RecurringIncomeFrequency, string> = { monthly: 'al mes' }

const HORIZON_LABEL: Record<Horizon, string> = {
  short: 'corto plazo (menos de 2 años)',
  medium: 'medio plazo (de 2 a 5 años)',
  long: 'largo plazo (más de 5 años)',
}

const RISK_LABEL: Record<RiskAttitude, string> = {
  conservative: 'conservador',
  balanced: 'equilibrado',
  dynamic: 'dinámico',
}

/** «Liquidez mínima: 300,00 €». `objectiveName` resuelve ids de objetivos; sin nombre, se cuenta. */
export function describeFact(fact: MemoryFact, objectiveName: (id: string) => string | undefined = () => undefined): string {
  switch (fact.kind) {
    case 'horizon':
      return `Horizonte: ${HORIZON_LABEL[fact.value]}`
    case 'riskAttitude':
      return `Perfil de riesgo: ${RISK_LABEL[fact.value]}`
    case 'minLiquidity':
      return `Liquidez mínima: ${formatCents(fact.cents)}`
    case 'irregularIncome':
      return fact.value ? 'Ingresos irregulares' : 'Ingresos estables'
    case 'priorities': {
      const names = fact.objectiveIds.map(objectiveName)
      if (names.every((n): n is string => n !== undefined)) return `Prioridad: ${names.map((n) => `«${n}»`).join(', ')}`
      const n = fact.objectiveIds.length
      return `Prioridad entre ${n} objetivo${n === 1 ? '' : 's'}`
    }
    case 'recurringIncome':
      return `Ingreso recurrente: ${formatCents(fact.cents)} ${FREQUENCY_LABEL[fact.frequency]} · ${fact.category}`
  }
}
