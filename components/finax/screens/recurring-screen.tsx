'use client'

import { formatCents } from '@/lib/money'
import { formatShortDate, todayISO } from '@/lib/dates'
import { describeSchedule, monthlyEquivalentCents, nextOccurrence } from '@/lib/finance/recurring'
import { useRecurring } from '@/hooks/use-recurring'
import { SubPageHeader, IconButton } from '../page-header'
import { FinancialCard } from '../card'
import { EmptyState } from '../empty-state'
import { Button } from '../button'
import { ScreenLoading } from '../loading'
import { useSheet } from '../sheet'
import { RecurringForm } from '../forms/recurring-form'
import { RecurringPending } from '../recurring-pending'
import { MovementsIcon, PlusIcon } from '../icons'
import { cn } from '@/lib/utils'
import type { ScreenProps } from './types'

/**
 * «Movimientos fijos»: lo que entra o sale siempre (nómina, alquiler,
 * suscripciones). Cada vez que toca, Finax te lo propone para que lo
 * confirmes con un toque; hasta entonces no cuenta en tu dinero.
 */
export function RecurringScreen({ onBack }: ScreenProps) {
  const state = useRecurring()
  const { open, close } = useSheet()
  if (!state) return <ScreenLoading />

  const { recurring, pending } = state
  const openNew = () => open('Nuevo fijo', <RecurringForm onDone={close} />)
  const incomeCents = recurring.filter((r) => r.type === 'ingreso').reduce((t, r) => t + monthlyEquivalentCents(r), 0)
  const expenseCents = recurring.filter((r) => r.type === 'gasto').reduce((t, r) => t + monthlyEquivalentCents(r), 0)
  const today = todayISO()
  const hasYearly = recurring.some((r) => r.frequency === 'yearly')

  return (
    <div className="space-y-6 px-5 pb-8 pt-3">
      <SubPageHeader
        title="Movimientos fijos"
        subtitle="Nómina, alquiler, suscripciones…"
        onBack={onBack}
        action={
          <IconButton label="Nuevo fijo" onClick={openNew}>
            <PlusIcon className="h-5 w-5" />
          </IconButton>
        }
      />

      {recurring.length === 0 ? (
        <EmptyState
          title="Sin movimientos fijos"
          description="Añade lo que entra o sale siempre igual. Cada vez que toque, Finax te lo propondrá y lo confirmas con un toque: así no se te olvida apuntarlo."
          icon={<MovementsIcon className="h-7 w-7" />}
          action={<Button onClick={openNew}>Añadir fijo</Button>}
        />
      ) : (
        <>
          <RecurringPending pending={pending} limit={Infinity} />

          <FinancialCard>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[19px] font-bold text-finax-dark tabular-nums">{formatCents(incomeCents, true)}</p>
                <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">Ingresos fijos al mes</p>
              </div>
              <div className="border-l border-border pl-4">
                <p className="text-[19px] font-bold text-negative tabular-nums">{formatCents(-expenseCents, true)}</p>
                <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">Gastos fijos al mes</p>
              </div>
            </div>
            {hasYearly && <p className="mt-3 text-[12px] font-medium text-muted-foreground text-pretty">Los anuales cuentan su parte de cada mes.</p>}
          </FinancialCard>

          <section>
            <h2 className="mb-3 text-[17px] font-bold tracking-tight text-grafito">Tus fijos</h2>
            <FinancialCard padded={false} className="px-4">
              <div className="divide-y divide-border">
                {recurring.map((r) => {
                  const income = r.type === 'ingreso'
                  const next = nextOccurrence(r)
                  return (
                    <button key={r.id} type="button" onClick={() => open('Editar fijo', <RecurringForm recurring={r} onDone={close} />)} className="block w-full space-y-0.5 py-3 text-left">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 break-words text-[14px] font-bold text-grafito">{r.name}</p>
                        <p className={cn('shrink-0 text-[14px] font-bold tabular-nums', income ? 'text-finax-dark' : 'text-negative')}>
                          {formatCents(income ? r.amountCents : -r.amountCents, true)}
                        </p>
                      </div>
                      <p className="text-[12px] font-medium text-muted-foreground text-pretty">
                        {r.category} · {describeSchedule(r)}
                      </p>
                      <p className={cn('text-[12px] font-medium', next <= today ? 'font-semibold text-axis-indigo' : 'text-grafito/80')}>
                        {next <= today ? `Por confirmar desde el ${formatShortDate(next)}` : `Próxima vez: ${formatShortDate(next)}`}
                      </p>
                    </button>
                  )
                })}
              </div>
            </FinancialCard>
          </section>
        </>
      )}
    </div>
  )
}
