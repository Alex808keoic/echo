'use client'

/**
 * Señales del mercado para tu plan (`lib/axis/plan/market-signals.ts`) con lo
 * que hay en el dispositivo: la investigación de esta semana, la de hace unas
 * 4 semanas, tu plan, tus inversiones y tus deudas.
 */
import { useMemo } from 'react'
import { marketSignals, safeRatePct, type MarketSignal } from '@/lib/axis/plan/market-signals'
import { inflationFrom } from '@/lib/axis/plan/inflation'
import { guessAssetType } from '@/lib/axis/plan/mix'
import { strongEquityMove } from '@/lib/market/moves'
import type { AllocationPlan } from '@/lib/axis/plan/allocation'
import type { FinancialOverview } from './use-financial-overview'
import { useMarketContext } from './use-market-context'

export interface MarketSignalsState {
  signals: MarketSignal[]
  /** Lo que paga hoy el ahorro seguro (tipo del BCE vigente), o `null`. */
  safeRatePct: number | null
}

/** Lo que pierde el dinero sin destino no va aquí: «Tu plan» ya lo dice en su paso. */
export function useMarketSignals(overview: FinancialOverview | undefined, plan: AllocationPlan | undefined): MarketSignalsState {
  const { market, marketState } = useMarketContext(overview)
  return useMemo(() => {
    const indicators = market?.keyIndicators ?? []
    if (!overview) return { signals: [], safeRatePct: safeRatePct(indicators) }
    const invest = plan?.steps.find((s) => s.kind === 'invest-long-term')
    const investsMonthly = invest?.kind === 'invest-long-term' && invest.monthlyCents > 0
    const holdsEquity = overview.positions.some((p) => {
      const type = p.assetType ?? guessAssetType(p.name)
      return (type === 'global-equity' || type === 'risky') && p.valueCents > 0
    })
    const signals = marketSignals({
      indicators,
      move: strongEquityMove(marketState.research?.indicators ?? [], marketState.baseline),
      invests: investsMonthly || holdsEquity,
      inflation: plan?.inflation ?? inflationFrom(market),
      debts: overview.debts,
    })
    return { signals, safeRatePct: safeRatePct(indicators) }
  }, [overview, plan, market, marketState.research, marketState.baseline])
}
