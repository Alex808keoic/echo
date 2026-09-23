/**
 * Modelo de lenguaje de AXIS.
 *
 * AXIS no es Gemini: Gemini (o Groq, o ninguno) es un motor lingüístico
 * intercambiable. Esta interfaz es lo único que el resto de AXIS conoce de
 * él: recibe una petición ya preparada (instrucciones, contexto, esquema) y
 * devuelve la salida cruda, que siempre se valida después. Nunca decide: la
 * decisión (`AxisDecision`) se toma antes y sin él.
 *
 * Implementaciones: `fromProvider` (envuelve los proveedores existentes sin
 * modificarlos) y `noModel` (sin modelo: AXIS responde en local).
 */
import type { MarketAIProvider } from '../../ai/providers/types'
import { AIProviderError, type AIProvider, type AIRequest, type ProviderDiagnostics } from '../ai/provider'

export interface LanguageOptions {
  maxOutputTokens: number
  signal?: AbortSignal
  /** Recibe el diagnóstico de una llamada que ha respondido (uso de tokens, motivo de fin, límites). Solo para logs. */
  onDiagnostics?: (diagnostics: ProviderDiagnostics) => void
}

export interface AxisLanguageModel {
  /** Identificador legible (`proveedor:modelo` o `none`), para diagnósticos; nunca secretos. */
  readonly id: string
  /** `false` en `noModel`: no se hace ninguna llamada. */
  readonly available: boolean
  /** Devuelve la salida cruda del modelo (JSON parseado) o lanza `AIProviderError`. */
  complete(request: AIRequest, options: LanguageOptions): Promise<unknown>
}

/** Envuelve un proveedor existente (Gemini, Groq, mock) sin tocarlo. */
export function fromProvider(provider: AIProvider | MarketAIProvider): AxisLanguageModel {
  return {
    id: provider.id,
    available: true,
    complete: (request, options) =>
      'completeWithUsage' in provider
        ? provider.completeWithUsage(request, options).then((c) => {
            if (c.diagnostics) options.onDiagnostics?.(c.diagnostics)
            return c.output
          })
        : provider.complete(request, options.signal),
  }
}

/** Sin modelo de lenguaje: cualquier intento de usarlo falla como «no disponible». */
export const noModel: AxisLanguageModel = {
  id: 'none',
  available: false,
  complete: () => Promise.reject(new AIProviderError('unavailable', 'sin modelo de lenguaje configurado')),
}

/** Acepta un modelo ya envuelto o un proveedor crudo (compatibilidad con el código existente). */
export function asLanguageModel(model: AxisLanguageModel | AIProvider | MarketAIProvider): AxisLanguageModel {
  return 'available' in model ? model : fromProvider(model)
}
