'use client'

import { useState, type ReactNode } from 'react'
import { axisHeadline, useAxis } from '@/hooks/use-axis'
import { useAxisChat } from '@/hooks/use-axis-chat'
import { useMarketContext } from '@/hooks/use-market-context'
import { FRESHNESS_LABEL } from '@/lib/market/freshness'
import { formatShortDate } from '@/lib/dates'
import type { AxisAnalysis, AxisEngineInfo, AxisNextStep, Priority } from '@/lib/axis/types'
import { AxisSphere } from '../axis-sphere'
import { AxisConversation } from '../axis-conversation'
import { FinancialCard } from '../card'
import { Button } from '../button'
import { IconButton } from '../page-header'
import { ScreenLoading } from '../loading'
import { LeafLogo, SettingsIcon, LightbulbIcon, ArrowUpRight, ChevronRight } from '../icons'
import type { ScreenKey } from '../bottom-navigation'
import { cn } from '@/lib/utils'
import { PlanPanel } from './plan-panel'
import { ToolsPanel } from './tools-panel'
import type { ScreenProps } from './types'

type Navigate = (screen: ScreenKey) => void

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 6 || hour >= 21) return 'Buenas noches'
  if (hour < 13) return 'Buenos días'
  return 'Buenas tardes'
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((f) => (
        <li key={f} className="flex gap-2 text-[12.5px] font-medium text-muted-foreground">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span className="text-pretty">{f}</span>
        </li>
      ))}
    </ul>
  )
}

function NextStepButton({ step, onNavigate }: { step: AxisNextStep; onNavigate: Navigate }) {
  return (
    <Button
      variant="axis"
      fullWidth
      className="mt-4"
      icon={<ArrowUpRight className="h-4 w-4" />}
      onClick={() => step.to && onNavigate(step.to)}
    >
      {step.label}
    </Button>
  )
}

const PRIORITY_LABEL: Record<Priority, string> = {
  critical: 'Prioritario',
  high: 'Atención',
  medium: 'A vigilar',
  low: 'Informativo',
}

/**
 * «Lo que veo en tus números»: la lectura de AXIS (señales, datos e
 * incertidumbre) como explicación del plan. No da una recomendación propia:
 * la única es «Tu plan»; el siguiente paso solo lleva a donde mirarlo.
 */
