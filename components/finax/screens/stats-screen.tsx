'use client'

import { useState } from 'react'
import { formatCents } from '@/lib/money'
import { currentMonthKey } from '@/lib/dates'
import { inMonth, monthlyTotals, totalsByCategory, type PeriodId } from '@/lib/finance/summary'
import { seriesDelta } from '@/lib/finance/patrimonio'
import { formatPct } from '@/lib/format'
import { useAxis } from '@/hooks/use-axis'
import { PageHeader, SectionHeader } from '../page-header'
import { FilterTabs, Segmented } from '../filter-tabs'
import { FinancialCard } from '../card'
import { DonutChart } from '../charts/donut-chart'
import { BarChart } from '../charts/bar-chart'
import { EvolutionChart, seriesForRange } from '../charts/evolution-chart'
import { chartColor } from '../charts/palette'
import { LegendRow, CategoryRow } from '../category-row'
import { AxisCard } from '../axis-card'
import { categoryIconMap, DotsIcon } from '../icons'
import { ScreenLoading } from '../loading'
import { EmptyState } from '../empty-state'
import { Button } from '../button'
import { useSheet } from '../sheet'
import { MovementForm } from '../forms/movement-form'
import { cn } from '@/lib/utils'
import type { Category, MovementType } from '@/lib/types'
import type { ScreenProps } from './types'

const FILTERS = ['Gastos', 'Ingresos', 'Patrimonio'] as const
const RANGES = ['6M', '1A', 'Todo'] as const
const MONTHS_FOR_RANGE: Record<(typeof RANGES)[number], number> = { '6M': 6, '1A': 12, Todo: 12 }

function iconFor(label: string) {
  const Icon = categoryIconMap[label as Category] ?? DotsIcon
  return <Icon className="h-[22px] w-[22px]" />
}

export function StatsScreen({ overview, onNavigate }: ScreenProps) {
  const [filter, setFilter] = useState<string>('Gastos')
  const [range, setRange] = useState<string>('6M')
  const axis = useAxis(overview)
  const { open, close } = useSheet()

  if (!overview) return <ScreenLoading />

  if (overview.movements.length === 0) {
    return (
      <div className="space-y-6 px-5 pb-24 pt-3">
        <PageHeader title="Estadísticas" subtitle="Analiza, entiende y mejora" />
        <EmptyState
          title="Sin datos que analizar"
          description="Las estadísticas se calculan a partir de tus movimientos reales."
          action={
            <Button onClick={() => open('Nuevo movimiento', <MovementForm onDone={close} />)}>
              Añadir movimiento
            </Button>
          }
        />
      </div>
    )
  }

  const type: MovementType = filter === 'Ingresos' ? 'ingreso' : 'gasto'
  const isPatrimonio = filter === 'Patrimonio'
  const monthMovements = inMonth(overview.movements, currentMonthKey())
  const categories = totalsByCategory(monthMovements, type)
  const monthTotal = type === 'gasto' ? overview.month.expenseCents : overview.month.incomeCents
  const rangeKey = range as (typeof RANGES)[number]
  const bars = monthlyTotals(overview.movements, type, MONTHS_FOR_RANGE[rangeKey])
  const hasBars = bars.some((b) => b.value > 0)
  const patrimonioRange: PeriodId = rangeKey === 'Todo' ? 'Todo' : rangeKey
  const delta = seriesDelta(seriesForRange(overview.series, patrimonioRange))
  const noun = type === 'gasto' ? 'Gastos' : 'Ingresos'

  return (
    <div className="space-y-6 px-5 pb-24 pt-3">
      <PageHeader title="Estadísticas" subtitle="Analiza, entiende y mejora" />

      <FilterTabs options={FILTERS} value={filter} onChange={setFilter} size="sm" />

      {isPatrimonio ? (
        <FinancialCard>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-bold tracking-tight text-grafito">Evolución del patrimonio</h2>
              {delta && (
                <p
                  className={cn(
                    'mt-0.5 text-[12.5px] font-semibold tabular-nums',
                    delta.cents >= 0 ? 'text-finax' : 'text-negative',
                  )}
                >
                  {formatCents(delta.cents, true)}
                  {delta.pct !== null && ` · ${formatPct(delta.pct, true)}`}
                </p>
              )}
            </div>
            <Segmented options={RANGES} value={range} onChange={setRange} />
          </div>
          <EvolutionChart series={overview.series} range={patrimonioRange} className="h-[150px] w-full" />
          <p className="mt-3 text-[11.5px] font-medium text-muted-foreground text-pretty">
            Cada punto es tu patrimonio líquido al cierre de un día con movimientos.
          </p>
        </FinancialCard>
      ) : (
        <>
          <FinancialCard>
            {categories.length === 0 ? (
              <p className="text-[13px] font-medium text-muted-foreground text-pretty">
                No hay {noun.toLowerCase()} registrados este mes.
              </p>
            ) : (
              <div className="flex items-center gap-4">
                <DonutChart
                  segments={categories.map((c, i) => ({ pct: c.pct, color: chartColor(i) }))}
                  size={132}
                  thickness={16}
                >
                  <span className="text-[15px] font-extrabold text-grafito tabular-nums">
                    {formatCents(monthTotal)}
                  </span>
                  <span className="text-[10.5px] font-medium text-muted-foreground">{noun} este mes</span>
                </DonutChart>

                <ul className="flex-1 space-y-2.5">
                  {categories.slice(0, 6).map((c, i) => (
                    <li key={c.key}>
                      <LegendRow color={chartColor(i)} label={c.label} pct={c.pct} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </FinancialCard>

          <FinancialCard>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[16px] font-bold tracking-tight text-grafito">Evolución de {noun.toLowerCase()}</h2>
              <Segmented options={RANGES} value={range} onChange={setRange} />
            </div>
            {hasBars ? (
              <BarChart data={bars} />
            ) : (
              <p className="text-[13px] font-medium text-muted-foreground text-pretty">
                Sin {noun.toLowerCase()} en este periodo.
              </p>
            )}
          </FinancialCard>
        </>
      )}

      <AxisCard
        tone="lavender"
        title="Insight de AXIS"
        text={
          axis.status === 'ready'
            ? axis.analysis.headline
            : 'AXIS necesita movimientos registrados para ofrecer una lectura.'
        }
        onClick={() => onNavigate('axis')}
      />

      {!isPatrimonio && categories.length > 0 && (
        <section>
          <SectionHeader title="Categorías" actionLabel="Ver todas" onAction={() => onNavigate('movimientos')} />
          <FinancialCard className="space-y-4">
            {categories.slice(0, 5).map((c) => (
              <CategoryRow
                key={c.key}
                icon={iconFor(c.label)}
                label={c.label}
                amount={formatCents(c.cents)}
                pct={c.pct}
              />
            ))}
          </FinancialCard>
        </section>
      )}
    </div>
  )
}
