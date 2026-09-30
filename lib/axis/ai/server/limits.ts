/**
 * Límites de coste de la IA de AXIS en el servidor.
 *
 * Complementan a los del proveedor (free tier sin billing) y a la caché del
 * cliente (una llamada por instantánea de datos). Constantes inmutables; el
 * único ajuste externo es `AXIS_AI_MAX_REQUESTS_PER_DAY`, que solo puede
 * REDUCIR el tope, nunca ampliarlo.
 *
 * El contador es por instancia de servidor y se reinicia con cada arranque
 * (en un entorno serverless puede haber varias instancias): es una barrera
 * adicional, no la única. Las barreras principales siguen siendo la cuenta
 * sin billing y la caché del cliente.
 */
export const AXIS_AI_LIMITS = Object.freeze({
  MAX_REQUESTS_PER_DAY: 40,
  /**
   * Ráfaga por minuto. Una conversación normal encadena varias peticiones
   * seguidas (el análisis de la pantalla y cada mensaje del chat consumen
   * una cada uno), así que un tope demasiado bajo corta la conversación sin
   * proteger la cuota: quien la protege es el tope DIARIO.
   */
  MAX_REQUESTS_PER_MINUTE: 12,
  /** Tamaño máximo del contexto recibido del cliente (JSON), en caracteres. */
  MAX_CONTEXT_CHARS: 40_000,
  /** Tope de salida por defecto (proveedores sin tope propio en `MAX_OUTPUT_TOKENS_BY_PROVIDER`). */
  MAX_OUTPUT_TOKENS: 3_000,
  /**
   * Tope de salida de cada proveedor.
   * - Cloudflare (Gemma 4, sin razonamiento): la expresión de una decisión
   *   ocupa ~430 tokens en el peor escenario dorado y una respuesta de chat
   *   cabe en ~570 (2.000 caracteres); 1.200 deja más del doble de margen.
   * - Groq (`gpt-oss`): el razonamiento cuenta dentro de `max_completion_tokens`,
   *   así que un tope bajo trunca la respuesta (`finish_reason: length`).
   */
  MAX_OUTPUT_TOKENS_BY_PROVIDER: Object.freeze({ cloudflare: 1_200, groq: 3_000, gemini: 3_000 }),
  /** Timeout de cada llamada a un proveedor (tope; la cadena puede dar menos). */
  TIMEOUT_MS: 20_000,
  /**
   * Plazo TOTAL de la cadena de proveedores (principal + fallback), por
   * debajo de los 25 s que espera el cliente: pasado ese tiempo el cliente ya
   * ha respondido en local y seguir llamando solo gastaría cuota.
   */
  CHAIN_DEADLINE_MS: 22_000,
  /** Tiempo que la cadena reserva para cada proveedor posterior al que está probando. */
  FALLBACK_RESERVE_MS: 8_000,
  /** Por debajo de este tiempo restante no se empieza otro intento. */
  MIN_ATTEMPT_MS: 3_000,
})

export interface AxisAiCounter {
  day: string
  dayCount: number
  minute: string
  minuteCount: number
}

export function emptyCounter(now: Date): AxisAiCounter {
  return { day: now.toISOString().slice(0, 10), dayCount: 0, minute: now.toISOString().slice(0, 16), minuteCount: 0 }
}

export function dailyCap(env: Record<string, string | undefined> = process.env): number {
  const configured = Number(env.AXIS_AI_MAX_REQUESTS_PER_DAY)
  if (Number.isInteger(configured) && configured >= 0) return Math.min(configured, AXIS_AI_LIMITS.MAX_REQUESTS_PER_DAY)
  return AXIS_AI_LIMITS.MAX_REQUESTS_PER_DAY
}

export type AxisAiDecision = { allowed: true; counter: AxisAiCounter } | { allowed: false; reason: string; counter: AxisAiCounter }

/** Comprueba y, si procede, consume una llamada. Devuelve el contador actualizado. */
export function takeAxisAiSlot(counter: AxisAiCounter, now: Date = new Date(), cap: number = dailyCap()): AxisAiDecision {
  const day = now.toISOString().slice(0, 10)
  const minute = now.toISOString().slice(0, 16)
  const next: AxisAiCounter = {
    day,
    dayCount: counter.day === day ? counter.dayCount : 0,
    minute,
    minuteCount: counter.minute === minute ? counter.minuteCount : 0,
  }
  if (next.dayCount + 1 > cap) return { allowed: false, reason: `límite diario de IA de AXIS (${cap})`, counter: next }
  if (next.minuteCount + 1 > AXIS_AI_LIMITS.MAX_REQUESTS_PER_MINUTE) {
    return { allowed: false, reason: `límite por minuto de IA de AXIS (${AXIS_AI_LIMITS.MAX_REQUESTS_PER_MINUTE})`, counter: next }
  }
  next.dayCount += 1
  next.minuteCount += 1
  return { allowed: true, counter: next }
}

/** Contador compartido de la instancia. */
let instanceCounter: AxisAiCounter | null = null

export function consumeInstanceSlot(now: Date = new Date()): AxisAiDecision {
  const decision = takeAxisAiSlot(instanceCounter ?? emptyCounter(now), now)
  instanceCounter = decision.counter
  return decision
}
