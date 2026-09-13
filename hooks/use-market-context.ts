'use client'

/**
 * `MarketContext` reducido para AXIS: cruza la investigación cacheada con los
 * nombres de las posiciones del usuario, en el dispositivo. Devuelve una
 * referencia estable mientras no cambien la investigación ni las posiciones.
 */
import { useMemo } from 'react'
import { buildMarketContext } from '@/lib/market/relevance'
import type { MarketContext } from '@/lib/market/types'
import type { FinancialOverview } from './use-financial-overview'
import { useMarket, type MarketState } from './use-market'

export interface MarketContextState {
  market: MarketContext | null
  marketState: MarketState & { refresh: () => Promise<void> }
}

export function useMarketContext(overview: FinancialOverview | undefined): MarketContextState {
  const marketState = useMarket()
  const { research, history } = marketState
  // Clave estable de las posiciones: solo cambia si cambian sus nombres.
  const positionKey = useMemo(() => JSON.stringify(overview?.positions.map((p) => p.name).sort() ?? []), [overview])
  const market = useMemo(() => {
    if (!research) return null
    return buildMarketContext(research, history, JSON.parse(positionKey) as string[])
  }, [research, history, positionKey])
  return { market, marketState }
}
