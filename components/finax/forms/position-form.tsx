'use client'

import { useState, type FormEvent } from 'react'
import type { Position, PositionInput } from '@/lib/types'
import { centsToInputValue, parseAmountToCents, parseBalanceToCents } from '@/lib/money'
import { isValidISODate, todayISO } from '@/lib/dates'
import { addPosition, deletePosition, updatePosition } from '@/lib/db/positions'
import { Button } from '../button'
import { AmountInput, Field, TextInput } from '../field'
import { Confirm } from '../confirm'
import { attemptWrite } from '@/lib/db/storage-errors'
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
  // Nueva inversión: lo normal es pagarla con el dinero registrado. Al editar se respeta lo guardado.
  const [fromLiquid, setFromLiquid] = useState(position ? position.fromLiquid === true : true)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  /** Error al guardar (almacenamiento), distinto de la validación de cada campo. */
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const investedCents = parseAmountToCents(invested)
    // Si no se indica valor actual, se asume igual al importe aportado. Puede ser 0 (pérdida total), nunca negativo.
    const parsedValue = value.trim() ? parseBalanceToCents(value) : investedCents
    const valueCents = parsedValue !== null && parsedValue >= 0 ? parsedValue : null
    const next: Errors = {}
    if (!name.trim()) next.name = 'Indica el activo.'
    if (investedCents === null) next.invested = 'Introduce un importe mayor que cero.'
    if (valueCents === null) next.value = 'Valor no válido.'
    if (!isValidISODate(date)) next.date = 'Fecha no válida.'
    setErrors(next)
    if (Object.keys(next).length > 0 || investedCents === null || valueCents === null) return

    const input: PositionInput = { name, investedCents, valueCents, date, fromLiquid }
    setBusy(true)
    setSaveError(null)
    const result = await attemptWrite(() => (position ? updatePosition(position.id, input) : addPosition(input)))
    setBusy(false)
    if (result.ok) onDone()
    else setSaveError(result.message)
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
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-background px-4 py-3">
        <input
          type="checkbox"
          checked={fromLiquid}
          onChange={(e) => setFromLiquid(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-finax"
        />
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold text-grafito">Sale de mi dinero líquido</span>
          <span className="mt-0.5 block text-[12px] font-medium text-muted-foreground text-pretty">
            {fromLiquid
              ? 'Se descuenta del líquido: tu patrimonio total no cambia al invertir. No lo registres también como gasto.'
              : 'No toca tu líquido: úsalo para inversiones anteriores a tu saldo inicial o pagadas con dinero de fuera de Finax.'}
          </span>
        </span>
      </label>
      {saveError && (
        <p role="alert" className="text-[12.5px] font-medium text-negative">
          {saveError}
        </p>
      )}

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
