/**
 * Punto de entrada de AXIS para la aplicación.
 *
 *   FinancialSnapshot (Dexie)  →  buildFinancialContext  →  AxisInput
 *   →  getAxisEngine().analyze  →  AxisResult validado  →  UI
 *
 * Para conectar un motor de IA externo: implementar `AxisEngine` (p. ej. en
 * `lib/axis/ai-engine.ts`) que reciba el mismo `AxisInput`, pase su salida
 * por `parseAxisAnalysis` y devolverlo desde `getAxisEngine()`. La UI muestra
 * `engine.label` / `engine.isAI` sin más cambios. Hasta entonces, el único
 * motor es el local de reglas.
 */
import { buildFinancialContext, type FinancialSnapshot } from './context'
import { localRulesEngine } from './local-engine'
import type { AxisEngine, AxisInput, AxisMemory, AxisResult } from './types'

export function getAxisEngine(): AxisEngine {
  return localRulesEngine
}

/** Analiza una instantánea de los datos locales con el motor configurado. */
export function analyzeSnapshot(snapshot: FinancialSnapshot, memory?: AxisMemory): Promise<AxisResult> {
  const input: AxisInput = { context: buildFinancialContext(snapshot), memory }
  return getAxisEngine().analyze(input)
}
