/**
 * Límites duros de consumo del Market Research Engine.
 *
 * Constantes inmutables: no se leen de variables de entorno para que ningún
 * cambio de configuración pueda ampliarlas por accidente. Cambiarlas exige un
 * commit revisado.
 */
export const LIMITS = Object.freeze({
  MAX_DEEP_RESEARCH_PER_MONTH: 6,
  MAX_AI_REQUESTS_PER_DAY: 2,
  MAX_AI_REQUESTS_PER_MONTH: 8,
  /** Por llamada. El material se recorta antes de llamar; nunca se excede. */
  MAX_INPUT_TOKENS: 30_000,
  /** Por llamada. Se pasa al proveedor como tope de generación. */
  MAX_OUTPUT_TOKENS: 6_000,
  /** Por mes (entrada + salida, según el uso real que reporta el proveedor). */
  MAX_TOTAL_TOKENS: 250_000,
  /** Investigaciones profundas extra (por evento) por semana ISO. */
  MAX_EVENT_RESEARCH_PER_WEEK: 1,
  /** Reintentos por investigación (el fallback a Groq). Cada uno cuenta. */
  MAX_RETRIES: 1,
})

/** Estimación conservadora de tokens a partir de texto (≈ 3,5 caracteres/token + 20 % de margen). */
export function estimateTokens(text: string): number {
  return Math.ceil((text.length / 3.5) * 1.2)
}
