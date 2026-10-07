import type { ObjectiveAllocation } from '@/lib/finance/objectives'
import { formatCents } from '@/lib/money'
import { formatPct } from '@/lib/format'
import { formatShortDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { ArrowDown, ArrowUp, TargetIcon } from './icons'

interface GoalCardProps {
  /** Reparto calculado del objetivo (`allocateObjectives`): nunca una cifra guardada. */
  item: ObjectiveAllocation
  onClick?: () => void
  /** Muestra la posición en el reparto («1.º»). */
  showRank?: boolean
  /** Controles de orden; `undefined` oculta el botón (extremos o sin controles). */
  onMoveUp?: () => void
  onMoveDown?: () => void
  /** «Marcar como conseguido» (activos) o «Reactivar» (conseguidos). */
  onAchieve?: () => void
  onReactivate?: () => void
}

const STATUS_LABEL = { covered: 'Cubierto', achieved: 'Conseguido' } as const

/** Tarjeta de objetivo: progreso calculado, meta, porcentaje, estado y acciones. */
export function GoalCard({ item, onClick, showRank, onMoveUp, onMoveDown, onAchieve, onReactivate }: GoalCardProps) {
  const hasOrder = onMoveUp !== undefined || onMoveDown !== undefined
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <GoalSummary item={item} onClick={onClick} showRank={showRank} />
        {hasOrder && (
          <div className="flex shrink-0 flex-col gap-1">
            <OrderButton label={`Subir ${item.objective.name}`} onClick={onMoveUp}>
              <ArrowUp className="h-3.5 w-3.5" />
            </OrderButton>
            <OrderButton label={`Bajar ${item.objective.name}`} onClick={onMoveDown}>
              <ArrowDown className="h-3.5 w-3.5" />
            </OrderButton>
          </div>
        )}
      </div>
      {(onAchieve || onReactivate) && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onAchieve ?? onReactivate}
            className="rounded-full bg-finax-soft px-3 py-1.5 text-[12px] font-bold text-finax transition-all hover:bg-finax-soft-2 active:scale-95"
          >
            {onAchieve ? 'Marcar como conseguido' : 'Reactivar'}
          </button>
        </div>
      )}
    </div>
  )
}

function OrderButton({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={!onClick}
      className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all hover:bg-graylight/70 disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function GoalSummary({ item, onClick, showRank }: Pick<GoalCardProps, 'item' | 'onClick' | 'showRank'>) {
  const { objective: goal, allocatedCents, remainingCents, pct, status, rank } = item
  const achieved = status === 'achieved'
  return (
    <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-start gap-3 text-left">
      <span className="relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-finax-soft text-finax">
        <TargetIcon className="h-5 w-5" />
        {showRank && rank !== null && (
          <span className="absolute -right-1 -top-1 rounded-full bg-finax px-1.5 text-[10.5px] font-bold text-white">{rank}.º</span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="break-words text-[14px] font-bold text-grafito">{goal.name}</p>
          <span className="shrink-0 text-[13px] font-bold text-finax">{formatPct(pct)}</span>
        </div>
        <p className="mt-0.5 flex flex-wrap gap-x-1 text-[12.5px] font-semibold text-muted-foreground tabular-nums">
          {achieved ? (
            <span className="whitespace-nowrap">Meta {formatCents(goal.targetCents)}</span>
          ) : (
            <>
              <span className="whitespace-nowrap">{formatCents(allocatedCents)}</span>
              <span className="whitespace-nowrap font-medium text-muted-foreground/70">/ {formatCents(goal.targetCents)}</span>
            </>
          )}
          {goal.targetDate && <span className="whitespace-nowrap font-medium text-muted-foreground/70">· {formatShortDate(goal.targetDate)}</span>}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] font-medium text-muted-foreground/80">
          {status !== 'in-progress' && (
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', achieved ? 'bg-finax text-white' : 'bg-finax-soft text-finax')}>
              {STATUS_LABEL[status]}
            </span>
          )}
          {status === 'in-progress' && `Te faltan ${formatCents(remainingCents)}`}
          {status === 'covered' && 'Tu dinero líquido ya llega a la meta'}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-finax" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </button>
  )
}
