/**
 * SOLO SERVIDOR. Orquestación del análisis con IA:
 *
 *   contexto recibido → comprobación de forma → buildAIRequest → AIProvider
 *   → parseAxisAnalysis → AxisAnalysis
 *
 * Configuración por variables de entorno (ver docs/AXIS.md):
 *   ANTHROPIC_API_KEY   clave del proveedor (sin ella, la IA no está disponible)
 *   AXIS_AI_ENABLED     "false" para desactivar la IA aunque haya clave
 *   AXIS_AI_MODEL       modelo a utilizar (opcional)
 */
import { buildAIRequest } from '../prompt'
import { AIProviderError, type AIProvider } from '../provider'
import { parseAxisAnalysis } from '../../validate'
import { AI_ENGINE_INFO } from '../../ai-engine'
import type { AxisAnalysis, AxisInput, AxisMemory, FinancialContext } from '../../types'
import { createAnthropicProvider } from './anthropic-provider'

export interface AIServerConfig {
  apiKey?: string
  enabled: boolean
  model?: string
}

export function readAIServerConfig(env: Record<string, string | undefined> = process.env): AIServerConfig {
  const apiKey = env.ANTHROPIC_API_KEY?.trim() || undefined
  return {
    apiKey,
    enabled: apiKey !== undefined && env.AXIS_AI_ENABLED?.trim().toLowerCase() !== 'false',
    model: env.AXIS_AI_MODEL?.trim() || undefined,
  }
}

export function isAIAvailable(config: AIServerConfig): boolean {
  return config.enabled && config.apiKey !== undefined
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

export function providerFromConfig(config: AIServerConfig): AIProvider | null {
  if (!isAIAvailable(config) || !config.apiKey) return null
  return createAnthropicProvider({ apiKey: config.apiKey, model: config.model })
}
