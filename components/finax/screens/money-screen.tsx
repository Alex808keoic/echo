'use client'

import { useState } from 'react'
import { formatCents } from '@/lib/money'
import { formatPct } from '@/lib/format'
import { currentMonthKey, formatMonthLabel, formatMonthYear, todayISO } from '@/lib/dates'
import { historyMonthCount, inMonth, monthlyTotals, needSplit, pctChange, periodStartISO, totalsByCategory, type NeedSplit, type PeriodId } from '@/lib/finance/summary'
import { wealthBreakdown } from '@/lib/finance/wealth-breakdown'
import { seriesDelta, wealthSources } from '@/lib/finance/patrimonio'
import { useIsMinor } from '@/hooks/use-minor'
import type { FinancialOverview } from '@/hooks/use-financial-overview'
import { IconButton, PageHeader, SectionHeader } from '../page-header'
import { FilterTabs, Segmented } from '../filter-tabs'
import { FinancialCard } from '../card'
import { DonutChart } from '../charts/donut-chart'
import { BarChart } from '../charts/bar-chart'
import { EvolutionChart, seriesForRange } from '../charts/evolution-chart'
import { brandColor, CHART_COLORS, donutSlices, REST_COLOR, REST_KEY } from '@/lib/ui/chart-colors'
import { LegendRow, CategoryRow } from '../category-row'
import { ChangeBadge } from '../metric'
import { ArrowUp, ArrowDown, TargetIcon, TrendUpIcon, ChevronRight, MoneyIcon, categoryIconMap, DotsIcon, SettingsIcon } from '../icons'
import { ScreenLoading } from '../loading'
import { EmptyState } from '../empty-state'
import { Button } from '../button'
import { useSheet } from '../sheet'
import { InitialBalanceForm } from '../forms/initial-balance-form'
import { MovementForm } from '../forms/movement-form'
import type { ScreenKey } from '../bottom-navigation'
import { cn } from '@/lib/utils'
import type { Category, MovementType } from '@/lib/types'
import type { ScreenProps } from './types'

const VIEWS = ['Patrimonio', 'Gastos', 'Ingresos'] as const
export type MoneyView = (typeof VIEWS)[number]
const RANGES = ['6M', '1A', 'Todo'] as const
const MONTHS_FOR_RANGE = { '6M': 6, '1A': 12 } as const

/**
 * Vista recordada mientras la app siga abierta. «Estadísticas» ya no es una
 * pestaña: se entra en «Tu dinero» por la vista de gastos (`openMoneyView`).
 */
let lastView: MoneyView = 'Patrimonio'

export function openMoneyView(view: MoneyView) {
  lastView = view
}

function iconFor(label: string) {
  const Icon = categoryIconMap[label as Category] ?? DotsIcon
  return <Icon className="h-[22px] w-[22px]" />
}

function changeBadge(current: number, previous: number, goodWhenUp: boolean) {
  const pct = pctChange(current, previous)
  if (pct === null) return <p className="mt-1 text-[12px] font-medium text-muted-foreground">sin mes anterior</p>
  const up = pct >= 0
  return (
    <ChangeBadge
      className="mt-1 text-[12px]"
      pct={formatPct(pct, true)}
      direction={up ? 'up' : 'down'}
      tone={up === goodWhenUp ? 'positive' : 'negative'}
    />
  )
}

/** «Tu dinero»: lo que tienes (patrimonio) y en qué entra y se va (gastos e ingresos), antes Mi Dinero y Estadísticas. */
export function MoneyScreen({ overview, onNavigate }: ScreenProps) {
  const [view, setViewState] = useState<MoneyView>(lastView)
  const setView = (next: string) => {
    lastView = next as MoneyView
    setViewState(next as MoneyView)
  }
  const [range, setRange] = useState<string>('6M')

  if (!overview) return <ScreenLoading />

  return (
    <div className="space-y-6 px-5 pb-24 pt-3">
      <PageHeader
        title="Tu dinero"
        subtitle="Lo que tienes y en qué se va"
        action={
          <IconButton label="Ajustes" onClick={() => onNavigate('ajustes')}>
            <SettingsIcon className="h-5 w-5" />
          </IconButton>
        }
      />

      <FilterTabs options={VIEWS} value={view} onChange={setView} size="sm" />

      {/* key = vista: Patrimonio, Gastos e Ingresos entran con suavidad al cambiar. */}
      <div key={view} className="content-swap space-y-6">
        {view === 'Patrimonio' ? (
          <WealthView overview={overview} range={range} onRange={setRange} onNavigate={onNavigate} />
        ) : (
          <FlowView overview={overview} type={view === 'Ingresos' ? 'ingreso' : 'gasto'} range={range} onRange={setRange} onNavigate={onNavigate} />
        )}
      </div>
    </div>
  )
}

