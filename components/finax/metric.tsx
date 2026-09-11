import { cn } from '@/lib/utils'
import { ArrowUp, ArrowDown } from './icons'

interface ChangeBadgeProps {
  pct: string
  direction: 'up' | 'down'
  /** tono verde por defecto; los gastos que bajan también son positivos */
  tone?: 'positive' | 'negative' | 'muted'
  className?: string
}

/** Badge de variación con flecha (ej. ↑ +12,4%). */
export function ChangeBadge({ pct, direction, tone = 'positive', className }: ChangeBadgeProps) {
  const color =
    tone === 'positive'
      ? 'text-finax'
      : tone === 'negative'
        ? 'text-negative'
        : 'text-muted-foreground'
  return (
    <span className={cn('inline-flex items-center gap-1 text-[13px] font-semibold', color, className)}>
      {direction === 'up' ? (
        <ArrowUp className="h-3.5 w-3.5" />
      ) : (
        <ArrowDown className="h-3.5 w-3.5" />
      )}
      {pct}
    </span>
  )
}
