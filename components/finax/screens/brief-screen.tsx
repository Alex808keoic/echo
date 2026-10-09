'use client'

import type { ReactNode } from 'react'
import { useMarketContext } from '@/hooks/use-market-context'
import { useWeeklyBrief } from '@/hooks/use-weekly-brief'
import { cn } from '@/lib/utils'
import { SubPageHeader } from '../page-header'
import { FinancialCard } from '../card'
import { ScreenLoading } from '../loading'
import { LeafLogo } from '../icons'
import type { ScreenProps } from './types'

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <FinancialCard className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      {children}
    </FinancialCard>
  )
}

const Text = ({ children, muted }: { children: ReactNode; muted?: boolean }) => (
  <p className={cn('text-[13.5px] font-medium leading-snug text-pretty', muted ? 'text-muted-foreground' : 'text-grafito/85')}>{children}</p>
)

/**
 * «Resumen semanal» (parte 5a): qué ha pasado en el mercado y qué significa
 * para ti. Los datos (indicadores, cambios y fechas) son siempre los del Brief
 * determinista; si hay una redacción con IA válida, sustituye solo los textos.
 * Sin IA, la versión determinista. Nunca recomienda productos ni momentos.
 */
export function BriefScreen({ overview, onNavigate, onBack }: ScreenProps) {
  const { market } = useMarketContext(overview)
  const state = useWeeklyBrief(overview, market, { phrase: true })
  if (!state) return <ScreenLoading />
  const { view, phrasing, phrasingPending } = state

  return (
    <div className="space-y-4 px-5 pb-8 pt-3">
      <SubPageHeader title="Resumen semanal" subtitle={view.researchLine ?? 'Mercado y tu situación'} onBack={onBack} />

      <div className="space-y-1.5 px-1">
        <p className="text-[18px] font-extrabold leading-snug tracking-tight text-grafito text-balance">{phrasing?.title ?? view.title}</p>
        <p className="text-[11.5px] font-semibold text-muted-foreground">
          {phrasing ? 'Redactado con IA a partir de los datos de Finax' : phrasingPending ? 'Preparando la redacción…' : 'Motor local de Finax'}
        </p>
      </div>

      {(view.indicators.length > 0 || view.notCurrent.length > 0) && (
        <Section label="Datos de la semana">
          {phrasing?.market && <Text>{phrasing.market}</Text>}
          {view.indicators.length > 0 && (
            <ul className="divide-y divide-border">
              {view.indicators.map((i) => (
                <li key={i.label} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-grafito">{i.label}</p>
                    <p className="text-[11.5px] font-medium text-muted-foreground">{i.detail}</p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-[14px] font-bold tabular-nums text-grafito">{i.value}</span>
                </li>
              ))}
            </ul>
          )}
          {view.notCurrent.length > 0 && <Text muted>Sin dato actual: {view.notCurrent.join(', ')}.</Text>}
        </Section>
      )}

      {view.changes.length > 0 && (
        <Section label="Qué ha cambiado (frente al dato anterior)">
          {phrasing?.changes ? (
            <Text>{phrasing.changes}</Text>
          ) : (
            <ul className="space-y-1">
              {view.changes.map((c) => (
                <li key={c.label} className="flex justify-between gap-3 text-[13px] font-medium text-grafito/85">
                  <span className="min-w-0">{c.label}</span>
                  <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums">{c.value}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {view.reading && (
        <Section label={`Lectura del mercado · ${view.reading.date}`}>
          <Text>{phrasing?.reading ?? view.reading.text}</Text>
          {view.reading.aging && <Text muted>La lectura tiene algunos días: puede no reflejar datos publicados después.</Text>}
        </Section>
      )}

      {view.events.length > 0 && (
        <Section label="Lo que ha pasado">
          {phrasing?.events ? (
            <Text>{phrasing.events}</Text>
          ) : (
            <ul className="space-y-2">
              {view.events.map((e) => (
                <li key={`${e.date}-${e.title}`}>
                  <p className="text-[13px] font-semibold text-grafito">{e.title}</p>
                  <p className="text-[12px] font-medium text-muted-foreground text-pretty">
                    {e.date} · {e.source}. {e.summary}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section label="Qué significa para ti">
        {phrasing ? (
          <Text>{phrasing.personal}</Text>
        ) : (
          <>
            {view.personal.fact && <Text>{view.personal.fact}</Text>}
            {view.personal.interpretation && <Text muted>{view.personal.interpretation}</Text>}
          </>
        )}
        <p className="rounded-xl bg-axis-soft px-3 py-2 text-[12.5px] font-semibold leading-snug text-axis-indigo text-pretty">{view.personal.marketRelevance}</p>
      </Section>

      <Section label="Conclusión">
        <Text>{phrasing?.conclusion ?? view.conclusion}</Text>
        {view.recommendation && <Text>{view.recommendation}</Text>}
        <button type="button" onClick={() => onNavigate('plan')} className="text-[12.5px] font-bold text-axis-violet transition-colors hover:text-axis-indigo">
          Ver tu plan →
        </button>
      </Section>

      {view.uncertainties.length > 0 && (
        <Section label="Lo que no sabemos">
          <ul className="space-y-1.5">
            {view.uncertainties.map((u) => (
              <li key={u.title} className="text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">
                <span className="font-semibold text-grafito/80">{u.title}.</span> {u.detail}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p className="flex gap-2.5 rounded-2xl bg-muted px-4 py-3 text-[12px] font-medium leading-snug text-muted-foreground text-pretty">
        <LeafLogo className="mt-0.5 h-4 w-4 shrink-0 text-axis-violet" />
        <span>Datos de fuentes públicas oficiales, con su fecha. Es información, no asesoramiento: Finax no recomienda productos concretos ni el momento de comprar o vender.</span>
      </p>
    </div>
  )
}
