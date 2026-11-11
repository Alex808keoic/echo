import { isAdvance, movementLabel, type Movement } from '@/lib/types'
import { formatCents } from '@/lib/money'
import { formatShortDate } from '@/lib/dates'
import { categoryIconMap } from './icons'
import { cn } from '@/lib/utils'

interface TransactionRowProps {
  movement: Movement
  /** Nombre del movimiento fijo del que salió, si sigue existiendo: sustituye a la etiqueta. */
  fixedName?: string
  /** Solo en un adelanto: lo que aún te deben (0 = devuelto entero). Sin dato, no se dice nada. */
  pendingCents?: number
  onClick?: () => void
}

/**
 * Fila de movimiento: chip de icono, etiqueta + categoría,
 * importe (verde ingreso / rojo gasto) y fecha.
 */
export function TransactionRow({ movement, fixedName, pendingCents, onClick }: TransactionRowProps) {
  const Icon = categoryIconMap[movement.category]
  const isIncome = movement.type === 'ingreso'
  const advance = isAdvance(movement)
  const label = fixedName ?? movementLabel(movement)
  const kind = advance ? 'Adelanto' : label === movement.category ? (isIncome ? 'Ingreso' : 'Gasto') : movement.category
  const advanceState = advance && pendingCents !== undefined ? (pendingCents > 0 ? `Te deben ${formatCents(pendingCents)}` : 'Devuelto') : null
  const subtitle = [kind, advanceState, movement.devolucionDe ? 'Devolución' : null, movement.puntual ? 'Puntual' : null, movement.wallet === 'efectivo' ? 'Efectivo' : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 py-3 text-left transition-opacity duration-150 active:opacity-60"
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
        <p className={cn('text-[14px] font-bold tabular-nums', isIncome ? 'text-finax-dark' : 'text-negative')}>
          {formatCents(isIncome ? movement.amountCents : -movement.amountCents, true)}
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
          {formatShortDate(movement.date)}
        </p>
      </div>
    </button>
  )
}
