'use client'

import { useState } from 'react'
import {
  patrimonio,
  patrimonioSeries,
  timeRanges,
  goals,
  todaySummary,
  axisHomeInsight,
} from '@/lib/demo-data'
import { formatCurrency, formatPct } from '@/lib/format'
import { Wordmark } from '../wordmark'
import { IconButton, SectionHeader } from '../page-header'
import { UserIcon, ArrowUp } from '../icons'
import { LineChart } from '../charts/line-chart'
import { AxisCard } from '../axis-card'
import { GoalCard } from '../goal-card'
import { FinancialCard } from '../card'
import { cn } from '@/lib/utils'
import type { TabKey } from '../bottom-navigation'

export function HomeScreen({ onNavigate }: { onNavigate: (tab: TabKey) => void }) {
  const [range, setRange] = useState('1A')

  return (
    <div className="space-y-6 px-5 pb-8 pt-3">
      <div className="flex items-center justify-between">
        <Wordmark />
        <IconButton label="Perfil">
          <UserIcon className="h-5 w-5" />
        </IconButton>
      </div>

      <section>
        <p className="text-[13px] font-medium text-muted-foreground">Tu patrimonio</p>
        <p className="mt-1 text-[38px] font-extrabold leading-none tracking-tight text-grafito tabular-nums">
          {formatCurrency(patrimonio.total)}
        </p>
        <p className="mt-2 flex items-center gap-1 text-[13px] font-semibold text-finax">
          <ArrowUp className="h-3.5 w-3.5" />
          {formatPct(patrimonio.changePct, true)}
          <span className="font-medium text-muted-foreground">{patrimonio.changeSinceLabel}</span>
        </p>
      </section>

      <LineChart data={patrimonioSeries} className="h-[150px] w-full" />

      <div className="flex items-center justify-between gap-1.5">
        {timeRanges.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn(
              'flex-1 rounded-full py-2 text-[12px] font-semibold transition-all',
              r === range ? 'bg-finax text-white' : 'bg-muted text-muted-foreground',
            )}
          >
            {r}
          </button>
        ))}
      </div>

      <AxisCard
        title="AXIS"
        text={axisHomeInsight}
        onClick={() => onNavigate('axis')}
      />

      <section>
        <SectionHeader
          title="Tus objetivos"
          actionLabel="Ver todos"
          onAction={() => onNavigate('dinero')}
        />
        <FinancialCard>
          <GoalCard goal={goals[0]} />
        </FinancialCard>
      </section>

      <section>
        <h2 className="mb-3 text-[17px] font-bold tracking-tight text-grafito">Resumen de hoy</h2>
        <FinancialCard>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[19px] font-bold text-finax tabular-nums">
                {formatCurrency(todaySummary.ingresos, true)}
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">Ingresos</p>
            </div>
            <div className="border-l border-border pl-4">
              <p className="text-[19px] font-bold text-negative tabular-nums">
                {formatCurrency(-todaySummary.gastos, true)}
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">Gastos</p>
            </div>
          </div>
        </FinancialCard>
      </section>
    </div>
  )
}
