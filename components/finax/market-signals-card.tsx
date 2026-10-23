'use client'

import type { MarketSignal } from '@/lib/axis/plan/market-signals'
import { FinancialCard } from './card'
import { cn } from '@/lib/utils'

const TONE: Record<MarketSignal['tone'], string> = {
  calm: 'bg-finax-soft text-finax-dark',
  info: 'bg-axis-soft text-axis-indigo',
  warning: 'bg-negative/8 text-negative',
}

const TONE_LABEL: Record<MarketSignal['tone'], string> = {
  calm: 'Tu plan no cambia',
  info: 'Para decidir mejor',
  warning: 'Te afecta',
}

interface MarketSignalsCardProps {
  signals: readonly MarketSignal[]
  /** Lleva a Deudas desde un aviso de deuda variable. */
  onDebts?: () => void
}

/**
 * «El mercado y tu plan»: lo que significa el mercado de esta semana para tu
 * dinero. Nunca cambia lo que inviertes ni recomienda productos.
 */
export function MarketSignalsCard({ signals, onDebts }: MarketSignalsCardProps) {
  if (signals.length === 0) return null
  return (
    <FinancialCard className="space-y-3">
      <p className="text-[15px] font-bold text-grafito">El mercado y tu plan</p>
      <ul className="space-y-3">
        {signals.map((s) => (
          <li key={s.id} className="space-y-1">
            <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold', TONE[s.tone])}>{TONE_LABEL[s.tone]}</span>
            <p className="text-[13.5px] font-bold leading-snug text-grafito text-pretty">{s.title}</p>
            <p className="text-[12.5px] font-medium leading-snug text-grafito/85 text-pretty">{s.text}</p>
            {s.id.startsWith('variable-debt:') && onDebts && (
              <button type="button" onClick={onDebts} className="tap text-[12.5px] font-semibold text-axis-indigo underline-offset-2 hover:underline">
                Ver tus deudas
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[11.5px] font-medium leading-snug text-muted-foreground text-pretty">
        Con los datos oficiales de la investigación de mercado de esta semana. Describe lo que ya ha pasado: nadie sabe lo que hará el mercado.
      </p>
    </FinancialCard>
  )
}
