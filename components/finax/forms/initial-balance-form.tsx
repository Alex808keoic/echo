'use client'

import { useState, type FormEvent } from 'react'
import { centsToInputValue, parseBalanceToCents } from '@/lib/money'
import { setInitialBalance } from '@/lib/db/config'
import { Button } from '../button'
import { AmountInput, Field } from '../field'
import { Confirm } from '../confirm'

interface InitialBalanceFormProps {
  /** Saldo actual; ausente en el primer arranque. */
  currentCents?: number
  onDone: () => void
}

/**
 * Saldo inicial (D-14): punto de partida del patrimonio. No es un movimiento.
 * Modificarlo después exige confirmación explícita.
 */
export function InitialBalanceForm({ currentCents, onDone }: InitialBalanceFormProps) {
  const [value, setValue] = useState(currentCents !== undefined ? centsToInputValue(currentCents) : '')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState<number | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const cents = parseBalanceToCents(value)
    if (cents === null) {
      setError('Introduce un importe válido (puede ser 0).')
      return
    }
    setError(undefined)
    if (currentCents === undefined) {
      void setInitialBalance(cents).then(onDone)
    } else {
      setPending(cents)
    }
  }

  if (pending !== null) {
    return (
      <Confirm
        message="Cambiar el saldo inicial recalcula todo tu patrimonio y su evolución. ¿Quieres continuar?"
        confirmLabel="Cambiar saldo"
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          await setInitialBalance(pending)
          onDone()
        }}
      />
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field
        label="Saldo inicial"
        error={error}
        hint="Dinero con el que empiezas en Finax. No aparece en el historial de movimientos."
      >
        <AmountInput value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      </Field>
      <Button type="submit" fullWidth>
        {currentCents === undefined ? 'Empezar' : 'Guardar'}
      </Button>
    </form>
  )
}
