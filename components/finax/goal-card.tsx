import Image from 'next/image'
import type { Goal } from '@/lib/demo-data'
import { formatCurrency, formatPct } from '@/lib/format'

interface GoalCardProps {
  goal: Goal
}

/** Tarjeta de objetivo: miniatura, título, progreso y porcentaje. */
export function GoalCard({ goal }: GoalCardProps) {
  const pct = Math.min(100, Math.round((goal.current / goal.target) * 100))
  return (
    <div className="flex items-center gap-3.5">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl">
        <Image
          src={goal.image || '/placeholder.svg'}
          alt={goal.title}
          fill
          sizes="56px"
          className="object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[14px] font-bold text-grafito">{goal.title}</p>
          <span className="shrink-0 text-[13px] font-bold text-finax">{formatPct(pct)}</span>
        </div>
        <p className="mt-0.5 text-[12.5px] font-semibold text-muted-foreground">
          {formatCurrency(goal.current)}{' '}
          <span className="font-medium text-muted-foreground/70">
            / {formatCurrency(goal.target)}
          </span>
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-finax"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
