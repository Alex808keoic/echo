'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getAxisMemory } from '@/lib/db/axis-memory'
import { useMarketContext } from '@/hooks/use-market-context'
import { freshValue } from '@/lib/axis/plan/market-signals'

/** Diferencial que se suma al Euríbor para proponer el interés de una hipoteca variable (un valor habitual; se puede cambiar). */
const HOME_SPREAD_PCT = 1
import { inflationFrom } from '@/lib/axis/plan/inflation'
import { HOME_COSTS_PCT, HOME_DOWN_PCT, SCENARIO_TIPS, SIMULATION_YEARS, simulate, type Scenario, type ScenarioKind, type SimSide, type SimVerdict } from '@/lib/axis/plan/simulate'
import { formatCents, parseAmountToCents, parsePercentToBp } from '@/lib/money'
import { todayISO } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { SubPageHeader } from '../page-header'
import { FinancialCard } from '../card'
import { Button } from '../button'
import { ScreenLoading } from '../loading'
import { AmountInput, ChipGroup, Field, TextInput } from '../field'
import { LeafLogo } from '../icons'
import type { ScreenProps } from './types'

const KINDS: Record<ScenarioKind, string> = {
  purchase: 'Compra grande',
  loan: 'Pedir un préstamo',
  income: 'Cambio de sueldo',
  expense: 'Gasto fijo nuevo',
  'no-income': 'Meses sin ingresos',
  home: 'Comprar vivienda',
  job: 'Cambiar de trabajo',
  'move-out': 'Independizarme',
}
const KIND_OPTIONS = Object.values(KINDS)
const kindOf = (label: string) => (Object.keys(KINDS) as ScenarioKind[]).find((k) => KINDS[k] === label) ?? 'purchase'

const VERDICT: Record<SimVerdict, { label: string; className: string }> = {
  ok: { label: 'Te lo puedes permitir', className: 'bg-finax-soft text-finax-dark' },
  careful: { label: 'Con cuidado', className: 'bg-axis-soft text-axis-indigo' },
  'not-now': { label: 'Ahora no', className: 'bg-negative/8 text-negative' },
}

type Values = Record<string, string>
const DEFAULTS: Partial<Record<ScenarioKind, Values>> = {
  loan: { apr: '8', months: '48' },
  home: { apr: '3', years: '30' },
  job: { gap: '0' },
  income: { direction: 'Sube' },
}

const int = (raw: string | undefined, min: number, max: number): number | null => {
  const n = Number((raw ?? '').trim())
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}
const amount = (raw: string | undefined) => parseAmountToCents(raw ?? '')
const optionalAmount = (raw: string | undefined) => ((raw ?? '').trim() === '' ? 0 : parseAmountToCents(raw ?? ''))
const pct = (raw: string | undefined) => {
  const bp = parsePercentToBp(raw ?? '', 50)
  return bp === null ? null : bp / 100
}

/** Lee el formulario de cada escenario; `null` si falta algo o no es válido. */
function scenarioOf(kind: ScenarioKind, v: Values): Scenario | null {
  switch (kind) {
    case 'purchase': {
      const cents = amount(v.cents)
      return cents ? { kind, cents } : null
    }
    case 'loan': {
      const cents = amount(v.cents)
      const aprPct = pct(v.apr)
      const months = int(v.months, 1, 480)
      return cents && aprPct !== null && months ? { kind, cents, aprPct, months } : null
    }
    case 'income': {
      const cents = amount(v.cents)
      return cents ? { kind, monthlyDeltaCents: v.direction === 'Baja' ? -cents : cents } : null
    }
    case 'expense': {
      const cents = amount(v.cents)
      return cents ? { kind, monthlyCents: cents } : null
    }
    case 'no-income': {
      const months = int(v.months, 1, 36)
      return months ? { kind, months } : null
    }
    case 'home': {
      const priceCents = amount(v.cents)
      const aprPct = pct(v.apr)
      const years = int(v.years, 5, 40)
      const rentSavedCents = optionalAmount(v.rent)
      return priceCents && aprPct !== null && years && rentSavedCents !== null ? { kind, priceCents, aprPct, years, rentSavedCents } : null
    }
    case 'job': {
      const newIncomeCents = amount(v.cents)
      const gapMonths = int(v.gap || '0', 0, 24)
      return newIncomeCents && gapMonths !== null ? { kind, newIncomeCents, gapMonths } : null
    }
    case 'move-out': {
      const rentCents = amount(v.rent)
      const otherMonthlyCents = optionalAmount(v.other)
      const upfrontCents = optionalAmount(v.upfront)
      return rentCents && otherMonthlyCents !== null && upfrontCents !== null ? { kind, rentCents, otherMonthlyCents, upfrontCents } : null
    }
  }
}

/**
 * «¿Y si…?»: simula una decisión con tus datos antes de tomarla. Se calcula en
 * el dispositivo sobre una copia: no guarda nada ni usa la IA.
 */
