'use client'

/**
 * Investigación de mercado en el cliente.
 *
 * - Lee la caché de Dexie al montar.
 * - Si hay conexión y la caché tiene más de `REFRESH_AFTER_MS` (o no existe),
 *   descarga `latest.json` y `history.json` de la rama de datos pública
 *   (`NEXT_PUBLIC_MARKET_DATA_URL`), con `If-None-Match`, y la guarda.
 * - Sin conexión o sin URL configurada, usa lo que haya en la caché.
 *
 * Abrir Finax NUNCA llama a ninguna IA: solo descarga un JSON estático.
 */
import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getMarketCache, putMarketCache, touchMarketCache, type MarketCacheEntry } from '@/lib/db/market'
import { freshnessOf } from '@/lib/market/freshness'
import type { Freshness, MarketHistoryEntry, MarketResearch } from '@/lib/market/types'
import { parseMarketHistory, parseMarketResearch } from '@/lib/market/validate'
import { pickBaselineId, type MarketBaseline } from '@/lib/market/moves'

/** URL pública de la rama de datos (no es un secreto). Sin ella, la función de mercado queda desactivada. */
export const MARKET_DATA_URL = process.env.NEXT_PUBLIC_MARKET_DATA_URL?.replace(/\/$/, '') ?? ''

export const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000

export interface MarketState {
  /** `disabled`: sin URL configurada · `loading` · `ready` (puede ser caché) · `empty`: sin datos y sin descarga posible */
  status: 'disabled' | 'loading' | 'ready' | 'empty'
  research: MarketResearch | null
  history: MarketHistoryEntry[]
  /** Investigación de hace unas 4 semanas para comparar la bolsa (`null` si no hay). */
  baseline: MarketBaseline | null
  freshness: Freshness | null
  fetchedAt: number | null
  /** Última descarga falló (se sigue usando la caché). */
  offline: boolean
}

let refreshInFlight: Promise<void> | null = null

/**
 * Indicadores de la investigación de hace unas 4 semanas (`history/<id>.json`).
 * Se reutiliza la guardada si es la misma; si falla, se sigue sin ella.
 */
async function fetchBaseline(history: MarketHistoryEntry[], research: MarketResearch, previous: MarketBaseline | null | undefined): Promise<MarketBaseline | null> {
  const id = pickBaselineId(history, research.generatedAt)
  if (!id) return null
  if (previous?.id === id) return previous
  try {
    const res = await fetch(`${MARKET_DATA_URL}/history/${encodeURIComponent(id)}.json`, { cache: 'no-store' })
    if (!res.ok) return previous ?? null
    const old = parseMarketResearch(await res.json())
    return { id: old.id, generatedAt: old.generatedAt, indicators: old.indicators }
  } catch {
    return previous ?? null
  }
}

/** Descarga y guarda la investigación si procede. Compartida entre montajes. */
export async function refreshMarket(cache: MarketCacheEntry | null, force = false): Promise<void> {
  if (!MARKET_DATA_URL) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  if (!force && cache && Date.now() - cache.fetchedAt < REFRESH_AFTER_MS) return
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    const headers: Record<string, string> = {}
    if (cache?.etag && !force) headers['if-none-match'] = cache.etag
    const res = await fetch(`${MARKET_DATA_URL}/latest.json`, { headers, cache: 'no-store' })
    if (res.status === 304 && cache) {
      // Cachés anteriores a la comparación de la bolsa: se completa sin volver a descargar la investigación.
      if (cache.baseline === undefined) {
        await putMarketCache({ ...cache, baseline: await fetchBaseline(cache.history, cache.research, null), fetchedAt: Date.now() })
        return
      }
      await touchMarketCache(Date.now())
      return
    }
    if (!res.ok) throw new Error(`market ${res.status}`)
    const research = parseMarketResearch(await res.json())
    let history: MarketHistoryEntry[] = cache?.history ?? []
    try {
      const h = await fetch(`${MARKET_DATA_URL}/history.json`, { cache: 'no-store' })
      if (h.ok) history = parseMarketHistory(await h.json())
    } catch {
      // El histórico es opcional: se conserva el anterior.
    }
    const baseline = await fetchBaseline(history, research, cache?.baseline)
    await putMarketCache({ research, history, baseline, fetchedAt: Date.now(), etag: res.headers.get('etag') ?? undefined })
  })().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

export function useMarket(): MarketState & { refresh: () => Promise<void> } {
  const cache = useLiveQuery(getMarketCache, [])
  const [offline, setOffline] = useState(false)
  const [attempted, setAttempted] = useState(false)

  useEffect(() => {
    if (cache === undefined || attempted) return
    setAttempted(true)
    refreshMarket(cache)
      .then(() => setOffline(false))
      .catch(() => setOffline(true))
  }, [cache, attempted])

  const refresh = useCallback(async () => {
    try {
      await refreshMarket(cache ?? null, true)
      setOffline(false)
    } catch {
      setOffline(true)
    }
  }, [cache])

  if (!MARKET_DATA_URL) {
    return { status: 'disabled', research: null, history: [], baseline: null, freshness: null, fetchedAt: null, offline: false, refresh }
  }
  if (cache === undefined || (cache === null && !attempted)) {
    return { status: 'loading', research: null, history: [], baseline: null, freshness: null, fetchedAt: null, offline, refresh }
  }
  if (!cache) {
    return { status: 'empty', research: null, history: [], baseline: null, freshness: null, fetchedAt: null, offline, refresh }
  }
  return {
    status: 'ready',
    research: cache.research,
    history: cache.history,
    baseline: cache.baseline ?? null,
    freshness: freshnessOf(cache.research.generatedAt),
    fetchedAt: cache.fetchedAt,
    offline,
    refresh,
  }
}
