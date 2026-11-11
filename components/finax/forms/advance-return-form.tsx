'use client'

import { useState, type FormEvent } from 'react'
import { CATEGORY_DEUDA, movementLabel, type Movement } from '@/lib/types'
import { centsToInputValue, formatCents, parseAmountToCents } from '@/lib/money'
import { isValidISODate, todayISO } from '@/lib/dates'
import { addMovement } from '@/lib/db/movements'
import { attemptWrite } from '@/lib/db/storage-errors'
import { Button } from '../button'
import { FilterTabs } from '../filter-tabs'
import { AmountInput, Field, TextInput } from '../field'

export const ADVANCE_RETURN_TITLE = 'Ya me lo ha devuelto'

const WALLET_OPTIONS = ['Tarjeta', 'Efectivo'] as const

interface AdvanceReturnFormProps {
  /** El adelanto (gasto con `porDevolver`). */
  advance: Movement
  /** Lo que aún te deben de él. */
  pendingCents: number
  onDone: () => void
}

/**
 * Apunta que te han devuelto un adelanto (2026-11-11): un ingreso de «Deuda» enlazado con `devolucionDe`.
 * Vuelve a tu dinero, pero no es un ingreso nuevo (los de «Deuda» nunca cuentan como habituales).
 * Por defecto, todo lo que falta; se puede apuntar menos si te devuelven una parte.
 */
export function AdvanceReturnForm({ advance, pendingCents, onDone }: AdvanceReturnFormProps) {
  const [amount, setAmount] = useState(centsToInputValue(pendingCents))
  const [date, setDate] = useState(todayISO())
  const [cash, setCash] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const who = advance.porDevolver?.quien

  async function submit(e: FormEvent) {
    e.preventDefault()
    const cents = parseAmountToCents(amount)
    if (cents === null) return setError('Introduce un importe mayor que cero (ej. 10).')
    if (cents > pendingCents) return setError(`Solo te deben ${formatCents(pendingCents)}.`)
    if (!isValidISODate(date) || date < advance.date) return setError('La fecha no puede ser anterior al adelanto.')
    setError(null)
    setBusy(true)
    const result = await attemptWrite(() =>
      addMovement({
        type: 'ingreso',
        amountCents: cents,
        date,
        category: CATEGORY_DEUDA,
        nota: `Devolución${who ? ` de ${who}` : ''}: ${movementLabel(advance)}`,
        devolucionDe: advance.id,
        ...(cash ? { wallet: 'efectivo' as const } : {}),
      }),
    )
    setBusy(false)
    if (result.ok) onDone()
    else setError(result.message)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-[13px] font-medium leading-snug text-muted-foreground text-pretty">
        {who ? `${who} te debe` : 'Te deben'} {formatCents(pendingCents)} de «{movementLabel(advance)}». Se suma a tu dinero, pero no cuenta como un ingreso nuevo.
      </p>
      <Field label="¿Cuánto te han devuelto?" hint="Si solo te devuelven una parte, pon esa parte: el resto seguirá pendiente.">
        <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </Field>
      <Field label="Lo recibes en" group>
        <FilterTabs options={WALLET_OPTIONS} value={cash ? 'Efectivo' : 'Tarjeta'} onChange={(v) => setCash(v === 'Efectivo')} size="sm" />
      </Field>
      <Field label="Fecha">
        <TextInput type="date" value={date} min={advance.date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {error && (
        <p role="alert" className="text-[12.5px] font-medium text-negative">
          {error}
        </p>
      )}
      <Button type="submit" fullWidth disabled={busy}>
        Apuntar devolución
      </Button>
    </form>
  )
}
