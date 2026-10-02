'use client'

import { useState, type FormEvent } from 'react'
import type { Objective } from '@/lib/types'
import { centsToInputValue, formatCents, parseAmountToCents } from '@/lib/money'
import { contributionError, contributionLimit } from '@/lib/finance/objectives'
import { contributeToObjective } from '@/lib/db/objectives'
import { Button } from '../button'
import { AmountInput, Field } from '../field'

interface ContributeFormProps {
  objective: Objective
  objectives: Objective[]
  liquidCents: number
  onDone: () => void
}

/**
 * Aportar a un objetivo: aparta parte del líquido sin crear movimientos.
 * No deja apartar más de lo que falta ni más del líquido aún sin apartar.
 */
export function ContributeForm({ objective, objectives, liquidCents, onDone }: ContributeFormProps) {
  const limit = contributionLimit(objective, objectives, liquidCents)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const amountCents = parseAmountToCents(amount)
    const message = contributionError(amountCents, limit)
    setError(message ?? undefined)
    if (message !== null || amountCents === null) return
    setBusy(true)
    try {
      await contributeToObjective(objective.id, amountCents)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-2xl bg-finax-soft px-4 py-3">
        <p className="truncate text-[14px] font-bold text-grafito">{objective.name}</p>
        <p className="mt-0.5 text-[12.5px] font-medium text-muted-foreground">
          Le faltan <span className="font-semibold text-grafito">{formatCents(limit.remainingCents)}</span> · Líquido sin
          apartar <span className="font-semibold text-grafito">{formatCents(limit.freeCents)}</span>
        </p>
      </div>
      <Field
        label="Importe a aportar"
        error={error}
        hint="Queda apartado para este objetivo. No se registra como gasto: sigue en tu líquido."
      >
        <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </Field>
      {limit.maxCents > 0 && (
        <button
          type="button"
          onClick={() => setAmount(centsToInputValue(limit.maxCents))}
          className="rounded-full bg-muted px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-all hover:bg-graylight/70"
        >
          Aportar el máximo ({formatCents(limit.maxCents)})
        </button>
      )}
      <Button type="submit" fullWidth disabled={busy || limit.maxCents === 0}>
        Aportar
      </Button>
    </form>
  )
}
