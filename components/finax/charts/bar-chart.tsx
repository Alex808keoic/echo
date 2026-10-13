'use client'

import { formatWholeCurrency } from '@/lib/format'
import { formatMonthYear } from '@/lib/dates'
import { cn } from '@/lib/utils'

interface BarDatum {
  /** `YYYY-MM`: da el nombre completo del mes al leer una barra. */
  monthKey: string
  month: string
  value: number
}

interface BarChartProps {
  data: BarDatum[]
  /** Mes elegido (`YYYY-MM`); `null` o fuera del rango = el último (mes actual). */
  selected: string | null
  onSelect: (monthKey: string) => void
  height?: number
}

/**
 * Barras mensuales (gastos o ingresos). Al tocar una barra se resalta,
 * muestra su importe en euros enteros y avisa a la pantalla (que enseña ese
 * mes en el resto de gráficos); por defecto, la del mes actual.
 */
export function BarChart({ data, selected, onSelect, height = 130 }: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value))
  // Un mes elegido que ya no está en el rango (al cambiar 6M/1A/Todo) vuelve al mes actual.
  const pickedIndex = data.findIndex((d) => d.monthKey === selected)
  const highlight = pickedIndex >= 0 ? pickedIndex : data.length - 1

  return (
    <div>
      {/* pt-5: hueco para el importe encima de la barra más alta. */}
      <div className="flex items-end justify-between gap-2 pt-5" style={{ height }}>
        {data.map((d, i) => {
          const h = max > 0 ? Math.round((d.value / max) * 100) : 0
          const active = i === highlight
          return (
            <button
              key={d.monthKey}
              type="button"
              onClick={() => onSelect(d.monthKey)}
              aria-pressed={active}
              aria-label={`${formatMonthYear(d.monthKey)}: ${formatWholeCurrency(d.value)}`}
              className="relative flex h-full flex-1 items-end"
            >
              {active && (
                <span
                  className="absolute left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-[11.5px] font-bold text-grafito tabular-nums"
                  style={{ bottom: `${h}%` }}
                >
                  {formatWholeCurrency(d.value)}
                </span>
              )}
              <span
                className="block w-full rounded-t-lg transition-[height,background-color] duration-300"
                style={{ height: `${h}%`, backgroundColor: active ? 'var(--finax)' : 'var(--finax-soft-2)' }}
              />
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {data.map((d, i) => (
          <span
            key={d.monthKey}
            className={cn(
              'flex-1 text-center text-[11px] font-medium',
              i === highlight ? 'font-bold text-finax-dark' : 'text-muted-foreground',
            )}
          >
            {d.month}
          </span>
        ))}
      </div>
    </div>
  )
}
