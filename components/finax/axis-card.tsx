import { cn } from '@/lib/utils'
import { AxisSphere } from './axis-sphere'
import { LeafLogo, ChevronRight } from './icons'

interface AxisCardProps {
  text: string
  title?: string
  tone?: 'lavender' | 'green'
  onClick?: () => void
}

/**
 * Tarjeta de recomendación/insight de AXIS.
 * - lavender: identidad AXIS (violeta/azul), con la esfera.
 * - green: integrada en Finax, con hoja verde.
 */
export function AxisCard({ text, title, tone = 'lavender', onClick }: AxisCardProps) {
  const isLavender = tone === 'lavender'
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3.5 rounded-3xl border p-4 text-left transition-colors',
        isLavender
          ? 'border-axis-violet/15 bg-axis-soft hover:bg-[#e7eaff]'
          : 'border-finax/15 bg-finax-soft hover:bg-finax-soft-2',
      )}
    >
      <div className="shrink-0">
        {isLavender ? (
          <AxisSphere size={40} glow={false} />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70 text-finax">
            <LeafLogo className="h-5 w-5" />
          </span>
        )}
      </div>
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
