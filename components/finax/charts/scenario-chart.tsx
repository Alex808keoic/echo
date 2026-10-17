'use client'

import { useId, type PointerEvent } from 'react'
import { monthsLabel, type ScenarioResult } from '@/lib/axis/guide/scenarios'
import { formatTick, nearestPointIndex, niceTicks, yDomain } from '@/lib/ui/chart-geometry'
import { formatWholeCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'

interface ScenarioChartProps {
  /** Mes a mes (0…n): los tres escenarios. */
  series: ScenarioResult[]
  /** Un camino posible mes a mes, en céntimos (lib/axis/guide/scenarios.ts `scenarioPath`). */
  path: number[]
  /** Mes marcado al tocar, o `null`. */
  active: number | null
  onActive: (month: number | null) => void
  height?: number
}

/**
 * Escenarios ilustrativos: banda entre «si va mal» y «si va bien», línea
 * discontinua de «lo normal» y un camino posible que sube y baja como una
 * inversión real. Eje vertical ajustado a los valores, con euros redondos, y
 * eje de tiempo. Al tocar o deslizar se marca un mes; el valor lo enseña quien
 * la usa (las tres cifras de debajo cambian a ese mes).
 */
export function ScenarioChart({ series, path, active, onActive, height = 150 }: ScenarioChartProps) {
  const gradientId = useId()
  const width = 300
  const padY = 10
  const n = series.length - 1
  const cents = [...series.flatMap((s) => [s.badCents, s.goodCents]), ...path]
  const domain = yDomain(cents.map((c) => c / 100))
  const { ticks, step, lo, hi } = niceTicks(domain.lo, domain.hi)
  const x = (i: number) => (n === 0 ? 0 : (i / n) * width)
  const y = (c: number) => padY + (1 - (c / 100 - lo) / (hi - lo || 1)) * (height - 2 * padY)
  const line = (values: number[]) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  const good = series.map((s) => s.goodCents)
  const bad = series.map((s) => s.badCents)
  const band = `${line(good)} ${bad
    .map((v, i) => [i, v] as const)
    .reverse()
    .map(([i, v]) => `L${x(i).toFixed(2)},${y(v).toFixed(2)}`)
    .join(' ')} Z`
  const points = path.map((v, i) => [x(i), y(v)] as const)
  const picked = active !== null && active <= n ? active : null
  const marker = points[picked ?? n]
  const labels = ticks.map((value) => ({ value, y: y(value * 100), text: formatTick(value, step) }))
  const widest = labels.reduce((a, b) => (b.text.length > a.length ? b.text : a), '')
  const years = n / 12

  const monthAt = (e: PointerEvent<HTMLDivElement>): number | null => {
    const rect = e.currentTarget.getBoundingClientRect()
    return rect.width === 0 ? null : nearestPointIndex(points, ((e.clientX - rect.left) / rect.width) * width)
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <div aria-hidden className="relative shrink-0 text-[10.5px] font-semibold tabular-nums text-muted-foreground" style={{ height }}>
          <span className="invisible block h-0 overflow-hidden whitespace-nowrap">{widest}</span>
          {labels.map((t) => (
            <span key={t.value} className="absolute right-0 -translate-y-1/2 whitespace-nowrap leading-none" style={{ top: `${(t.y / height) * 100}%` }}>
              {t.text}
            </span>
          ))}
        </div>
        <div
          className="relative mr-2 min-w-0 flex-1 touch-pan-y select-none"
          style={{ height }}
          onPointerDown={(e) => {
            const m = monthAt(e)
            // Dedo: tocar otra vez el mismo mes lo quita.
            onActive(e.pointerType !== 'mouse' && m === picked ? null : m)
          }}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse' || e.buttons > 0) onActive(monthAt(e))
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') onActive(null)
          }}
        >
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Escenarios ilustrativos de cómo podría evolucionar tu dinero">
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--finax)" stopOpacity="0.2" />
                <stop offset="100%" stopColor="var(--negative)" stopOpacity="0.1" />
              </linearGradient>
            </defs>
            {labels.map((t) => (
              <line key={t.value} x1={0} x2={width} y1={t.y} y2={t.y} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={band} fill={`url(#${gradientId})`} />
            <path d={line(good)} fill="none" stroke="var(--finax)" strokeOpacity="0.5" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
            <path d={line(bad)} fill="none" stroke="var(--negative)" strokeOpacity="0.5" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
            <path d={line(series.map((s) => s.midCents))} fill="none" stroke="var(--grafito)" strokeOpacity="0.45" strokeWidth="1.25" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            {/* key = el camino: al cambiar cantidad o plazo, se vuelve a dibujar. */}
            <path
              key={path.join(',')}
              className="chart-draw"
              d={line(path)}
              fill="none"
              stroke="var(--finax-dark)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {picked !== null && (
              <line x1={marker[0]} x2={marker[0]} y1={0} y2={height} stroke="var(--finax-dark)" strokeOpacity="0.4" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          {/* Punto en HTML: dentro del SVG (preserveAspectRatio="none") se deformaría en óvalo. */}
          <span
            aria-hidden
            className="pointer-events-none absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-finax/20"
            style={{ left: `${(marker[0] / width) * 100}%`, top: `${(marker[1] / height) * 100}%` }}
          >
            <span className="h-[9px] w-[9px] rounded-full bg-finax-dark" />
          </span>
          {picked !== null && (
            <span
              role="status"
              className={cn(
                'pointer-events-none absolute -top-2 whitespace-nowrap rounded-full bg-grafito px-2.5 py-1 text-[11.5px] font-bold text-white tabular-nums shadow-md',
                marker[0] > width / 2 ? '-translate-x-full' : '',
              )}
              style={{ left: `${(marker[0] / width) * 100}%` }}
            >
              {formatWholeCurrency(path[picked] / 100)}
              <span className="font-semibold text-white/75"> · {monthsLabel(picked)}</span>
            </span>
          )}
        </div>
      </div>
      {/* Eje de tiempo, alineado con el área de la gráfica (misma columna invisible que el eje vertical). */}
      <div aria-hidden className="flex gap-2 text-[10.5px] font-semibold text-muted-foreground">
        <span className="invisible h-0 overflow-hidden whitespace-nowrap tabular-nums">{widest}</span>
        <div className="mr-2 flex min-w-0 flex-1 justify-between">
          <span>Hoy</span>
          {years >= 2 && <span>{monthsLabel(Math.round(n / 2))}</span>}
          <span>{monthsLabel(n)}</span>
        </div>
      </div>
    </div>
  )
}
