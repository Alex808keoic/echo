/**
 * Patrón común de los motores que usan un modelo de lenguaje: comprobar la
 * disponibilidad una sola vez, intentar con un tiempo máximo y, ante
 * cualquier problema, responder con el motor local. Finax nunca depende del
 * modelo para funcionar; este módulo es el que lo garantiza.
 */

/** Recuerda la disponibilidad: se comprueba una vez por motor y un fallo cuenta como «no disponible». */
export function rememberAvailability(check: () => Promise<boolean>): () => Promise<boolean> {
  let pending: Promise<boolean> | null = null
  return () => (pending ??= check().catch(() => false))
}

/** Ejecuta `run` con un `AbortSignal` que se dispara a los `timeoutMs`. */
export async function withTimeout<T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

export interface FallbackPlan<T> {
  isAvailable: () => Promise<boolean>
  timeoutMs: number
  /** Intento con el modelo (incluida la validación de su salida). */
  attempt: (signal: AbortSignal) => Promise<T>
  /** Respuesta local cuando no hay modelo. */
  whenUnavailable: () => T | Promise<T>
  /** Respuesta local cuando el intento falla por cualquier motivo (red, HTTP, timeout, salida inválida). */
  whenFailed: (error: unknown) => T | Promise<T>
}

/** Sin modelo → local; con modelo → intento acotado en tiempo; error → local. */
export async function withFallback<T>(plan: FallbackPlan<T>): Promise<T> {
  if (!(await plan.isAvailable())) return plan.whenUnavailable()
  try {
    return await withTimeout(plan.timeoutMs, plan.attempt)
  } catch (error) {
    return plan.whenFailed(error)
  }
}
