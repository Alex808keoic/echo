/**
 * SOLO SERVIDOR. Modelo de lenguaje a partir de la configuración (variables
 * de entorno): el proveedor elegido con `AXIS_AI_PROVIDER`, o `noModel`.
 * Es el único punto que conecta la configuración con los proveedores.
 */
import { providerFromConfig, readAIServerConfig, type AIServerConfig } from '../ai/server/analyze'
import { fromProvider, noModel, type AxisLanguageModel } from './model'

export function languageModelFromConfig(config: AIServerConfig = readAIServerConfig()): AxisLanguageModel {
  const provider = providerFromConfig(config)
  return provider ? fromProvider(provider) : noModel
}
