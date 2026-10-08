'use client'

import { useId } from 'react'
import { chartGeometry, smoothPath } from '@/lib/ui/chart-geometry'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'

interface LineChartProps {
  data: number[]
  /** Posición en el tiempo de cada valor (p. ej. días): el eje X es proporcional. Sin ella, espaciado uniforme. */
  xs?: number[]
  height?: number
  className?: string
}

/**
 * Gráfico de evolución del patrimonio.
 * Línea suavizada (interpolación monótona, sin salirse de los datos) con relleno degradado.
 * La escala vertical se ajusta a la serie (lib/ui/chart-geometry): por eso se
 * indican el máximo y el mínimo del periodo, para que se sepa qué se está viendo.
 * SVG puro, responsive vía viewBox; las etiquetas van en HTML para no deformarse.
 */
export function LineChart({ data, xs, height = 150, className }: LineChartProps) {
  const gradientId = useId()
  const lineId = useId()
  const width = 340
  const padY = 14

  const { points, baseY } = chartGeometry(data, xs ?? null, width, height, padY)

  // Suavizado monótono: nunca se sale de los valores reales ni retrocede en el tiempo.
  const linePath = smoothPath(points)

  // El área llega al 0 si está en escala (un patrimonio negativo queda por debajo); si no, al borde inferior.
  const last = points[points.length - 1]
  const areaPath = `${linePath} L ${last[0]},${baseY} L ${points[0][0]},${baseY} Z`

  // Máximo y mínimo del periodo, a la altura de cada uno (en % de la altura del gráfico).
  const max = Math.max(...data)
  const min = Math.min(...data)
  const topPct = (Math.min(...points.map(([, y]) => y)) / height) * 100
  const bottomPct = (Math.max(...points.map(([, y]) => y)) / height) * 100
  const label = 'pointer-events-none absolute left-0 rounded-full bg-background/80 px-1.5 text-[10.5px] font-semibold leading-[14px] tabular-nums text-muted-foreground'

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Evolución del patrimonio: entre ${formatCurrency(min)} y ${formatCurrency(max)} en el periodo`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--finax)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--finax)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={lineId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="var(--finax)" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={`url(#${lineId})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={last[0]} cy={last[1]} r="4.5" fill="var(--finax)" />
        <circle cx={last[0]} cy={last[1]} r="8" fill="var(--finax)" fillOpacity="0.18" />
      </svg>
      {/* Máximo justo encima de su altura y mínimo justo debajo: nunca tapan la línea. */}
      <span aria-hidden className={label} style={{ bottom: `${100 - topPct}%` }}>
        {formatCurrency(max)}
      </span>
      {min !== max && (
        <span aria-hidden className={label} style={{ top: `${bottomPct}%` }}>
          {formatCurrency(min)}
        </span>
      )}
    </div>
  )
}
