/**
 * MOTOR DE IA — AXIS
 * ------------------------------------------------------------------
 * Implementa el mismo contrato `AxisEngine` que el motor local, pero delega
 * la interpretación en un proveedor de IA a través de un transporte (en la
 * app, una llamada al servidor de Finax; en tests, un mock).
 *
 *   AxisInput → transporte → salida cruda → parseAxisAnalysis → AxisAnalysis
 *
 * Es una capa prescindible: ante cualquier problema (IA no disponible, sin
 * clave, timeout, error de red o HTTP, JSON inválido, análisis no válido)
 * responde el motor local. Finax nunca depende de la IA para funcionar.
 */
import { parseAxisAnalysis } from './validate'
import type { AxisEngine, AxisEngineInfo, AxisInput, AxisResult } from './types'

export const AI_ENGINE_INFO: AxisEngineInfo = {
  id: 'external-ai',
  label: 'IA de AXIS',
  isAI: true,
}

/** Transporte hacia el proveedor. No conoce secretos: eso queda en el servidor. */
export interface AITransport {
  /** `true` si hay un proveedor configurado y activo. */
  isAvailable(): Promise<boolean>
  /** Devuelve la salida cruda del análisis (se valida después). */
  analyze(input: AxisInput, signal: AbortSignal): Promise<unknown>
}

export interface AIEngineOptions {
  transport: AITransport
  /** Motor al que se recurre ante cualquier fallo. */
  fallback: AxisEngine
  timeoutMs?: number
  /** Notificación opcional de fallbacks, para diagnóstico. Nunca llega a la UI. */
  onFallback?: (reason: string) => void
}

export const DEFAULT_AI_TIMEOUT_MS = 25_000

export function createAIEngine({ transport, fallback, timeoutMs = DEFAULT_AI_TIMEOUT_MS, onFallback }: AIEngineOptions): AxisEngine {
  // La disponibilidad se comprueba una vez por sesión de motor: si no hay IA,
  // no se vuelve a preguntar ni se hacen llamadas.
  let availability: Promise<boolean> | null = null
  const isAvailable = () => (availability ??= transport.isAvailable().catch(() => false))

  async function analyzeWithAI(input: AxisInput): Promise<AxisResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const raw = await transport.analyze(input, controller.signal)
      if (typeof raw !== 'object' || raw === null) throw new Error('salida no válida')
      const generatedAt = (raw as { generatedAt?: unknown }).generatedAt
      // Estos campos los fija Finax, nunca el modelo ni el transporte.
      const analysis = parseAxisAnalysis({
        ...raw,
        engine: AI_ENGINE_INFO,
        basedOnDemoData: input.context.quality.isDemo,
        generatedAt: typeof generatedAt === 'string' ? generatedAt : new Date().toISOString(),
      })
      return { status: 'analysis', analysis }
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    info: AI_ENGINE_INFO,
    async analyze(input) {
      // Sin contexto no hay nada que interpretar: el motor local explica qué falta.
      if (input.context.quality.level === 'none') return fallback.analyze(input)
      if (!(await isAvailable())) {
        onFallback?.('unavailable')
        return fallback.analyze(input)
      }
      try {
        return await analyzeWithAI(input)
      } catch (error) {
        onFallback?.(error instanceof Error ? error.message : 'unknown')
        return fallback.analyze(input)
      }
    },
  }
}
