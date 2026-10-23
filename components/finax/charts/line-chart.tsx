'use client'

import { useId, useState, type PointerEvent } from 'react'
import { chartGeometry, formatTick, nearestPointIndex, smoothPath } from '@/lib/ui/chart-geometry'
import { formatCurrency, formatWholeCurrency } from '@/lib/format'
import { formatShortDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

interface LineChartProps {
  data: number[]
  /** Posición en el tiempo de cada valor (p. ej. días): el eje X es proporcional. Sin ella, espaciado uniforme. */
  xs?: number[]
  /** Fecha (YYYY-MM-DD) de cada valor: al tocar la gráfica se lee «8.851 € · 13 oct 2026». */
  dates?: string[]
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
 * Al tocar o deslizar el dedo en horizontal se marca el punto real más cercano
 * con su importe en euros enteros (sin interpolar entre puntos).
 */
export function LineChart({ data, xs, dates, height = 150, className }: LineChartProps) {
  const [active, setActive] = useState<number | null>(null)
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

  // Otro periodo trae otra serie: un índice fuera de ella no se muestra.
  const picked = active !== null && active < points.length ? active : null
  const marker = points[picked ?? points.length - 1]
  const pointAt = (e: PointerEvent<HTMLDivElement>): number | null => {
    const rect = e.currentTarget.getBoundingClientRect()
    return rect.width === 0 ? null : nearestPointIndex(points, ((e.clientX - rect.left) / rect.width) * width)
  }
  const pick = (e: PointerEvent<HTMLDivElement>) => setActive(pointAt(e))
  // Tocar otra vez el mismo punto lo oculta y vuelve a mostrar el último.
  const toggle = (e: PointerEvent<HTMLDivElement>) => {
    const i = pointAt(e)
    setActive((prev) => (e.pointerType !== 'mouse' && prev === i ? null : i))
  }

  return (
    <div className={cn('flex gap-2', className)}>
      <div aria-hidden className="relative shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
        <span className="invisible block h-0 overflow-hidden whitespace-nowrap">{widest}</span>
        {labels.map((t) => (
          <span key={t.value} className="absolute right-0 -translate-y-1/2 whitespace-nowrap leading-none" style={{ top: `${(t.y / height) * 100}%` }}>
            {t.text}
          </span>
        ))}
      </div>
      {/* mr-2: el punto final (HTML) sobresale del trazado sin cortarse en el borde. */}
      <div
        className="relative mr-2 min-w-0 flex-1 touch-pan-y select-none"
        onPointerDown={toggle}
        onPointerMove={(e) => {
          // Ratón: sigue al cursor. Dedo: solo mientras está apoyado (el desplazamiento vertical sigue funcionando).
          if (e.pointerType === 'mouse' || e.buttons > 0) pick(e)
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setActive(null)
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full"
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
          {picked !== null && (
            <line
              x1={marker[0]}
              x2={marker[0]}
              y1={0}
              y2={height}
              stroke="var(--finax-dark)"
              strokeOpacity="0.35"
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {/* Punto final en HTML: dentro del SVG (preserveAspectRatio="none") se deformaba en óvalo y se cortaba. */}
        <span
          key={`p-${linePath}`}
          aria-hidden
          className="chart-area pointer-events-none absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-finax/20"
          style={{ left: `${(marker[0] / width) * 100}%`, top: `${(marker[1] / height) * 100}%` }}
        >
          <span className="h-[9px] w-[9px] rounded-full bg-finax" />
        </span>
        {picked !== null && (
          // Etiqueta hacia dentro de la gráfica: a la derecha del punto en la mitad izquierda y al revés.
          <span
            role="status"
            className={cn(
              'pointer-events-none absolute -top-1 whitespace-nowrap rounded-full bg-grafito px-2.5 py-1 text-[11.5px] font-bold text-white tabular-nums shadow-md',
              marker[0] > width / 2 ? '-translate-x-full' : '',
            )}
            style={{ left: `${(marker[0] / width) * 100}%` }}
          >
            {formatWholeCurrency(data[picked])}
            {dates?.[picked] && <span className="font-semibold text-white/75"> · {formatShortDate(dates[picked])}</span>}
          </span>
        )}
      </div>
    </div>
  )
}
