/**
 * Transporte del navegador hacia el servidor de Finax (`/api/axis`).
 *
 * El navegador nunca habla con el proveedor de IA ni conoce su clave: envía
 * el contexto financiero al servidor de la propia app y recibe un análisis.
 */
import type { AITransport } from '../ai-engine'
import type { AxisInput } from '../types'

export const AXIS_API_PATH = '/api/axis'

export const browserTransport: AITransport = {
  async isAvailable() {
    const res = await fetch(AXIS_API_PATH, { method: 'GET', cache: 'no-store' })
    if (!res.ok) return false
    const body: unknown = await res.json()
    return typeof body === 'object' && body !== null && (body as { available?: unknown }).available === true
  },

  async analyze(input: AxisInput, signal: AbortSignal) {
    const res = await fetch(AXIS_API_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context: input.context, memory: input.memory }),
      signal,
    })
    if (!res.ok) throw new Error(`axis api ${res.status}`)
    const body: unknown = await res.json()
    if (typeof body !== 'object' || body === null || !('analysis' in body)) throw new Error('axis api: respuesta sin análisis')
    return (body as { analysis: unknown }).analysis
  },
}
