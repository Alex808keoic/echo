/**
 * Caché de análisis de AXIS (sin React), usada por `hooks/use-axis.ts`.
 *
 * - Un resultado por instantánea (identidad del `overview`, estable mientras
 *   no cambian los datos locales), contexto de mercado (`researchId@freshness`)
 *   y firma del perfil (`profileSignature`): aceptar, editar u olvidar un dato
 *   del perfil vuelve a analizar; guardar una conclusión, no.
 * - Si ya hay un análisis con IA para la misma clave, quien pide el local
 *   (las tarjetas) lo reutiliza.
 * - `invalidate()` descarta todo lo de una instantánea (`refresh()` del hook).
 */
import { analyzeSnapshot } from './engine'
import type { FinancialSnapshot } from './context'
import { profileSignature } from './profile/derive'
import type { AxisMemory, AxisResult, MarketContext } from './types'

export type AnalyzeFn = typeof analyzeSnapshot

export interface AnalysisCache {
  resultFor(snapshot: FinancialSnapshot, ai: boolean, market: MarketContext | null, memory: AxisMemory | null): Promise<AxisResult>
  invalidate(snapshot: FinancialSnapshot): void
}

export function createAnalysisCache(analyze: AnalyzeFn = analyzeSnapshot): AnalysisCache {
  const cache = new WeakMap<FinancialSnapshot, Map<string, Promise<AxisResult>>>()
  return {
    resultFor(snapshot, ai, market, memory) {
      const entry = cache.get(snapshot) ?? new Map<string, Promise<AxisResult>>()
      cache.set(snapshot, entry)
      const contextKey = `${market ? `${market.researchId}@${market.freshness}` : 'none'}#${profileSignature(memory)}`
      const aiKey = `ai:${contextKey}`
      const cachedAI = entry.get(aiKey)
      if (cachedAI) return cachedAI
      const key = ai ? aiKey : `local:${contextKey}`
      let pending = entry.get(key)
      if (!pending) {
        const { config, movements, objectives, positions } = snapshot
        pending = analyze({ config, movements, objectives, positions }, ai ? 'ai' : 'local', market, memory)
        entry.set(key, pending)
      }
      return pending
    },
    invalidate(snapshot) {
      cache.delete(snapshot)
    },
  }
}

/** Caché compartida de la aplicación. */
export const analysisCache = createAnalysisCache()
