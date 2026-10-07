'use client'

import { movementLabel, type Movement } from '@/lib/types'
import { formatCents } from '@/lib/money'
import { formatFullDate } from '@/lib/dates'
import { Button } from '../button'
import { TrashIcon } from '../icons'
import { useSheet } from '../sheet'
import { MovementForm } from './movement-form'
import { useConfirmMovementDeletion } from './delete-movement'
import { cn } from '@/lib/utils'

export const MOVEMENT_DETAIL_TITLE = 'Detalle del movimiento'

interface MovementDetailProps {
  movement: Movement
  onDone: () => void
}

/** Ficha de detalle de un movimiento (única vista donde aparece la nota). */
export function MovementDetail({ movement, onDone }: MovementDetailProps) {
  const { open } = useSheet()
  const confirmDeletion = useConfirmMovementDeletion()

  const isIncome = movement.type === 'ingreso'
  const rows: Array<[string, string]> = [
    ['Tipo', isIncome ? 'Ingreso' : 'Gasto'],
    ['Categoría', movement.category],
    ['Fecha', formatFullDate(movement.date)],
  ]
  if (movement.motivo) rows.splice(2, 0, ['Motivo', movement.motivo])
  if (movement.nota) rows.push(['Nota', movement.nota])

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] font-medium text-muted-foreground">{movementLabel(movement)}</p>
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
