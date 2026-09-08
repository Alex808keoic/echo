'use client'

import { useId } from 'react'

interface LineChartProps {
  data: number[]
  height?: number
  className?: string
}

/**
 * Gráfico de evolución del patrimonio.
 * Línea suavizada (curva de Catmull-Rom → Bézier) con relleno degradado.
 * SVG puro, responsive vía viewBox.
 */
export function LineChart({ data, height = 150, className }: LineChartProps) {
  const gradientId = useId()
  const lineId = useId()
  const width = 340
  const padY = 14

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width
    const y = padY + (1 - (value - min) / range) * (height - padY * 2)
    return [x, y] as const
  })

  // Suavizado tipo Catmull-Rom convertido a curvas cúbicas de Bézier.
  const linePath = points
    .map((point, i) => {
      if (i === 0) return `M ${point[0]},${point[1]}`
      const p0 = points[i - 1]
      const p1 = point
      const prev = points[i - 2] ?? p0
      const next = points[i + 1] ?? p1
      const cp1x = p0[0] + (p1[0] - prev[0]) / 6
      const cp1y = p0[1] + (p1[1] - prev[1]) / 6
      const cp2x = p1[0] - (next[0] - p0[0]) / 6
      const cp2y = p1[1] - (next[1] - p0[1]) / 6
      return `C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p1[0]},${p1[1]}`
    })
    .join(' ')

  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`
  const last = points[points.length - 1]

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
