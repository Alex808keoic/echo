'use client'

import { useState, type FormEvent } from 'react'
import type { Position } from '@/lib/types'
import { centsToInputValue, formatCents, parseBalanceToCents } from '@/lib/money'
import { formatShortDate, toISODate } from '@/lib/dates'
import { lastValueDate } from '@/lib/finance/position-values'
import { setPositionValues } from '@/lib/db/positions'
import { attemptWrite } from '@/lib/db/storage-errors'
import { Button } from '../button'
import { AmountInput, Field } from '../field'

interface UpdateValuesFormProps {
  positions: Position[]
  onDone: () => void
}

/**
 * «Actualizar valores»: el valor de hoy de todas tus inversiones en una sola
 * hoja. Lo que dejes igual también queda apuntado como al día.
 */
export function UpdateValuesForm({ positions, onDone }: UpdateValuesFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(positions.map((p) => [p.id, centsToInputValue(p.valueCents)])))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = positions.map((p) => ({ id: p.id, valueCents: parseBalanceToCents(values[p.id] ?? '') }))
    const next: Record<string, string> = {}
    for (const v of parsed) if (v.valueCents === null || v.valueCents < 0) next[v.id] = 'Valor no válido (puede ser 0).'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setBusy(true)
    setSaveError(null)
    const result = await attemptWrite(() => setPositionValues(parsed.map((v) => ({ id: v.id, valueCents: v.valueCents as number }))))
    setBusy(false)
    if (result.ok) onDone()
    else setSaveError(result.message)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">
        Mira en tu banco o bróker cuánto vale hoy cada inversión. Con cada actualización, tu gráfica de patrimonio enseña cómo han ido de verdad.
      </p>
      {positions.map((p, i) => {
        const last = lastValueDate(p) ?? toISODate(new Date(p.updatedAt))
        return (
          <Field key={p.id} label={p.name} error={errors[p.id]} hint={`Aportado ${formatCents(p.investedCents)} · último valor el ${formatShortDate(last)}`}>
            <AmountInput value={values[p.id] ?? ''} onChange={(e) => setValues((prev) => ({ ...prev, [p.id]: e.target.value }))} autoFocus={i === 0} />
          </Field>
        )
      })}
      {saveError && (
        <p role="alert" className="text-[12.5px] font-medium text-negative">
          {saveError}
        </p>
      )}
      <Button type="submit" fullWidth disabled={busy}>
        Guardar valores
      </Button>
    </form>
  )
}
