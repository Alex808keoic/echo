'use client'

import { useState } from 'react'
import { useMarket } from '@/hooks/use-market'
import { GROUP_TREND_LABEL, marketPanorama, panoramaHighlights, type GroupPanorama, type GroupTrend } from '@/lib/market/panorama'
import { cn } from '@/lib/utils'
import { SubPageHeader } from '../page-header'
import { FinancialCard } from '../card'
import { ScreenLoading } from '../loading'
import type { ScreenProps } from './types'

const TREND_TONE: Record<GroupTrend, string> = {
  'strong-rise': 'bg-finax/15 text-finax-dark',
  'strong-drop': 'bg-negative/10 text-negative',
  rise: 'bg-finax/10 text-finax-dark',
  drop: 'bg-negative/8 text-negative',
  calm: 'bg-muted text-grafito/75',
  'no-data': 'bg-muted text-muted-foreground',
  depends: 'bg-axis-soft text-axis-indigo',
}

function TrendPill({ trend }: { trend: GroupTrend }) {
  return <span className={cn('inline-block shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold', TREND_TONE[trend])}>{GROUP_TREND_LABEL[trend]}</span>
}

/** Que una cifra no se separe de su unidad al partir la línea. */
const keep = (text: string) => text.replace(/(\d) (%|€|\$|pts|puntos)/g,'$1 $2')

function Label({ children }: { children: string }) {
  return <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{children}</p>
}

/**
 * «Cómo van las inversiones»: cada familia de la Guía con lo que ha pasado en
 * el último mes, a partir de la investigación de mercado. Lo calcula Finax
 * (`lib/market/panorama.ts`); solo cuenta lo que ya ha pasado.
 */
export function MarketsScreen({ onBack }: Pick<ScreenProps, 'onBack'>) {
  const market = useMarket()
  const [open, setOpen] = useState<string | null>(null)
  if (market.status === 'loading') return <ScreenLoading />
  const research = market.research
  // La nota de la investigación solo si es de esta semana o de hace pocas; las cifras vienen siempre de los indicadores vigentes.
  const notes = research && market.freshness !== 'stale' ? research.assetClasses : []
  const groups = research ? marketPanorama(research.indicators, notes) : []
  const highlights = panoramaHighlights(groups)

  return (
    <div className="space-y-5 px-5 pb-8 pt-3">
      <SubPageHeader title="Cómo van las inversiones" subtitle="Lo que ha pasado en el último mes" onBack={onBack} />

      {!research ? (
        <FinancialCard>
          <p className="text-[13px] font-medium leading-snug text-grafito/85 text-pretty">
            {market.status === 'disabled'
              ? 'La investigación de mercado no está activada en esta versión.'
              : 'Aún no hay datos de mercado en este móvil. Se descargan solos cuando hay conexión.'}
          </p>
        </FinancialCard>
      ) : (
        <>
          <FinancialCard className="space-y-2">
            <Label>{highlights.length > 0 ? 'Lo que destaca' : 'En resumen'}</Label>
            {highlights.length > 0 ? (
              <ul className="space-y-1.5">
                {highlights.map((g) => (
                  <li key={g.id} className="text-[13px] font-medium leading-snug text-grafito/85 text-pretty">
                    <span className="font-bold text-grafito">{g.name}:</span> {keep(g.headline)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] font-medium leading-snug text-grafito/85 text-pretty">Ninguna familia ha tenido un movimiento fuerte en el último mes.</p>
            )}
            <p className="text-[12px] font-medium leading-snug text-muted-foreground text-pretty">
              Describe lo que ya ha pasado, no lo que va a pasar. Que algo haya subido mucho no lo hace mejor compra: tu plan decide cuánto y en qué.
            </p>
          </FinancialCard>

          <ul className="space-y-3">
            {groups.map((g) => (
              <GroupCard key={g.id} group={g} expanded={open === g.id} onToggle={() => setOpen(open === g.id ? null : g.id)} />
            ))}
          </ul>

          <p className="text-[11.5px] font-medium leading-snug text-muted-foreground text-pretty">
            Datos de {[...new Set(research.indicators.map((i) => i.source))].join(', ')}, con posible retraso. No es asesoramiento financiero.
          </p>
        </>
      )}
    </div>
  )
}

function GroupCard({ group, expanded, onToggle }: { group: GroupPanorama; expanded: boolean; onToggle: () => void }) {
  const hasDetail = group.figures.length > 0 || group.note !== null
  return (
    <li>
      <FinancialCard padded={false}>
        <button
          type="button"
          aria-expanded={hasDetail ? expanded : undefined}
          disabled={!hasDetail}
          onClick={onToggle}
          className="block w-full space-y-1.5 px-4 py-3.5 text-left"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-[14px] font-bold text-grafito">{group.name}</span>
            <TrendPill trend={group.trend} />
          </span>
          <span className="block text-[12.5px] font-medium leading-snug text-grafito/80 text-pretty">{keep(group.headline)}</span>
          {hasDetail && <span className="block text-[12px] font-bold text-finax-dark">{expanded ? 'Ocultar datos' : 'Ver datos'}</span>}
        </button>
        {expanded && (
          <div className="space-y-2.5 border-t border-border px-4 pb-4 pt-3">
            {group.figures.map((f) => (
              <div key={f.label} className="flex items-start justify-between gap-3">
                <span className="min-w-0 text-[12.5px] font-medium leading-snug text-grafito/80 text-pretty">
                  {f.label}
                  <span className="block text-[11px] text-muted-foreground">
                    {f.asOf} · {f.source}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[13px] font-bold tabular-nums text-grafito">
                  {f.value}
                  {f.change && <span className="block text-[11px] font-semibold text-muted-foreground">{f.change}</span>}
                </span>
              </div>
            ))}
            {group.note && (
              <div className="space-y-1 rounded-2xl bg-muted/60 px-3 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Lectura de la semana</p>
                <p className="text-[12.5px] font-medium leading-snug text-grafito/80 text-pretty">{group.note}</p>
              </div>
            )}
          </div>
        )}
      </FinancialCard>
    </li>
  )
}
