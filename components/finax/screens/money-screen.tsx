'use client'

import { formatCents } from '@/lib/money'
import { formatPct } from '@/lib/format'
import { pctChange, roundedShares } from '@/lib/finance/summary'
import { axisHeadline, useAxis } from '@/hooks/use-axis'
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
  if (pct === null) return <p className="mt-1 text-[12px] font-medium text-muted-foreground/80">sin mes anterior</p>
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
  const { state: axis } = useAxis(overview)
  const { open, close } = useSheet()

  if (!overview) return <ScreenLoading />

  const { month, previousMonth, liquidCents, investedCents, patrimonioCents, objectivesTotals } = overview
  const reserved = Math.max(0, Math.min(objectivesTotals.savedCents, liquidCents))
  const available = Math.max(0, liquidCents - reserved)
  const parts = [
    { key: 'disponible', label: 'Disponible', amount: available },
    { key: 'objetivos', label: 'Objetivos', amount: reserved },
    { key: 'inversiones', label: 'Inversiones', amount: investedCents },
  ].filter((b) => b.amount > 0)
  const shares = roundedShares(parts.map((b) => b.amount))
  const breakdown = parts.map((b, i) => ({ ...b, color: chartColor(i), pct: shares[i] }))

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
                  monthUp ? 'text-finax' : 'text-negative',
                )}
              >
                {monthUp ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                {overview.monthChangePct !== null
                  ? formatPct(overview.monthChangePct, true)
                  : formatCents(overview.monthChangeCents, true)}
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
        {breakdown.length === 0 ? (
          <p className="mt-3 text-[13px] font-medium text-muted-foreground text-pretty">
            Aún no hay patrimonio que desglosar. Empieza por tu saldo inicial o un ingreso.
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

            <ul className="flex-1 space-y-3.5">
              {breakdown.map((b) => (
                <li key={b.key} className="flex items-center gap-2.5">
                  <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-grafito">{b.label}</p>
                    <p className="text-[12.5px] font-medium text-muted-foreground tabular-nums">
                      {formatCents(b.amount)}
                    </p>
                  </div>
                  <span className="text-[12.5px] font-bold text-muted-foreground tabular-nums">
                    {formatPct(b.pct)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
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
              <p className="truncate text-[12px] font-medium text-muted-foreground">
                {objectivesTotals.count === 0
                  ? 'Sin objetivos'
                  : `${objectivesTotals.activeCount} activo${objectivesTotals.activeCount === 1 ? '' : 's'} · ${formatPct(objectivesTotals.pct)}`}
              </p>
            </div>
            <span className="text-[15px] font-bold text-grafito tabular-nums">
              {formatCents(objectivesTotals.savedCents)}
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
              <p className="truncate text-[12px] font-medium text-muted-foreground">
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
