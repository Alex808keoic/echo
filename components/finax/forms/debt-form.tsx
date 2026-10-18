'use client'

import { useState, type FormEvent } from 'react'
import type { Debt, DebtInput } from '@/lib/types'
import { bpToInputValue, centsToInputValue, parseAmountToCents, parseBalanceToCents, parsePercentToBp } from '@/lib/money'
import { addDebt, deleteDebt, updateDebt } from '@/lib/db/debts'
import { Button } from '../button'
import { AmountInput, Field, TextInput } from '../field'
import { Confirm } from '../confirm'
import { attemptWrite } from '@/lib/db/storage-errors'
import { TrashIcon } from '../icons'

interface DebtFormProps {
  debt?: Debt
  onDone: () => void
}

interface Errors {
  name?: string
  balance?: string
  apr?: string
  payment?: string
}

/**
 * Alta y edición de deudas (préstamo, tarjeta, financiación, hipoteca). Lo que
 * queda por devolver se actualiza a mano, como el valor de una inversión.
 */
export function DebtForm({ debt, onDone }: DebtFormProps) {
  const [name, setName] = useState(debt?.name ?? '')
  const [balance, setBalance] = useState(debt ? centsToInputValue(debt.balanceCents) : '')
  const [apr, setApr] = useState(debt ? bpToInputValue(debt.aprBp) : '')
  const [payment, setPayment] = useState(debt ? centsToInputValue(debt.monthlyPaymentCents) : '')
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    // Al editar se puede dejar en 0 (ya devuelta); al crear tiene que quedar algo.
    const balanceCents = debt ? parseBalanceToCents(balance) : parseAmountToCents(balance)
    const aprBp = parsePercentToBp(apr)
    const paymentCents = parseAmountToCents(payment)
    const next: Errors = {}
    if (!name.trim()) next.name = 'Ponle un nombre (p. ej. «Préstamo del coche»).'
    if (balanceCents === null || balanceCents < 0) next.balance = 'Introduce lo que queda por devolver.'
    if (aprBp === null) next.apr = 'Introduce el interés anual, p. ej. 8,5.'
    if (paymentCents === null) next.payment = 'Introduce la cuota mensual.'
    setErrors(next)
    if (Object.keys(next).length > 0 || balanceCents === null || aprBp === null || paymentCents === null) return

    const input: DebtInput = { name, balanceCents, aprBp, monthlyPaymentCents: paymentCents }
    setBusy(true)
    setSaveError(null)
    const result = await attemptWrite(() => (debt ? updateDebt(debt.id, input) : addDebt(input)))
    setBusy(false)
    if (result.ok) onDone()
    else setSaveError(result.message)
  }

  if (debt && confirmingDelete) {
    return (
      <Confirm
        message={`¿Eliminar la deuda «${debt.name}»? Si ya la has terminado de pagar, también puedes dejarla en 0.`}
        confirmLabel="Eliminar"
        destructive
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={async () => {
          await deleteDebt(debt.id)
          onDone()
        }}
      />
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nombre" error={errors.name}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Préstamo del coche" maxLength={60} autoFocus={!debt} />
      </Field>
      <Field label="Lo que queda por devolver" error={errors.balance} hint="Míralo en tu banco y actualízalo de vez en cuando.">
        <AmountInput value={balance} onChange={(e) => setBalance(e.target.value)} />
      </Field>
      <Field label="Interés anual (TAE), en %" error={errors.apr} hint="Viene en el contrato o en la app del banco. Las tarjetas a plazos suelen pasar del 20 %.">
        <TextInput inputMode="decimal" value={apr} onChange={(e) => setApr(e.target.value)} placeholder="Ej. 8,5" />
      </Field>
      <Field label="Cuota mensual" error={errors.payment} hint="Cuando la pagues, regístrala como gasto: aquí solo sirve para calcular cuándo terminas.">
        <AmountInput value={payment} onChange={(e) => setPayment(e.target.value)} />
      </Field>
      {saveError && (
        <p role="alert" className="text-[12.5px] font-medium text-negative">
          {saveError}
        </p>
      )}
      <div className="flex gap-3 pt-1">
        {debt && (
          <Button type="button" variant="secondary" aria-label="Eliminar deuda" onClick={() => setConfirmingDelete(true)} className="px-4 text-negative">
            <TrashIcon className="h-5 w-5" />
          </Button>
        )}
        <Button type="submit" fullWidth disabled={busy}>
          {debt ? 'Guardar cambios' : 'Añadir deuda'}
        </Button>
      </div>
    </form>
  )
}
