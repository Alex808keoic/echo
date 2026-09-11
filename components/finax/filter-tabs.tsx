'use client'

import { cn } from '@/lib/utils'

interface FilterTabsProps {
  options: readonly string[]
  value: string
  onChange: (value: string) => void
  /** 'pill' = pastilla verde rellena (Movimientos/Estadísticas) */
  size?: 'md' | 'sm'
}

/**
 * Grupo de pestañas/segmentos. La opción activa se rellena en verde Finax,
 * las inactivas quedan en gris claro.
 */
export function FilterTabs({ options, value, onChange, size = 'md' }: FilterTabsProps) {
  return (
    <div className="flex items-center gap-2">
      {options.map((option) => {
        const active = option === value
        return (
          <button
            type="button"
            key={option}
            onClick={() => onChange(option)}
            aria-pressed={active}
            className={cn(
              'rounded-full font-semibold transition-all',
              size === 'md' ? 'px-5 py-2 text-[13px]' : 'px-3.5 py-1.5 text-xs',
              active
                ? 'bg-finax text-white shadow-[0_6px_14px_-8px_rgba(14,166,118,0.7)]'
                : 'bg-muted text-muted-foreground hover:bg-graylight/70',
            )}
          >
            {option}
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

/** Segmento compacto usado dentro de tarjetas (rangos temporales del gráfico). */
export function Segmented({ options, value, onChange }: SegmentedProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-muted p-1">
      {options.map((option) => {
        const active = option === value
        return (
          <button
            type="button"
            key={option}
            onClick={() => onChange(option)}
            aria-pressed={active}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-semibold transition-all',
              active ? 'bg-finax text-white' : 'text-muted-foreground',
            )}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
