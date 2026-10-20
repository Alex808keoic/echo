'use client'

import { useEffect, useState, type FormEvent } from 'react'
import {
  CATEGORY_DEUDA,
  categoriesFor,
  requiresMotivo,
  type Category,
  type Movement,
  type MovementInput,
  type MovementType,
} from '@/lib/types'
import { centsToInputValue, parseAmountToCents } from '@/lib/money'
import { isValidISODate, todayISO } from '@/lib/dates'
import { addMovement, listMovements, updateMovement } from '@/lib/db/movements'
import { suggestedCategory } from '@/lib/finance/suggestions'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../button'
import { FilterTabs } from '../filter-tabs'
import { AmountInput, ChipGroup, Field, TextArea, TextInput } from '../field'
import { attemptWrite } from '@/lib/db/storage-errors'
import { TrashIcon } from '../icons'
import { useSheet } from '../sheet'
import { useConfirmMovementDeletion } from './delete-movement'
import { useIsMinor } from '@/hooks/use-minor'

const TYPE_OPTIONS = ['Gasto', 'Ingreso'] as const
const typeFromLabel = (label: string): MovementType => (label === 'Ingreso' ? 'ingreso' : 'gasto')
const labelFromType = (type: MovementType) => (type === 'ingreso' ? 'Ingreso' : 'Gasto')

interface MovementFormProps {
  /** Movimiento a editar; ausente para crear uno nuevo. */
  movement?: Movement
  /** Valores con los que empieza un movimiento nuevo (p. ej. un fijo al confirmarlo). */
  initial?: MovementInput
  /** Guarda en lugar de añadir un movimiento nuevo (p. ej. confirmar un fijo). */
  onSave?: (input: MovementInput) => Promise<unknown>
  submitLabel?: string
  onDone: () => void
}

interface Errors {
  amount?: string
  date?: string
  category?: string
  motivo?: string
}

/** Alta y edición de movimientos. Importes en céntimos, fecha sin hora. */
export function MovementForm({ movement, initial, onSave, submitLabel, onDone }: MovementFormProps) {
  const start = movement ?? initial
  // Historial propio para sugerir categoría al crear (nunca al editar: ahí manda lo guardado).
  const history = useLiveQuery(listMovements, [], undefined)
  const [type, setType] = useState<MovementType>(start?.type ?? 'gasto')
  const [amount, setAmount] = useState(start ? centsToInputValue(start.amountCents) : '')
  const [date, setDate] = useState(start?.date ?? todayISO())
  const [category, setCategory] = useState<Category | null>(start?.category ?? null)
  // La sugerencia se aplica una sola vez por tipo y solo si el usuario no ha elegido ya.
  const [suggestedFor, setSuggestedFor] = useState<MovementType | null>(start ? type : null)
  const [motivo, setMotivo] = useState(start?.motivo ?? '')
  const [nota, setNota] = useState(start?.nota ?? '')
  const [puntual, setPuntual] = useState(start?.puntual === true)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  /** Error al guardar (almacenamiento), distinto de la validación de cada campo. */
  const [saveError, setSaveError] = useState<string | null>(null)
  const { open } = useSheet()
  const confirmDeletion = useConfirmMovementDeletion()

  const minor = useIsMinor()
  const categories = categoriesFor(type, { minor, keep: start?.category })
  // Lo que te devuelven de una deuda ya cuenta siempre como puntual.
  const isDebtRepayment = type === 'ingreso' && category === CATEGORY_DEUDA
  const needsMotivo = category !== null && requiresMotivo(category)

  // Valor por defecto inteligente: la categoría que el usuario más usa para este tipo.
  useEffect(() => {
    if (start || history === undefined || suggestedFor === type) return
    setSuggestedFor(type)
    if (category !== null) return
    const suggestion = suggestedCategory(history, type, todayISO())
    if (suggestion) setCategory(suggestion)
  }, [history, type, start, category, suggestedFor])

  function changeType(label: string) {
    const next = typeFromLabel(label)
    setType(next)
    // Al cambiar de tipo, la categoría anterior deja de valer: se vacía y se vuelve a sugerir.
    if (category && !categoriesFor(next, { minor, keep: start?.category }).includes(category)) setCategory(null)
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

    const input: MovementInput = { type, amountCents, date, category, motivo, nota, ...(puntual && !isDebtRepayment ? { puntual: true as const } : {}) }
    setBusy(true)
    setSaveError(null)
    const result = await attemptWrite(() => (movement ? updateMovement(movement.id, input) : onSave ? onSave(input) : addMovement(input)))
    setBusy(false)
    if (result.ok) onDone()
    else setSaveError(result.message)
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

      {isDebtRepayment ? (
        <p className="rounded-2xl border border-border bg-background px-4 py-3 text-[12px] font-medium leading-snug text-muted-foreground text-pretty">
          Lo que te devuelven de una deuda cuenta en tu dinero, pero AXIS y tu plan no lo toman como un ingreso de cada mes.
        </p>
      ) : (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-background px-4 py-3">
          <input
            type="checkbox"
            checked={puntual}
            onChange={(e) => setPuntual(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-finax"
          />
          <span className="min-w-0">
            <span className="block text-[13.5px] font-semibold text-grafito">Es puntual (no suele pasar)</span>
            <span className="mt-0.5 block text-[12px] font-medium text-muted-foreground text-pretty">
              {type === 'ingreso'
                ? 'Por ejemplo, un trabajo suelto o un regalo grande. Cuenta en tu dinero, pero AXIS y tu plan no lo toman como algo de cada mes.'
                : 'Por ejemplo, una reparación o un viaje. Cuenta en tu dinero, pero AXIS y tu plan no lo toman como algo de cada mes.'}
            </span>
          </span>
        </label>
      )}

      <Field label="Nota (opcional)" hint="Solo se muestra en el detalle del movimiento.">
        <TextArea value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} />
      </Field>

      {saveError && (
        <p role="alert" className="text-[12.5px] font-medium text-negative">
          {saveError}
        </p>
      )}

      <div className="flex gap-3 pt-1">
        {movement && (
          <Button
            type="button"
            variant="secondary"
            aria-label="Eliminar movimiento"
            onClick={() => confirmDeletion(movement, () => open('Editar movimiento', <MovementForm movement={movement} onDone={onDone} />))}
            className="px-4 text-negative"
          >
            <TrashIcon className="h-5 w-5" />
          </Button>
        )}
        <Button type="submit" fullWidth disabled={busy}>
          {submitLabel ?? (movement ? 'Guardar cambios' : 'Añadir movimiento')}
        </Button>
      </div>
    </form>
  )
}
