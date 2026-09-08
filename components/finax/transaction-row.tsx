import type { Transaction } from '@/lib/demo-data'
import { formatCurrency } from '@/lib/format'
import { transactionIconMap } from './icons'
import { cn } from '@/lib/utils'

interface TransactionRowProps {
  transaction: Transaction
}

/**
 * Fila de movimiento: chip de icono, nombre + categoría,
 * importe (verde ingreso / rojo gasto) y hora.
 */
export function TransactionRow({ transaction }: TransactionRowProps) {
  const Icon = transactionIconMap[transaction.icon]
  const isIncome = transaction.type === 'income'

  return (
    <div className="flex items-center gap-3.5 py-3">
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
          isIncome ? 'bg-finax-soft text-finax' : 'bg-muted text-grafito',
        )}
      >
        <Icon className="h-[22px] w-[22px]" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-bold text-grafito">{transaction.name}</p>
        <p className="truncate text-[12px] font-medium text-muted-foreground">
          {transaction.category}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            'text-[14px] font-bold tabular-nums',
            isIncome ? 'text-finax' : 'text-negative',
          )}
        >
          {formatCurrency(transaction.amount, true)}
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
          {transaction.time}
        </p>
      </div>
    </div>
  )
}
