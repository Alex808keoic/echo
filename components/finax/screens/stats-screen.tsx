'use client'

import { useState } from 'react'
import {
  statsFilters,
  spendingTotal,
  spendingByCategory,
  spendingEvolution,
  evolutionRanges,
  topCategories,
  axisStatsInsight,
} from '@/lib/demo-data'
import { formatCurrency } from '@/lib/format'
import { PageHeader, SectionHeader } from '../page-header'
import { FilterTabs, Segmented } from '../filter-tabs'
import { FinancialCard } from '../card'
import { DonutChart } from '../charts/donut-chart'
import { BarChart } from '../charts/bar-chart'
import { LegendRow, CategoryRow } from '../category-row'
import { AxisCard } from '../axis-card'
import { HouseCategoryIcon } from '../icons'
import type { TabKey } from '../bottom-navigation'

export function StatsScreen({ onNavigate }: { onNavigate: (tab: TabKey) => void }) {
  const [filter, setFilter] = useState<string>('Gastos')
  const [range, setRange] = useState('6M')

  return (
    <div className="space-y-6 px-5 pb-8 pt-3">
      <PageHeader title="Estadísticas" subtitle="Analiza, entiende y mejora" />

      <FilterTabs options={statsFilters} value={filter} onChange={setFilter} size="sm" />

      <FinancialCard>
        <div className="flex items-center gap-4">
          <DonutChart
            segments={spendingByCategory.map((c) => ({ pct: c.pct, color: c.color }))}
            size={132}
            thickness={16}
          >
            <span className="text-[15px] font-extrabold text-grafito tabular-nums">
              {formatCurrency(spendingTotal)}
            </span>
            <span className="text-[10.5px] font-medium text-muted-foreground">Gastos este mes</span>
          </DonutChart>

          <ul className="flex-1 space-y-2.5">
            {spendingByCategory.map((c) => (
              <li key={c.key}>
                <LegendRow color={c.color} label={c.label} pct={c.pct} />
              </li>
            ))}
          </ul>
        </div>
      </FinancialCard>

      <FinancialCard>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-bold tracking-tight text-grafito">Evolución de gastos</h2>
          <Segmented options={evolutionRanges} value={range} onChange={setRange} />
        </div>
        <BarChart data={spendingEvolution} />
      </FinancialCard>

      <AxisCard
        tone="lavender"
        title="Insight de AXIS"
        text={axisStatsInsight}
        onClick={() => onNavigate('axis')}
      />

      <section>
        <SectionHeader
          title="Categorías"
          actionLabel="Ver todas"
          onAction={() => onNavigate('movimientos')}
        />
        <FinancialCard>
          {topCategories.map((c) => (
            <CategoryRow
              key={c.key}
              icon={<HouseCategoryIcon className="h-[22px] w-[22px]" />}
              label={c.label}
              amount={formatCurrency(c.amount)}
              pct={c.pct}
            />
          ))}
        </FinancialCard>
      </section>
    </div>
  )
}
