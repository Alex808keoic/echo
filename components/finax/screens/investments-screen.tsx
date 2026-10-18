'use client'

import { formatCents } from '@/lib/money'
import { formatPct } from '@/lib/format'
import { formatShortDate } from '@/lib/dates'
import { positionGain, totalInvestedCents, totalValueCents } from '@/lib/finance/objectives'
import { roundedShares } from '@/lib/finance/summary'
import { SubPageHeader, IconButton } from '../page-header'
import { FinancialCard } from '../card'
import { DonutChart } from '../charts/donut-chart'
import { chartColor } from '@/lib/ui/chart-colors'
import { EmptyState } from '../empty-state'
import { Button } from '../button'
import { ScreenLoading } from '../loading'
import { useSheet } from '../sheet'
import { PositionForm } from '../forms/position-form'
import { PlusIcon, TrendUpIcon } from '../icons'
import { cn } from '@/lib/utils'
import type { ScreenProps } from './types'
import { useAllocationPlan } from '@/hooks/use-allocation-plan'
import { feeSummary, isHighFee, LOW_FEE_PCT, portfolioReturn, type FeeSummary, type PortfolioReturn } from '@/lib/axis/plan/returns'
import { inflationFrom, inflationPhrase, type InflationRef } from '@/lib/axis/plan/inflation'
import { pctText } from '@/lib/axis/plan/describe'
import { todayISO } from '@/lib/dates'

