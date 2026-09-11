/**
 * Contrato de AXIS: la capa inteligente transversal de Finax.
 *
 * Orden oficial de un análisis (D-26):
 *   DATOS → INTERPRETACIÓN → RECOMENDACIÓN → ALTERNATIVAS → INCERTIDUMBRE
 *   → CONCLUSIÓN / SIGUIENTE PASO
 *
 * AXIS analiza y recomienda; NUNCA ejecuta operaciones financieras.
 * Un motor (`AxisEngine`) rellena este contrato. Hoy existe un motor local de
 * reglas; un motor de IA externo podrá sustituirlo sin cambiar la interfaz.
 */
import type { ScreenKey } from '@/components/finax/bottom-navigation'

/** Contexto financiero real que AXIS recibe. Sale íntegro de los datos locales. */
export interface AxisContext {
  patrimonioCents: number
  liquidCents: number
  investedCents: number
  monthIncomeCents: number
  monthExpenseCents: number
  previousMonthExpenseCents: number
  movementCount: number
  /** Distribución de gasto del mes por categoría, de mayor a menor. */
  monthTopExpense: { label: string; cents: number; pct: number } | null
  objectives: Array<{ name: string; currentCents: number; targetCents: number; targetDate?: string }>
  positions: Array<{ name: string; investedCents: number; valueCents: number }>
  /** Nº de días con movimientos (puntos reales de evolución). */
  historyDays: number
}

/**
 * Nivel de confianza, cualitativo a propósito: un porcentaje sugeriría una
 * precisión que el razonamiento no tiene.
 */
export type Confidence = 'alta' | 'media' | 'baja'

export interface AxisAlternative {
  name: string
  summary: string
}

export interface AxisUncertainty {
  title: string
  detail: string
}

export interface AxisNextStep {
  label: string
  /** Pantalla de Finax donde continuar. AXIS solo propone, nunca ejecuta. */
  to?: ScreenKey
}

export interface AxisAnalysis {
  /** DATOS: hechos, sin interpretación. */
  facts: string[]
  /** INTERPRETACIÓN: lectura de la situación. */
  interpretation: string
  /**
   * RECOMENDACIÓN. Ausente cuando la conclusión es que no hace falta actuar:
   * la ausencia de acción también es una respuesta válida.
   */
  recommendation?: { what: string; why: string }
  alternatives: AxisAlternative[]
  uncertainties: AxisUncertainty[]
  confidence: Confidence
  conclusion: string
  nextStep?: AxisNextStep
  /** Frase corta para las tarjetas de Inicio / Mi Dinero / Estadísticas. */
  headline: string
  generatedAt: string
  /** Identificación del motor que produjo el análisis. */
  engine: AxisEngineInfo
}

export interface AxisEngineInfo {
  id: 'local-rules' | 'external-ai'
  label: string
  /** `true` cuando el análisis lo ha producido un modelo de IA real. */
  isAI: boolean
}

export interface AxisEngine {
  info: AxisEngineInfo
  analyze(context: AxisContext): Promise<AxisAnalysis>
}

/** Estado de la superficie de AXIS. */
export type AxisState =
  | { status: 'loading' }
  | { status: 'insufficient-context'; context: AxisContext; missing: string[] }
  | { status: 'ready'; context: AxisContext; analysis: AxisAnalysis }
