'use client'

import { useState } from 'react'
import { formatCents } from '@/lib/money'
import { formatShortDate } from '@/lib/dates'
import { confirmOccurrence, skipOccurrence } from '@/lib/db/recurring'
import { movementFromOccurrence, type PendingOccurrence } from '@/lib/finance/recurring'
import { attemptWrite } from '@/lib/db/storage-errors'
import { FinancialCard } from './card'
import { Button } from './button'
import { useSheet } from './sheet'
import { MovementForm } from './forms/movement-form'
import { cn } from '@/lib/utils'

/** En Inicio y Movimientos, por encima de esto la lista se resume y se ve entera en «Fijos». */
const MAX_ROWS = 4

interface RecurringPendingProps {
  pending: PendingOccurrence[]
  /** Lleva a la pantalla de fijos (para ver el resto si hay muchos). */
  onSeeAll?: () => void
  /** Cuántos se enseñan (por defecto, 4). */
  limit?: number
}

const keyOf = (p: PendingOccurrence) => `${p.recurring.id}:${p.occurrence}`

/**
 * Fijos que ya tocaban y esperan tu confirmación. Confirmar crea el
 * movimiento con lo previsto; «Cambiar» deja ajustar importe o fecha antes;
 * «Omitir» lo descarta esa vez. Nada cuenta como dinero hasta confirmarlo.
 */
export function RecurringPending({ pending, onSeeAll, limit = MAX_ROWS }: RecurringPendingProps) {
  const { open, close } = useSheet()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (pending.length === 0) return null

  const run = async (key: string, write: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    const result = await attemptWrite(write)
    setBusy(null)
    if (!result.ok) setError(result.message)
  }
  const confirmAll = () =>
    run('all', async () => {
      for (const p of pending) await confirmOccurrence(p.recurring.id, p.occurrence)
    })
  const change = (p: PendingOccurrence) =>
    open(
      `Confirmar «${p.recurring.name}»`,
      <MovementForm
        initial={movementFromOccurrence(p.recurring, p.occurrence)}
        onSave={(input) => confirmOccurrence(p.recurring.id, p.occurrence, input)}
        submitLabel="Confirmar"
        onDone={close}
      />,
    )

  const shown = pending.slice(0, limit)
  const hidden = pending.length - shown.length

  return (
    <section aria-label="Fijos por confirmar">
      <FinancialCard className="space-y-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-finax-dark">Por confirmar</p>
          <p className="mt-0.5 text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">
            {pending.length === 1
              ? 'Un movimiento fijo ya tocaba. No cuenta en tu dinero hasta que lo confirmes.'
              : `${pending.length} movimientos fijos ya tocaban. No cuentan en tu dinero hasta que los confirmes.`}
          </p>
        </div>
        <ul className="divide-y divide-border">
          {shown.map((p) => {
            const key = keyOf(p)
            const income = p.recurring.type === 'ingreso'
            return (
              <li key={key} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-[14px] font-bold text-grafito">{p.recurring.name}</p>
                    <p className="text-[12px] font-medium text-muted-foreground">Tocaba el {formatShortDate(p.occurrence)}</p>
                  </div>
                  <p className={cn('shrink-0 text-[14px] font-bold tabular-nums', income ? 'text-finax-dark' : 'text-negative')}>
                    {formatCents(income ? p.recurring.amountCents : -p.recurring.amountCents, true)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 px-3 py-2 text-[12.5px]" disabled={busy !== null} onClick={() => run(key, () => confirmOccurrence(p.recurring.id, p.occurrence))}>
                    Confirmar
                  </Button>
                  <Button variant="secondary" className="px-3 py-2 text-[12.5px]" disabled={busy !== null} onClick={() => change(p)}>
                    Cambiar
                  </Button>
                  <Button variant="ghost" className="px-3 py-2 text-[12.5px] text-muted-foreground" disabled={busy !== null} onClick={() => run(key, () => skipOccurrence(p.recurring.id, p.occurrence))}>
                    Omitir
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
        {error && (
          <p role="alert" className="text-[12.5px] font-medium text-negative">
            {error}
          </p>
        )}
        {(pending.length > 1 || hidden > 0) && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {pending.length > 1 && (
              <Button variant="secondary" className="flex-1 px-3 py-2 text-[12.5px]" disabled={busy !== null} onClick={confirmAll}>
                Confirmar los {pending.length}
              </Button>
            )}
            {hidden > 0 && onSeeAll && (
              <Button variant="ghost" className="flex-1 px-3 py-2 text-[12.5px]" onClick={onSeeAll}>
                Ver {hidden} más
              </Button>
            )}
          </div>
        )}
      </FinancialCard>
    </section>
  )
}
