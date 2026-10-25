'use client'

import { useMemo } from 'react'
import type { FinancialOverview } from '@/hooks/use-financial-overview'
import { useAllocationPlan } from '@/hooks/use-allocation-plan'
import { idealSplit, type SplitPartKey } from '@/lib/axis/plan/ideal-split'
import { PLAN_DISCLAIMER } from '@/lib/axis/plan/describe'
import { formatCents } from '@/lib/money'
import { formatPct } from '@/lib/format'
import { DonutChart } from './charts/donut-chart'
import { Button } from './button'
import type { ScreenKey } from './bottom-navigation'

/** Color fijo por parte: los tipos de inversión, los mismos que la barra de Tu plan. */
const PART_COLOR: Record<SplitPartKey, string> = {
  cushion: '#0b8560',
  objectives: 'var(--finax)',
  'safe-savings': '#02648c',
  debt: 'var(--grafito)',
  'global-equity': 'var(--axis-blue)',
  bonds: 'var(--axis-indigo)',
  risky: 'var(--negative)',
}

interface IdealSplitProps {
  overview: FinancialOverview
  onNavigate: (screen: ScreenKey) => void
}

/**
 * «Cómo debería repartirse tu dinero»: AXIS reparte todo tu patrimonio de hoy
 * como lo haría tu plan y lo compara con cómo lo tienes. Va en Tu dinero y en
 * Herramientas de AXIS; sin título propio (lo pone quien lo usa).
 */
export function IdealSplit({ overview, onNavigate }: IdealSplitProps) {
  const result = useAllocationPlan(overview)
  const split = useMemo(() => (result ? idealSplit(result.plan, result.decision) : null), [result])
  if (!split) return null

  if (split.kind === 'empty')
    return <p className="text-[13px] font-medium text-muted-foreground text-pretty">Aún no tienes patrimonio que repartir. Empieza por tu saldo inicial o un ingreso.</p>
  if (split.kind === 'no-data')
    return <p className="text-[13px] font-medium text-muted-foreground text-pretty">Necesito al menos un mes de gastos apuntados para saber cuánto colchón te hace falta.</p>
  if (split.kind === 'no-profile')
    return (
      <div className="space-y-3">
        <p className="text-[13px] font-medium text-muted-foreground text-pretty">
          Para decirte cuánto invertir y en qué tipos necesito saber cuánto riesgo aceptas y cuándo necesitarás el dinero.
        </p>
        <Button variant="secondary" fullWidth onClick={() => onNavigate('memoria')}>
          Responder «Tu perfil»
        </Button>
      </div>
    )

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-axis-soft px-3 py-2 text-[12.5px] font-semibold leading-snug text-axis-indigo text-pretty">{split.headline}</p>

      <div className="flex items-center gap-5">
        <DonutChart segments={split.parts.map((p) => ({ pct: p.pct, color: PART_COLOR[p.key] }))} size={132} thickness={16}>
          <span className="whitespace-nowrap text-[13px] font-extrabold text-grafito tabular-nums">{formatCents(split.totalCents)}</span>
          <span className="text-[11px] font-medium text-muted-foreground">Recomendado</span>
        </DonutChart>
        <ul className="min-w-0 flex-1 space-y-3">
          {split.parts.map((p) => (
            <li key={p.key} className="flex items-start gap-2.5">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PART_COLOR[p.key] }} />
              <div className="min-w-0 flex-1">
                <p className="break-words text-[13px] font-semibold text-grafito">{p.label}</p>
                <p className="flex flex-wrap gap-x-1.5 text-[12.5px] font-medium text-muted-foreground tabular-nums">
                  <span className="whitespace-nowrap">{formatCents(p.cents)}</span>
                  <span className="whitespace-nowrap font-bold">{formatPct(p.pct)}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-[13px] font-bold text-grafito">Cómo lo tienes</p>
        {split.comparison.map((c) => (
          <div key={c.group} className="space-y-1">
            <p className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="min-w-0 font-semibold text-grafito">{c.label}</span>
              <span className="whitespace-nowrap font-medium text-muted-foreground tabular-nums">
                tú <span className="font-bold text-grafito">{formatPct(c.actualPct)}</span> · recomendado {formatPct(c.idealPct)}
              </span>
            </p>
            {/* Barra de lo que tienes y marca de lo recomendado. */}
            <div className="relative h-1.5 w-full rounded-full bg-muted">
              <div className="h-full rounded-full bg-finax" style={{ width: `${c.actualPct}%` }} />
              <span className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-grafito" style={{ left: `calc(${c.idealPct}% - 1px)` }} aria-hidden />
            </div>
          </div>
        ))}
        <p className="text-[11.5px] font-medium leading-snug text-muted-foreground text-pretty">
          La raya marca lo recomendado. Lo calcula tu plan: colchón, objetivos, deudas y tu perfil. {PLAN_DISCLAIMER}
        </p>
      </div>
    </div>
  )
}
