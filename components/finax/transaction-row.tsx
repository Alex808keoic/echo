import { movementLabel, type Movement } from '@/lib/types'
import { formatCents } from '@/lib/money'
import { formatShortDate } from '@/lib/dates'
import { categoryIconMap } from './icons'
import { cn } from '@/lib/utils'

interface TransactionRowProps {
  movement: Movement
  onClick?: () => void
}

/**
 * Fila de movimiento: chip de icono, etiqueta + categoría,
 * importe (verde ingreso / rojo gasto) y fecha.
 */
export function TransactionRow({ movement, onClick }: TransactionRowProps) {
  const Icon = categoryIconMap[movement.category]
  const isIncome = movement.type === 'ingreso'
  const label = movementLabel(movement)
  const subtitle = label === movement.category ? (isIncome ? 'Ingreso' : 'Gasto') : movement.category

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 py-3 text-left"
    >
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
          isIncome ? 'bg-finax-soft text-finax' : 'bg-muted text-grafito',
        )}
      >
        <Icon className="h-[22px] w-[22px]" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-bold text-grafito">{label}</p>
        <p className="truncate text-[12px] font-medium text-muted-foreground">{subtitle}</p>
      </div>

      <div className="shrink-0 text-right">
        <p className={cn('text-[14px] font-bold tabular-nums', isIncome ? 'text-finax' : 'text-negative')}>
          {formatCents(isIncome ? movement.amountCents : -movement.amountCents, true)}
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
          {formatShortDate(movement.date)}
        </p>
      </div>
    </button>
  )
}
