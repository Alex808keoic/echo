'use client'

import { formatCents } from '@/lib/money'
import { formatPct } from '@/lib/format'
import { pctChange } from '@/lib/finance/summary'
import { wealthBreakdown } from '@/lib/finance/wealth-breakdown'
import { axisHeadline, useAxis } from '@/hooks/use-axis'
import { useMarketContext } from '@/hooks/use-market-context'
import { PageHeader, SectionHeader } from '../page-header'
import { FinancialCard } from '../card'
import { DonutChart } from '../charts/donut-chart'
import { chartColor } from '../charts/palette'
import { AxisCard } from '../axis-card'
import { ChangeBadge } from '../metric'
import { ArrowUp, ArrowDown, TargetIcon, TrendUpIcon, ChevronRight, MoneyIcon } from '../icons'
import { ScreenLoading } from '../loading'
import { useSheet } from '../sheet'
import { InitialBalanceForm } from '../forms/initial-balance-form'
import { cn } from '@/lib/utils'
import type { ScreenProps } from './types'

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

export function MoneyScreen({ overview, onNavigate }: ScreenProps) {
  const { market } = useMarketContext(overview)
  const { state: axis } = useAxis(overview, { market })
  const { open, close } = useSheet()

  if (!overview) return <ScreenLoading />

  const { month, previousMonth, liquidCents, investedCents, patrimonioCents, objectivesAllocation: allocation } = overview
  // Patrimonio = líquido + inversiones; líquido = destinado a objetivos (reparto automático) + disponible.
  const destined = allocation.allocatedCents
  const available = allocation.availableCents
  const breakdownView = wealthBreakdown({ liquidCents, destinedCents: destined, availableCents: available, investedCents })
  const breakdown = breakdownView.kind === 'parts' ? breakdownView.parts.map((b, i) => ({ ...b, color: chartColor(i) })) : []

  const monthUp = (overview.monthChangeCents ?? 0) >= 0

  return (
    <div className="space-y-6 px-5 pb-8 pt-3">
      <PageHeader title="Mi Dinero" subtitle="Tu situación financiera en un vistazo" />

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

      <AxisCard
        tone="green"
        text={axisHeadline(axis)}
        onClick={() => onNavigate('axis')}
      />

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
    </div>
  )
}
