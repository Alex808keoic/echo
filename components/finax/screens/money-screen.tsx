'use client'

import {
  patrimonio,
  monthlySummary,
  patrimonioBreakdown,
  accounts,
  axisMoneyInsight,
} from '@/lib/demo-data'
import { formatCurrency, formatPct } from '@/lib/format'
import { PageHeader, SectionHeader } from '../page-header'
import { FinancialCard } from '../card'
import { DonutChart } from '../charts/donut-chart'
import { AxisCard } from '../axis-card'
import { ChangeBadge } from '../metric'
import { ArrowUp, ArrowDown, EyeIcon, MoneyIcon } from '../icons'
import type { TabKey } from '../bottom-navigation'

export function MoneyScreen({ onNavigate }: { onNavigate: (tab: TabKey) => void }) {
  return (
    <div className="space-y-6 px-5 pb-8 pt-3">
      <PageHeader title="Mi Dinero" subtitle="Tu situación financiera en un vistazo" />

      <FinancialCard>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">Patrimonio total</p>
            <p className="mt-1 text-[32px] font-extrabold leading-none tracking-tight text-grafito tabular-nums">
              {formatCurrency(patrimonio.total)}
            </p>
            <p className="mt-2 flex items-center gap-1 text-[13px] font-semibold text-finax">
              <ArrowUp className="h-3.5 w-3.5" />
              {formatPct(patrimonio.changePct, true)}
              <span className="font-medium text-muted-foreground">
                {patrimonio.changeSinceLabel}
              </span>
            </p>
          </div>
          <EyeIcon className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-finax-soft p-3.5">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-finax-dark">
              <ArrowUp className="h-3.5 w-3.5" />
              Ingresos
            </div>
            <p className="mt-1.5 text-[18px] font-bold text-grafito tabular-nums">
              {formatCurrency(monthlySummary.ingresos.amount)}
            </p>
            <p className="text-[11px] font-medium text-muted-foreground">este mes</p>
            <ChangeBadge
              className="mt-1 text-[12px]"
              pct={formatPct(monthlySummary.ingresos.changePct, true)}
              direction="up"
            />
          </div>

          <div className="rounded-2xl bg-negative-soft p-3.5">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-negative">
              <ArrowDown className="h-3.5 w-3.5" />
              Gastos
            </div>
            <p className="mt-1.5 text-[18px] font-bold text-grafito tabular-nums">
              {formatCurrency(monthlySummary.gastos.amount)}
            </p>
            <p className="text-[11px] font-medium text-muted-foreground">este mes</p>
            <ChangeBadge
              className="mt-1 text-[12px]"
              pct={formatPct(monthlySummary.gastos.changePct, true)}
              direction="down"
              tone="positive"
            />
          </div>
        </div>
      </FinancialCard>

      <FinancialCard>
        <h2 className="text-[16px] font-bold tracking-tight text-grafito">
          Desglose del patrimonio
        </h2>
        <div className="mt-4 flex items-center gap-5">
          <DonutChart
            segments={patrimonioBreakdown.map((b) => ({ pct: b.pct, color: b.color }))}
            size={132}
            thickness={16}
          >
            <span className="text-[15px] font-extrabold text-grafito tabular-nums">
              {formatCurrency(patrimonio.total)}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">Total</span>
          </DonutChart>

          <ul className="flex-1 space-y-3.5">
            {patrimonioBreakdown.map((b) => (
              <li key={b.key} className="flex items-center gap-2.5">
                <span
                  className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: b.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-grafito">{b.label}</p>
                  <p className="text-[12.5px] font-medium text-muted-foreground tabular-nums">
                    {formatCurrency(b.amount)}
                  </p>
                </div>
                <span className="text-[12.5px] font-bold text-muted-foreground tabular-nums">
                  {formatPct(b.pct)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </FinancialCard>

      <AxisCard tone="green" text={axisMoneyInsight} onClick={() => onNavigate('axis')} />

      <section>
        <SectionHeader
          title="Cuentas"
          actionLabel="Ver todas"
          onAction={() => onNavigate('movimientos')}
        />
        <FinancialCard>
          {accounts.map((acc) => (
            <div key={acc.id} className="flex items-center gap-3.5">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-finax-soft text-finax">
                <MoneyIcon className="h-[22px] w-[22px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-grafito">{acc.name}</p>
                <p className="text-[12px] font-medium text-muted-foreground">{acc.provider}</p>
              </div>
              <span className="text-[15px] font-bold text-grafito tabular-nums">
                {formatCurrency(acc.balance)}
              </span>
            </div>
          ))}
        </FinancialCard>
      </section>
    </div>
  )
}
