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

/**
 * Diagnóstico de una llamada al proveedor, apto para los logs del servidor:
 * solo números, códigos y nombres de límite. Nunca textos del modelo ni del
 * usuario, cuerpos de respuesta, identificadores de cuenta ni claves.
 */
export interface ProviderDiagnostics {
  status?: number
  /** Motivo de fin que reporta el proveedor (`stop`, `length`, `MAX_TOKENS`…). */
  finishReason?: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  /** Límite que ha saltado según el proveedor (`TPM`, `TPD`, `RPM`, `RPD`). */
  limitType?: string
  /** Cifras del mensaje de límite del proveedor: tope, consumido y pedido por esta llamada. */
  limit?: number
  used?: number
  requested?: number
  /** Cabeceras de límite del proveedor (`retry-after`, `x-ratelimit-*`), tal cual. */
  retryAfter?: string
  limitRequests?: string
  limitTokens?: string
  remainingRequests?: string
  remainingTokens?: string
  resetRequests?: string
  resetTokens?: string
}

/** Error del proveedor con una causa clasificada; nunca contiene secretos. */
export class AIProviderError extends Error {
  constructor(
    public readonly kind: 'unavailable' | 'rate-limit' | 'http' | 'timeout' | 'malformed' | 'refusal',
    message: string,
    public readonly diagnostics?: ProviderDiagnostics,
  ) {
    super(message)
    this.name = 'AIProviderError'
  }
}
