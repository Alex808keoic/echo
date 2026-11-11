'use client'

import { advanceCents, isAdvance, isOneOff, movementLabel, returnedByAdvance, type Movement } from '@/lib/types'
import { db } from '@/lib/db/db'
import { ADVANCE_RETURN_TITLE, AdvanceReturnForm } from './advance-return-form'
import { formatCents } from '@/lib/money'
import { formatFullDate } from '@/lib/dates'
import { Button } from '../button'
import { TrashIcon } from '../icons'
import { useSheet } from '../sheet'
import { MovementForm } from './movement-form'
import { useConfirmMovementDeletion } from './delete-movement'
import { cn } from '@/lib/utils'
import { useLiveQuery } from 'dexie-react-hooks'
import { getRecurring } from '@/lib/db/recurring'

export const MOVEMENT_DETAIL_TITLE = 'Detalle del movimiento'

interface MovementDetailProps {
  movement: Movement
  onDone: () => void
}

/** Ficha de detalle de un movimiento (única vista donde aparece la nota). */
export function MovementDetail({ movement, onDone }: MovementDetailProps) {
  const { open } = useSheet()
  const confirmDeletion = useConfirmMovementDeletion()
  const recurringId = movement.recurringId
  const fixed = useLiveQuery(() => (recurringId ? getRecurring(recurringId) : undefined), [recurringId])

  // Adelantos (2026-11-11): lo que ya te han devuelto sale de los ingresos enlazados con `devolucionDe`.
  const advance = isAdvance(movement)
  const linkedId = advance ? movement.id : movement.devolucionDe
  const linked = useLiveQuery(
    () => (linkedId ? db.movements.filter((m) => m.id === linkedId || m.devolucionDe === linkedId).toArray() : []),
    [linkedId],
  )
  const returnedCents = advance && linked ? (returnedByAdvance(linked).get(movement.id) ?? 0) : 0
  const pendingCents = advance ? Math.max(0, advanceCents(movement) - returnedCents) : 0
  const original = movement.devolucionDe ? linked?.find((m) => m.id === movement.devolucionDe) : undefined

  const isIncome = movement.type === 'ingreso'
  const rows: Array<[string, string]> = [
    ['Tipo', isIncome ? 'Ingreso' : advance ? 'Adelanto' : 'Gasto'],
    ['Categoría', movement.category],
    ['Fecha', formatFullDate(movement.date)],
  ]
  if (movement.motivo) rows.splice(2, 0, ['Motivo', movement.motivo])
  rows.push(['Dinero', movement.wallet === 'efectivo' ? 'Efectivo' : 'Tarjeta / banco'])
  if (fixed) rows.push(['Fijo', fixed.name])
  if (advance) {
    const who = movement.porDevolver?.quien
    rows.push(['Te devolverán', `${formatCents(advanceCents(movement))}${who ? ` (${who})` : ''}`])
    if (returnedCents > 0) rows.push(['Ya te han devuelto', formatCents(Math.min(returnedCents, advanceCents(movement)))])
    rows.push(['Te deben', pendingCents > 0 ? formatCents(pendingCents) : 'Nada: te lo han devuelto todo'])
  }
  if (original) rows.push(['Devolución de', `${movementLabel(original)} (${formatFullDate(original.date)})`])
  if (isOneOff(movement) && !movement.devolucionDe) rows.push(['Puntual', 'Sí: no cuenta como algo de cada mes'])
  if (movement.nota) rows.push(['Nota', movement.nota])

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] font-medium text-muted-foreground">{fixed?.name ?? movementLabel(movement)}</p>
        <p
          className={cn(
            'mt-1 text-[32px] font-extrabold leading-none tracking-tight tabular-nums',
            isIncome ? 'text-finax-dark' : 'text-negative',
          )}
        >
          {formatCents(isIncome ? movement.amountCents : -movement.amountCents, true)}
        </p>
      </div>
      <dl className="divide-y divide-border rounded-2xl border border-border">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 px-4 py-3">
            <dt className="text-[13px] font-medium text-muted-foreground">{k}</dt>
            <dd className="text-right text-[13.5px] font-semibold text-grafito text-pretty">{v}</dd>
          </div>
        ))}
      </dl>
      {advance && pendingCents > 0 && (
        <Button
          type="button"
          fullWidth
          onClick={() => open(ADVANCE_RETURN_TITLE, <AdvanceReturnForm advance={movement} pendingCents={pendingCents} onDone={onDone} />)}
        >
          Ya me lo ha devuelto
        </Button>
      )}
      {/* Eliminar a la izquierda: el «Eliminar» de la confirmación queda a la derecha, así un doble toque no borra. */}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="secondary"
          className="px-4 text-negative"
          icon={<TrashIcon className="h-4 w-4" />}
          onClick={() => confirmDeletion(movement, () => open(MOVEMENT_DETAIL_TITLE, <MovementDetail movement={movement} onDone={onDone} />))}
        >
          Eliminar
        </Button>
        <Button type="button" variant="secondary" fullWidth onClick={() => open('Editar movimiento', <MovementForm movement={movement} onDone={onDone} />)}>
          Editar movimiento
        </Button>
      </div>
    </div>
  )
}
