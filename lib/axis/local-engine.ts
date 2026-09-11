/**
 * MOTOR LOCAL DE REGLAS — AXIS
 * ------------------------------------------------------------------
 * NO es inteligencia artificial: lógica determinista sobre el contexto
 * financiero, sin conexión, sin modelo de lenguaje y sin datos de mercado.
 * La interfaz lo identifica como tal (`info.isAI = false`).
 *
 * Flujo: FinancialContext → reglas (señales) → priorización → composición
 * → validación → AxisResult. Cuando se conecte un motor de IA, este queda
 * como preparación de contexto y como fallback offline.
 */
import { composeAnalysis, composeNoAnalysis } from './compose'
import { detectSignals } from './rules'
import { parseAxisAnalysis } from './validate'
import type { AxisEngine, AxisEngineInfo, AxisInput, AxisResult } from './types'

export const LOCAL_RULES_ENGINE_INFO: AxisEngineInfo = {
  id: 'local-rules',
  label: 'Motor local de reglas',
  isAI: false,
}

/** Versión síncrona, útil para tests y para preparar contexto a un motor externo. */
export function analyzeLocally(input: AxisInput, now: Date = new Date()): AxisResult {
  const { context } = input
  if (context.quality.level === 'none') {
    return composeNoAnalysis(context, LOCAL_RULES_ENGINE_INFO)
  }
  const signals = detectSignals(context)
  const analysis = parseAxisAnalysis(composeAnalysis(context, signals, LOCAL_RULES_ENGINE_INFO, now))
  return { status: 'analysis', analysis }
}

export const localRulesEngine: AxisEngine = {
  info: LOCAL_RULES_ENGINE_INFO,
  analyze: (input) => Promise.resolve(analyzeLocally(input)),
}
