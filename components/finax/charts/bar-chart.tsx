'use client'

import { useId } from 'react'

interface BarDatum {
  month: string
  value: number
}

interface BarChartProps {
  data: BarDatum[]
  height?: number
  /** índice de la barra resaltada (por defecto la última) */
  highlightIndex?: number
}

/** Gráfico de barras (evolución de gastos) con la última barra resaltada. */
export function BarChart({ data, height = 130, highlightIndex }: BarChartProps) {
  const gradientId = useId()
  const max = Math.max(...data.map((d) => d.value))
  const highlight = highlightIndex ?? data.length - 1

  return (
    <div>
      <div className="flex items-end justify-between gap-2" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.round((d.value / max) * 100)
          const active = i === highlight
          return (
            <div key={d.month} className="flex h-full flex-1 items-end">
              <div
                className="w-full rounded-t-lg transition-all"
                style={{
                  height: `${h}%`,
                  background: active
                    ? `url(#${gradientId})`
                    : undefined,
                  backgroundColor: active ? 'var(--finax)' : 'var(--finax-soft-2)',
                }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {data.map((d, i) => (
          <span
            key={d.month}
            className={`flex-1 text-center text-[11px] font-medium ${
              i === highlight ? 'text-finax' : 'text-muted-foreground'
            }`}
          >
            {d.month}
          </span>
        ))}
      </div>
    </div>
  )
}
