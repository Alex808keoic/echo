'use client'

import { useState } from 'react'
import { movementLabel, type Movement } from '@/lib/types'
import { formatCents } from '@/lib/money'
import { formatFullDate } from '@/lib/dates'
import { Button } from '../button'
import { MovementForm } from './movement-form'
import { cn } from '@/lib/utils'

interface MovementDetailProps {
  movement: Movement
  onDone: () => void
}

/** Ficha de detalle de un movimiento (única vista donde aparece la nota). */
export function MovementDetail({ movement, onDone }: MovementDetailProps) {
  const [editing, setEditing] = useState(false)
  if (editing) return <MovementForm movement={movement} onDone={onDone} />

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
            isIncome ? 'text-finax' : 'text-negative',
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
      <Button type="button" variant="secondary" fullWidth onClick={() => setEditing(true)}>
        Editar movimiento
      </Button>
    </div>
  )
}
