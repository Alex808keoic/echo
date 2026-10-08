/**
 * Caché de análisis de AXIS (sin React), usada por `hooks/use-axis.ts`.
 *
 * - Un resultado por instantánea (identidad del `overview`, estable mientras
 *   no cambian los datos locales), contexto de mercado (`marketCacheKey`:
 *   investigación + indicadores que AXIS usa, que el job diario refresca sin
 *   cambiar la investigación) y firma del perfil (`profileSignature`): aceptar, editar u olvidar un dato
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

/**
 * Clave del mercado para la caché: la investigación (`researchId@freshness`) y
 * los indicadores que AXIS usa (`keyIndicators`), con lo que puede cambiar sin
 * que cambie la investigación: el job diario refresca valor, fecha y variación,
 * y la frescura de cada uno cambia con el paso de los días. Ordenados por
 * clave: el mismo contenido da la misma clave. Los indicadores que no entran en
 * el contexto no cuentan.
 */
export function marketCacheKey(market: MarketContext | null): string {
  if (!market) return 'none'
  const indicators = [...market.keyIndicators]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((i) => `${i.key}=${i.value}@${i.asOf}~${i.changePct}~${i.status ?? ''}~${i.freshness}`)
    .join('|')
  return `${market.researchId}@${market.freshness}[${indicators}]`
}

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
      const contextKey = `${marketCacheKey(market)}#${profileSignature(memory)}`
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
