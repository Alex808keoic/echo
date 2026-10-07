'use client'

import { useId } from 'react'
import { chartGeometry, smoothPath } from '@/lib/ui/chart-geometry'

interface LineChartProps {
  data: number[]
  /** Posición en el tiempo de cada valor (p. ej. días): el eje X es proporcional. Sin ella, espaciado uniforme. */
  xs?: number[]
  height?: number
  className?: string
}

/**
 * Gráfico de evolución del patrimonio.
 * Línea suavizada (interpolación monótona, sin salirse de los datos) con relleno degradado hasta
 * el cero (lib/ui/chart-geometry: tiempo proporcional y el 0 siempre en escala).
 * SVG puro, responsive vía viewBox.
 */
export function LineChart({ data, xs, height = 150, className }: LineChartProps) {
  const gradientId = useId()
  const lineId = useId()
  const width = 340
  const padY = 14

  const { points, zeroY } = chartGeometry(data, xs ?? null, width, height, padY)

  // Suavizado monótono: nunca se sale de los valores reales ni retrocede en el tiempo.
  const linePath = smoothPath(points)

  // El área llega hasta el cero (no hasta el borde inferior): con patrimonio negativo, queda por debajo de la base.
  const last = points[points.length - 1]
  const areaPath = `${linePath} L ${last[0]},${zeroY} L ${points[0][0]},${zeroY} Z`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      role="img"
      aria-label="Evolución del patrimonio"
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
  )
}