interface ViewProps {
  overview: FinancialOverview
  range: string
  onRange: (range: string) => void
  onNavigate: (screen: ScreenKey) => void
}

function WealthView({ overview, range, onRange, onNavigate }: ViewProps) {
  const { open, close } = useSheet()
  const { month, previousMonth, liquidCents, investedCents, patrimonioCents, objectivesAllocation: allocation } = overview
  // Patrimonio = líquido + inversiones; líquido = destinado a objetivos (reparto automático) + disponible.
  const destined = allocation.allocatedCents
  const available = allocation.availableCents
  const breakdownView = wealthBreakdown({ liquidCents, destinedCents: destined, availableCents: available, investedCents })
  const breakdown = breakdownView.kind === 'parts' ? breakdownView.parts.map((b) => ({ ...b, color: brandColor(b.key) })) : []

  const monthUp = (overview.monthChangeCents ?? 0) >= 0
  const owedCents = overview.debts.reduce((t, d) => t + Math.max(0, d.balanceCents), 0)

  const rangeKey = range as (typeof RANGES)[number]
  const patrimonioRange: PeriodId = rangeKey === 'Todo' ? 'Todo' : rangeKey
  const delta = seriesDelta(seriesForRange(overview.series, patrimonioRange))
  // El mismo periodo que la curva: ahorro e inversiones suman lo que cambia la línea.
  const sources = wealthSources(overview.movements, overview.positions, periodStartISO(patrimonioRange), todayISO())

  return (
    <>
      <FinancialCard>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">Patrimonio total</p>
            <p className="mt-1 text-[32px] font-extrabold leading-none tracking-tight text-grafito tabular-nums">
              {formatCents(patrimonioCents)}
            </p>
            {overview.monthChangeCents !== null ? (
              <p
                className={cn(
                  'mt-2 flex items-center gap-1 text-[13px] font-semibold',
                  monthUp ? 'text-finax-dark' : 'text-negative',
                )}
              >
                {monthUp ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                {/* En euros: la variación del patrimonio no es una rentabilidad. */}
                {formatCents(overview.monthChangeCents, true)}
                <span className="font-medium text-muted-foreground">este mes</span>
              </p>
            ) : (
              <p className="mt-2 text-[13px] font-medium text-muted-foreground">Sin movimientos este mes</p>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-finax-soft p-3.5">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-finax-dark">
              <ArrowUp className="h-3.5 w-3.5" />
              Ingresos
            </div>
            <p className="mt-1.5 text-[18px] font-bold text-grafito tabular-nums">
              {formatCents(month.incomeCents)}
            </p>
            <p className="text-[11px] font-medium text-muted-foreground">este mes</p>
            {changeBadge(month.incomeCents, previousMonth.incomeCents, true)}
          </div>

          <div className="rounded-2xl bg-negative-soft p-3.5">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-negative">
              <ArrowDown className="h-3.5 w-3.5" />
              Gastos
            </div>
            <p className="mt-1.5 text-[18px] font-bold text-grafito tabular-nums">
              {formatCents(month.expenseCents)}
            </p>
            <p className="text-[11px] font-medium text-muted-foreground">este mes</p>
            {changeBadge(month.expenseCents, previousMonth.expenseCents, false)}
          </div>
        </div>
      </FinancialCard>

      {overview.movements.length > 0 && (
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
            <Segmented options={RANGES} value={range} onChange={onRange} />
          </div>
          <EvolutionChart series={overview.series} range={patrimonioRange} className="h-[150px] w-full" />
          {delta && (
            <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="font-medium text-muted-foreground">Lo que has ahorrado</dt>
                <dd className={cn('font-bold tabular-nums', sources.savingsCents >= 0 ? 'text-finax-dark' : 'text-negative')}>{formatCents(sources.savingsCents, true)}</dd>
              </div>
              {overview.positions.length > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="font-medium text-muted-foreground">Lo que han hecho tus inversiones</dt>
                  <dd className={cn('font-bold tabular-nums', sources.investmentsCents >= 0 ? 'text-finax-dark' : 'text-negative')}>{formatCents(sources.investmentsCents, true)}</dd>
                </div>
              )}
            </dl>
          )}
          <p className="mt-3 text-[11.5px] font-medium text-muted-foreground text-pretty">
            Parte de tu saldo inicial. Cada punto es tu patrimonio total al cierre de un día con datos. Lo que suben o
            bajan tus inversiones entra el día en que apuntas su valor: actualízalo cada mes en Inversiones.
          </p>
        </FinancialCard>
      )}

      <FinancialCard>
        <h2 className="text-[16px] font-bold tracking-tight text-grafito">Desglose del patrimonio</h2>
        {breakdownView.kind === 'empty' ? (
          <p className="mt-3 text-[13px] font-medium text-muted-foreground text-pretty">
            Aún no hay patrimonio que desglosar. Empieza por tu saldo inicial o un ingreso.
          </p>
        ) : breakdownView.kind === 'negative-liquid' ? (
          <p className="mt-3 text-[13px] font-medium text-muted-foreground text-pretty">
            Tu dinero líquido está en negativo, así que el patrimonio no se puede repartir en porcentajes. Así queda tu líquido:
          </p>
        ) : (
          <div className="mt-4 flex items-center gap-5">
            <DonutChart
              segments={breakdown.map((b) => ({ pct: b.pct, color: b.color }))}
              size={132}
              thickness={16}
            >
              <span className="text-[15px] font-extrabold text-grafito tabular-nums">
                {formatCents(patrimonioCents)}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">Total</span>
            </DonutChart>

            <ul className="min-w-0 flex-1 space-y-3.5">
              {breakdown.map((b) => (
                <li key={b.key} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
                  {/* Importe y porcentaje en la misma línea, cada uno entero: con cifras grandes nada se parte. */}
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[13px] font-semibold text-grafito">{b.label}</p>
                    <p className="flex flex-wrap gap-x-1.5 text-[12.5px] font-medium text-muted-foreground tabular-nums">
                      <span className="whitespace-nowrap">{formatCents(b.amount)}</span>
                      <span className="whitespace-nowrap font-bold">{formatPct(b.pct)}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <dl className="mt-5 space-y-1.5 border-t border-border pt-4 text-[12.5px]">
          <div className="flex justify-between gap-3">
            <dt className="font-medium text-muted-foreground">Líquido</dt>
            <dd className="font-bold text-grafito tabular-nums">{formatCents(liquidCents)}</dd>
          </div>
          <div className="flex justify-between gap-3 pl-3">
            <dt className="font-medium text-muted-foreground">Destinado a objetivos</dt>
            <dd className="font-semibold text-grafito tabular-nums">{formatCents(destined)}</dd>
          </div>
          <div className="flex justify-between gap-3 pl-3">
            <dt className="font-medium text-muted-foreground">Disponible</dt>
            <dd className="font-semibold text-grafito tabular-nums">{formatCents(available)}</dd>
          </div>
        </dl>
      </FinancialCard>

      <section>
        <SectionHeader title="Ahorro e inversión" actionLabel="Ver movimientos" onAction={() => onNavigate('movimientos')} />
        <FinancialCard padded={false} className="divide-y divide-border px-5">
          <button
            type="button"
            onClick={() => onNavigate('objetivos')}
            className="flex w-full items-center gap-3.5 py-4 text-left"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-finax-soft text-finax">
              <TargetIcon className="h-[22px] w-[22px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-grafito">Objetivos</p>
              <p className="text-[12px] font-medium text-muted-foreground">
                {allocation.items.length === 0
                  ? 'Sin objetivos'
                  : `${allocation.activeCount} activo${allocation.activeCount === 1 ? '' : 's'} · ${formatPct(allocation.activePct)}`}
              </p>
            </div>
            <span className="text-[15px] font-bold text-grafito tabular-nums">
              {formatCents(destined)}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('inversiones')}
            className="flex w-full items-center gap-3.5 py-4 text-left"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-finax-soft text-finax">
              <TrendUpIcon className="h-[22px] w-[22px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-grafito">Inversiones</p>
              <p className="text-[12px] font-medium text-muted-foreground">
                {overview.positions.length === 0
                  ? 'Sin posiciones'
                  : `${overview.positions.length} posici${overview.positions.length === 1 ? 'ón' : 'ones'} · manual`}
              </p>
            </div>
            <span className="text-[15px] font-bold text-grafito tabular-nums">{formatCents(investedCents)}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
          </button>
          <button type="button" onClick={() => onNavigate('deudas')} className="flex w-full items-center gap-3.5 py-4 text-left">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-negative-soft text-negative">
              <ArrowDown className="h-[22px] w-[22px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-grafito">Deudas</p>
              <p className="text-[12px] font-medium text-muted-foreground">
                {owedCents > 0 ? `Tu patrimonio menos deudas: ${formatCents(patrimonioCents - owedCents)}` : 'Préstamos, tarjetas, financiaciones'}
              </p>
            </div>
            <span className="text-[15px] font-bold text-grafito tabular-nums">{formatCents(owedCents)}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
          </button>
          <button
            type="button"
            onClick={() =>
              open(
                'Saldo inicial',
                <InitialBalanceForm currentCents={overview.config?.initialBalanceCents} onDone={close} />,
              )
            }
            className="flex w-full items-center gap-3.5 py-4 text-left"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-grafito">
              <MoneyIcon className="h-[22px] w-[22px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-grafito">Saldo inicial</p>
              <p className="truncate text-[12px] font-medium text-muted-foreground">
                {overview.config ? 'Punto de partida' : 'Sin configurar'}
              </p>
            </div>
            <span className="text-[15px] font-bold text-grafito tabular-nums">
              {formatCents(overview.initialBalanceCents)}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
          </button>
        </FinancialCard>
      </section>
    </>
  )
}

/** Gastos o ingresos: por categoría en el mes elegido y mes a mes. */
function FlowView({ overview, type, range, onRange, onNavigate }: ViewProps & { type: MovementType }) {
  // Mes tocado en las barras: el donut y las categorías pasan a ese mes.
  const [pickedMonth, setPickedMonth] = useState<string | null>(null)
  // «Resto» abierto en el donut y lista de categorías completa: valen para un mes concreto.
  const [restOpenFor, setRestOpenFor] = useState<string | null>(null)
  const [allCategoriesFor, setAllCategoriesFor] = useState<string | null>(null)
  const minor = useIsMinor()
  const { open, close } = useSheet()

  if (overview.movements.length === 0) {
    return (
      <EmptyState
        title="Sin datos que analizar"
        description="Se calcula a partir de tus movimientos reales."
        action={<Button onClick={() => open('Nuevo movimiento', <MovementForm onDone={close} />)}>Añadir movimiento</Button>}
      />
    )
  }

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
  const restOpen = restOpenFor === month
  const rest = categories.slice(slices.filter((s) => s.key !== REST_KEY).length)
  const showAllCategories = allCategoriesFor === month
  // Necesario frente a prescindible: solo en gastos y nunca para menores de edad.
  const need = type === 'gasto' && !minor && categories.length > 0 ? needSplit(monthMovements) : null
  const monthPhrase = isThisMonth ? 'este mes' : `en ${formatMonthYear(month)}`
  const hasBars = bars.some((b) => b.value > 0)
  const noun = type === 'gasto' ? 'Gastos' : 'Ingresos'

  return (
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
              <span className="text-[11px] font-medium leading-tight text-muted-foreground">
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
                      onClick={() => setRestOpenFor(restOpen ? null : month)}
                      className="tap block w-full text-left"
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
          <Segmented options={RANGES} value={range} onChange={onRange} />
        </div>
        {hasBars ? (
          <BarChart key={range} data={bars} selected={month} onSelect={setPickedMonth} />
        ) : (
          <p className="text-[13px] font-medium text-muted-foreground text-pretty">
            Sin {noun.toLowerCase()} en este periodo.
          </p>
        )}
      </FinancialCard>

      {categories.length > 0 && (
        <section>
          <SectionHeader
            title={isThisMonth ? 'Categorías' : `Categorías · ${formatMonthLabel(month)}`}
            actionLabel={categories.length > 5 ? (showAllCategories ? 'Ver menos' : `Ver las ${categories.length}`) : 'Ver movimientos'}
            onAction={() => (categories.length > 5 ? setAllCategoriesFor(showAllCategories ? null : month) : onNavigate('movimientos'))}
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
    </>
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
