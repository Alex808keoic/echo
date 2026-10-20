'use client'

import { useState } from 'react'
import { formatCents } from '@/lib/money'
import { PERIODS, type PeriodId } from '@/lib/finance/summary'
import { useSlidingIndicator } from '../use-sliding-indicator'
import { seriesDelta } from '@/lib/finance/patrimonio'
import { axisHeadline, useAxis } from '@/hooks/use-axis'
import { useMarketContext } from '@/hooks/use-market-context'
import { useAllocationPlan } from '@/hooks/use-allocation-plan'
import { useMonthReview, usePlanChecklist } from '@/hooks/use-plan-checklist'
import { todayISO } from '@/lib/dates'
import { dueReminders } from '@/lib/reminders'
import { useLiveQuery } from 'dexie-react-hooks'
import { dismissRecurringHint, getLastBackupAt, getRecurringHintDismissedAt } from '@/lib/db/meta'
import { useRecurring } from '@/hooks/use-recurring'

/** Días al principio del mes en los que Inicio anuncia la revisión del mes anterior. */
const REVIEW_NOTICE_DAYS = 10
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
import { Onboarding, ONBOARDING_TITLE } from '../forms/onboarding'
import { RecurringForm } from '../forms/recurring-form'
import { RecurringPending } from '../recurring-pending'
import { ObjectiveForm } from '../forms/objective-form'
import { cn } from '@/lib/utils'
import type { ScreenProps } from './types'

export function HomeScreen({ overview, onNavigate }: ScreenProps) {
  const [range, setRange] = useState<PeriodId>('1A')
  const { market } = useMarketContext(overview)
  const { state: axis } = useAxis(overview, { market })
  const plan = useAllocationPlan(overview)
  const checklist = usePlanChecklist(plan?.plan, plan?.decision.context.objectives, overview?.positions)
  const review = useMonthReview(overview?.axisSnapshot, plan?.plan, checklist)
  const lastBackupAt = useLiveQuery(getLastBackupAt, [], undefined)
  const fixed = useRecurring()
  const hintDismissedAt = useLiveQuery(getRecurringHintDismissedAt, [], undefined)
  const today = todayISO()
  const created = overview ? [...overview.movements, ...overview.positions].map((r) => r.createdAt).concat(overview.config ? [overview.config.configuredAt] : []) : []
  // Los primeros días del mes, la revisión del anterior se anuncia en Inicio.
  const showReview = review && Number(todayISO().slice(8, 10)) <= REVIEW_NOTICE_DAYS
  const reminders =
    overview && plan
      ? dueReminders({
          today,
          checklist: checklist ? { items: checklist.items.length, done: checklist.doneCount } : null,
          hasRecurringIncome: (plan.decision.profile.fields.recurringIncomes?.length ?? 0) > 0,
          incomeThisMonth: plan.decision.context.flows.current.incomeCents,
          positionsUpdatedAt: overview.positions.map((p) => p.updatedAt),
          // Mientras carga la fecha de la última copia, no se avisa.
          firstDataAt: lastBackupAt === undefined || created.length === 0 || overview.config?.demo ? null : Math.min(...created),
          lastBackupAt: lastBackupAt ?? null,
          hasLastYearData: overview.movements.some((m) => m.date.startsWith(String(Number(today.slice(0, 4)) - 1))),
        })
      : []
  const { open, close } = useSheet()

  if (!overview) return <ScreenLoading />

  // Quien ya usaba Finax antes de los fijos (o se saltó ese paso): una tarjeta que se puede cerrar.
  const showFixedHint = !overview.isEmpty && !overview.config?.demo && fixed?.recurring.length === 0 && hintDismissedAt === null

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
              onClick={() => open(ONBOARDING_TITLE, <Onboarding />)}
            >
              Empezar
            </Button>
          }
        />
      ) : (
        <>
          <EvolutionChart series={overview.series} range={range} className="h-[150px] w-full" />

          <PeriodTabs range={range} onChange={setRange} />
        </>
      )}

      <AxisCard
        title="AXIS"
        text={axisHeadline(axis)}
        onClick={() => onNavigate('axis')}
      />

      {reminders.length > 0 && (
        <ul className="space-y-2" aria-label="Recordatorios">
          {reminders.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onNavigate(r.to)}
                className="flex w-full items-center gap-3 rounded-2xl bg-axis-soft px-4 py-3 text-left text-[13px] font-semibold leading-snug text-axis-indigo transition-opacity active:opacity-70"
              >
                <span className="min-w-0 flex-1 text-pretty">{r.text}</span>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {fixed && <RecurringPending pending={fixed.pending} onSeeAll={() => onNavigate('fijos')} />}

      {showFixedHint && (
        <FinancialCard className="space-y-3">
          <div>
            <p className="text-[15px] font-bold text-grafito">¿Tienes ingresos o gastos fijos?</p>
            <p className="mt-1 text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">
              Tu nómina, el alquiler, las suscripciones… Apúntalos una vez y te los propondremos cada vez que toquen, para confirmarlos con un toque.
            </p>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1 px-4 py-2.5 text-[13px]" onClick={() => open('Nuevo fijo', <RecurringForm onDone={close} />)}>
              Añadir un fijo
            </Button>
            <Button variant="ghost" className="px-4 py-2.5 text-[13px] text-muted-foreground" onClick={() => void dismissRecurringHint()}>
              Ahora no
            </Button>
          </div>
        </FinancialCard>
      )}

      {plan && (
        <button
          type="button"
          onClick={() => onNavigate('plan')}
          className="flex w-full items-center gap-3 rounded-3xl border border-border bg-card p-4 text-left shadow-[0_2px_14px_-8px_rgba(31,41,55,0.14)] transition-[background-color,scale] duration-150 hover:bg-muted/40 active:scale-[0.99]"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-bold uppercase tracking-[0.06em] text-finax-dark">Tu plan del mes</span>
            <span className="mt-0.5 block text-[13.5px] font-semibold leading-snug text-grafito text-pretty">{planHeadline(plan.plan, plan.decision.context.objectives)}</span>
            {showReview && (
              <span className="mt-1 block text-[12px] font-semibold text-axis-indigo">Revisión de {review.label} lista</span>
            )}
            {checklist && checklist.items.length > 0 && (
              <span className="mt-1 block text-[12px] font-medium text-muted-foreground tabular-nums">
                Tu decisión del mes: {checklist.doneCount} de {checklist.items.length} hechas
              </span>
            )}
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

/** Periodos de la gráfica de Inicio, con el verde deslizándose de uno a otro. */
function PeriodTabs({ range, onChange }: { range: PeriodId; onChange: (range: PeriodId) => void }) {
  const { containerRef, style, animate } = useSlidingIndicator<HTMLDivElement>(range)
  return (
    <div ref={containerRef} className="relative isolate flex items-center justify-between gap-1.5">
      <span
        aria-hidden
        className={cn('pointer-events-none absolute inset-y-0 left-0 z-10 rounded-full bg-finax-dark', animate && 'slide-indicator')}
        style={style}
      />
      {PERIODS.map((p) => {
        const active = p.id === range
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            aria-pressed={active}
            data-active={active}
            className={cn(
              'relative flex-1 rounded-full py-2 text-[12px] font-semibold transition-colors duration-200 after:absolute after:inset-x-0 after:-inset-y-1',
              active ? 'text-white' : 'bg-muted text-muted-foreground',
            )}
          >
            <span className="relative z-20">{p.id}</span>
          </button>
        )
      })}
    </div>
  )
}
