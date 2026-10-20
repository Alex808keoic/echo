'use client'

import { useState } from 'react'
import { formatCents } from '@/lib/money'
import { formatPct } from '@/lib/format'
import { currentMonthKey, formatMonthLabel, formatMonthYear } from '@/lib/dates'
import { historyMonthCount, inMonth, monthlyTotals, needSplit, totalsByCategory, type NeedSplit, type PeriodId } from '@/lib/finance/summary'
import { useIsMinor } from '@/hooks/use-minor'
import { seriesDelta } from '@/lib/finance/patrimonio'
import { axisHeadline, useAxis } from '@/hooks/use-axis'
import { useMarketContext } from '@/hooks/use-market-context'
import { PageHeader, SectionHeader } from '../page-header'
import { FilterTabs, Segmented } from '../filter-tabs'
import { FinancialCard } from '../card'
import { DonutChart } from '../charts/donut-chart'
import { BarChart } from '../charts/bar-chart'
import { EvolutionChart, seriesForRange } from '../charts/evolution-chart'
import { CHART_COLORS, donutSlices, REST_COLOR, REST_KEY } from '@/lib/ui/chart-colors'
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
const MONTHS_FOR_RANGE = { '6M': 6, '1A': 12 } as const

function iconFor(label: string) {
  const Icon = categoryIconMap[label as Category] ?? DotsIcon
  return <Icon className="h-[22px] w-[22px]" />
}

