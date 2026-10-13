import type { CSSProperties, ReactNode } from 'react'

interface Segment {
  pct: number
  color: string
}

interface DonutChartProps {
  segments: Segment[]
  size?: number
  thickness?: number
  gap?: number
  children?: ReactNode
}

/** Lo que tarda el donut en dibujarse entero al aparecer. */
const SWEEP_MS = 700

/**
 * Donut de proporciones basado en stroke-dasharray.
 * Deja un pequeño hueco entre segmentos y muestra contenido en el centro.
 * Al montarse se dibuja en el sentido de las agujas del reloj: cada porción
 * crece cuando termina la anterior (para repetirlo, cambiar su `key`).
 */
export function DonutChart({
  segments,
  size = 150,
  thickness = 18,
  gap = 2,
  children,
}: DonutChartProps) {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2

  let offset = 0

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label="Distribución">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={thickness}
        />
        {segments.map((segment, i) => {
          const length = (segment.pct / 100) * circumference
          const dash = Math.max(0, length - gap)
          const dashOffset = -offset
          // Retraso y duración proporcionales a dónde empieza y cuánto mide: un solo barrido continuo.
          const sweep: CSSProperties & Record<'--donut-c', string> = {
            '--donut-c': `${circumference}px`,
            animationDelay: `${Math.round((offset / circumference) * SWEEP_MS)}ms`,
            animationDuration: `${Math.max(60, Math.round((segment.pct / 100) * SWEEP_MS))}ms`,
          }
          offset += length
          return (
            <circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={dashOffset}
              className="donut-seg"
              style={sweep}
            />
          )
        })}
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center" style={{ padding: thickness + 6 }}>
          {children}
        </div>
      )}
    </div>
  )
}
