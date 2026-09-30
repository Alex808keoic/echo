/**
 * SOLO SERVIDOR. Modelo de lenguaje a partir de la configuración (variables
 * de entorno): la cadena de proveedores (`AXIS_AI_PROVIDER` y, si existe,
 * `AXIS_AI_FALLBACK_PROVIDER`), cada uno con su tope de salida y un plazo
 * total compartido; o `noModel`. Es el único punto que conecta la
 * configuración con los proveedores.
 */
import { configuredProviders, readAIServerConfig, type AIServerConfig } from '../ai/server/analyze'
import { AXIS_AI_LIMITS } from '../ai/server/limits'
import { fallbackChain, fromProvider, type AxisLanguageModel } from './model'

export function languageModelFromConfig(config: AIServerConfig = readAIServerConfig()): AxisLanguageModel {
  const models = configuredProviders(config).map(({ id, provider }) => fromProvider(provider, { maxOutputTokens: AXIS_AI_LIMITS.MAX_OUTPUT_TOKENS_BY_PROVIDER[id] }))
  return fallbackChain(models, {
    deadlineMs: AXIS_AI_LIMITS.CHAIN_DEADLINE_MS,
    reserveMs: AXIS_AI_LIMITS.FALLBACK_RESERVE_MS,
    minAttemptMs: AXIS_AI_LIMITS.MIN_ATTEMPT_MS,
  })
}
