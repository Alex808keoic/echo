/**
 * Caché local de la investigación de mercado (Dexie, tabla `market`).
 * Un único registro con clave "latest". No contiene datos del usuario y no
 * forma parte del backup: es regenerable.
 */
import type { MarketHistoryEntry, MarketResearch } from '../market/types'
import { db } from './db'

export const MARKET_KEY = 'latest' as const

export interface MarketCacheEntry {
  key: typeof MARKET_KEY
  research: MarketResearch
  history: MarketHistoryEntry[]
  /** Momento de la última descarga (o intento con 304). */
  fetchedAt: number
  etag?: string
}

export async function getMarketCache(): Promise<MarketCacheEntry | null> {
  const entry = await db.market.get(MARKET_KEY)
  return entry ?? null
}

export async function putMarketCache(entry: Omit<MarketCacheEntry, 'key'>): Promise<void> {
  await db.market.put({ key: MARKET_KEY, ...entry })
}

/** Solo actualiza la marca de tiempo (respuesta 304: sin cambios). */
export async function touchMarketCache(fetchedAt: number): Promise<void> {
  await db.market.update(MARKET_KEY, { fetchedAt })
}

export async function clearMarketCache(): Promise<void> {
  await db.market.clear()
}
