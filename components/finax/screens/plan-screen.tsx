'use client'

import { useAllocationPlan } from '@/hooks/use-allocation-plan'
import type { AllocationPlan } from '@/lib/axis/plan/allocation'
import { describeStep, LONG_TERM_EXPLANATION, PLAN_DISCLAIMER, planSegments, type SegmentKind, type StepAction } from '@/lib/axis/plan/describe'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import { SubPageHeader } from '../page-header'
import { FinancialCard } from '../card'
import { Button } from '../button'
import { ScreenLoading } from '../loading'
import { useCushionActions } from '../cushion-actions'
import { LeafLogo } from '../icons'
import type { ScreenProps } from './types'

const SEGMENT_COLOR: Record<SegmentKind, string> = {
  cushion: 'bg-finax-dark',
  'short-term': 'bg-axis-violet',
  'long-term': 'bg-axis-blue',
  objectives: 'bg-finax',
}

/**
 * «Tu plan»: qué hacer cada mes con lo que ahorras (`buildAllocationPlan`).
 * Calculado en el dispositivo, sin IA ni mercado. Las únicas escrituras son
 * crear el «Fondo de emergencia» o ponerlo el primero, siempre con confirmación.
 */
export function PlanScreen({ overview, onNavigate, onBack }: ScreenProps) {
  const result = useAllocationPlan(overview)
  const cushion = useCushionActions()
  if (!result) return <ScreenLoading />
  const { plan, decision } = result
  const objectives = decision.context.objectives

  const act = (kind: StepAction) => {
    switch (kind) {
      case 'create-cushion':
        return cushion.createCushion(plan.cushion?.targetCents ?? 0)
      case 'move-cushion-first':
        return cushion.moveCushionFirst(plan.cushion?.objectiveId ?? '')
      case 'answer-profile':
        return onNavigate('memoria')
      case 'register-data':
        return onNavigate('movimientos')
      case 'review-spending':
        return onNavigate('estadisticas')
      case 'review-money':
        return onNavigate('dinero')
    }
  }

  return (
    <div className="space-y-5 px-5 pb-8 pt-3">
      <SubPageHeader title="Tu plan" subtitle="Qué hacer cada mes con lo que ahorras" onBack={onBack} />

      {plan.monthly && <MonthlySummary plan={plan} />}

      <ol className="space-y-3">
        {plan.steps.map((step, i) => {
          const view = describeStep(step, plan, objectives)
          return (
            <li key={`${step.kind}-${i}`}>
              <FinancialCard className="space-y-2">
                <div className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[12.5px] font-bold text-grafito">{i + 1}</span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[14.5px] font-bold leading-snug text-grafito text-pretty">{view.title}</p>
                    {view.detail && <p className="text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">{view.detail}</p>}
                    {view.note && <p className="rounded-xl bg-axis-soft px-3 py-2 text-[12.5px] font-semibold leading-snug text-axis-indigo text-pretty">{view.note}</p>}
                    {view.warning && <p className="rounded-xl bg-negative/8 px-3 py-2 text-[12.5px] font-semibold leading-snug text-negative text-pretty">{view.warning}</p>}
                  </div>
                </div>
                {step.kind === 'invest-long-term' && (
                  <p className="rounded-xl bg-muted px-3 py-2 text-[12px] font-medium leading-snug text-grafito/75 text-pretty">{LONG_TERM_EXPLANATION}</p>
                )}
                {view.action && (
                  <Button variant={i === 0 ? 'primary' : 'secondary'} fullWidth onClick={() => act(view.action!.kind)}>
                    {view.action.label}
                  </Button>
                )}
              </FinancialCard>
            </li>
          )
        })}
      </ol>

      <p className="flex gap-2.5 rounded-2xl bg-muted px-4 py-3 text-[12px] font-medium leading-snug text-muted-foreground text-pretty">
        <LeafLogo className="mt-0.5 h-4 w-4 shrink-0 text-axis-violet" />
        <span>{PLAN_DISCLAIMER}</span>
      </p>
    </div>
  )
}

/** Ahorro y gasto habituales y, si hay reparto, la barra con cómo se divide el ahorro. */
function MonthlySummary({ plan }: { plan: AllocationPlan }) {
  const monthly = plan.monthly!
  const segments = planSegments(plan)
  const total = segments.reduce((t, s) => t + s.cents, 0)
  return (
    <FinancialCard className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[12px] font-semibold text-muted-foreground">Ahorras al mes</p>
          <p className="mt-0.5 whitespace-nowrap text-[18px] font-bold tabular-nums text-grafito">{formatCents(monthly.savingsCents)}</p>
        </div>
        <div>
          <p className="text-[12px] font-semibold text-muted-foreground">Para gastar</p>
          <p className="mt-0.5 whitespace-nowrap text-[18px] font-bold tabular-nums text-grafito">{formatCents(monthly.spendingCents)}</p>
        </div>
      </div>
      <p className="text-[11.5px] font-medium leading-snug text-muted-foreground">Lo habitual en tus últimos {monthly.months} meses completos.</p>
      {total > 0 && (
        <div className="space-y-2">
          <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={segments.map((s) => `${s.label}: ${formatCents(s.cents)}`).join(', ')}>
            {segments.map((s) => (
              <span key={s.kind} className={cn('h-full', SEGMENT_COLOR[s.kind])} style={{ width: `${(s.cents / total) * 100}%` }} />
            ))}
          </div>
          <ul className="space-y-1">
            {segments.map((s) => (
              <li key={s.kind} className="flex items-center justify-between gap-3 text-[12.5px] font-medium text-grafito/80">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', SEGMENT_COLOR[s.kind])} />
                  {s.label}
                </span>
                <span className="whitespace-nowrap font-semibold tabular-nums text-grafito">{formatCents(s.cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </FinancialCard>
  )
}
