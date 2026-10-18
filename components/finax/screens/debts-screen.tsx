'use client'

import { formatCents } from '@/lib/money'
import { formatShortDate, toISODate } from '@/lib/dates'
import { aprPctOf, DEBT_CHEAP_PCT, DEBT_EXPENSIVE_PCT, DEBT_LOAD_MAX_PCT, payoffMonths, remainingInterestCents } from '@/lib/finance/debts'
import { durationText, pctText } from '@/lib/axis/plan/describe'
import { useAllocationPlan } from '@/hooks/use-allocation-plan'
import { SubPageHeader, IconButton } from '../page-header'
import { FinancialCard } from '../card'
import { EmptyState } from '../empty-state'
import { Button } from '../button'
import { ScreenLoading } from '../loading'
import { useSheet } from '../sheet'
import { DebtForm } from '../forms/debt-form'
import { MoneyIcon, PlusIcon } from '../icons'
import { cn } from '@/lib/utils'
import type { ScreenProps } from './types'

const DAY_MS = 86_400_000
/** Una deuda sin actualizar en más de estos días: se pide revisar lo que queda. */
const STALE_DEBT_DAYS = 45

function costTag(aprPct: number): { label: string; className: string } {
  if (aprPct >= DEBT_EXPENSIVE_PCT) return { label: 'Cara', className: 'bg-negative/8 text-negative' }
  if (aprPct >= DEBT_CHEAP_PCT) return { label: 'Interés medio', className: 'bg-axis-soft text-axis-indigo' }
  return { label: 'Barata', className: 'bg-finax-soft text-finax-dark' }
}

/**
 * «Tus deudas»: lo que debes, cuánto te cuesta y cuándo terminas. Las deudas
 * entran en tu plan (las caras se devuelven antes de invertir) y en lo que
 * sabe AXIS. Datos manuales: el saldo pendiente lo actualizas tú.
 */
