'use client'

import type { ReactNode } from 'react'
import { formatCents } from '@/lib/money'
import { useAxis } from '@/hooks/use-axis'
import type { AxisAnalysis, AxisContext } from '@/lib/axis/types'
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
import type { ScreenProps } from './types'

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

function SituationCard({ context, onNavigate }: { context: AxisContext; onNavigate: (s: ScreenKey) => void }) {
  const active = context.objectives.filter((o) => o.currentCents < o.targetCents).length
  const rows: Array<{ key: string; label: string; value: string; icon: ReactNode; to: ScreenKey }> = [
    { key: 'patrimonio', label: 'Patrimonio', value: formatCents(context.patrimonioCents), icon: <MoneyIcon className="h-[18px] w-[18px]" />, to: 'dinero' },
    { key: 'ingresos', label: 'Ingresos (mes)', value: formatCents(context.monthIncomeCents), icon: <ArrowUp className="h-[18px] w-[18px]" />, to: 'movimientos' },
    { key: 'gastos', label: 'Gastos (mes)', value: formatCents(context.monthExpenseCents), icon: <ArrowDown className="h-[18px] w-[18px]" />, to: 'estadisticas' },
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

function Analysis({ analysis, onNavigate }: { analysis: AxisAnalysis; onNavigate: ScreenProps['onNavigate'] }) {
  return (
    <>
      <Layer label="Interpretación">
        <p className="text-[13.5px] font-medium leading-snug text-grafito/85 text-pretty">{analysis.interpretation}</p>
        {analysis.facts.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {analysis.facts.map((f) => (
              <li key={f} className="flex gap-2 text-[12.5px] font-medium text-muted-foreground">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                <span className="text-pretty">{f}</span>
              </li>
            ))}
          </ul>
        )}
      </Layer>

      <div className="rounded-3xl border border-axis-violet/15 bg-axis-soft p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-axis-indigo/70">Recomendación</p>
        <div className="mt-1.5 flex items-center gap-2 text-axis-indigo">
          <LightbulbIcon className="h-5 w-5" />
          <p className="text-[14px] font-bold text-pretty">
            {analysis.recommendation ? analysis.recommendation.what : 'No hace falta actuar ahora'}
          </p>
        </div>
        <p className="mt-2 text-[13px] font-medium leading-snug text-grafito/80 text-pretty">
          {analysis.recommendation ? analysis.recommendation.why : analysis.conclusion}
        </p>
      </div>

      {analysis.alternatives.length > 0 && (
        <Layer label="Alternativas">
          <ul className="space-y-3">
            {analysis.alternatives.map((a) => (
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
          {analysis.uncertainties.map((u) => (
            <li key={u.title}>
              <p className="text-[13.5px] font-bold text-grafito">{u.title}</p>
              <p className="mt-0.5 text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">{u.detail}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] font-semibold text-muted-foreground">
          Confianza: <span className="text-grafito">{analysis.confidence}</span>
        </p>
      </Layer>

      <Layer label="Conclusión / siguiente paso">
        <p className="text-[13.5px] font-medium leading-snug text-grafito/85 text-pretty">{analysis.conclusion}</p>
        {analysis.nextStep && (
          <Button
            variant="axis"
            fullWidth
            className="mt-4"
            icon={<ArrowUpRight className="h-4 w-4" />}
            onClick={() => analysis.nextStep?.to && onNavigate(analysis.nextStep.to)}
          >
            {analysis.nextStep.label}
          </Button>
        )}
      </Layer>
    </>
  )
}

export function AxisScreen({ overview, onNavigate }: ScreenProps) {
  const axis = useAxis(overview)
  if (!overview || axis.status === 'loading') return <ScreenLoading />

  const engine = axis.status === 'ready' ? axis.analysis.engine : null

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
        <SituationCard context={axis.context} onNavigate={onNavigate} />

        {axis.status === 'insufficient-context' ? (
          <Layer label="Sin análisis">
            <p className="text-[13.5px] font-medium leading-snug text-grafito/85 text-pretty">
              AXIS todavía no tiene contexto suficiente para razonar. No se ha producido ningún análisis.
            </p>
            <ul className="mt-3 space-y-1.5">
              {axis.missing.map((m) => (
                <li key={m} className="flex gap-2 text-[12.5px] font-medium text-muted-foreground">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                  <span className="text-pretty">{m}</span>
                </li>
              ))}
            </ul>
            <Button
              variant="axis"
              fullWidth
              className="mt-4"
              icon={<ArrowUpRight className="h-4 w-4" />}
              onClick={() => onNavigate('movimientos')}
            >
              Registrar un movimiento
            </Button>
          </Layer>
        ) : (
          <Analysis analysis={axis.analysis} onNavigate={onNavigate} />
        )}

        <p className="flex items-center justify-center gap-1.5 px-4 text-center text-[11.5px] font-medium text-muted-foreground text-pretty">
          <LightbulbIcon className="h-4 w-4 shrink-0 text-axis-violet" />
          {engine
            ? engine.isAI
              ? `Análisis generado por ${engine.label} a partir de tus datos locales.`
              : `${engine.label}: sin IA conectada. AXIS analiza y recomienda; nunca ejecuta operaciones.`
            : 'AXIS analiza y recomienda; nunca ejecuta operaciones.'}
        </p>
      </div>
    </div>
  )
}