export function InvestmentsScreen({ overview, onNavigate, onBack }: ScreenProps) {
  const { open, close } = useSheet()
  const result = useAllocationPlan(overview)
  if (!overview) return <ScreenLoading />
  const inflation = result?.plan.inflation ?? inflationFrom(null)
  const invest = result?.plan.steps.find((s) => s.kind === 'invest-long-term')
  const monthlyInvest = invest?.kind === 'invest-long-term' ? invest.monthlyCents : 0
  const ret = portfolioReturn(overview.positions, todayISO(), inflation.pct)
  const fees = feeSummary(overview.positions, monthlyInvest)

  const { positions } = overview
  const invested = totalInvestedCents(positions)
  const value = totalValueCents(positions)
  const gain = value - invested
  const gainPct = invested > 0 ? (gain / invested) * 100 : null
  const weights = roundedShares(positions.map((p) => p.valueCents))
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
                gain >= 0 ? 'text-finax-dark' : 'text-negative',
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

          {ret && <ReturnCard ret={ret} fees={fees} inflation={inflation} monthlyInvest={monthlyInvest} />}

          <FinancialCard>
            <h2 className="text-[16px] font-bold tracking-tight text-grafito">Distribución</h2>
            <div className="mt-4 flex items-center gap-5">
              <DonutChart
                segments={positions.map((_, i) => ({ pct: weights[i], color: chartColor(i) }))}
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
                  <li key={p.id} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: chartColor(i) }} />
                    {/* Porcentaje bajo el nombre (como en Mi Dinero): el nombre tiene todo el ancho y nunca se corta. */}
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[13px] font-semibold text-grafito">{p.name}</p>
                      <p className="text-[12.5px] font-bold text-muted-foreground tabular-nums">{formatPct(weights[i])}</p>
                    </div>
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
                        <p className="break-words text-[14px] font-bold text-grafito">{p.name}</p>
                        <p className="flex flex-wrap gap-x-1 text-[12px] font-medium text-muted-foreground">
                          <span className="whitespace-nowrap">{formatCents(p.investedCents)}</span>
                          <span className="whitespace-nowrap">· {formatShortDate(p.date)}</span>
                          {p.feeBp !== undefined && <span className="whitespace-nowrap">· comisión {pctText(p.feeBp / 100)}</span>}
                        </p>
                        {isHighFee(p) && <p className="text-[11.5px] font-semibold text-negative">Comisión alta para su tipo</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[14px] font-bold text-grafito tabular-nums">{formatCents(p.valueCents)}</p>
                        <p
                          className={cn(
                            'mt-0.5 text-[11px] font-semibold tabular-nums',
                            g.cents >= 0 ? 'text-finax-dark' : 'text-negative',
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

/** Rentabilidad (nominal y descontando la inflación) y lo que te cuestan las comisiones. */
function ReturnCard({ ret, fees, inflation, monthlyInvest }: { ret: PortfolioReturn; fees: FeeSummary | null; inflation: InflationRef; monthlyInvest: number }) {
  return (
    <FinancialCard className="space-y-3">
      <h2 className="text-[16px] font-bold tracking-tight text-grafito">Rentabilidad real y comisiones</h2>
      {ret.annualPct !== null && ret.realAnnualPct !== null ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[12px] font-semibold text-muted-foreground">Al año</p>
            <p className={cn('mt-0.5 text-[18px] font-bold tabular-nums', ret.annualPct >= 0 ? 'text-finax-dark' : 'text-negative')}>{formatPct(ret.annualPct, true)}</p>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-muted-foreground">Descontando la inflación</p>
            <p className={cn('mt-0.5 text-[18px] font-bold tabular-nums', ret.realAnnualPct >= 0 ? 'text-finax-dark' : 'text-negative')}>{formatPct(ret.realAnnualPct, true)}</p>
          </div>
        </div>
      ) : (
        <p className="text-[12.5px] font-medium leading-snug text-grafito/85 text-pretty">
          Tu primera aportación tiene menos de un año: todavía no se calcula la rentabilidad anual, porque unos meses buenos o malos engañan.
        </p>
      )}
      <p className="text-[11.5px] font-medium leading-snug text-muted-foreground text-pretty">
        {ret.annualPct !== null
          ? `Teniendo en cuenta cuándo pusiste cada euro, desde hace ${String(ret.years).replace('.', ',')} años. Descontada ${inflationPhrase(inflation)}: lo que de verdad ganas en poder de compra.`
          : `Con ${inflationPhrase(inflation)}, para ganar poder de compra tus inversiones tienen que crecer más que eso cada año.`}{' '}
        Depende de que actualices el valor de cada inversión.
      </p>
      {fees ? (
        <div className="space-y-1.5 rounded-xl bg-muted px-3 py-2.5 text-[12.5px] leading-snug text-pretty">
          <p className="font-semibold text-grafito">
            Pagas de media un {pctText(fees.avgPct)} al año: unos {formatCents(fees.yearlyCents)} con lo que tienes hoy.
          </p>
          {fees.longRun && (
            <p className="font-medium text-grafito/85">
              En {fees.longRun.years} años, con lo de hoy{monthlyInvest > 0 ? ` y los ${formatCents(monthlyInvest)} al mes de tu plan` : ''}, tus comisiones se llevarían unos {formatCents(fees.longRun.yoursCents)}
              {fees.avgPct > LOW_FEE_PCT ? `; con un ${pctText(LOW_FEE_PCT)}, unos ${formatCents(fees.longRun.lowCents)}` : ''}.
            </p>
          )}
          {fees.highFeeCount > 0 && (
            <p className="font-semibold text-negative">
              {fees.highFeeCount === 1 ? 'Una inversión tiene' : `${fees.highFeeCount} inversiones tienen`} una comisión alta para su tipo: compara con alternativas del mismo tipo más baratas.
            </p>
          )}
          {fees.coveredPct < 100 && <p className="font-medium text-muted-foreground">Solo cuenta el {fees.coveredPct} % de tu dinero invertido: indica la comisión del resto al editar cada inversión.</p>}
        </div>
      ) : (
        <p className="rounded-xl bg-muted px-3 py-2.5 text-[12.5px] font-medium leading-snug text-grafito/85 text-pretty">
          Indica la comisión anual de cada inversión (al editarla) y te diré cuánto te cuesta a largo plazo: es de lo poco que puedes controlar.
        </p>
      )}
    </FinancialCard>
  )
}
