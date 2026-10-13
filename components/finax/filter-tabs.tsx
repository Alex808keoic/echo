'use client'

import { cn } from '@/lib/utils'
import { useSlidingIndicator } from './use-sliding-indicator'

interface FilterTabsProps {
  options: readonly string[]
  value: string
  onChange: (value: string) => void
  /** 'pill' = pastilla verde rellena (Movimientos/Estadísticas) */
  size?: 'md' | 'sm'
}

/**
 * Grupo de pestañas/segmentos. La opción activa se rellena en verde Finax,
 * las inactivas quedan en gris claro. El verde se desliza de una opción a otra:
 * el indicador va entre el fondo gris de los botones y su texto (z-10 / z-20).
 */
export function FilterTabs({ options, value, onChange, size = 'md' }: FilterTabsProps) {
  const { containerRef, style, animate } = useSlidingIndicator<HTMLDivElement>(value)
  return (
    <div ref={containerRef} className="relative isolate flex items-center gap-2">
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 z-10 rounded-full bg-finax-dark shadow-[0_6px_14px_-8px_rgba(14,166,118,0.7)]',
          animate && 'slide-indicator',
        )}
        style={style}
      />
      {options.map((option) => {
        const active = option === value
        return (
          <button
            type="button"
            key={option}
            onClick={() => onChange(option)}
            aria-pressed={active}
            data-active={active}
            className={cn(
              'relative after:absolute after:inset-x-0 after:-inset-y-2 rounded-full font-semibold transition-colors duration-200',
              size === 'md' ? 'px-5 py-2 text-[13px]' : 'px-3.5 py-1.5 text-xs',
              active ? 'text-white' : 'bg-muted text-muted-foreground hover:bg-graylight/70',
            )}
          >
            <span className="relative z-20">{option}</span>
          </button>
        )
      })}
    </div>
  )
}

interface SegmentedProps {
  options: readonly string[]
  value: string
  onChange: (value: string) => void
}

/** Segmento compacto usado dentro de tarjetas (rangos temporales del gráfico), con el mismo resaltado deslizante. */
export function Segmented({ options, value, onChange }: SegmentedProps) {
  const { containerRef, style, animate } = useSlidingIndicator<HTMLDivElement>(value)
  return (
    <div ref={containerRef} className="relative isolate inline-flex items-center gap-1 rounded-full bg-muted p-1">
      <span
        aria-hidden
        className={cn('pointer-events-none absolute inset-y-1 left-0 z-10 rounded-full bg-finax-dark', animate && 'slide-indicator')}
        style={style}
      />
      {options.map((option) => {
        const active = option === value
        return (
          <button
            type="button"
            key={option}
            onClick={() => onChange(option)}
            aria-pressed={active}
            data-active={active}
            className={cn(
              'relative after:absolute after:inset-x-0 after:-inset-y-2 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors duration-200',
              active ? 'text-white' : 'text-muted-foreground',
            )}
          >
            <span className="relative z-20">{option}</span>
          </button>
        )
      })}
    </div>
  )
}
