import type { ReactNode } from 'react'
import { formatPct } from '@/lib/format'

interface LegendRowProps {
  color: string
  label: string
  pct: number
}

/** Fila de leyenda para el donut: punto de color, etiqueta y porcentaje. */
export function LegendRow({ color, label, pct }: LegendRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="text-[13px] font-medium text-grafito">{label}</span>
      </div>
      <span className="text-[13px] font-semibold text-muted-foreground tabular-nums">
        {formatPct(pct)}
      </span>
    </div>
  )
}

interface CategoryRowProps {
  icon: ReactNode
  label: string
  amount: string
  pct: number
}

/**
 * Fila de categoría con chip de icono, importe, barra de progreso
 * y porcentaje (lista inferior de Estadísticas).
 */
export function CategoryRow({ icon, label, amount, pct }: CategoryRowProps) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-finax-soft text-finax">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[14px] font-bold text-grafito">{label}</p>
          <span className="shrink-0 text-[13px] font-semibold text-muted-foreground tabular-nums">
            {formatPct(pct)}
          </span>
        </div>
        <p className="mt-0.5 text-[12.5px] font-semibold text-muted-foreground">{amount}</p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-finax" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}
