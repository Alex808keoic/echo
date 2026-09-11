'use client'

import { hasEnoughHistory, type PatrimonioPoint } from '@/lib/finance/patrimonio'
import { filterFrom, periodStartISO, type PeriodId } from '@/lib/finance/summary'
import { LineChart } from './line-chart'
import { TrendUpIcon } from '../icons'

interface EvolutionChartProps {
  series: PatrimonioPoint[]
  range: PeriodId
  className?: string
}

/** Serie recortada al periodo; incluye el último punto anterior como base. */
export function seriesForRange(series: PatrimonioPoint[], range: PeriodId): PatrimonioPoint[] {
  const start = periodStartISO(range)
  if (start === null) return series
  const inRange = filterFrom(series, start)
  const before = series.filter((p) => p.date < start)
  const base = before[before.length - 1]
  return base ? [{ ...base, date: start }, ...inRange] : inRange
}

/**
 * Evolución del patrimonio con datos reales (D-21). Si no hay al menos tres
 * días con movimientos, muestra un estado de datos insuficientes en lugar de
 * dibujar una curva inventada.
 */
export function EvolutionChart({ series, range, className }: EvolutionChartProps) {
  const points = seriesForRange(series, range)
  if (!hasEnoughHistory(points)) {
    const missing = Math.max(0, 3 - points.length)
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/60 px-6 text-center ${className ?? ''}`}
      >
        <TrendUpIcon className="mb-2 h-6 w-6 text-finax" />
        <p className="text-[13px] font-bold text-grafito">Aún no hay evolución que mostrar</p>
        <p className="mt-0.5 text-[12px] font-medium text-muted-foreground text-pretty">
          {points.length === 0
            ? 'Registra movimientos en este periodo para ver la curva.'
            : `Faltan ${missing} día${missing === 1 ? '' : 's'} con movimientos para dibujar una tendencia real.`}
        </p>
      </div>
    )
  }
  return <LineChart data={points.map((p) => p.cents / 100)} className={className} />
}
