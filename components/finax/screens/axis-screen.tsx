'use client'

import type { ReactNode } from 'react'
import { formatCents } from '@/lib/money'
import { useAxis } from '@/hooks/use-axis'
import type { AxisAnalysis, AxisEngineInfo, AxisNextStep, Priority } from '@/lib/axis/types'
import type { FinancialOverview } from '@/hooks/use-financial-overview'
import { AxisSphere } from '../axis-sphere'
import { FinancialCard } from '../card'
import { Button } from '../button'
import { IconButton } from '../page-header'
import { ScreenLoading } from '../loading'
import {
  LeafLogo,
  SettingsIcon,
  MoneyIcon,
  ArrowUp,
  ArrowDown,
  TargetIcon,
  LightbulbIcon,
  ArrowUpRight,
  ChevronRight,
} from '../icons'
import type { ScreenKey } from '../bottom-navigation'
import { cn } from '@/lib/utils'
import type { ScreenProps } from './types'

type Navigate = (screen: ScreenKey) => void

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 6 || hour >= 21) return 'Buenas noches'
  if (hour < 13) return 'Buenos días'
  return 'Buenas tardes'
}

/** Bloque de una capa del análisis, con etiqueta de texto explícita (D-26). */
function Layer({ label, children }: { label: string; children: ReactNode }) {
  return (
    <FinancialCard>
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <div className="mt-2">{children}</div>
    </FinancialCard>
  )
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

function SituationCard({ overview, onNavigate }: { overview: FinancialOverview; onNavigate: Navigate }) {
  const active = overview.objectivesTotals.activeCount
  const rows: Array<{ key: string; label: string; value: string; icon: ReactNode; to: ScreenKey }> = [
    { key: 'patrimonio', label: 'Patrimonio', value: formatCents(overview.patrimonioCents), icon: <MoneyIcon className="h-[18px] w-[18px]" />, to: 'dinero' },
    { key: 'ingresos', label: 'Ingresos (mes)', value: formatCents(overview.month.incomeCents), icon: <ArrowUp className="h-[18px] w-[18px]" />, to: 'movimientos' },
    { key: 'gastos', label: 'Gastos (mes)', value: formatCents(overview.month.expenseCents), icon: <ArrowDown className="h-[18px] w-[18px]" />, to: 'estadisticas' },
    { key: 'objetivos', label: 'Objetivos', value: `${active} activo${active === 1 ? '' : 's'}`, icon: <TargetIcon className="h-[18px] w-[18px]" />, to: 'objetivos' },
  ]
  return (
    <FinancialCard padded={false} className="overflow-hidden">
      <div className="border-b border-border px-5 py-3.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Datos</p>
        <h2 className="mt-0.5 text-[15px] font-bold tracking-tight text-grafito">Tu situación actual</h2>
      </div>
      <ul>
        {rows.map((item, i) => (
          <li key={item.key} className={i !== rows.length - 1 ? 'border-b border-border' : ''}>
            <button
              type="button"
              onClick={() => onNavigate(item.to)}
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-grafito">
                {item.icon}
              </span>
              <span className="flex-1 text-[13.5px] font-medium text-muted-foreground">{item.label}</span>
              <span className="text-[14px] font-bold text-grafito tabular-nums">{item.value}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
            </button>
          </li>
        ))}
      </ul>
    </FinancialCard>
  )
}

function Analysis({ analysis, onNavigate }: { analysis: AxisAnalysis; onNavigate: Navigate }) {
  const { data, interpretation, recommendation, alternatives, uncertainty, conclusion } = analysis
  return (
    <>
      {data.facts.length > 0 && (
        <Layer label="Datos">
          <Bullets items={data.facts} />
        </Layer>
      )}

      <Layer label="Interpretación">
        <p className="text-[13.5px] font-medium leading-snug text-grafito/85 text-pretty">{interpretation.summary}</p>
        {interpretation.signals.length > 1 && (
          <ul className="mt-3 space-y-2">
            {interpretation.signals.slice(1).map((s) => (
              <li key={s.id} className="flex items-start gap-2 text-[12.5px] font-medium text-muted-foreground">
                <span
                  className={cn(
                    'mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
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
      </Layer>

      <div className="rounded-3xl border border-axis-violet/15 bg-axis-soft p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-axis-indigo/70">Recomendación</p>
        <div className="mt-1.5 flex items-center gap-2 text-axis-indigo">
          <LightbulbIcon className="h-5 w-5 shrink-0" />
          <p className="text-[14px] font-bold text-pretty">
            {recommendation ? recommendation.what : 'No hace falta actuar ahora'}
          </p>
        </div>
        <p className="mt-2 text-[13px] font-medium leading-snug text-grafito/80 text-pretty">
          {recommendation ? recommendation.why : conclusion.summary}
        </p>
      </div>

      {alternatives.length > 0 && (
        <Layer label="Alternativas">
          <ul className="space-y-3">
            {alternatives.map((a) => (
              <li key={a.name}>
                <p className="text-[13.5px] font-bold text-grafito">{a.name}</p>
                <p className="mt-0.5 text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">{a.summary}</p>
              </li>
            ))}
          </ul>
        </Layer>
      )}

      <Layer label="Incertidumbre">
        <ul className="space-y-3">
          {uncertainty.items.map((u) => (
            <li key={u.title}>
              <p className="text-[13.5px] font-bold text-grafito">{u.title}</p>
              <p className="mt-0.5 text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">{u.detail}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] font-semibold text-muted-foreground">
          Confianza: <span className="text-grafito">{uncertainty.confidence}</span>
        </p>
      </Layer>

      <Layer label="Conclusión / siguiente paso">
        <p className="text-[13.5px] font-medium leading-snug text-grafito/85 text-pretty">{conclusion.summary}</p>
        {conclusion.nextStep && <NextStepButton step={conclusion.nextStep} onNavigate={onNavigate} />}
      </Layer>
    </>
  )
}

function engineNote(engine: AxisEngineInfo | null): string {
  if (!engine) return 'AXIS analiza y recomienda; nunca ejecuta operaciones.'
  return engine.isAI
    ? `Análisis generado por ${engine.label} a partir de tus datos locales.`
    : `${engine.label}: sin IA conectada. AXIS analiza y recomienda; nunca ejecuta operaciones.`
}

export function AxisScreen({ overview, onNavigate }: ScreenProps) {
  const axis = useAxis(overview)
  if (!overview || axis.status === 'loading') return <ScreenLoading />

  const engine = axis.status === 'analysis' ? axis.analysis.engine : axis.engine

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
            <p className="mt-1 text-[12px] font-medium text-muted-foreground">Tu gestor financiero</p>
          </div>
        </div>
        <IconButton label="Ajustes" onClick={() => onNavigate('ajustes')}>
          <SettingsIcon className="h-5 w-5" />
        </IconButton>
      </div>

      {/* Hero con esfera */}
      <div className="relative mt-2 flex flex-col items-center overflow-hidden px-5 pb-6 pt-6">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-64"
          style={{
            background:
              'radial-gradient(60% 60% at 50% 30%, rgba(129,140,248,0.20), rgba(129,140,248,0) 70%)',
          }}
        />
        <AxisSphere size={132} />
        <h1 className="relative mt-6 text-[26px] font-extrabold tracking-tight text-grafito">{greeting()}</h1>
        <p className="relative mt-2 max-w-[280px] text-center text-[13px] font-medium leading-snug text-muted-foreground text-pretty">
          Analizo tu situación financiera para ayudarte a tomar mejores decisiones.
        </p>
      </div>

      <div className="space-y-5 px-5">
        {axis.status === 'analysis' && axis.analysis.basedOnDemoData && (
          <p className="rounded-2xl border border-axis-violet/20 bg-axis-soft px-4 py-2.5 text-[12px] font-semibold text-axis-indigo">
            Análisis sobre datos de demostración: no describe tu situación real.
          </p>
        )}

        <SituationCard overview={overview} onNavigate={onNavigate} />

        {axis.status === 'no-analysis' ? (
          <Layer label="Sin análisis">
            <p className="text-[13.5px] font-medium leading-snug text-grafito/85 text-pretty">{axis.message}</p>
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
                    onClick={() => n.to && onNavigate(n.to)}
                    className="flex w-full items-center gap-2 text-left text-[12.5px] font-medium text-muted-foreground"
                  >
                    <span className="mt-[1px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                    <span className="flex-1 text-pretty">{n.label}</span>
                    {n.to && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />}
                  </button>
                </li>
              ))}
            </ul>
            <NextStepButton step={axis.nextStep} onNavigate={onNavigate} />
          </Layer>
        ) : (
          <Analysis analysis={axis.analysis} onNavigate={onNavigate} />
        )}

        <p className="flex items-center justify-center gap-1.5 px-4 text-center text-[11.5px] font-medium text-muted-foreground text-pretty">
          <LightbulbIcon className="h-4 w-4 shrink-0 text-axis-violet" />
          {engineNote(engine)}
        </p>
      </div>
    </div>
  )
}
