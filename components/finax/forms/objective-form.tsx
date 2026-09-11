'use client'

import { useState, type FormEvent } from 'react'
import type { Objective, ObjectiveInput } from '@/lib/types'
import { centsToInputValue, parseAmountToCents, parseBalanceToCents } from '@/lib/money'
import { isValidISODate } from '@/lib/dates'
import { addObjective, deleteObjective, updateObjective } from '@/lib/db/objectives'
import { Button } from '../button'
import { AmountInput, Field, TextInput } from '../field'
import { Confirm } from '../confirm'
import { TrashIcon } from '../icons'

interface ObjectiveFormProps {
  objective?: Objective
  onDone: () => void
}

interface Errors {
  name?: string
  target?: string
  current?: string
  date?: string
}

/** Alta y edición de objetivos de ahorro. */
export function ObjectiveForm({ objective, onDone }: ObjectiveFormProps) {
  const [name, setName] = useState(objective?.name ?? '')
  const [target, setTarget] = useState(objective ? centsToInputValue(objective.targetCents) : '')
  const [current, setCurrent] = useState(objective ? centsToInputValue(objective.currentCents) : '0,00')
  const [date, setDate] = useState(objective?.targetDate ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const targetCents = parseAmountToCents(target)
    const currentCents = parseBalanceToCents(current)
    const next: Errors = {}
    if (!name.trim()) next.name = 'Ponle un nombre al objetivo.'
    if (targetCents === null) next.target = 'Introduce una cantidad mayor que cero.'
    if (currentCents === null || currentCents < 0) next.current = 'Cantidad no válida.'
    if (date && !isValidISODate(date)) next.date = 'Fecha no válida.'
    setErrors(next)
    if (Object.keys(next).length > 0 || targetCents === null || currentCents === null) return

    const input: ObjectiveInput = { name, targetCents, currentCents, targetDate: date || undefined }
    setBusy(true)
    try {
      if (objective) await updateObjective(objective.id, input)
      else await addObjective(input)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  if (objective && confirmingDelete) {
    return (
      <Confirm
        message={`¿Eliminar el objetivo «${objective.name}»? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={async () => {
          await deleteObjective(objective.id)
          onDone()
        }}
      />
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nombre" error={errors.name}>
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Viaje a Japón"
          maxLength={60}
          autoFocus
        />
      </Field>
      <Field label="Cantidad objetivo" error={errors.target}>
        <AmountInput value={target} onChange={(e) => setTarget(e.target.value)} />
      </Field>
      <Field label="Cantidad actual" error={errors.current} hint="Lo que ya tienes reservado para este objetivo.">
        <AmountInput value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="Fecha objetivo (opcional)" error={errors.date}>
        <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="flex gap-3 pt-1">
        {objective && (
          <Button
            type="button"
            variant="secondary"
            aria-label="Eliminar objetivo"
            onClick={() => setConfirmingDelete(true)}
            className="px-4 text-negative"
          >
            <TrashIcon className="h-5 w-5" />
          </Button>
        )}
        <Button type="submit" fullWidth disabled={busy}>
          {objective ? 'Guardar cambios' : 'Crear objetivo'}
        </Button>
      </div>
    </form>
  )
}
