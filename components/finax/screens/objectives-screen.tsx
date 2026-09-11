'use client'

import { formatCents } from '@/lib/money'
import { formatPct } from '@/lib/format'
import { isObjectiveCompleted } from '@/lib/finance/objectives'
import { SubPageHeader, IconButton } from '../page-header'
import { FinancialCard } from '../card'
import { GoalCard } from '../goal-card'
import { EmptyState } from '../empty-state'
import { Button } from '../button'
import { ScreenLoading } from '../loading'
import { useSheet } from '../sheet'
import { ObjectiveForm } from '../forms/objective-form'
import { PlusIcon, TargetIcon } from '../icons'
import type { ScreenProps } from './types'

export function ObjectivesScreen({ overview, onNavigate, onBack }: ScreenProps) {
  const { open, close } = useSheet()
  if (!overview) return <ScreenLoading />

  const { objectives, objectivesTotals: totals } = overview
  const active = objectives.filter((o) => !isObjectiveCompleted(o))
  const completed = objectives.filter(isObjectiveCompleted)
  const openNew = () => open('Nuevo objetivo', <ObjectiveForm onDone={close} />)

  return (
    <div className="space-y-6 px-5 pb-8 pt-3">
      <SubPageHeader
        title="Objetivos"
        subtitle="Define para qué ahorras"
        onBack={onBack}
        action={
          <IconButton label="Nuevo objetivo" onClick={openNew}>
            <PlusIcon className="h-5 w-5" />
          </IconButton>
        }
      />

      {objectives.length === 0 ? (
        <EmptyState
          title="Sin objetivos todavía"
          description="Un objetivo da sentido a tu ahorro. Empieza con uno."
          icon={<TargetIcon className="h-7 w-7" />}
          action={<Button onClick={openNew}>Crear objetivo</Button>}
        />
      ) : (
        <>
          <FinancialCard>
            <p className="text-[13px] font-medium text-muted-foreground">Ahorrado para objetivos</p>
            <p className="mt-1 text-[32px] font-extrabold leading-none tracking-tight text-grafito tabular-nums">
              {formatCents(totals.savedCents)}
            </p>
            <p className="mt-2 text-[13px] font-semibold text-finax">
              {formatPct(totals.pct)}{' '}
              <span className="font-medium text-muted-foreground">de {formatCents(totals.targetCents)}</span>
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-finax" style={{ width: `${totals.pct}%` }} />
            </div>
          </FinancialCard>

          {active.length > 0 && (
            <section>
              <h2 className="mb-3 text-[17px] font-bold tracking-tight text-grafito">En curso</h2>
              <FinancialCard className="space-y-5">
                {active.map((o) => (
                  <GoalCard
                    key={o.id}
                    goal={o}
                    onClick={() => open('Editar objetivo', <ObjectiveForm objective={o} onDone={close} />)}
                  />
                ))}
              </FinancialCard>
            </section>
          )}

          {completed.length > 0 && (
            <section>
              <h2 className="mb-3 text-[17px] font-bold tracking-tight text-grafito">Conseguidos</h2>
              <FinancialCard className="space-y-5">
                {completed.map((o) => (
                  <GoalCard
                    key={o.id}
                    goal={o}
                    onClick={() => open('Editar objetivo', <ObjectiveForm objective={o} onDone={close} />)}
                  />
                ))}
              </FinancialCard>
            </section>
          )}
        </>
      )}
    </div>
  )
}
