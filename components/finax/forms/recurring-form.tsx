'use client'

import { useState, type FormEvent } from 'react'
import { categoriesFor, requiresMotivo, type Category, type MovementType, type RecurringFrequency, type RecurringMovement, type RecurringMovementInput } from '@/lib/types'
import { centsToInputValue, parseAmountToCents } from '@/lib/money'
import { isValidISODate, todayISO } from '@/lib/dates'
import { addRecurring, deleteRecurring, updateRecurring } from '@/lib/db/recurring'
import { describeSchedule, nextOccurrence } from '@/lib/finance/recurring'
import { attemptWrite } from '@/lib/db/storage-errors'
import { Button } from '../button'
import { FilterTabs } from '../filter-tabs'
import { AmountInput, ChipGroup, Field, TextInput } from '../field'
import { Confirm } from '../confirm'
import { TrashIcon } from '../icons'

const TYPE_OPTIONS = ['Gasto', 'Ingreso'] as const
const FREQUENCY_OPTIONS = ['Cada mes', 'Cada año'] as const
const typeFromLabel = (label: string): MovementType => (label === 'Ingreso' ? 'ingreso' : 'gasto')
const labelFromType = (type: MovementType) => (type === 'ingreso' ? 'Ingreso' : 'Gasto')
const frequencyFromLabel = (label: string): RecurringFrequency => (label === 'Cada año' ? 'yearly' : 'monthly')
const labelFromFrequency = (f: RecurringFrequency) => (f === 'yearly' ? 'Cada año' : 'Cada mes')

interface RecurringFormProps {
  /** Fijo a editar; ausente para crear uno nuevo. */
  recurring?: RecurringMovement
  /** Valores con los que empieza uno nuevo (atajos del primer uso). */
  preset?: Partial<RecurringMovementInput>
  onDone: () => void
}

interface Errors {
  name?: string
  amount?: string
  category?: string
  date?: string
}

/**
 * Alta y edición de un movimiento fijo. No crea ningún movimiento: cada vez
 * que toca, Finax lo propone y lo confirmas tú.
 */
export function RecurringForm({ recurring, preset, onDone }: RecurringFormProps) {
  const start = recurring ?? preset
  const today = todayISO()
  // Al editar, la fecha es la próxima vez sin confirmar (puede haber pasado, si está pendiente).
  const initialDate = recurring ? nextOccurrence(recurring) : (preset?.startDate ?? today)
  const [name, setName] = useState(start?.name ?? '')
  const [type, setType] = useState<MovementType>(start?.type ?? 'gasto')
  const [amount, setAmount] = useState(start?.amountCents ? centsToInputValue(start.amountCents) : '')
  const [category, setCategory] = useState<Category | null>(start?.category ?? null)
  const [frequency, setFrequency] = useState<RecurringFrequency>(start?.frequency ?? 'monthly')
  const [date, setDate] = useState(initialDate)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const categories = categoriesFor(type)
  // Solo se puede elegir una fecha pasada si es la que ya estaba (una vez pendiente).
  const minDate = initialDate < today ? initialDate : today

  function changeType(label: string) {
    const next = typeFromLabel(label)
    setType(next)
    if (category && !categoriesFor(next).includes(category)) setCategory(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const amountCents = parseAmountToCents(amount)
    const next: Errors = {}
    if (!name.trim()) next.name = 'Ponle un nombre (p. ej. «Nómina» o «Alquiler»).'
    if (amountCents === null) next.amount = 'Introduce el importe habitual (ej. 12,50).'
    if (!category) next.category = 'Elige una categoría.'
    if (!isValidISODate(date) || (date < today && date !== initialDate)) next.date = 'Elige hoy o una fecha futura.'
    setErrors(next)
    if (Object.keys(next).length > 0 || amountCents === null || !category) return

    const input: RecurringMovementInput = { name, type, amountCents, category, frequency, startDate: date }
    setBusy(true)
    setSaveError(null)
    const result = await attemptWrite(() => (recurring ? updateRecurring(recurring.id, input) : addRecurring(input)))
    setBusy(false)
    if (result.ok) onDone()
    else setSaveError(result.message)
  }

  if (recurring && confirmingDelete) {
    return (
      <Confirm
        message={`¿Eliminar «${recurring.name}» de tus fijos? Dejará de proponerse; lo que ya confirmaste se queda en tu historial.`}
        confirmLabel="Eliminar"
        destructive
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={async () => {
          await deleteRecurring(recurring.id)
          onDone()
        }}
      />
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FilterTabs options={TYPE_OPTIONS} value={labelFromType(type)} onChange={changeType} />

      <Field
        label="Nombre"
        error={errors.name}
        hint={category && requiresMotivo(category) ? 'Con «Otros», el nombre es lo que verás en tu historial.' : undefined}
      >
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === 'ingreso' ? 'Ej. Nómina' : 'Ej. Alquiler, Spotify, gimnasio'}
          maxLength={40}
          autoFocus={!recurring && !preset?.name}
        />
      </Field>

      <Field label="Importe habitual" error={errors.amount} hint="Si un mes es distinto, lo cambias al confirmarlo.">
        <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>

      <Field label="Categoría" error={errors.category} group>
        <ChipGroup options={categories} value={category} onChange={setCategory} />
      </Field>

      <Field label="Cada cuánto" group>
        <FilterTabs options={FREQUENCY_OPTIONS} value={labelFromFrequency(frequency)} onChange={(l) => setFrequency(frequencyFromLabel(l))} size="sm" />
      </Field>

      <Field
        label="Próxima vez"
        error={errors.date}
        hint={isValidISODate(date) ? `${describeSchedule({ frequency, startDate: date })}. Ese día te lo propondremos para que lo confirmes.` : undefined}
      >
        <TextInput type="date" value={date} min={minDate} onChange={(e) => setDate(e.target.value)} />
      </Field>

      {saveError && (
        <p role="alert" className="text-[12.5px] font-medium text-negative">
          {saveError}
        </p>
      )}

      <div className="flex gap-3 pt-1">
        {recurring && (
          <Button type="button" variant="secondary" aria-label="Eliminar fijo" onClick={() => setConfirmingDelete(true)} className="px-4 text-negative">
            <TrashIcon className="h-5 w-5" />
          </Button>
        )}
        <Button type="submit" fullWidth disabled={busy}>
          {recurring ? 'Guardar cambios' : 'Añadir fijo'}
        </Button>
      </div>
    </form>
  )
}
