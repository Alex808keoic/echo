import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { AxisMark } from './axis-mark'
import { ChevronRight } from './icons'

interface AxisCardProps {
  text: string
  title?: string
  tone?: 'lavender' | 'green'
  onClick?: () => void
  /** Líneas debajo del texto (p. ej. cómo va la decisión del mes). */
  extra?: ReactNode
}

/**
 * Tarjeta de recomendación/insight de AXIS.
 * - lavender: identidad AXIS (violeta/azul), con el símbolo del ecosistema.
 * - green: integrada en Finax, sobre verde (con el mismo símbolo de AXIS).
 */
export function AxisCard({ text, title, tone = 'lavender', onClick, extra }: AxisCardProps) {
  const isLavender = tone === 'lavender'
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3.5 rounded-3xl border p-4 text-left transition-[color,background-color,border-color,scale] duration-150 active:scale-[0.99]',
        isLavender
          ? 'border-axis-violet/15 bg-axis-soft hover:bg-[#e7eaff]'
          : 'border-finax/15 bg-finax-soft hover:bg-finax-soft-2',
      )}
    >
      <AxisMark size={40} className="shrink-0" />
      <div className="min-w-0 flex-1">
        {title && (
          <p
            className={cn(
              'mb-0.5 text-[13px] font-bold',
              isLavender ? 'text-axis-indigo' : 'text-finax-dark',
            )}
          >
            {title}
          </p>
        )}
        <p className="text-[12.5px] font-medium leading-snug text-grafito/80 text-pretty">
          {text}
        </p>
        {extra}
      </div>
      <ChevronRight
        className={cn(
          'h-5 w-5 shrink-0',
          isLavender ? 'text-axis-violet' : 'text-finax',
        )}
      />
    </button>
  )
}
