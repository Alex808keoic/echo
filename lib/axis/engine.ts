/**
 * Punto de entrada de AXIS para la aplicación.
 *
 *   FinancialSnapshot (Dexie)  →  buildFinancialContext  →  AxisInput
 *   →  motor  →  AxisResult validado  →  UI
 *
 * Dos motores con el mismo contrato:
 *   - `localRulesEngine`: reglas deterministas, siempre disponible (offline).
 *   - `aiEngine`: proveedor de IA vía el servidor de Finax; ante cualquier
 *     fallo o ausencia de configuración responde el motor local.
 *
 * La IA es una capa adicional y prescindible: si desaparece, Finax sigue igual.
 */
import { createAIEngine } from './ai-engine'
import { browserTransport } from './ai/browser-transport'
import { buildFinancialContext, type FinancialSnapshot } from './context'
import { localRulesEngine } from './local-engine'
import type { AxisEngine, AxisInput, AxisMemory, AxisResult } from './types'

const aiEngine: AxisEngine = createAIEngine({ transport: browserTransport, fallback: localRulesEngine })

/** Motor por preferencia: `'ai'` intenta la IA (con fallback), `'local'` no hace ninguna llamada. */
export function getAxisEngine(prefer: 'ai' | 'local' = 'local'): AxisEngine {
  return prefer === 'ai' ? aiEngine : localRulesEngine
}

/** Analiza una instantánea de los datos locales con el motor indicado. */
export function analyzeSnapshot(
  snapshot: FinancialSnapshot,
  prefer: 'ai' | 'local' = 'local',
  memory?: AxisMemory,
): Promise<AxisResult> {
  const input: AxisInput = { context: buildFinancialContext(snapshot), memory }
  return getAxisEngine(prefer).analyze(input)
}
