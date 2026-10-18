'use client'

import { useAllocationPlan } from '@/hooks/use-allocation-plan'
import { useMonthReview, usePlanChecklist, type PlanChecklist } from '@/hooks/use-plan-checklist'
import type { MonthReview, ReviewVerdict } from '@/lib/axis/plan/review'
import type { SleeveKey } from '@/lib/axis/plan/mix'
import { useSheet } from '../sheet'
import { PositionForm } from '../forms/position-form'
import type { AllocationPlan } from '@/lib/axis/plan/allocation'
import { describeStep, PLAN_DISCLAIMER, planSegments, SLEEVE_EXPLANATION, type SegmentKind, type StepAction } from '@/lib/axis/plan/describe'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import { SubPageHeader } from '../page-header'
import { FinancialCard } from '../card'
import { Button } from '../button'
import { ScreenLoading } from '../loading'
import { useCushionActions } from '../cushion-actions'
import { stepReasons } from '@/lib/axis/plan/why'
import { LeafLogo } from '../icons'
import type { ScreenProps } from './types'
import { useState } from 'react'
import { FilterTabs } from '../filter-tabs'
import { projectWealth, PROJECTION_YEARS, type ProjectionYears } from '@/lib/axis/plan/projection'
import { inflationFrom, inflationPhrase } from '@/lib/axis/plan/inflation'
import type { FinancialContext } from '@/lib/axis/types'
import { useLiveQuery } from 'dexie-react-hooks'
import { listUserMemories } from '@/lib/db/axis-memories'
import { ProfileForm } from '../forms/profile-form'
import { reviewYear, yearsWithData } from '@/lib/axis/plan/year-review'
import { todayISO } from '@/lib/dates'
import type { FinancialOverview } from '@/hooks/use-financial-overview'
import type { UserMemory } from '@/lib/axis/chat/types'

const PROFILE_KINDS = new Set(['riskAttitude', 'horizon', 'irregularIncome', 'adult'])
/** Hasta este mes (incluido), el resumen que se enseña primero es el del año anterior. */
const LAST_YEAR_UNTIL_MONTH = 3

const SEGMENT_COLOR: Record<SegmentKind, string> = {
  cushion: 'bg-finax-dark',
  'short-term': 'bg-axis-violet',
  'long-term': 'bg-axis-blue',
  'long-term-bonds': 'bg-axis-indigo',
  'long-term-risky': 'bg-negative',
  objectives: 'bg-finax',
  debt: 'bg-grafito',
}

/**
 * «Tu plan»: qué hacer cada mes con lo que ahorras (`buildAllocationPlan`).
 * Calculado en el dispositivo, sin IA ni mercado. Las únicas escrituras son
 * crear el «Fondo de emergencia» o ponerlo el primero, siempre con confirmación.
 */