export function DebtsScreen({ overview, onNavigate, onBack }: ScreenProps) {
  const { open, close } = useSheet()
  const result = useAllocationPlan(overview)
  if (!overview) return <ScreenLoading />

  const debts = overview.debts.filter((d) => d.balanceCents > 0)
  const paid = overview.debts.filter((d) => d.balanceCents <= 0)
  const owed = debts.reduce((t, d) => t + d.balanceCents, 0)
  const payments = debts.reduce((t, d) => t + d.monthlyPaymentCents, 0)
  const monthly = result?.plan.monthly
  const income = monthly ? monthly.savingsCents + monthly.spendingCents : 0
  const loadPct = income > 0 && payments > 0 ? Math.round((payments / income) * 100) : null
  const openNew = () => open('Nueva deuda', <DebtForm onDone={close} />)

  return (
    <div className="space-y-6 px-5 pb-8 pt-3">
      <SubPageHeader
        title="Deudas"
        subtitle="Préstamos, tarjetas y financiaciones"
        onBack={onBack}
        action={
          <IconButton label="Nueva deuda" onClick={openNew}>
            <PlusIcon className="h-5 w-5" />
          </IconButton>
        }
      />

      {debts.length === 0 && paid.length === 0 ? (
        <EmptyState
          title="Sin deudas registradas"
          description="Si tienes un préstamo, una tarjeta a plazos o algo financiado, apúntalo: tu plan decidirá si conviene devolverlo antes de invertir."
          icon={<MoneyIcon className="h-7 w-7" />}
          action={<Button onClick={openNew}>Añadir deuda</Button>}
        />
      ) : (
        <>
          <FinancialCard className="space-y-3">
            <div>
              <p className="text-[13px] font-medium text-muted-foreground">Debes en total</p>
              <p className="mt-1 text-[32px] font-extrabold leading-none tracking-tight text-grafito tabular-nums">{formatCents(owed)}</p>
            </div>
            <dl className="space-y-1.5 border-t border-border pt-3 text-[12.5px]">
              <div className="flex justify-between gap-3">
                <dt className="font-medium text-muted-foreground">Cuotas al mes</dt>
                <dd className="font-bold text-grafito tabular-nums">{formatCents(payments)}</dd>
              </div>
              {loadPct !== null && (
                <div className="flex justify-between gap-3">
                  <dt className="font-medium text-muted-foreground">De tus ingresos habituales</dt>
                  <dd className={cn('font-bold tabular-nums', loadPct > DEBT_LOAD_MAX_PCT ? 'text-negative' : 'text-grafito')}>{loadPct} %</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="font-medium text-muted-foreground">Tu patrimonio menos lo que debes</dt>
                <dd className="font-bold text-grafito tabular-nums">{formatCents(overview.patrimonioCents - owed)}</dd>
              </div>
            </dl>
            {loadPct !== null && loadPct > DEBT_LOAD_MAX_PCT && (
              <p className="rounded-xl bg-negative/8 px-3 py-2 text-[12.5px] font-semibold leading-snug text-negative text-pretty">
                Por encima del {DEBT_LOAD_MAX_PCT} % es mucha carga: no pidas más préstamos hasta bajarla.
              </p>
            )}
          </FinancialCard>

          <section>
            <h2 className="mb-3 text-[17px] font-bold tracking-tight text-grafito">Tus deudas</h2>
            <FinancialCard padded={false} className="px-4">
              <div className="divide-y divide-border">
                {[...debts, ...paid].map((d) => {
                  const apr = aprPctOf(d.aprBp)
                  const tag = costTag(apr)
                  const months = payoffMonths(d.balanceCents, apr, d.monthlyPaymentCents)
                  const interest = remainingInterestCents(d.balanceCents, apr, d.monthlyPaymentCents)
                  const stale = d.balanceCents > 0 && Date.now() - d.updatedAt > STALE_DEBT_DAYS * DAY_MS
                  return (
                    <button key={d.id} type="button" onClick={() => open('Editar deuda', <DebtForm debt={d} onDone={close} />)} className="block w-full space-y-1 py-3 text-left">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 break-words text-[14px] font-bold text-grafito">{d.name}</p>
                        <p className="shrink-0 text-[14px] font-bold text-grafito tabular-nums">{formatCents(d.balanceCents)}</p>
                      </div>
                      {d.balanceCents <= 0 ? (
                        <p className="text-[12px] font-semibold text-finax-dark">Devuelta. Puedes eliminarla.</p>
                      ) : (
                        <>
                          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] font-medium text-muted-foreground">
                            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', tag.className)}>{tag.label}</span>
                            <span className="whitespace-nowrap">{pctText(apr)} al año</span>
                            <span className="whitespace-nowrap">· {formatCents(d.monthlyPaymentCents)}/mes</span>
                          </p>
                          <p className="text-[12px] font-medium leading-snug text-grafito/80 text-pretty">
                            {months !== null
                              ? `Con esta cuota terminas en unos ${durationText(months)}${interest ? ` y pagas unos ${formatCents(Math.round(interest / 100) * 100)} de intereses` : ''}.`
                              : 'Con esta cuota no llegas a cubrir los intereses: la deuda no baja. Habla con tu banco.'}
                          </p>
                          {stale && <p className="text-[12px] font-semibold text-axis-indigo">Actualizada el {formatShortDate(toISODate(new Date(d.updatedAt)))}: revisa lo que queda.</p>}
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            </FinancialCard>
          </section>

          <FinancialCard className="space-y-2">
            <p className="text-[15px] font-bold text-grafito">Cómo las trata tu plan</p>
            <ul className="list-disc space-y-1 pl-4 text-[12.5px] font-medium leading-snug text-grafito/85 text-pretty">
              <li>Las caras (más de lo que cabe esperar de tu inversión, y siempre desde el {DEBT_EXPENSIVE_PCT} %): primero apartas un mes de gasto y después todo tu ahorro va a devolverlas, de la más cara a la más barata. Devolverlas es una rentabilidad segura.</li>
              <li>Las de interés medio: tu plan sigue invirtiendo, y te recuerda que devolverlas antes también es buena opción.</li>
              <li>Las baratas (menos del {DEBT_CHEAP_PCT} %, como muchas hipotecas): basta con pagar la cuota.</li>
            </ul>
            <Button variant="secondary" fullWidth onClick={() => onNavigate('plan')}>
              Ver tu plan
            </Button>
          </FinancialCard>
        </>
      )}
    </div>
  )
}
