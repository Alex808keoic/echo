'use client'

import { useState, type FormEvent } from 'react'
import type { Position, PositionInput } from '@/lib/types'
import { centsToInputValue, parseAmountToCents } from '@/lib/money'
import { isValidISODate, todayISO } from '@/lib/dates'
import { addPosition, deletePosition, updatePosition } from '@/lib/db/positions'
import { Button } from '../button'
import { AmountInput, Field, TextInput } from '../field'
import { Confirm } from '../confirm'
import { TrashIcon } from '../icons'

interface PositionFormProps {
  position?: Position
  onDone: () => void
}

interface Errors {
  name?: string
  invested?: string
  value?: string
  date?: string
}

/**
 * Alta y edición de posiciones manuales (D-22: activo, importe y fecha).
 * El valor actual se introduce a mano porque no hay cotizaciones conectadas.
 */
export function PositionForm({ position, onDone }: PositionFormProps) {
  const [name, setName] = useState(position?.name ?? '')
  const [invested, setInvested] = useState(position ? centsToInputValue(position.investedCents) : '')
  const [value, setValue] = useState(position ? centsToInputValue(position.valueCents) : '')
  const [date, setDate] = useState(position?.date ?? todayISO())
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const investedCents = parseAmountToCents(invested)
    // Si no se indica valor actual, se asume igual al importe aportado.
    const valueCents = value.trim() ? parseAmountToCents(value) : investedCents
    const next: Errors = {}
    if (!name.trim()) next.name = 'Indica el activo.'
    if (investedCents === null) next.invested = 'Introduce un importe mayor que cero.'
    if (valueCents === null) next.value = 'Valor no válido.'
    if (!isValidISODate(date)) next.date = 'Fecha no válida.'
    setErrors(next)
    if (Object.keys(next).length > 0 || investedCents === null || valueCents === null) return

    const input: PositionInput = { name, investedCents, valueCents, date }
    setBusy(true)
    try {
      if (position) await updatePosition(position.id, input)
      else await addPosition(input)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  if (position && confirmingDelete) {
    return (
      <Confirm
        message={`¿Eliminar la posición «${position.name}»? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={async () => {
          await deletePosition(position.id)
          onDone()
        }}
      />
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Activo" error={errors.name}>
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Fondo indexado global"
          maxLength={60}
          autoFocus
        />
      </Field>
      <Field label="Importe invertido" error={errors.invested}>
        <AmountInput value={invested} onChange={(e) => setInvested(e.target.value)} />
      </Field>
      <Field label="Fecha de la aportación" error={errors.date}>
        <TextInput type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field
        label="Valor actual (manual)"
        error={errors.value}
        hint="Sin cotizaciones conectadas. Si lo dejas vacío, se usa el importe invertido."
      >
        <AmountInput value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <div className="flex gap-3 pt-1">
        {position && (
          <Button
            type="button"
            variant="secondary"
            aria-label="Eliminar posición"
            onClick={() => setConfirmingDelete(true)}
            className="px-4 text-negative"
          >
            <TrashIcon className="h-5 w-5" />
          </Button>
        )}
        <Button type="submit" fullWidth disabled={busy}>
          {position ? 'Guardar cambios' : 'Añadir inversión'}
        </Button>
      </div>
    </form>
  )
}