export function SimulatorScreen({ overview, onNavigate, onBack }: ScreenProps) {
  const memory = useLiveQuery(getAxisMemory, [], undefined)
  const { market } = useMarketContext(overview)
  const [kind, setKind] = useState<ScenarioKind>('purchase')
  const [values, setValues] = useState<Values>({})
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [error, setError] = useState<string | null>(null)

  const result = useMemo(() => {
    if (!overview || memory === undefined || !scenario) return null
    return simulate({ snapshot: overview.axisSnapshot, ...(memory ? { memory } : {}), asOf: todayISO(), inflation: inflationFrom(market), scenario })
  }, [overview, memory, market, scenario])

  if (!overview || memory === undefined) return <ScreenLoading />

  // Hipoteca: con un Euríbor reciente, el interés propuesto es Euríbor + 1 punto.
  const euribor = freshValue(market?.keyIndicators ?? [], 'euribor-12m')
  const homeApr = euribor !== null ? String(Math.round((euribor + HOME_SPREAD_PCT) * 10) / 10).replace('.', ',') : null
  const v = { ...DEFAULTS[kind], ...(kind === 'home' && homeApr ? { apr: homeApr } : {}), ...values }
  const set = (key: string) => (e: { target: { value: string } }) => setValues((prev) => ({ ...prev, [key]: e.target.value }))
  const changeKind = (label: string) => {
    setKind(kindOf(label))
    setValues({})
    setScenario(null)
    setError(null)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const s = scenarioOf(kind, v)
    setError(s ? null : 'Revisa los datos: falta alguno o no es válido.')
    setScenario(s)
  }

  return (
    <div className="space-y-5 px-5 pb-8 pt-3">
      <SubPageHeader title="¿Y si…?" subtitle="Prueba una decisión antes de tomarla" onBack={onBack} />

      <FinancialCard>
        <form onSubmit={submit} className="space-y-4">
          <Field label="¿Qué quieres probar?" group>
            <ChipGroup options={KIND_OPTIONS} value={KINDS[kind]} onChange={changeKind} />
          </Field>
          <ScenarioFields kind={kind} v={v} euribor={euribor} set={set} setValue={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))} />
          {error && (
            <p role="alert" className="text-[12.5px] font-medium text-negative">
              {error}
            </p>
          )}
          <Button type="submit" fullWidth>
            Simular
          </Button>
        </form>
      </FinancialCard>

      {result?.status === 'insufficient-data' && (
        <FinancialCard className="space-y-2">
          <p className="text-[14px] font-bold text-grafito">Faltan datos para simular</p>
          <p className="text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">Necesito al menos dos meses completos con movimientos para saber cuánto ahorras de verdad.</p>
          <Button variant="secondary" fullWidth onClick={() => onNavigate('movimientos')}>
            Registrar movimientos
          </Button>
        </FinancialCard>
      )}

      {result?.status === 'ok' && (
        <>
          <FinancialCard className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[15px] font-bold text-grafito">Resultado</p>
              <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold', VERDICT[result.verdict].className)}>{VERDICT[result.verdict].label}</span>
            </div>
            <p className="text-[13px] font-semibold leading-snug text-grafito text-pretty">{result.summary}</p>
            {result.facts.length > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-[12.5px] font-medium leading-snug text-grafito/85 text-pretty">
                {result.facts.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
            <ul className="space-y-1.5">
              {result.checks.map((c) => (
                <li key={c.text} className={cn('flex gap-2 rounded-xl px-3 py-2 text-[12.5px] font-semibold leading-snug text-pretty', c.ok ? 'bg-finax-soft text-finax-dark' : 'bg-negative/8 text-negative')}>
                  <span aria-hidden>{c.ok ? '✓' : '✗'}</span>
                  <span className="sr-only">{c.ok ? 'Bien:' : 'Cuidado:'}</span>
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
          </FinancialCard>
          <Comparison before={result.before} after={result.after} />
        </>
      )}

      <FinancialCard className="space-y-2">
        <p className="text-[15px] font-bold text-grafito">Qué tener en cuenta</p>
        <ul className="list-disc space-y-1 pl-4 text-[12.5px] font-medium leading-snug text-grafito/85 text-pretty">
          {SCENARIO_TIPS[kind].map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </FinancialCard>

      <p className="flex gap-2.5 rounded-2xl bg-muted px-4 py-3 text-[12px] font-medium leading-snug text-muted-foreground text-pretty">
        <LeafLogo className="mt-0.5 h-4 w-4 shrink-0 text-axis-violet" />
        <span>
          Es una simulación con tus datos y las reglas de tu plan, no una previsión ni asesoramiento personalizado. No se guarda nada: tus datos no cambian.
          {kind === 'home' && ` Supone un ${HOME_DOWN_PCT} % de entrada y un ${HOME_COSTS_PCT} % de gastos de compra; en tu comunidad pueden ser distintos.`}
        </span>
      </p>
    </div>
  )
}

function ScenarioFields({ kind, v, euribor, set, setValue }: { kind: ScenarioKind; v: Values; euribor: number | null; set: (key: string) => (e: { target: { value: string } }) => void; setValue: (key: string, value: string) => void }) {
  const money = (key: string, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <AmountInput value={v[key] ?? ''} onChange={set(key)} />
    </Field>
  )
  const number = (key: string, label: string, placeholder: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <TextInput inputMode="decimal" value={v[key] ?? ''} onChange={set(key)} placeholder={placeholder} />
    </Field>
  )
  switch (kind) {
    case 'purchase':
      return money('cents', 'Cuánto cuesta', 'Pagado de una vez, con tu dinero.')
    case 'loan':
      return (
        <>
          {money('cents', 'Cuánto pedirías')}
          {number('apr', 'Interés anual (TAE), en %', 'Ej. 8')}
          {number('months', 'Plazo, en meses', 'Ej. 48')}
        </>
      )
    case 'income':
      return (
        <>
          <Field label="Tu sueldo…" group>
            <ChipGroup options={['Sube', 'Baja']} value={v.direction ?? 'Sube'} onChange={(d) => setValue('direction', d)} />
          </Field>
          {money('cents', 'Cuánto al mes (neto)')}
        </>
      )
    case 'expense':
      return money('cents', 'Cuánto al mes', 'Una suscripción, un seguro, el gimnasio, una cuota…')
    case 'no-income':
      return number('months', 'Cuántos meses sin ingresos', 'Ej. 3', 'Por ejemplo, entre un trabajo y otro.')
    case 'home':
      return (
        <>
          {money('cents', 'Precio de la vivienda')}
          {number(
            'apr',
            'Interés de la hipoteca, en %',
            'Ej. 3',
            euribor !== null
              ? `Propuesto: Euríbor de hoy (${String(euribor).replace('.', ',')} %) + ${HOME_SPREAD_PCT} punto, habitual en una variable. Cámbialo por el de tu oferta (las de tipo fijo suelen ser distintas).`
              : undefined,
          )}
          {number('years', 'Plazo, en años', 'Ej. 30')}
          {money('rent', 'Alquiler que dejarías de pagar al mes', 'Déjalo vacío si no pagas alquiler.')}
        </>
      )
    case 'job':
      return (
        <>
          {money('cents', 'Sueldo neto nuevo al mes', 'Lo que te llegaría a la cuenta cada mes.')}
          {number('gap', 'Meses sin sueldo entre medias', '0')}
        </>
      )
    case 'move-out':
      return (
        <>
          {money('rent', 'Alquiler al mes')}
          {money('other', 'Otros gastos nuevos al mes', 'Luz, agua, internet, comida… Puedes dejarlo vacío.')}
          {money('upfront', 'Gasto al empezar', 'Fianza, muebles, mudanza. Puedes dejarlo vacío.')}
        </>
      )
  }
}

function Comparison({ before, after }: { before: SimSide; after: SimSide }) {
  const rows: Array<[string, string, string]> = [
    ['Ahorro al mes', fmt(before.savingsCents), fmt(after.savingsCents)],
    ['Dinero líquido', formatCents(before.liquidCents), formatCents(after.liquidCents)],
    ['Inversión al mes', formatCents(before.investCents), formatCents(after.investCents)],
    [`Patrimonio en ${SIMULATION_YEARS} años (normal)`, fmt(before.projectionCents), fmt(after.projectionCents)],
  ]
  return (
    <FinancialCard className="space-y-3">
      <p className="text-[15px] font-bold text-grafito">Antes y después</p>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1.5 text-[12.5px]">
        <span />
        <span className="text-right font-semibold text-muted-foreground">Ahora</span>
        <span className="text-right font-semibold text-muted-foreground">Con el cambio</span>
        {rows.map(([label, a, b]) => (
          <div key={label} className="contents">
            <span className="font-medium text-grafito/80">{label}</span>
            <span className="whitespace-nowrap text-right font-semibold tabular-nums text-grafito">{a}</span>
            <span className={cn('whitespace-nowrap text-right font-bold tabular-nums', a === b ? 'text-grafito' : 'text-axis-indigo')}>{b}</span>
          </div>
        ))}
      </div>
      <div className="space-y-1 rounded-xl bg-muted px-3 py-2.5 text-[12.5px] leading-snug text-pretty">
        <p className="font-medium text-muted-foreground">Lo primero de tu plan pasaría a ser:</p>
        <p className="font-bold text-grafito">{after.firstStep}</p>
      </div>
    </FinancialCard>
  )
}

const fmt = (cents: number | null) => (cents === null ? '—' : formatCents(cents))
