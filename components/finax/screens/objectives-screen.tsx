'use client'

import { useEffect, useState } from 'react'
import { formatCents } from '@/lib/money'
import { formatPct } from '@/lib/format'
import { markObjectiveAchieved, moveObjective, reactivateObjective } from '@/lib/db/objectives'
import { SubPageHeader, IconButton } from '../page-header'
import { FinancialCard } from '../card'
import { GoalCard } from '../goal-card'
import { EmptyState } from '../empty-state'
import { Button } from '../button'
import { ScreenLoading } from '../loading'
import { useSheet } from '../sheet'
import { ObjectiveForm } from '../forms/objective-form'
import { CloseIcon, PlusIcon, TargetIcon } from '../icons'
import type { ScreenProps } from './types'

/** Aviso único del cambio a progreso automático; se recuerda solo en este navegador. */
const NOTICE_KEY = 'finax:objectives-auto-progress-notice'

function useOneTimeNotice(): [boolean, () => void] {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(NOTICE_KEY) === null)
    } catch {
      setVisible(false)
    }
  }, [])
  const dismiss = () => {
    setVisible(false)
    try {
      window.localStorage.setItem(NOTICE_KEY, '1')
    } catch {
      // Sin almacenamiento: el aviso solo se oculta en esta visita.
    }
  }
  return [visible, dismiss]
}

export function ObjectivesScreen({ overview, onBack }: ScreenProps) {
  const { open, close } = useSheet()
  const [noticeVisible, dismissNotice] = useOneTimeNotice()
  if (!overview) return <ScreenLoading />

  const allocation = overview.objectivesAllocation
  const active = allocation.items.filter((i) => i.status !== 'achieved')
  const achieved = allocation.items.filter((i) => i.status === 'achieved')
  const openNew = () => open('Nuevo objetivo', <ObjectiveForm onDone={close} />)
  const edit = (id: string) => {
    const objective = overview.objectives.find((o) => o.id === id)
    if (objective) open('Editar objetivo', <ObjectiveForm objective={objective} onDone={close} />)
  }
  const reorderable = active.length > 1

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

      {overview.objectives.length === 0 ? (
        <EmptyState
          title="Sin objetivos todavía"
          description="Un objetivo da sentido a tu ahorro. Empieza con uno."
          icon={<TargetIcon className="h-7 w-7" />}
          action={<Button onClick={openNew}>Crear objetivo</Button>}
        />
      ) : (
        <>
          {noticeVisible && (
            <div role="status" className="flex items-start gap-3 rounded-2xl bg-finax-soft px-4 py-3">
              <p className="flex-1 text-[12.5px] font-medium text-finax-dark text-pretty">
                Ahora tus objetivos se actualizan automáticamente según tu dinero líquido y su orden de prioridad.
              </p>
              <button type="button" aria-label="Cerrar aviso" onClick={dismissNotice} className="text-finax-dark/70">
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          )}

          <FinancialCard>
            <p className="text-[13px] font-medium text-muted-foreground">Destinado a objetivos</p>
            <p className="mt-1 text-[32px] font-extrabold leading-none tracking-tight text-grafito tabular-nums">
              {formatCents(allocation.allocatedCents)}
            </p>
            <p className="mt-2 text-[13px] font-semibold text-finax">
              {formatPct(allocation.activePct)}{' '}
              <span className="font-medium text-muted-foreground">de {formatCents(allocation.activeTargetCents)} en objetivos activos</span>
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-finax" style={{ width: `${allocation.activePct}%` }} />
            </div>
            <p className="mt-3 text-[12px] font-medium text-muted-foreground text-pretty">
              Tu dinero líquido se reparte solo, por orden: el primero recibe antes que el segundo.
            </p>
          </FinancialCard>

          {active.length > 0 && (
            <section>
              <h2 className="mb-3 text-[17px] font-bold tracking-tight text-grafito">En curso</h2>
              <FinancialCard className="space-y-5">
                {active.map((item, i) => (
                  <GoalCard
                    key={item.objective.id}
                    item={item}
                    showRank={reorderable}
                    onClick={() => edit(item.objective.id)}
                    onMoveUp={reorderable ? (i > 0 ? () => void moveObjective(item.objective.id, -1) : undefined) : undefined}
                    onMoveDown={reorderable ? (i < active.length - 1 ? () => void moveObjective(item.objective.id, 1) : undefined) : undefined}
                    onAchieve={() => void markObjectiveAchieved(item.objective.id)}
                  />
                ))}
              </FinancialCard>
            </section>
          )}

          {achieved.length > 0 && (
            <section>
              <h2 className="mb-3 text-[17px] font-bold tracking-tight text-grafito">Conseguidos</h2>
              <FinancialCard className="space-y-5">
                {achieved.map((item) => (
                  <GoalCard
                    key={item.objective.id}
                    item={item}
                    onClick={() => edit(item.objective.id)}
                    onReactivate={() => void reactivateObjective(item.objective.id)}
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
