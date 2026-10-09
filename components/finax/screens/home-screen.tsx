'use client'

import { useState } from 'react'
import { formatCents } from '@/lib/money'
import { PERIODS, type PeriodId } from '@/lib/finance/summary'
import { seriesDelta } from '@/lib/finance/patrimonio'
import { axisHeadline, useAxis } from '@/hooks/use-axis'
import { useMarketContext } from '@/hooks/use-market-context'
import { useAllocationPlan } from '@/hooks/use-allocation-plan'
import { planHeadline } from '@/lib/axis/plan/describe'
import { Wordmark } from '../wordmark'
import { IconButton, SectionHeader } from '../page-header'
import { UserIcon, ArrowUp, ArrowDown, ChevronRight } from '../icons'
import { EvolutionChart, seriesForRange } from '../charts/evolution-chart'
import { AxisCard } from '../axis-card'
import { GoalCard } from '../goal-card'
import { FinancialCard } from '../card'
import { EmptyState } from '../empty-state'
import { Button } from '../button'
import { ScreenLoading } from '../loading'
import { useSheet } from '../sheet'
import { InitialBalanceForm } from '../forms/initial-balance-form'
import { ObjectiveForm } from '../forms/objective-form'
import { cn } from '@/lib/utils'
import type { ScreenProps } from './types'

export function HomeScreen({ overview, onNavigate }: ScreenProps) {
  const [range, setRange] = useState<PeriodId>('1A')
  const { market } = useMarketContext(overview)
  const { state: axis } = useAxis(overview, { market })
  const plan = useAllocationPlan(overview)
  const { open, close } = useSheet()

  if (!overview) return <ScreenLoading />

  const delta = seriesDelta(seriesForRange(overview.series, range))
  // El primero del reparto que aún no está cubierto; si no, el primero de la lista.
  const items = overview.objectivesAllocation.items
  const firstGoal = items.find((i) => i.status === 'in-progress') ?? items[0]

  return (
    <div className="space-y-6 px-5 pb-8 pt-3">
      <div className="flex items-center justify-between">
        <Wordmark />
        <IconButton label="Ajustes" onClick={() => onNavigate('ajustes')}>
          <UserIcon className="h-5 w-5" />
        </IconButton>
      </div>

      {overview.config?.demo && (
        <p className="rounded-2xl border border-axis-violet/20 bg-axis-soft px-4 py-2.5 text-[12px] font-semibold text-axis-indigo">
          Datos de demostración: no son datos financieros reales.
        </p>
      )}

      <section>
        <button
          type="button"
          onClick={() => onNavigate('dinero')}
          aria-label="Ver Mi Dinero"
          className="block w-full text-left"
        >
          <p className="text-[13px] font-medium text-muted-foreground">Tu patrimonio</p>
          <p className="mt-1 text-[38px] font-extrabold leading-none tracking-tight text-grafito tabular-nums">
            {formatCents(overview.patrimonioCents)}
          </p>
          {delta ? (
            <p
              className={cn(
                'mt-2 flex items-center gap-1 text-[13px] font-semibold',
                delta.cents >= 0 ? 'text-finax-dark' : 'text-negative',
              )}
            >
              {delta.cents >= 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              {/* En euros: un % sobre un saldo inicial pequeño se leería como rentabilidad. */}
              {formatCents(delta.cents, true)}
              <span className="font-medium text-muted-foreground">en el periodo</span>
            </p>
          ) : (
            <p className="mt-2 text-[13px] font-medium text-muted-foreground">
              {overview.config ? 'Sin variación registrada en el periodo' : 'Configura tu saldo inicial para empezar'}
            </p>
          )}
        </button>
      </section>

      {overview.isEmpty ? (
        <EmptyState
          title="Aquí empieza tu historia"
          description="Indica tu saldo inicial y registra tu primer movimiento."
          action={
            <Button
              onClick={() => open('Saldo inicial', <InitialBalanceForm onDone={close} />)}
            >
              Empezar
            </Button>
          }
        />
      ) : (
        <>
          <EvolutionChart series={overview.series} range={range} className="h-[150px] w-full" />

          <div className="flex items-center justify-between gap-1.5">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setRange(p.id)}
                className={cn(
                  'relative flex-1 rounded-full py-2 text-[12px] font-semibold transition-all after:absolute after:inset-x-0 after:-inset-y-1',
                  p.id === range ? 'bg-finax-dark text-white' : 'bg-muted text-muted-foreground',
                )}
              >
                {p.id}
              </button>
            ))}
          </div>
        </>
      )}

      <AxisCard
        title="AXIS"
        text={axisHeadline(axis)}
        onClick={() => onNavigate('axis')}
      />

      {plan && (
        <button
          type="button"
          onClick={() => onNavigate('plan')}
          className="flex w-full items-center gap-3 rounded-3xl border border-border bg-card p-4 text-left shadow-[0_2px_14px_-8px_rgba(31,41,55,0.14)] transition-[background-color,scale] duration-150 hover:bg-muted/40 active:scale-[0.99]"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-bold uppercase tracking-[0.06em] text-finax-dark">Tu plan del mes</span>
            <span className="mt-0.5 block text-[13.5px] font-semibold leading-snug text-grafito text-pretty">{planHeadline(plan.plan, plan.decision.context.objectives)}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </button>
      )}

      <section>
        <SectionHeader title="Tus objetivos" actionLabel="Ver todos" onAction={() => onNavigate('objetivos')} />
        <FinancialCard>
          {firstGoal ? (
            <GoalCard
              item={firstGoal}
              onClick={() => open('Editar objetivo', <ObjectiveForm objective={firstGoal.objective} onDone={close} />)}
            />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-medium text-muted-foreground text-pretty">
                Todavía no tienes objetivos. Define para qué ahorras.
              </p>
              <Button
                variant="secondary"
                className="shrink-0 px-4 py-2 text-[12.5px]"
                onClick={() => open('Nuevo objetivo', <ObjectiveForm onDone={close} />)}
              >
                Crear
              </Button>
            </div>
          )}
        </FinancialCard>
      </section>

      <section>
        <h2 className="mb-3 text-[17px] font-bold tracking-tight text-grafito">Resumen de hoy</h2>
        <FinancialCard>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[19px] font-bold text-finax-dark tabular-nums">
                {formatCents(overview.today.incomeCents, true)}
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">Ingresos</p>
            </div>
            <div className="border-l border-border pl-4">
              <p className="text-[19px] font-bold text-negative tabular-nums">
                {formatCents(-overview.today.expenseCents, true)}
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">Gastos</p>
            </div>
          </div>
        </FinancialCard>
      </section>
    </div>
  )
}
