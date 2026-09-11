'use client'

import { formatCents } from '@/lib/money'
import { formatPct } from '@/lib/format'
import { formatShortDate } from '@/lib/dates'
import { positionGain, positionWeightPct, totalInvestedCents, totalValueCents } from '@/lib/finance/objectives'
import { SubPageHeader, IconButton } from '../page-header'
import { FinancialCard } from '../card'
import { DonutChart } from '../charts/donut-chart'
import { chartColor } from '../charts/palette'
import { EmptyState } from '../empty-state'
import { Button } from '../button'
import { ScreenLoading } from '../loading'
import { useSheet } from '../sheet'
import { PositionForm } from '../forms/position-form'
import { PlusIcon, TrendUpIcon } from '../icons'
import { cn } from '@/lib/utils'
import type { ScreenProps } from './types'

export function InvestmentsScreen({ overview, onNavigate, onBack }: ScreenProps) {
  const { open, close } = useSheet()
  if (!overview) return <ScreenLoading />

  const { positions } = overview
  const invested = totalInvestedCents(positions)
  const value = totalValueCents(positions)
  const gain = value - invested
  const gainPct = invested > 0 ? (gain / invested) * 100 : null
  const openNew = () => open('Nueva inversión', <PositionForm onDone={close} />)

  return (
    <div className="space-y-6 px-5 pb-8 pt-3">
      <SubPageHeader
        title="Inversiones"
        subtitle="Posiciones registradas manualmente"
        onBack={onBack}
        action={
          <IconButton label="Nueva inversión" onClick={openNew}>
            <PlusIcon className="h-5 w-5" />
          </IconButton>
        }
      />

      {positions.length === 0 ? (
        <EmptyState
          title="Sin inversiones registradas"
          description="Anota tus posiciones para que formen parte de tu patrimonio."
          icon={<TrendUpIcon className="h-7 w-7" />}
          action={<Button onClick={openNew}>Añadir inversión</Button>}
        />
      ) : (
        <>
          <FinancialCard>
            <p className="text-[13px] font-medium text-muted-foreground">Patrimonio invertido</p>
            <p className="mt-1 text-[32px] font-extrabold leading-none tracking-tight text-grafito tabular-nums">
              {formatCents(value)}
            </p>
            <p
              className={cn(
                'mt-2 text-[13px] font-semibold tabular-nums',
                gain >= 0 ? 'text-finax' : 'text-negative',
              )}
            >
              {formatCents(gain, true)}
              {gainPct !== null && ` · ${formatPct(gainPct, true)}`}{' '}
              <span className="font-medium text-muted-foreground">sobre {formatCents(invested)} aportados</span>
            </p>
            <p className="mt-3 text-[11.5px] font-medium text-muted-foreground text-pretty">
              Valores introducidos manualmente. Finax no consulta cotizaciones ni ejecuta operaciones.
            </p>
          </FinancialCard>

          <FinancialCard>
            <h2 className="text-[16px] font-bold tracking-tight text-grafito">Distribución</h2>
            <div className="mt-4 flex items-center gap-5">
              <DonutChart
                segments={positions.map((p, i) => ({
                  pct: positionWeightPct(p, value),
                  color: chartColor(i),
                }))}
                size={132}
                thickness={16}
              >
                <span className="text-[15px] font-extrabold text-grafito tabular-nums">
                  {positions.length}
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">
                  {positions.length === 1 ? 'posición' : 'posiciones'}
                </span>
              </DonutChart>
              <ul className="min-w-0 flex-1 space-y-3.5">
                {positions.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: chartColor(i) }} />
                    <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-grafito">{p.name}</p>
                    <span className="shrink-0 text-[12.5px] font-bold text-muted-foreground tabular-nums">
                      {formatPct(Math.round(positionWeightPct(p, value)))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </FinancialCard>

          <section>
            <h2 className="mb-3 text-[17px] font-bold tracking-tight text-grafito">Posiciones</h2>
            <FinancialCard padded={false} className="px-4">
              <div className="divide-y divide-border">
                {positions.map((p) => {
                  const g = positionGain(p)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => open('Editar inversión', <PositionForm position={p} onDone={close} />)}
                      className="flex w-full items-center gap-3.5 py-3 text-left"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-finax-soft text-finax">
                        <TrendUpIcon className="h-[22px] w-[22px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-bold text-grafito">{p.name}</p>
                        <p className="truncate text-[12px] font-medium text-muted-foreground">
                          {formatCents(p.investedCents)} · {formatShortDate(p.date)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[14px] font-bold text-grafito tabular-nums">{formatCents(p.valueCents)}</p>
                        <p
                          className={cn(
                            'mt-0.5 text-[11px] font-semibold tabular-nums',
                            g.cents >= 0 ? 'text-finax' : 'text-negative',
                          )}
                        >
                          {g.pct !== null ? formatPct(g.pct, true) : formatCents(g.cents, true)}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </FinancialCard>
          </section>
        </>
      )}
    </div>
  )
}