export function StatsScreen({ overview, onNavigate }: ScreenProps) {
  const [filter, setFilter] = useState<string>('Gastos')
  const [range, setRange] = useState<string>('6M')
  // Mes tocado en las barras: el donut y las categorías pasan a ese mes.
  const [pickedMonth, setPickedMonth] = useState<string | null>(null)
  // «Resto» abierto en el donut y lista de categorías completa: valen para un filtro y un mes concretos.
  const [restOpenFor, setRestOpenFor] = useState<string | null>(null)
  const [allCategoriesFor, setAllCategoriesFor] = useState<string | null>(null)
  const minor = useIsMinor()
  const { market } = useMarketContext(overview)
  const { state: axis } = useAxis(overview, { market })
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
  const rangeKey = range as (typeof RANGES)[number]
  // «Todo» = desde el primer movimiento (nunca menos que «1A»); con más de 12 meses las barras se desplazan.
  const barMonths = rangeKey === 'Todo' ? historyMonthCount(overview.movements, MONTHS_FOR_RANGE['1A']) : MONTHS_FOR_RANGE[rangeKey]
  const bars = monthlyTotals(overview.movements, type, barMonths)
  // Un mes que ya no está en las barras (otro rango) vuelve al mes actual, igual que en BarChart.
  const thisMonth = currentMonthKey()
  const month = pickedMonth !== null && bars.some((b) => b.monthKey === pickedMonth) ? pickedMonth : thisMonth
  const isThisMonth = month === thisMonth
  const monthMovements = inMonth(overview.movements, month)
  const categories = totalsByCategory(monthMovements, type)
  const monthTotal = categories.reduce((t, c) => t + c.cents, 0)
  // Donut y leyenda salen de las mismas porciones: cada color tiene su fila; lo que no cabe va a «Resto».
  const slices = donutSlices(categories, type)
  const viewKey = `${type}:${month}`
  const restOpen = restOpenFor === viewKey
  const rest = categories.slice(slices.filter((s) => s.key !== REST_KEY).length)
  const showAllCategories = allCategoriesFor === viewKey
  // Necesario frente a prescindible: solo en gastos y nunca para menores de edad.
  const need = type === 'gasto' && !minor && categories.length > 0 ? needSplit(monthMovements) : null
  const monthPhrase = isThisMonth ? 'este mes' : `en ${formatMonthYear(month)}`
  const hasBars = bars.some((b) => b.value > 0)
  const patrimonioRange: PeriodId = rangeKey === 'Todo' ? 'Todo' : rangeKey
  const delta = seriesDelta(seriesForRange(overview.series, patrimonioRange))
  const noun = type === 'gasto' ? 'Gastos' : 'Ingresos'

  return (
    <div className="space-y-6 px-5 pb-24 pt-3">
      <PageHeader title="Estadísticas" subtitle="Analiza, entiende y mejora" />

      <FilterTabs options={FILTERS} value={filter} onChange={setFilter} size="sm" />

      {/* key = filtro: Gastos, Ingresos y Patrimonio entran con suavidad al cambiar. */}
      <div key={filter} className="content-swap space-y-6">
        {isPatrimonio ? (
          <FinancialCard>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[16px] font-bold tracking-tight text-grafito">Evolución del patrimonio</h2>
                {delta && (
                  <p
                    className={cn(
                      'mt-0.5 text-[12.5px] font-semibold tabular-nums',
                      delta.cents >= 0 ? 'text-finax-dark' : 'text-negative',
                    )}
                  >
                    {/* Solo en euros: un % sobre el saldo inicial se leería como rentabilidad (−1.029 % con 1.200 € de partida). */}
                    {formatCents(delta.cents, true)}
                  </p>
                )}
              </div>
              <Segmented options={RANGES} value={range} onChange={setRange} />
            </div>
            <EvolutionChart series={overview.series} range={patrimonioRange} className="h-[150px] w-full" />
            <p className="mt-3 text-[11.5px] font-medium text-muted-foreground text-pretty">
              Parte de tu saldo inicial. Cada punto es tu patrimonio total al cierre de un día con movimientos; las
              inversiones cuentan por lo aportado y, en el último punto, por su valor actual.
            </p>
          </FinancialCard>
        ) : (
          <>
            <FinancialCard>
              {categories.length === 0 ? (
                <p className="text-[13px] font-medium text-muted-foreground text-pretty">
                  No hay {noun.toLowerCase()} registrados {monthPhrase}.
                </p>
              ) : (
                <div className="flex items-center gap-3">
                  <DonutChart
                    // key = mes: al tocar otra barra, el donut se vuelve a dibujar con ese mes.
                    key={month}
                    segments={slices.map((c) => ({ pct: c.pct, color: c.color }))}
                    size={120}
                    thickness={14}
                  >
                    <span className="text-[15px] font-extrabold text-grafito tabular-nums">
                      {formatCents(monthTotal)}
                    </span>
                    <span className="text-[10.5px] font-medium leading-tight text-muted-foreground">
                      {noun} {isThisMonth ? 'este mes' : `· ${formatMonthLabel(month)}`}
                    </span>
                  </DonutChart>
                  <ul className="min-w-0 flex-1 space-y-2.5">
                    {slices.map((c) => (
                      <li key={c.key}>
                        {c.key === REST_KEY ? (
                          <button
                            type="button"
                            aria-expanded={restOpen}
                            onClick={() => setRestOpenFor(restOpen ? null : viewKey)}
                            className="block w-full text-left"
                          >
                            <LegendRow color={c.color} label={restOpen ? 'Resto ▴' : 'Resto ▾'} pct={c.pct} />
                          </button>
                        ) : (
                          <LegendRow color={c.color} label={c.label} pct={c.pct} />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {restOpen && rest.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-border pt-3" aria-label="Detalle de «Resto»">
                  {rest.map((c) => (
                    <li key={c.key} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: REST_COLOR }} />
                        <span className="min-w-0 break-words font-medium text-grafito">{c.label}</span>
                      </span>
                      <span className="shrink-0 font-semibold text-muted-foreground tabular-nums">
                        {formatCents(c.cents)} · {formatPct(c.pct)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </FinancialCard>

            {need && <NeedCard need={need} monthPhrase={monthPhrase} />}

            <FinancialCard>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <h2 className="whitespace-nowrap text-[16px] font-bold tracking-tight text-grafito">Evolución de {noun.toLowerCase()}</h2>
                <Segmented options={RANGES} value={range} onChange={setRange} />
              </div>
              {hasBars ? (
                <BarChart key={range} data={bars} selected={month} onSelect={setPickedMonth} />
              ) : (
                <p className="text-[13px] font-medium text-muted-foreground text-pretty">
                  Sin {noun.toLowerCase()} en este periodo.
                </p>
              )}
            </FinancialCard>
          </>
        )}

      </div>

      <AxisCard
        tone="lavender"
        title="Insight de AXIS"
        text={axisHeadline(axis)}
        onClick={() => onNavigate('axis')}
      />

      {!isPatrimonio && categories.length > 0 && (
        <section>
          <SectionHeader
            title={isThisMonth ? 'Categorías' : `Categorías · ${formatMonthLabel(month)}`}
            actionLabel={categories.length > 5 ? (showAllCategories ? 'Ver menos' : `Ver las ${categories.length}`) : 'Ver movimientos'}
            onAction={() => (categories.length > 5 ? setAllCategoriesFor(showAllCategories ? null : viewKey) : onNavigate('movimientos'))}
          />
          <FinancialCard className="space-y-4">
            {(showAllCategories ? categories : categories.slice(0, 5)).map((c) => (
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

/**
 * Gasto del mes partido en necesario y prescindible (categorías fijas,
 * `EXPENSE_NEED`). Lo de «Otros» va aparte: su motivo puede ser cualquier cosa.
 */
function NeedCard({ need, monthPhrase }: { need: NeedSplit; monthPhrase: string }) {
  const parts = [
    { label: 'Necesario', cents: need.necesarioCents, pct: need.pcts[0], color: CHART_COLORS[0] },
    { label: 'Prescindible', cents: need.prescindibleCents, pct: need.pcts[1], color: CHART_COLORS[1] },
    { label: 'Otros, sin clasificar', cents: need.otherCents, pct: need.pcts[2], color: REST_COLOR },
  ].filter((p) => p.cents > 0)
  return (
    <FinancialCard className="space-y-3">
      <div>
        <h2 className="text-[16px] font-bold tracking-tight text-grafito">Necesario y prescindible</h2>
        <p className="mt-0.5 text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">
          Lo prescindible es lo primero que puedes recortar si necesitas ahorrar más.
        </p>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        {parts.map((p) => (
          <span key={p.label} className="h-full" style={{ width: `${p.pct}%`, background: p.color }} />
        ))}
      </div>
      <ul className="space-y-1.5" aria-label={`Gasto ${monthPhrase}`}>
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="min-w-0 font-medium text-grafito">{p.label}</span>
            </span>
            <span className="shrink-0 font-semibold text-muted-foreground tabular-nums">
              {formatCents(p.cents)} · {formatPct(p.pct)}
            </span>
          </li>
        ))}
      </ul>
    </FinancialCard>
  )
}
