import type { Objective } from '@/lib/types'
import { isObjectiveCompleted, objectiveProgressPct } from '@/lib/finance/objectives'
import { formatCents } from '@/lib/money'
import { formatPct } from '@/lib/format'
import { formatShortDate } from '@/lib/dates'
import { TargetIcon } from './icons'

interface GoalCardProps {
  goal: Objective
  onClick?: () => void
}

/** Tarjeta de objetivo: chip, título, progreso y porcentaje. */
export function GoalCard({ goal, onClick }: GoalCardProps) {
  const pct = objectiveProgressPct(goal)
  const completed = isObjectiveCompleted(goal)
  const remaining = goal.targetCents - goal.currentCents
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3.5 text-left">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-finax-soft text-finax">
        <TargetIcon className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[14px] font-bold text-grafito">{goal.name}</p>
          <span className="shrink-0 text-[13px] font-bold text-finax">{formatPct(pct)}</span>
        </div>
        <p className="mt-0.5 truncate text-[12.5px] font-semibold text-muted-foreground">
          {formatCents(goal.currentCents)}{' '}
          <span className="font-medium text-muted-foreground/70">/ {formatCents(goal.targetCents)}</span>
          {goal.targetDate && (
            <span className="font-medium text-muted-foreground/70"> · {formatShortDate(goal.targetDate)}</span>
          )}
        </p>
        <p className="mt-0.5 text-[12px] font-medium text-muted-foreground/80">
          {completed ? 'Objetivo conseguido' : `Te faltan ${formatCents(remaining)}`}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-finax" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </button>
  )
}
