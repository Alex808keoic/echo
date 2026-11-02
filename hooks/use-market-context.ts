'use client'

/**
 * `MarketContext` reducido para AXIS: cruza la investigación cacheada con los
 * nombres de las posiciones del usuario, en el dispositivo. Devuelve una
 * referencia estable mientras no cambien la investigación ni las posiciones.
 */
import { useMemo } from 'react'
import { buildMarketContext } from '@/lib/market/relevance'
import { strongEquityMove } from '@/lib/market/moves'
import type { MarketContext } from '@/lib/market/types'
import type { FinancialOverview } from './use-financial-overview'
import { useMarket, type MarketState } from './use-market'

export interface MarketContextState {
  market: MarketContext | null
  marketState: MarketState & { refresh: () => Promise<void> }
}

export function useMarketContext(overview: FinancialOverview | undefined): MarketContextState {
  const marketState = useMarket()
  const { research, history, baseline } = marketState
  // Clave estable de las posiciones: solo cambia si cambian sus nombres.
  const positionKey = useMemo(() => JSON.stringify(overview?.positions.map((p) => p.name).sort() ?? []), [overview])
  const market = useMemo(() => {
    if (!research) return null
    const context = buildMarketContext(research, history, JSON.parse(positionKey) as string[])
    // Caída o subida fuerte del último mes: la usa el plan (y viaja al chat, que recalcula el mismo plan).
    const move = strongEquityMove(research.indicators, baseline)
    return move ? { ...context, equityMove: move } : context
  }, [research, history, baseline, positionKey])
  return { market, marketState }
}
