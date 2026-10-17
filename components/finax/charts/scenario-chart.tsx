'use client'

import { useId } from 'react'
import type { ScenarioResult } from '@/lib/axis/guide/scenarios'

interface ScenarioChartProps {
  /** Año a año (0…n): los tres escenarios. */
  series: ScenarioResult[]
  height?: number
}

/**
 * Abanico de escenarios ilustrativos: banda entre «si va mal» y «si va bien»
 * y línea de «lo normal». Eje vertical desde 0 para no exagerar las
 * diferencias; línea discontinua a la altura de lo que pones al principio.
 * SVG puro, responsive vía viewBox. Solo dibuja: las cifras van en HTML.
 */
export function ScenarioChart({ series, height = 120 }: ScenarioChartProps) {
  const gradientId = useId()
  const width = 300
  const padY = 8
  const n = series.length - 1
  const max = Math.max(...series.map((s) => s.goodCents), series[0].midCents) || 1
  const x = (i: number) => (n === 0 ? 0 : (i / n) * width)
  const y = (cents: number) => height - padY - (cents / max) * (height - 2 * padY)
  const line = (pick: (s: ScenarioResult) => number) => series.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(pick(s)).toFixed(1)}`).join(' ')
  const band = `${line((s) => s.goodCents)} ${series
    .map((s, i) => [i, s] as const)
    .reverse()
    .map(([i, s]) => `L${x(i).toFixed(1)},${y(s.badCents).toFixed(1)}`)
    .join(' ')} Z`
  const start = y(series[0].midCents)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-[120px] w-full overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--finax)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--axis-violet)" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <line x1="0" x2={width} y1={start} y2={start} stroke="var(--muted-foreground)" strokeOpacity="0.45" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <path d={band} fill={`url(#${gradientId})`} />
      <path d={line((s) => s.goodCents)} fill="none" stroke="var(--finax)" strokeOpacity="0.55" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <path d={line((s) => s.badCents)} fill="none" stroke="var(--negative)" strokeOpacity="0.55" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <path d={line((s) => s.midCents)} fill="none" stroke="var(--finax-dark)" strokeWidth="2.25" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
