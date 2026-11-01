'use client'

import { useState, type FormEvent } from 'react'
import { centsToInputValue, formatCents, parseAmountToCents, parseBalanceToCents } from '@/lib/money'
import { formatShortDate, isValidISODate, todayISO } from '@/lib/dates'
import { addCashTransfer, deleteCashTransfer } from '@/lib/db/cash'
import { attemptWrite } from '@/lib/db/storage-errors'
import { cashAdjustment } from '@/lib/finance/wallets'
import { useFinancialOverview, type FinancialOverview } from '@/hooks/use-financial-overview'
import type { CashTransfer } from '@/lib/types'
import { Button } from '../button'
import { AmountInput, Field, TextInput } from '../field'
import { CloseIcon } from '../icons'
import { useSheet } from '../sheet'
import { cn } from '@/lib/utils'

export const WALLET_TITLE = 'Tarjeta y efectivo'

/**
 * Cuánto tienes en el banco y en efectivo, y los traspasos entre los dos. Lee
 * los datos en vivo: la hoja se actualiza al añadir o borrar un traspaso.
 */
export function WalletSheet() {
  const overview = useFinancialOverview()
  if (!overview) return null
  return <WalletView overview={overview} />
}

function WalletView({ overview }: { overview: FinancialOverview }) {
  const { open, close } = useSheet()
  const { bankCents, cashCents } = overview.wallets
  const back = () => open(WALLET_TITLE, <WalletSheet />)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Balance label="Tarjeta / banco" cents={bankCents} />
        <Balance label="Efectivo" cents={cashCents} />
      </div>
      <p className="text-[12px] font-medium leading-snug text-muted-foreground text-pretty">
        Suman tu dinero líquido ({formatCents(overview.liquidCents)}). Al apuntar un gasto o un ingreso, elige si fue con tarjeta o en efectivo.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="px-3 text-[13px]" onClick={() => open('Sacar efectivo', <TransferForm direction="a-efectivo" onDone={back} />)}>
          Sacar efectivo
        </Button>
        <Button variant="secondary" className="px-3 text-[13px]" onClick={() => open('Ingresar en el banco', <TransferForm direction="a-banco" onDone={back} />)}>
          Ingresar en el banco
        </Button>
      </div>
      <button
        type="button"
        className="w-full text-center text-[12.5px] font-bold text-finax-dark"
        onClick={() => open('Corregir efectivo', <AdjustCashForm currentCents={cashCents} onDone={back} />)}
      >
        Corregir cuánto efectivo tengo
      </button>

      {overview.cashTransfers.length > 0 && (
        <section>
          <h3 className="mb-2 text-[13px] font-bold text-muted-foreground">Traspasos</h3>
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {overview.cashTransfers.slice(0, 20).map((t) => (
              <TransferRow key={t.id} transfer={t} />
            ))}
          </ul>
        </section>
      )}

      <Button fullWidth onClick={close}>
        Hecho
      </Button>
    </div>
  )
}

function Balance({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="rounded-2xl bg-muted/60 p-3.5">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-[18px] font-bold tabular-nums', cents < 0 ? 'text-negative' : 'text-grafito')}>{formatCents(cents)}</p>
    </div>
  )
}

function TransferRow({ transfer }: { transfer: CashTransfer }) {
  const [confirming, setConfirming] = useState(false)
  const toCash = transfer.direction === 'a-efectivo'
  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-grafito">{toCash ? 'Sacado del banco' : 'Ingresado en el banco'}</span>
        <span className="block truncate text-[11.5px] font-medium text-muted-foreground">
          {formatShortDate(transfer.date)}
          {transfer.nota && ` · ${transfer.nota}`}
        </span>
      </span>
      <span className="shrink-0 text-[13px] font-bold text-grafito tabular-nums">{formatCents(transfer.amountCents)}</span>
      {confirming ? (
        <button type="button" className="shrink-0 text-[12px] font-bold text-negative" onClick={() => void deleteCashTransfer(transfer.id)}>
          Borrar
        </button>
      ) : (
        <button type="button" aria-label="Borrar traspaso" className="shrink-0 p-1 text-muted-foreground" onClick={() => setConfirming(true)}>
          <CloseIcon className="h-4 w-4" />
        </button>
      )}
    </li>
  )
}

function TransferForm({ direction, onDone }: { direction: CashTransfer['direction']; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const amountCents = parseAmountToCents(amount)
    if (amountCents === null) return setError('Introduce un importe mayor que cero (ej. 50).')
    if (!isValidISODate(date)) return setError('Fecha no válida.')
    const result = await attemptWrite(() => addCashTransfer({ direction, amountCents, date, nota }))
    if (result.ok) onDone()
    else setError(result.message)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">
        {direction === 'a-efectivo'
          ? 'Lo que sacas del cajero pasa del banco a tu efectivo. No es un gasto: tu dinero total no cambia.'
          : 'El efectivo que ingresas pasa a tu cuenta. No es un ingreso: tu dinero total no cambia.'}
      </p>
      <Field label="Importe">
        <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </Field>
      <Field label="Fecha">
        <TextInput type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Nota (opcional)">
        <TextInput value={nota} onChange={(e) => setNota(e.target.value)} maxLength={60} placeholder="Ej. Cajero del trabajo" />
      </Field>
      {error && (
        <p role="alert" className="text-[12.5px] font-medium text-negative">
          {error}
        </p>
      )}
      <Button type="submit" fullWidth>
        Guardar
      </Button>
    </form>
  )
}

function AdjustCashForm({ currentCents, onDone }: { currentCents: number; onDone: () => void }) {
  const [amount, setAmount] = useState(centsToInputValue(Math.max(0, currentCents)))
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const target = parseBalanceToCents(amount)
    if (target === null || target < 0) return setError('Introduce un importe válido (puede ser 0).')
    const adjustment = cashAdjustment(currentCents, target)
    if (!adjustment) return onDone()
    const result = await attemptWrite(() => addCashTransfer({ ...adjustment, date: todayISO(), nota: 'Corrección de efectivo' }))
    if (result.ok) onDone()
    else setError(result.message)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">
        Cuenta lo que llevas en la cartera y escríbelo. La diferencia pasa entre el banco y el efectivo, así que tu dinero total no cambia.
      </p>
      <Field label="Efectivo que tengo ahora">
        <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </Field>
      {error && (
        <p role="alert" className="text-[12.5px] font-medium text-negative">
          {error}
        </p>
      )}
      <Button type="submit" fullWidth>
        Guardar
      </Button>
    </form>
  )
}
