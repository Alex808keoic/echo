/**
 * Abstracción del proveedor de IA de AXIS.
 *
 * Un `AIProvider` recibe una petición ya preparada (instrucciones, contexto
 * y esquema JSON de salida) y devuelve la salida cruda del modelo como
 * `unknown`. Nunca decide nada: la validación (`parseAxisAnalysis`) y el
 * fallback viven fuera. Cambiar de proveedor = otra implementación de esta
 * interfaz, sin tocar AXIS ni la UI.
 */

export interface AIRequest {
  /** Instrucciones estrictas de AXIS (prompt de sistema). */
  system: string
  /** Contexto financiero y señales, ya serializados. */
  user: string
  /** JSON Schema que la salida debe cumplir. */
  schema: Record<string, unknown>
}

export interface AIProvider {
  /** Identificador legible del modelo/proveedor, para diagnósticos (nunca secretos). */
  readonly id: string
  /** Devuelve el JSON producido por el modelo, ya parseado, o lanza un error. */
  complete(request: AIRequest, signal?: AbortSignal): Promise<unknown>
}

/** Error del proveedor con una causa clasificada; nunca contiene secretos. */
export class AIProviderError extends Error {
  constructor(
    public readonly kind: 'unavailable' | 'rate-limit' | 'http' | 'timeout' | 'malformed' | 'refusal',
    message: string,
  ) {
    super(message)
    this.name = 'AIProviderError'
  }
}
