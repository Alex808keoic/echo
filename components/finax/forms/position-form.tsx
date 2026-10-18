'use client'

import { useState, type FormEvent } from 'react'
import type { Position, PositionAssetType, PositionInput } from '@/lib/types'
import { guessAssetType } from '@/lib/axis/plan/mix'
import { bpToInputValue, centsToInputValue, parseAmountToCents, parseBalanceToCents, parsePercentToBp } from '@/lib/money'
import { isValidISODate, todayISO } from '@/lib/dates'
import { addPosition, deletePosition, updatePosition } from '@/lib/db/positions'
import { Button } from '../button'
import { AmountInput, ChipGroup, Field, TextInput } from '../field'
import { Confirm } from '../confirm'
import { attemptWrite } from '@/lib/db/storage-errors'
import { TrashIcon } from '../icons'

interface PositionFormProps {
  position?: Position
  /** Valores iniciales al crear (p. ej. desde «Tu decisión del mes»). */
  initial?: { name?: string; investedCents?: number; assetType?: PositionAssetType }
  onDone: () => void
}

const TYPE_LABELS: Record<PositionAssetType, string> = {
  'global-equity': 'Renta variable global',
  bonds: 'Renta fija',
  risky: 'Arriesgada',
  safe: 'Ahorro seguro',
  other: 'Otro',
}
const TYPE_OPTIONS = Object.values(TYPE_LABELS)
const typeOfLabel = (label: string) => (Object.keys(TYPE_LABELS) as PositionAssetType[]).find((k) => TYPE_LABELS[k] === label) ?? 'other'

interface Errors {
  name?: string
  invested?: string
  value?: string
  date?: string
  fee?: string
}

/**
 * Alta y edición de posiciones manuales (D-22: activo, importe y fecha).
 * El valor actual se introduce a mano porque no hay cotizaciones conectadas.
 */
export function PositionForm({ position, initial, onDone }: PositionFormProps) {
  const [name, setName] = useState(position?.name ?? initial?.name ?? '')
  const [invested, setInvested] = useState(position ? centsToInputValue(position.investedCents) : initial?.investedCents ? centsToInputValue(initial.investedCents) : '')
  const [value, setValue] = useState(position ? centsToInputValue(position.valueCents) : '')
  const [date, setDate] = useState(position?.date ?? todayISO())
  // Nueva inversión: lo normal es pagarla con el dinero registrado. Al editar se respeta lo guardado.
  const [fromLiquid, setFromLiquid] = useState(position ? position.fromLiquid === true : true)
  // Tipo para comparar tu mezcla con la del plan: el guardado o, si no lo has elegido, el que sugiere el nombre.
  const [assetType, setAssetType] = useState<PositionAssetType | null>(position?.assetType ?? initial?.assetType ?? null)
  const shownType = assetType ?? guessAssetType(name)
  const [fee, setFee] = useState(position?.feeBp !== undefined ? bpToInputValue(position.feeBp) : '')
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
    // Opcional: vacío = no la sé. Hasta un 10 % anual.
    const feeBp = fee.trim() ? parsePercentToBp(fee, 10) : undefined
    if (feeBp === null) next.fee = 'Introduce un porcentaje entre 0 y 10, p. ej. 0,2.'
    setErrors(next)
    if (Object.keys(next).length > 0 || investedCents === null || valueCents === null || feeBp === null) return

    const input: PositionInput = { name, investedCents, valueCents, date, fromLiquid, assetType: shownType, ...(feeBp !== undefined ? { feeBp } : {}) }
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
      <Field label="Tipo" hint="Sirve para comparar lo que tienes con la mezcla de tu plan. Se sugiere por el nombre; cámbialo si no es." group>
        <ChipGroup options={TYPE_OPTIONS} value={TYPE_LABELS[shownType]} onChange={(label) => setAssetType(typeOfLabel(label))} />
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
      <Field
        label="Comisión anual, en % (opcional)"
        error={errors.fee}
        hint="La «TER» o «gastos corrientes» del fondo, o lo que cobre tu plataforma. Sirve para decirte cuánto te cuestan tus comisiones."
      >
        <TextInput inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Ej. 0,2" />
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
