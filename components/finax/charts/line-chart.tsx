'use client'

import { useId } from 'react'
import { chartGeometry, formatTick, smoothPath } from '@/lib/ui/chart-geometry'
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
 * La escala vertical se ajusta a la serie (lib/ui/chart-geometry), así que se
 * muestra un eje con valores redondos a la izquierda (300 €, 400 €, 500 €…) y
 * una línea guía suave a la altura de cada uno.
 * SVG puro, responsive vía viewBox; los valores del eje van en HTML para no deformarse.
 */
export function LineChart({ data, xs, height = 150, className }: LineChartProps) {
  const gradientId = useId()
  const lineId = useId()
  const width = 340
  const padY = 14

  const { points, baseY, ticks, tickStep } = chartGeometry(data, xs ?? null, width, height, padY)

  // Suavizado monótono: nunca se sale de los valores reales ni retrocede en el tiempo.
  const linePath = smoothPath(points)

  // El área llega al 0 si está en escala (un patrimonio negativo queda por debajo); si no, al borde inferior.
  const last = points[points.length - 1]
  const areaPath = `${linePath} L ${last[0]},${baseY} L ${points[0][0]},${baseY} Z`

  const labels = ticks.map((t) => ({ ...t, text: formatTick(t.value, tickStep) }))
  // La columna del eje mide lo que el valor más largo: el resto se alinea a la derecha.
  const widest = labels.reduce((a, b) => (b.text.length > a.length ? b.text : a), '')

  return (
    <div className={cn('flex gap-2', className)}>
      <div aria-hidden className="relative shrink-0 text-[10.5px] font-semibold tabular-nums text-muted-foreground">
        <span className="invisible block h-0 overflow-hidden whitespace-nowrap">{widest}</span>
        {labels.map((t) => (
          <span key={t.value} className="absolute right-0 -translate-y-1/2 whitespace-nowrap leading-none" style={{ top: `${(t.y / height) * 100}%` }}>
            {t.text}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full min-w-0 flex-1"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Evolución del patrimonio: entre ${formatCurrency(Math.min(...data))} y ${formatCurrency(Math.max(...data))} en el periodo`}
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
        {ticks.map((t) => (
          <line
            key={t.value}
            x1={0}
            x2={width}
            y1={t.y}
            y2={t.y}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* key = el trazado: al cambiar de periodo, la línea se vuelve a dibujar. */}
        <path key={`a-${linePath}`} className="chart-area" d={areaPath} fill={`url(#${gradientId})`} />
        <path
          key={`l-${linePath}`}
          className="chart-draw"
          d={linePath}
          fill="none"
          stroke={`url(#${lineId})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <g key={`p-${linePath}`} className="chart-area">
          <circle cx={last[0]} cy={last[1]} r="4.5" fill="var(--finax)" />
          <circle cx={last[0]} cy={last[1]} r="8" fill="var(--finax)" fillOpacity="0.18" />
        </g>
      </svg>
    </div>
  )
}