export function PlanScreen({ overview, onNavigate, onBack }: ScreenProps) {
  const result = useAllocationPlan(overview)
  const cushion = useCushionActions()
  const checklist = usePlanChecklist(result?.plan, result?.decision.context.objectives)
  const review = useMonthReview(overview?.axisSnapshot, result?.plan, checklist)
  const memories = useLiveQuery(listUserMemories, [], undefined)
  if (!result || !overview || memories === undefined) return <ScreenLoading />
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
      case 'review-objectives':
        return onNavigate('objetivos')
      case 'review-memories':
        return onNavigate('memoria')
      case 'review-debts':
        return onNavigate('deudas')
    }
  }

  return (
    <div className="space-y-5 px-5 pb-8 pt-3">
      <SubPageHeader title="Tu plan" subtitle="Qué hacer cada mes con lo que ahorras" onBack={onBack} />

      {review && <MonthReviewCard review={review} onStats={() => onNavigate('estadisticas')} />}

      {checklist && checklist.items.length > 0 && <MonthChecklist checklist={checklist} />}

      {checklist && !checklist.checkedIn && <MonthCheckIn checklist={checklist} memories={memories} onSimulate={() => onNavigate('simulador')} />}

      {plan.monthly && <MonthlySummary plan={plan} />}

      <ol className="space-y-3">
        {plan.steps.map((step, i) => {
          const view = describeStep(step, plan, objectives)
          const why = stepReasons(step, plan, decision.profile.fields)
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
                {(step.kind === 'invest-long-term' || step.kind === 'idle-money') && step.mix.length > 0 && (
                  <ul className="space-y-2 rounded-xl bg-muted px-3 py-2.5">
                    {step.mix.map((p) => (
                      <li key={p.key} className="space-y-0.5">
                        <p className="flex items-baseline justify-between gap-3 text-[12.5px] font-bold text-grafito">
                          <span className="min-w-0">
                            {p.label} · {p.pct} %
                          </span>
                          <span className="whitespace-nowrap tabular-nums">
                            {formatCents(p.cents)}
                            {step.kind === 'invest-long-term' ? '/mes' : ''}
                          </span>
                        </p>
                        <p className="text-[12px] font-medium leading-snug text-grafito/75 text-pretty">{SLEEVE_EXPLANATION[p.key]}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {why.length > 0 && (
                  <details className="rounded-xl border border-border px-3 py-2">
                    <summary className="cursor-pointer text-[12.5px] font-semibold text-axis-indigo">¿Por qué?</summary>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12px] font-medium leading-snug text-grafito/80 text-pretty">
                      {why.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </details>
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

      <ProjectionCard plan={plan} context={decision.context} />

      <YearReviewCard overview={overview} plan={plan} memories={memories} onStats={() => onNavigate('estadisticas')} />

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" fullWidth onClick={() => onNavigate('simulador')}>
          ¿Y si…?
        </Button>
        <Button variant="secondary" fullWidth onClick={() => onNavigate('deudas')}>
          Mis deudas
        </Button>
      </div>

      <Button variant="secondary" fullWidth onClick={() => onNavigate('guia')}>
        Guía para invertir
      </Button>

      <p className="flex gap-2.5 rounded-2xl bg-muted px-4 py-3 text-[12px] font-medium leading-snug text-muted-foreground text-pretty">
        <LeafLogo className="mt-0.5 h-4 w-4 shrink-0 text-axis-violet" />
        <span>{PLAN_DISCLAIMER}</span>
      </p>
    </div>
  )
}

const POSITION_NAME: Record<SleeveKey, string> = { 'global-equity': 'Renta variable global', bonds: 'Renta fija', risky: 'Parte arriesgada' }

/** «Tu decisión del mes»: el plan como lista de cosas que hacer, marcables. Marcar no mueve dinero. */
function MonthChecklist({ checklist }: { checklist: PlanChecklist }) {
  const { open, close } = useSheet()
  const { items, done, doneCount, toggle } = checklist
  const register = (sleeve: SleeveKey, cents: number) =>
    open('Añadir inversión', <PositionForm initial={{ name: POSITION_NAME[sleeve], investedCents: cents, assetType: sleeve }} onDone={close} />)
  return (
    <FinancialCard className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-bold text-grafito">Tu decisión del mes</p>
        <p className="whitespace-nowrap text-[12px] font-semibold text-muted-foreground tabular-nums">
          {doneCount} de {items.length} hechas
        </p>
      </div>
      <ul className="space-y-2">
        {items.map((item) => {
          const checked = done.has(item.id)
          return (
            <li key={item.id} className="space-y-1">
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={checked} onChange={() => void toggle(item.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-finax" />
                <span className={cn('text-[13.5px] font-semibold leading-snug text-pretty', checked ? 'text-muted-foreground line-through' : 'text-grafito')}>{item.text}</span>
              </label>
              {checked && item.invest && (
                <button type="button" onClick={() => register(item.invest!.sleeve, item.invest!.cents)} className="ml-7 text-[12.5px] font-semibold text-axis-indigo underline-offset-2 hover:underline">
                  Apuntarlo en Inversiones
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-[11.5px] font-medium leading-snug text-muted-foreground text-pretty">Marcar un paso no mueve dinero: es para que lleves la cuenta. Abajo tienes el detalle y el porqué de cada uno.</p>
    </FinancialCard>
  )
}

const VERDICT: Record<ReviewVerdict, { label: string; className: string }> = {
  'on-track': { label: 'Según el plan', className: 'bg-finax-soft text-finax-dark' },
  partial: { label: 'En parte', className: 'bg-axis-soft text-axis-indigo' },
  'off-track': { label: 'Fuera del plan', className: 'bg-negative/8 text-negative' },
}

/** Revisión del mes anterior: lo que pasó frente a lo que decía el plan. */
function MonthReviewCard({ review, onStats }: { review: MonthReview; onStats: () => void }) {
  const v = VERDICT[review.verdict]
  return (
    <FinancialCard className="space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px] font-bold text-grafito">Revisión de {review.label}</p>
        <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold', v.className)}>{v.label}</span>
      </div>
      <ul className="list-disc space-y-1 pl-4 text-[12.5px] font-medium leading-snug text-grafito/85 text-pretty">
        {review.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="rounded-xl bg-muted px-3 py-2 text-[12.5px] font-semibold leading-snug text-grafito text-pretty">{review.next}</p>
      {review.verdict !== 'on-track' && (
        <button type="button" onClick={onStats} className="text-[12.5px] font-semibold text-axis-indigo underline-offset-2 hover:underline">
          Ver en qué se fue el dinero
        </button>
      )}
      {review.usesCurrentPlan && (
        <p className="text-[11.5px] font-medium leading-snug text-muted-foreground">No había plan guardado de ese mes: se compara con lo que propone tu plan ahora.</p>
      )}
    </FinancialCard>
  )
}

/** Una vez al mes: ¿ha cambiado algo que deba cambiar tu plan? Lo respondido se guarda solo para no volver a preguntar este mes. */
function MonthCheckIn({ checklist, memories, onSimulate }: { checklist: PlanChecklist; memories: UserMemory[]; onSimulate: () => void }) {
  const { open, close } = useSheet()
  const reviewProfile = () =>
    open(
      'Tu perfil',
      <ProfileForm
        memories={memories}
        onDone={() => {
          close()
          void checklist.checkIn()
        }}
      />,
    )
  return (
    <FinancialCard className="space-y-3">
      <div>
        <p className="text-[15px] font-bold text-grafito">¿Ha cambiado algo este mes?</p>
        <p className="mt-1 text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">
          Un cambio de trabajo o de sueldo, un gasto nuevo, otros plazos, o cómo llevas el riesgo. Tu plan es tan bueno como lo que sabe de ti.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" fullWidth onClick={() => void checklist.checkIn()}>
          Nada
        </Button>
        <Button fullWidth onClick={reviewProfile}>
          Revisar mi perfil
        </Button>
      </div>
      <button type="button" onClick={onSimulate} className="text-[12.5px] font-semibold text-axis-indigo underline-offset-2 hover:underline">
        ¿Un cambio que aún no ha pasado? Pruébalo en «¿Y si…?»
      </button>
    </FinancialCard>
  )
}

/** Resumen del año (el anterior hasta marzo; después, lo que va de año), con lo que conviene hacer. */
function YearReviewCard({ overview, plan, memories, onStats }: { overview: FinancialOverview; plan: AllocationPlan; memories: UserMemory[]; onStats: () => void }) {
  const { open, close } = useSheet()
  const today = todayISO()
  const years = yearsWithData(overview.movements).slice(0, 3)
  const lastYear = String(Number(today.slice(0, 4)) - 1)
  const preferred = Number(today.slice(5, 7)) <= LAST_YEAR_UNTIL_MONTH && years.includes(lastYear) ? lastYear : years[0]
  const [year, setYear] = useState<string | undefined>(undefined)
  const shown = year && years.includes(year) ? year : preferred
  if (!shown) return null
  const answers = memories.filter((m) => m.fact && PROFILE_KINDS.has(m.fact.kind))
  const r = reviewYear({
    snapshot: overview.axisSnapshot,
    year: shown,
    asOf: today,
    inflation: plan.inflation ?? inflationFrom(null),
    profileAnsweredAt: answers.length > 0 ? Math.max(...answers.map((m) => m.updatedAt)) : null,
  })
  if (!r) return null
  return (
    <FinancialCard className="space-y-3">
      <div>
        <p className="text-[15px] font-bold text-grafito">{r.partial ? `Tu ${r.year} hasta ahora` : `Tu ${r.year}`}</p>
        <p className="mt-1 text-[12.5px] font-medium leading-snug text-muted-foreground">Resumen del año, con {r.months === 1 ? '1 mes' : `${r.months} meses`} de datos.</p>
      </div>
      {years.length > 1 && <FilterTabs options={years} value={shown} onChange={setYear} size="sm" />}
      <ul className="list-disc space-y-1 pl-4 text-[12.5px] font-medium leading-snug text-grafito/85 text-pretty">
        {r.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="space-y-1.5 rounded-xl bg-muted px-3 py-2.5">
        <p className="text-[12.5px] font-bold text-grafito">{r.partial ? 'Para lo que queda de año' : 'Para el año que viene'}</p>
        <ul className="list-disc space-y-1 pl-4 text-[12px] font-medium leading-snug text-grafito/85 text-pretty">
          {r.next.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" fullWidth onClick={onStats}>
          Ver estadísticas
        </Button>
        <Button variant={r.profileStale ? 'primary' : 'secondary'} fullWidth onClick={() => open('Tu perfil', <ProfileForm memories={memories} onDone={close} />)}>
          {r.profileStale ? 'Repetir mi perfil' : 'Ver mi perfil'}
        </Button>
      </div>
    </FinancialCard>
  )
}

const YEAR_LABEL = (y: number) => `${y} años`

/** «Cómo podría crecer tu patrimonio»: proyección ilustrativa del plan frente a dejarlo todo quieto. */
function ProjectionCard({ plan, context }: { plan: AllocationPlan; context: FinancialContext }) {
  const [years, setYears] = useState<ProjectionYears>(10)
  const inflation = plan.inflation ?? inflationFrom(null)
  const p = projectWealth(plan, context, years, inflation)
  if (!p) return null
  const row = (label: string, cents: number, strong = false) => (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12.5px] font-medium text-grafito/80">{label}</span>
      <span className={cn('whitespace-nowrap tabular-nums', strong ? 'text-[16px] font-bold text-grafito' : 'text-[13px] font-semibold text-grafito')}>{formatCents(cents)}</span>
    </div>
  )
  return (
    <FinancialCard className="space-y-3">
      <div>
        <p className="text-[15px] font-bold text-grafito">Cómo podría crecer tu patrimonio</p>
        <p className="mt-1 text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">Con lo que tienes hoy y siguiendo este plan cada mes.</p>
      </div>
      <FilterTabs options={PROJECTION_YEARS.map(YEAR_LABEL)} value={YEAR_LABEL(years)} onChange={(label) => setYears(Number(label.split(' ')[0]) as ProjectionYears)} size="sm" />
      <div className="space-y-1.5">
        {row('Si va mal', p.badCents)}
        {row('Normal', p.midCents, true)}
        {row('Si va bien', p.goodCents)}
      </div>
      <div className="space-y-1.5 rounded-xl bg-muted px-3 py-2.5">
        {row('Normal, en euros de hoy', p.midTodayCents)}
        {row('Todo quieto en la cuenta, en euros de hoy', p.stillTodayCents)}
        <p className="text-[11.5px] font-medium leading-snug text-muted-foreground text-pretty">
          Habrías puesto {formatCents(p.contributedCents)}. Quieto en la cuenta seguiría siendo esa cifra, pero con {inflationPhrase(inflation)} compraría menos: eso es lo que muestra «en euros de hoy».
        </p>
      </div>
      <p className="text-[11.5px] font-medium leading-snug text-muted-foreground text-pretty">
        Es una aproximación con supuestos generales, no una previsión: sin comisiones ni impuestos, y el dinero líquido no crece. «Si va mal» y «si va bien» son 1 de cada 10 casos por abajo y por arriba.
      </p>
    </FinancialCard>
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
      <p className="text-[11.5px] font-medium leading-snug text-muted-foreground text-pretty">
        {monthly.forecast
          ? 'Previsión: tu ingreso fijo previsto menos lo que gastaste en tu último mes completo.'
          : `Lo habitual en tus últimos ${monthly.months} meses completos, sin lo puntual.`}
        {!monthly.forecast && monthly.recurringIncomeCents !== undefined &&
          ` Tu ingreso previsto (${formatCents(monthly.recurringIncomeCents)} al mes) no se suma: mandan tus datos registrados.`}
      </p>
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
