/**
 * MOTOR LOCAL DE REGLAS — AXIS
 * ------------------------------------------------------------------
 * NO es inteligencia artificial: lógica determinista sobre el contexto
 * financiero, sin conexión, sin modelo de lenguaje y sin datos de mercado.
 * La interfaz lo identifica como tal (`info.isAI = false`).
 *
 * Flujo: FinancialContext → decide() (reglas → señales → priorización →
 * decisión) → render() (redacción) → validación → AxisResult. Es la
 * preparación de contexto para cualquier motor externo y el fallback offline.
 */
import { render } from './compose'
import { decide } from './core/decision'
import { parseAxisAnalysis } from './validate'
import type { AxisEngine, AxisEngineInfo, AxisInput, AxisResult } from './types'

export const LOCAL_RULES_ENGINE_INFO: AxisEngineInfo = {
  id: 'local-rules',
  label: 'Motor local de reglas',
  isAI: false,
}

/** Versión síncrona, útil para tests y para preparar contexto a un motor externo. */
export function analyzeLocally(input: AxisInput, now: Date = new Date()): AxisResult {
  const result = render(decide(input), LOCAL_RULES_ENGINE_INFO, now)
  if (result.status === 'no-analysis') return result
  return { status: 'analysis', analysis: parseAxisAnalysis(result.analysis) }
}

export const localRulesEngine: AxisEngine = {
  info: LOCAL_RULES_ENGINE_INFO,
  analyze: (input) => Promise.resolve(analyzeLocally(input)),
}
