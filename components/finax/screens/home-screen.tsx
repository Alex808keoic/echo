'use client'

import { useState } from 'react'
import { formatCents } from '@/lib/money'
import { formatPct } from '@/lib/format'
import { PERIODS, type PeriodId } from '@/lib/finance/summary'
import { seriesDelta } from '@/lib/finance/patrimonio'
import { axisHeadline, useAxis } from '@/hooks/use-axis'
import { Wordmark } from '../wordmark'
import { IconButton, SectionHeader } from '../page-header'
import { UserIcon, ArrowUp, ArrowDown } from '../icons'
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
  const axis = useAxis(overview)
  const { open, close } = useSheet()

  if (!overview) return <ScreenLoading />

  const delta = seriesDelta(seriesForRange(overview.series, range))
  const firstGoal = overview.objectives.find((o) => o.currentCents < o.targetCents) ?? overview.objectives[0]

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
                delta.cents >= 0 ? 'text-finax' : 'text-negative',
              )}
            >
              {delta.cents >= 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              {delta.pct !== null ? formatPct(delta.pct, true) : formatCents(delta.cents, true)}
              <span className="font-medium text-muted-foreground">líquido, en el periodo</span>
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
                  'flex-1 rounded-full py-2 text-[12px] font-semibold transition-all',
                  p.id === range ? 'bg-finax text-white' : 'bg-muted text-muted-foreground',
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

      <section>
        <SectionHeader title="Tus objetivos" actionLabel="Ver todos" onAction={() => onNavigate('objetivos')} />
        <FinancialCard>
          {firstGoal ? (
            <GoalCard
              goal={firstGoal}
              onClick={() => open('Editar objetivo', <ObjectiveForm objective={firstGoal} onDone={close} />)}
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
              <p className="text-[19px] font-bold text-finax tabular-nums">
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
