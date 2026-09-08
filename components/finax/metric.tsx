import type { ReactNode } from 'react'
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

interface MetricProps {
  label: string
  value: string
  icon?: ReactNode
  change?: ReactNode
  tone?: 'income' | 'expense' | 'neutral'
}

/**
 * Métrica compacta (ingresos / gastos) con icono superior,
 * valor y variación. Usada en tarjetas de resumen.
 */
export function Metric({ label, value, icon, change, tone = 'neutral' }: MetricProps) {
  const valueColor =
    tone === 'income' ? 'text-finax' : tone === 'expense' ? 'text-negative' : 'text-grafito'
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn('mt-1.5 text-[19px] font-bold tracking-tight', valueColor)}>{value}</div>
      {change && <div className="mt-1">{change}</div>}
    </div>
  )
}
