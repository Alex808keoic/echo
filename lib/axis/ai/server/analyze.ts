/**
 * SOLO SERVIDOR. Orquestación del análisis con IA:
 *
 *   contexto recibido → comprobación de forma → buildAIRequest → AIProvider
 *   → parseAxisAnalysis → AxisAnalysis
 *
 * ESTADO: no hay ningún proveedor de IA implementado. `providerFromConfig()`
 * devuelve `null`, así que `/api/axis` responde «no disponible» y AXIS usa
 * siempre el motor local. La arquitectura queda lista para un proveedor con
 * nivel gratuito y límites estrictos (ver docs/AXIS.md → «Cómo añadir un
 * proveedor de IA»).
 *
 * Configuración por variables de entorno:
 *   AXIS_AI_ENABLED     "false" desactiva la IA aunque exista un proveedor
 *   (las credenciales del proveedor se definirán cuando se elija uno; nunca
 *   se exponen al cliente)
 */
import { buildAIRequest } from '../prompt'
import { AIProviderError, type AIProvider } from '../provider'
import { parseAxisAnalysis } from '../../validate'
import { AI_ENGINE_INFO } from '../../ai-engine'
import type { AxisAnalysis, AxisInput, AxisMemory, FinancialContext } from '../../types'

export interface AIServerConfig {
  enabled: boolean
}

export function readAIServerConfig(env: Record<string, string | undefined> = process.env): AIServerConfig {
  return { enabled: env.AXIS_AI_ENABLED?.trim().toLowerCase() !== 'false' }
}

/**
 * Proveedor configurado, o `null` si no hay ninguno. Aquí se instanciará la
 * implementación concreta de `AIProvider` cuando se decida el proveedor.
 */
export function providerFromConfig(config: AIServerConfig): AIProvider | null {
  if (!config.enabled) return null
  return null
}

export function isAIAvailable(config: AIServerConfig): boolean {
  return providerFromConfig(config) !== null
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Comprobación de forma del contexto recibido del cliente: lo justo para no procesar basura. */
export function isFinancialContext(v: unknown): v is FinancialContext {
  return (
    isRecord(v) &&
    typeof v.asOf === 'string' &&
    isRecord(v.wealth) &&
    isRecord(v.flows) &&
    isRecord(v.flows.current) &&
    isRecord(v.flows.previous) &&
    Array.isArray(v.objectives) &&
    isRecord(v.investments) &&
    isRecord(v.quality) &&
    typeof (v.quality as Record<string, unknown>).level === 'string'
  )
}

/** Ejecuta el análisis con un proveedor dado. Lanza si el resultado no es válido. */
export async function analyzeWithProvider(
  provider: AIProvider,
  context: FinancialContext,
  memory?: AxisMemory,
  signal?: AbortSignal,
): Promise<AxisAnalysis> {
  const input: AxisInput = { context, memory }
  const raw = await provider.complete(buildAIRequest(input), signal)
  if (!isRecord(raw)) throw new AIProviderError('malformed', 'la salida no es un objeto')
  return parseAxisAnalysis({
    ...raw,
    engine: AI_ENGINE_INFO,
    generatedAt: new Date().toISOString(),
    basedOnDemoData: context.quality.isDemo,
  })
}