function Insight({ analysis, onNavigate, footer }: { analysis: AxisAnalysis; onNavigate: Navigate; footer: ReactNode }) {
  const { data, interpretation, uncertainty, conclusion } = analysis
  const step = conclusion.nextStep
  return (
    <FinancialCard className="space-y-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-axis-indigo/70">AXIS</p>
        <p className="mt-0.5 text-[15px] font-bold text-grafito">Lo que veo en tus números</p>
      </div>
      {analysis.basedOnDemoData && (
        <p className="rounded-xl bg-axis-soft px-3 py-2 text-[12px] font-semibold text-axis-indigo">
          Sobre datos de demostración: no describe tu situación real.
        </p>
      )}
      <p className="text-[13.5px] font-medium leading-snug text-grafito/85 text-pretty">{interpretation.summary}</p>
      {interpretation.signals.length > 1 && (
        <ul className="space-y-3">
          {interpretation.signals.slice(1).map((s) => (
            <li key={s.id} className="flex flex-col items-start gap-1 text-[12.5px] font-medium text-muted-foreground">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide',
                  s.priority === 'critical' || s.priority === 'high'
                    ? 'bg-negative-soft text-negative'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {PRIORITY_LABEL[s.priority]}
              </span>
              <span className="text-pretty">{s.text}</span>
            </li>
          ))}
        </ul>
      )}
      <details className="rounded-xl border border-border px-3">
        <summary className="cursor-pointer py-2.5 text-[12.5px] font-semibold text-axis-indigo">Datos y lo que no sé</summary>
        <div className="space-y-3 pb-3">
          {data.facts.length > 0 && <Bullets items={data.facts} />}
          <ul className="space-y-2">
            {uncertainty.items.map((u) => (
              <li key={u.title}>
                <p className="text-[12.5px] font-bold text-grafito">{u.title}</p>
                <p className="mt-0.5 text-[12px] font-medium leading-snug text-muted-foreground text-pretty">{u.detail}</p>
              </li>
            ))}
          </ul>
          <p className="text-[12px] font-semibold text-muted-foreground">
            Confianza: <span className="text-grafito">{uncertainty.confidence}</span>
          </p>
        </div>
      </details>
      {step?.to && step.to !== 'plan' && (
        <button
          type="button"
          onClick={() => step.to && onNavigate(step.to)}
          className="tap flex items-center gap-1 text-[12.5px] font-semibold text-axis-indigo underline-offset-2 hover:underline"
        >
          {step.label}
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
      {footer}
    </FinancialCard>
  )
}

function engineNote(engine: AxisEngineInfo | null): string {
  if (!engine) return 'AXIS te aconseja; nunca ejecuta operaciones.'
  return engine.isAI
    ? `Lectura redactada por ${engine.label} a partir de tus datos locales.`
    : `${engine.label} (sin IA). AXIS te aconseja; nunca ejecuta operaciones.`
}

export type AxisTab = 'plan' | 'herramientas' | 'conversacion'

const TABS: ReadonlyArray<{ key: AxisTab; label: string }> = [
  { key: 'plan', label: 'Tu plan' },
  { key: 'herramientas', label: 'Herramientas' },
  { key: 'conversacion', label: 'Conversación' },
]

/**
 * Pestaña recordada mientras la app siga abierta: si una tarjeta del chat lleva a
 * otra pantalla, al volver se sigue en la conversación.
 */
let lastTab: AxisTab = 'plan'

/** Para entrar en AXIS por una pestaña concreta (la pantalla «plan» es AXIS en «Tu plan»). */
export function openAxisTab(tab: AxisTab) {
  lastTab = tab
}

function AxisTabs({ value, onChange }: { value: AxisTab; onChange: (tab: AxisTab) => void }) {
  return (
    <div role="tablist" aria-label="AXIS" className="relative isolate grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
      {/* Fondo blanco que se desliza a la pestaña elegida (un tercio sin el relleno ni los huecos). */}
      <span
        aria-hidden
        className="slide-indicator pointer-events-none absolute inset-y-1 left-1 z-10 w-[calc((100%-16px)/3)] rounded-full bg-card shadow-[0_2px_10px_-6px_rgba(79,70,229,0.5)]"
        style={{ transform: `translateX(calc(${TABS.findIndex((t) => t.key === value)} * (100% + 4px)))` }}
      />
      {TABS.map((t) => {
        const active = t.key === value
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`axis-tab-${t.key}`}
            aria-selected={active}
            aria-controls={`axis-panel-${t.key}`}
            onClick={() => onChange(t.key)}
            className={cn(
              'relative z-20 rounded-full py-2.5 text-[13.5px] font-bold transition-colors duration-200',
              active ? 'text-axis-indigo' : 'text-muted-foreground',
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

export function AxisScreen({ overview, onNavigate }: ScreenProps) {
  const [tab, setTabState] = useState<AxisTab>(lastTab)
  const setTab = (next: AxisTab) => {
    lastTab = next
    setTabState(next)
  }
  // Desde la conversación, «Ver tu plan» cambia de pestaña sin salir de AXIS.
  const navigate: Navigate = (screen) => (screen === 'plan' ? setTab('plan') : onNavigate(screen))
  const { market, marketState } = useMarketContext(overview)
  const { state: axis, refresh } = useAxis(overview, { ai: true, market, remember: true })
  const chat = useAxisChat(overview, market)
  if (!overview) return <ScreenLoading />

  const engine = axis.status === 'analysis' ? axis.analysis.engine : axis.status === 'no-analysis' ? axis.engine : null

  const footer = (
    <div className="space-y-2 border-t border-border pt-3">
      {market && marketState.freshness && (
        <p className="text-[11.5px] font-medium text-muted-foreground text-pretty">
          Mercado · {formatShortDate(market.asOf.slice(0, 10))} · {FRESHNESS_LABEL[marketState.freshness]}
          {market.sources.length > 0 && ` · fuentes: ${market.sources.slice(0, 4).join(', ')}`}
        </p>
      )}
      <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground text-pretty">
        <LightbulbIcon className="h-4 w-4 shrink-0 text-axis-violet" />
        {engineNote(engine)}
      </p>
      {axis.status === 'analysis' && (
        <button type="button" onClick={refresh} className="tap text-[12px] font-semibold text-axis-violet transition-colors hover:text-axis-indigo">
          Actualizar lectura
        </button>
      )}
    </div>
  )

  const insight =
    axis.status === 'loading' ? (
      <FinancialCard>
        <p className="text-[13.5px] font-medium leading-snug text-muted-foreground text-pretty">Leyendo tus números…</p>
      </FinancialCard>
    ) : axis.status === 'no-analysis' ? (
      <FinancialCard>
        <p className="text-[15px] font-bold text-grafito">Lo que veo en tus números</p>
        <p className="mt-2 text-[13.5px] font-medium leading-snug text-grafito/85 text-pretty">{axis.message}</p>
        {axis.facts.length > 0 && (
          <div className="mt-3">
            <Bullets items={axis.facts} />
          </div>
        )}
        <p className="mt-3 text-[12.5px] font-semibold text-grafito">Para empezar a razonar necesito:</p>
        <ul className="mt-1.5 space-y-1.5">
          {axis.needs.map((n) => (
            <li key={n.label}>
              <button
                type="button"
                onClick={() => n.to && navigate(n.to)}
                className="flex w-full items-center gap-2 text-left text-[12.5px] font-medium text-muted-foreground"
              >
                <span className="mt-[1px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                <span className="flex-1 text-pretty">{n.label}</span>
                {n.to && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />}
              </button>
            </li>
          ))}
        </ul>
        <NextStepButton step={axis.nextStep} onNavigate={navigate} />
      </FinancialCard>
    ) : (
      <Insight analysis={axis.analysis} onNavigate={navigate} footer={footer} />
    )

  return (
    <div className="pb-8">
      {/* Cabecera identidad AXIS */}
      <div className="flex items-center justify-between px-5 pt-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-axis-soft text-axis-violet">
            <LeafLogo className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[17px] font-extrabold leading-none tracking-tight text-grafito">AXIS</p>
            <p className="mt-1 text-[12px] font-medium text-muted-foreground">Tu consultor financiero</p>
          </div>
        </div>
        <IconButton label="Ajustes" onClick={() => onNavigate('ajustes')}>
          <SettingsIcon className="h-5 w-5" />
        </IconButton>
      </div>

      {/* Saludo compacto: la esfera grande ocupaba media pantalla del móvil antes de llegar a nada útil. */}
      <div className="relative mt-3 flex items-center gap-4 px-5 pb-4 pt-2">
        <div
          className="pointer-events-none absolute left-0 top-[-12px] h-[104px] w-[104px]"
          style={{ background: 'radial-gradient(closest-side, rgba(129,140,248,0.22), rgba(129,140,248,0))' }}
        />
        <AxisSphere size={60} className="shrink-0" />
        <div className="relative min-w-0">
          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-grafito">{greeting()}</h1>
          <p className="mt-0.5 text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">{axisHeadline(axis)}</p>
        </div>
      </div>

      <div className="px-5">
        <AxisTabs value={tab} onChange={setTab} />
      </div>

      {tab === 'conversacion' ? (
        <div id="axis-panel-conversacion" role="tabpanel" aria-labelledby="axis-tab-conversacion" className="content-swap mt-5 px-5">
          <AxisConversation
            status={chat.status}
            online={chat.online}
            messages={chat.messages}
            memories={chat.memories}
            onSend={chat.send}
            onResolveProposal={chat.resolveProposal}
            onClear={chat.clear}
            onForget={chat.forget}
            onNavigate={navigate}
          />
        </div>
      ) : tab === 'herramientas' ? (
        <div id="axis-panel-herramientas" role="tabpanel" aria-labelledby="axis-tab-herramientas" className="content-swap mt-5 px-5">
          <ToolsPanel onNavigate={navigate} />
        </div>
      ) : (
        <div id="axis-panel-plan" role="tabpanel" aria-labelledby="axis-tab-plan" className="content-swap mt-5 space-y-5 px-5">
          <PlanPanel
            overview={overview}
            onNavigate={navigate}
            insight={insight}
          />
        </div>
      )}
    </div>
  )
}
