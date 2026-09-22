'use client'

import { useEffect, useState, type FormEvent } from 'react'
import {
  categoriesFor,
  requiresMotivo,
  type Category,
  type Movement,
  type MovementInput,
  type MovementType,
} from '@/lib/types'
import { centsToInputValue, parseAmountToCents } from '@/lib/money'
import { isValidISODate, todayISO } from '@/lib/dates'
import { addMovement, deleteMovement, listMovements, updateMovement } from '@/lib/db/movements'
import { suggestedCategory } from '@/lib/finance/suggestions'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../button'
import { FilterTabs } from '../filter-tabs'
import { AmountInput, ChipGroup, Field, TextArea, TextInput } from '../field'
import { Confirm } from '../confirm'
import { TrashIcon } from '../icons'

const TYPE_OPTIONS = ['Gasto', 'Ingreso'] as const
const typeFromLabel = (label: string): MovementType => (label === 'Ingreso' ? 'ingreso' : 'gasto')
const labelFromType = (type: MovementType) => (type === 'ingreso' ? 'Ingreso' : 'Gasto')

interface MovementFormProps {
  /** Movimiento a editar; ausente para crear uno nuevo. */
  movement?: Movement
  onDone: () => void
}

interface Errors {
  amount?: string
  date?: string
  category?: string
  motivo?: string
}

/** Alta y edición de movimientos. Importes en céntimos, fecha sin hora. */
export function MovementForm({ movement, onDone }: MovementFormProps) {
  // Historial propio para sugerir categoría al crear (nunca al editar: ahí manda lo guardado).
  const history = useLiveQuery(listMovements, [], undefined)
  const [type, setType] = useState<MovementType>(movement?.type ?? 'gasto')
  const [amount, setAmount] = useState(movement ? centsToInputValue(movement.amountCents) : '')
  const [date, setDate] = useState(movement?.date ?? todayISO())
  const [category, setCategory] = useState<Category | null>(movement?.category ?? null)
  // La sugerencia se aplica una sola vez por tipo y solo si el usuario no ha elegido ya.
  const [suggestedFor, setSuggestedFor] = useState<MovementType | null>(movement ? type : null)
  const [motivo, setMotivo] = useState(movement?.motivo ?? '')
  const [nota, setNota] = useState(movement?.nota ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const categories = categoriesFor(type)
  const needsMotivo = category !== null && requiresMotivo(category)

  // Valor por defecto inteligente: la categoría que el usuario más usa para este tipo.
  useEffect(() => {
    if (movement || history === undefined || suggestedFor === type) return
    setSuggestedFor(type)
    if (category !== null) return
    const suggestion = suggestedCategory(history, type, todayISO())
    if (suggestion) setCategory(suggestion)
  }, [history, type, movement, category, suggestedFor])

  function changeType(label: string) {
    const next = typeFromLabel(label)
    setType(next)
    // Al cambiar de tipo, la categoría anterior deja de valer: se vacía y se vuelve a sugerir.
    if (category && !categoriesFor(next).includes(category)) setCategory(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const amountCents = parseAmountToCents(amount)
    const next: Errors = {}
    if (amountCents === null) next.amount = 'Introduce un importe mayor que cero (ej. 12,50).'
    if (!isValidISODate(date)) next.date = 'Fecha no válida.'
    if (!category) next.category = 'Elige una categoría.'
    if (needsMotivo && !motivo.trim()) next.motivo = 'El motivo es obligatorio en «Otros».'
    setErrors(next)
    if (Object.keys(next).length > 0 || amountCents === null || !category) return

    const input: MovementInput = { type, amountCents, date, category, motivo, nota }
    setBusy(true)
    try {
      if (movement) await updateMovement(movement.id, input)
      else await addMovement(input)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  if (movement && confirmingDelete) {
    return (
      <Confirm
        message="¿Eliminar este movimiento? El patrimonio se recalculará automáticamente. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={async () => {
          await deleteMovement(movement.id)
          onDone()
        }}
      />
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FilterTabs options={TYPE_OPTIONS} value={labelFromType(type)} onChange={changeType} />

      <Field label="Importe" error={errors.amount}>
        <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </Field>

      <Field label="Fecha" error={errors.date}>
        <TextInput type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <Field label="Categoría" error={errors.category} group>
        <ChipGroup options={categories} value={category} onChange={setCategory} />
      </Field>

      {needsMotivo && (
        <Field label="Motivo" error={errors.motivo} hint="Sustituye a «Otros» en el historial.">
          <TextInput
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. Gasolina"
            maxLength={60}
          />
        </Field>
      )}

      <Field label="Nota (opcional)" hint="Solo se muestra en el detalle del movimiento.">
        <TextArea value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} />
      </Field>

      <div className="flex gap-3 pt-1">
        {movement && (
          <Button
            type="button"
            variant="secondary"
            aria-label="Eliminar movimiento"
            onClick={() => setConfirmingDelete(true)}
            className="px-4 text-negative"
          >
            <TrashIcon className="h-5 w-5" />
          </Button>
        )}
        <Button type="submit" fullWidth disabled={busy}>
          {movement ? 'Guardar cambios' : 'Añadir movimiento'}
        </Button>
      </div>
    </form>
  )
}
