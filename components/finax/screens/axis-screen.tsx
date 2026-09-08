'use client'

import { axisUser, axisSituation, axisRecommendation } from '@/lib/demo-data'
import { AxisSphere } from '../axis-sphere'
import { FinancialCard } from '../card'
import { Button } from '../button'
import { IconButton } from '../page-header'
import {
  LeafLogo,
  SettingsIcon,
  ChevronRight,
  MoneyIcon,
  ArrowUp,
  ArrowDown,
  TargetIcon,
  LightbulbIcon,
  ArrowUpRight,
} from '../icons'

const situationIcons: Record<string, (props: { className?: string }) => React.ReactElement> = {
  patrimonio: (p) => <MoneyIcon {...p} />,
  ingresos: (p) => <ArrowUp {...p} />,
  gastos: (p) => <ArrowDown {...p} />,
  objetivos: (p) => <TargetIcon {...p} />,
}

export function AxisScreen() {
  return (
    <div className="pb-8">
      {/* Cabecera identidad AXIS */}
      <div className="flex items-center justify-between px-5 pt-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-axis-soft text-axis-violet">
            <LeafLogo className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[17px] font-extrabold leading-none tracking-tight text-grafito">
              AXIS
            </p>
            <p className="mt-1 text-[12px] font-medium text-muted-foreground">Tu gestor financiero</p>
          </div>
        </div>
        <IconButton label="Ajustes">
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
        <h1 className="relative mt-6 text-[26px] font-extrabold tracking-tight text-grafito">
          Hola, {axisUser.name}
        </h1>
        <p className="relative mt-2 max-w-[280px] text-center text-[13px] font-medium leading-snug text-muted-foreground text-pretty">
          Analizo tu situación financiera para ayudarte a tomar mejores decisiones.
        </p>
      </div>

      <div className="space-y-5 px-5">
        {/* Situación actual */}
        <FinancialCard padded={false} className="overflow-hidden">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-[15px] font-bold tracking-tight text-grafito">Tu situación actual</h2>
          </div>
          <ul>
            {axisSituation.map((item, i) => {
              const Icon = situationIcons[item.key]
              return (
                <li
                  key={item.key}
                  className={`flex items-center gap-3 px-5 py-3.5 ${
                    i !== axisSituation.length - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-grafito">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="flex-1 text-[13.5px] font-medium text-muted-foreground">
                    {item.label}
                  </span>
                  <span className="text-[14px] font-bold text-grafito tabular-nums">
                    {item.value}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                </li>
              )
            })}
          </ul>
        </FinancialCard>

        {/* Recomendación */}
        <div className="rounded-3xl border border-axis-violet/15 bg-axis-soft p-4">
          <div className="flex items-center gap-2 text-axis-indigo">
            <LightbulbIcon className="h-5 w-5" />
            <p className="text-[14px] font-bold">Recomendación de AXIS</p>
          </div>
          <p className="mt-2 text-[13px] font-medium leading-snug text-grafito/80 text-pretty">
            {axisRecommendation}
          </p>
        </div>

        <Button variant="axis" fullWidth icon={<ArrowUpRight className="h-4 w-4" />}>
          Hablar con AXIS
        </Button>

        <p className="flex items-center justify-center gap-1.5 px-4 text-center text-[11.5px] font-medium text-muted-foreground text-pretty">
          <LightbulbIcon className="h-4 w-4 shrink-0 text-axis-violet" />
          Basado en tus datos, AXIS te ofrece recomendaciones personalizadas.
        </p>
      </div>
    </div>
  )
}
