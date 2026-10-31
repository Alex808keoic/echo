/**
 * Qué comparte Finax con la app AXIS del ecosistema.
 *
 * La app AXIS es otra aplicación: reúne los resúmenes semanales de Finax,
 * Axthletics y Mentax. El AXIS consultor de Finax no cambia ni lee nada de ella.
 */
import { METRIC_KEYS, type MetricKey } from './contract'

export type FinaxMetric = MetricKey<'finax'>

export const FINAX_METRICS: readonly FinaxMetric[] = METRIC_KEYS.finax

/** El consentimiento: qué métricas y desde cuándo. Ausente = no se comparte nada. */
export interface EcosystemSharing {
  metrics: FinaxMetric[]
  /** Instante ISO en que el usuario confirmó lo que comparte. */
  since: string
}

export const METRIC_LABELS: Record<FinaxMetric, string> = {
  income_cents: 'Ingresos',
  expense_cents: 'Gastos',
  expense_habitual_cents: 'Gastos habituales',
  wealth_cents: 'Patrimonio',
  invested_value_cents: 'Valor invertido',
  debt_cents: 'Deudas',
  movements_count: 'Movimientos apuntados',
}

/** Activadas al conectar: todas las del catálogo de AXIS (el reparto por categorías no existe en v1). */
export const DEFAULT_METRICS: readonly FinaxMetric[] = FINAX_METRICS

function isMetric(value: unknown): value is FinaxMetric {
  return typeof value === 'string' && (FINAX_METRICS as readonly string[]).includes(value)
}

export function isEcosystemSharing(value: unknown): value is EcosystemSharing {
  if (typeof value !== 'object' || value === null) return false
  const { metrics, since } = value as Record<string, unknown>
  return Array.isArray(metrics) && metrics.every(isMetric) && typeof since === 'string' && !Number.isNaN(Date.parse(since))
}
