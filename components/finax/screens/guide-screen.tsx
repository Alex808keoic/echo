'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useAllocationPlan } from '@/hooks/use-allocation-plan'
import { productFit, type FitVerdict, type ProductFit } from '@/lib/axis/guide/fit'
import { AUTHORIZED_SERVICES, EXAMPLES_NOTICE, groupRiskRange, OFFICIAL_LINKS, RISK_LABEL, type InvestmentGroupId, type ProductType } from '@/lib/axis/guide/products'
import { isRecommended, recommendGuide, VERDICT_SHORT, type GroupFit, type GuideRecommendation } from '@/lib/axis/guide/recommend'
import { defaultYears, projectScenario, SCENARIO_AMOUNTS_CENTS, SCENARIO_ASSUMPTIONS, SCENARIO_NOTICE, SCENARIO_YEARS, scenarioSeries, type GrowthAssumption } from '@/lib/axis/guide/scenarios'
import { formatWholeCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ScenarioChart } from '../charts/scenario-chart'
import { SubPageHeader } from '../page-header'
import { FinancialCard } from '../card'
import { ScreenLoading } from '../loading'
import { ArrowUpRight, ChevronRight, LeafLogo, SparkIcon } from '../icons'
import type { ScreenProps } from './types'

const VERDICT_TONE: Record<FitVerdict, string> = {
  fits: 'bg-finax/10 text-finax-dark',
  'fits-short-term': 'bg-finax/10 text-finax-dark',
  partial: 'bg-axis-soft text-axis-indigo',
  'not-now': 'bg-axis-soft text-axis-indigo',
  'not-for-horizon': 'bg-negative/8 text-negative',
  'outside-plan': 'bg-negative/8 text-negative',
}

function Label({ children }: { children: string }) {
  return <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{children}</p>
}

function VerdictPill({ verdict, text }: { verdict: FitVerdict; text?: string }) {
  return <span className={cn('inline-block shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold', VERDICT_TONE[verdict])}>{text ?? VERDICT_SHORT[verdict]}</span>
}

function Bullets({ items, className }: { items: readonly string[]; className?: string }) {
  return (
    <ul className={cn('list-disc space-y-0.5 pl-5 text-grafito/80', className)}>
      {items.map((i) => (
        <li key={i} className="text-pretty">
          {i}
        </li>
      ))}
    </ul>
  )
}

function riskRangeLabel(id: InvestmentGroupId): string {
  const [low, high] = groupRiskRange(id)
  return low === high ? `Riesgo ${RISK_LABEL[low].toLowerCase()}` : `Riesgo de ${RISK_LABEL[low].toLowerCase()} a ${RISK_LABEL[high].toLowerCase()}`
}

/**
 * «Guía para invertir», en dos niveles: familias (ahorro seguro, renta fija,
 * fondos, ETF, compañías, materias primas, inmobiliario, cripto) y, al abrir
 * una, sus tipos de producto con ejemplos de lo que existe. AXIS marca, por
 * reglas (guide/recommend.ts), qué familia y qué tipo encajan con TU plan;
 * nunca qué producto o empresa comprar.
 */
export function GuideScreen({ overview, onNavigate, onBack }: ScreenProps) {
  const result = useAllocationPlan(overview)
  const [groupId, setGroupId] = useState<InvestmentGroupId | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [fee, setFee] = useState('')
  const top = useRef<HTMLDivElement>(null)
  if (!result) return <ScreenLoading />
  const { plan, decision } = result
  const rec = recommendGuide(plan, decision.profile.fields)
  const minor = decision.profile.fields.adult === false

  const go = (id: InvestmentGroupId | null, typeId: string | null = null) => {
    setGroupId(id)
    setOpen(typeId)
    setFee('')
    requestAnimationFrame(() => top.current?.scrollIntoView({ block: 'start' }))
  }
  const group = groupId ? rec.groups.find((g) => g.group.id === groupId) ?? null : null

  return (
    <div ref={top} className="space-y-5 px-5 pb-8 pt-3">
      <SubPageHeader
        title={group ? group.group.name : 'Guía para invertir'}
        subtitle={group ? 'Tipos dentro de esta familia' : 'Qué existe y qué encaja contigo'}
        onBack={group ? () => go(null) : onBack}
      />

      {group ? (
        <GroupView
          group={group}
          open={open}
          onToggle={(id) => {
            setOpen(open === id ? null : id)
            setFee('')
          }}
          fee={fee}
          onFee={setFee}
          plan={plan}
          profile={decision.profile.fields}
          onPlan={() => onNavigate('plan')}
        />
      ) : (
        <>
          <LeadCard rec={rec} onOpen={go} onPlan={() => onNavigate('plan')} />

          <section className="space-y-2">
            <Label>Dónde se puede invertir</Label>
            {rec.groups.map((g) => (
              <FinancialCard key={g.group.id} padded={false}>
                <button type="button" onClick={() => go(g.group.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block text-[14px] font-bold text-grafito">{g.group.name}</span>
                    <span className="block text-[12px] font-medium leading-snug text-muted-foreground text-pretty">{g.group.summary}</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
                      <VerdictPill verdict={g.best.fit.verdict} />
                      <span className="text-[11.5px] font-medium text-muted-foreground">
                        {riskRangeLabel(g.group.id)} · {g.types.length} tipos
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </FinancialCard>
            ))}
          </section>

          <FinancialCard className="space-y-3">
            <Label>Si quieres una recomendación concreta</Label>
            <p className="text-[13px] font-medium leading-snug text-grafito/85 text-pretty">{AUTHORIZED_SERVICES.intro}</p>
            <p className="text-[12.5px] font-bold text-grafito">Comprueba que:</p>
            <Bullets items={AUTHORIZED_SERVICES.checks} className="text-[12.5px] font-medium leading-snug" />
            <p className="text-[12.5px] font-bold text-negative">Desconfía si:</p>
            <Bullets items={AUTHORIZED_SERVICES.redFlags} className="text-[12.5px] font-medium leading-snug" />
            <div className="space-y-2 pt-1">
              {OFFICIAL_LINKS.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 rounded-2xl bg-muted px-3.5 py-2.5 transition-colors hover:bg-graylight/60">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-grafito">{l.label}</span>
                    <span className="block text-[12px] font-medium leading-snug text-muted-foreground text-pretty">{l.detail}</span>
                  </span>
                  <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                </a>
              ))}
            </div>
            {minor && <p className="rounded-xl bg-axis-soft px-3 py-2 text-[12.5px] font-semibold text-axis-indigo text-pretty">{AUTHORIZED_SERVICES.minors}</p>}
          </FinancialCard>
        </>
      )}

      <p className="flex gap-2.5 rounded-2xl bg-muted px-4 py-3 text-[12px] font-medium leading-snug text-muted-foreground text-pretty">
        <LeafLogo className="mt-0.5 h-4 w-4 shrink-0 text-axis-violet" />
        <span>
          Esta guía es información general. AXIS te dice qué tipo de producto encaja con tu plan, no qué producto comprar: los ejemplos solo enseñan qué existe. Finax no recomienda productos, marcas ni entidades, ni
          cuándo comprar o vender.
        </span>
      </p>
    </div>
  )
}

/** Lo que mejor encaja de toda la guía, o por qué todavía no toca invertir. */
function LeadCard({ rec, onOpen, onPlan }: { rec: GuideRecommendation; onOpen: (id: InvestmentGroupId, typeId: string) => void; onPlan: () => void }) {
  const { lead, shortTerm } = rec
  const recommended = isRecommended(lead.fit.verdict)
  return (
    <FinancialCard className="space-y-3 border-axis-blue/30">
      <div className="flex items-center gap-2">
        <SparkIcon className="h-4 w-4 text-axis-violet" />
        <Label>AXIS · lo que mejor te encaja ahora</Label>
      </div>
      {recommended ? (
        <div className="space-y-1">
          <p className="text-[18px] font-extrabold leading-tight text-grafito">{lead.group.name}</p>
          <p className="text-[13px] font-medium text-muted-foreground">
            Dentro de ella: <span className="font-bold text-grafito">{lead.type.name}</span>
          </p>
        </div>
      ) : (
        <p className="text-[16px] font-extrabold leading-snug text-grafito text-balance">Todavía no es momento de invertir</p>
      )}
      <VerdictPill verdict={lead.fit.verdict} text={lead.fit.headline} />
      <Bullets items={lead.fit.reasons} className="text-[13px] font-medium leading-snug" />
      {recommended ? (
        <button type="button" onClick={() => onOpen(lead.group.id, lead.type.id)} className="min-h-10 w-full rounded-2xl bg-finax-dark px-4 py-2.5 text-[13.5px] font-bold text-white transition-transform active:scale-[0.98]">
          Ver {lead.group.name.toLowerCase()}
        </button>
      ) : (
        <button type="button" onClick={onPlan} className="text-[12.5px] font-bold text-axis-violet hover:text-axis-indigo">
          Ver tu plan →
        </button>
      )}
      {shortTerm && (
        <button type="button" onClick={() => onOpen(shortTerm.group.id, shortTerm.type.id)} className="flex w-full items-center gap-2 rounded-2xl bg-muted px-3.5 py-2.5 text-left">
          <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-grafito/85 text-pretty">
            Para el dinero que puedes necesitar pronto: <span className="font-bold text-grafito">{shortTerm.group.name}</span> ({shortTerm.type.name.toLowerCase()})
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      )}
    </FinancialCard>
  )
}

function groupAdvice(g: GroupFit): string {
  const { verdict } = g.best.fit
  if (isRecommended(verdict)) return `Lo que más te encaja de esta familia: ${g.best.type.name}.`
  if (verdict === 'partial') return `Lo que más se acerca a tu plan: ${g.best.type.name}, aunque solo en parte.`
  return 'Ahora mismo, nada de esta familia encaja con tu plan.'
}

interface GroupViewProps {
  group: GroupFit
  open: string | null
  onToggle: (id: string) => void
  fee: string
  onFee: (v: string) => void
  plan: Parameters<typeof productFit>[1]
  profile: Parameters<typeof productFit>[2]
  onPlan: () => void
}

function GroupView({ group, open, onToggle, fee, onFee, plan, profile, onPlan }: GroupViewProps) {
  const feeNumber = fee.trim() === '' ? undefined : Number(fee.replace(',', '.'))
  const validFee = feeNumber !== undefined && Number.isFinite(feeNumber) ? feeNumber : undefined
  return (
    <>
      <FinancialCard className="space-y-3">
        <p className="text-[13px] font-medium leading-snug text-grafito/85 text-pretty">{group.group.intro}</p>
        <p className="flex gap-2 rounded-2xl bg-axis-soft px-3.5 py-2.5 text-[12.5px] font-semibold leading-snug text-axis-indigo text-pretty">
          <SparkIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{groupAdvice(group)}</span>
        </p>
      </FinancialCard>

      <section className="space-y-2">
        {group.types.map(({ type, fit }) => {
          const expanded = open === type.id
          return (
            <FinancialCard key={type.id} padded={false}>
              <button type="button" aria-expanded={expanded} onClick={() => onToggle(type.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block text-[14px] font-bold text-grafito">{type.name}</span>
                  <span className="block text-[12px] font-medium text-muted-foreground">
                    Riesgo: {RISK_LABEL[type.risk].toLowerCase()} · {type.horizon}
                  </span>
                  <VerdictPill verdict={fit.verdict} />
                </span>
                <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', expanded && 'rotate-90')} />
              </button>
              {expanded && <TypeDetail type={type} fit={productFit(type, plan, profile, validFee)} fee={fee} onFee={onFee} onPlan={onPlan} />}
            </FinancialCard>
          )
        })}
      </section>
    </>
  )
}

function TypeDetail({ type, fit, fee, onFee, onPlan }: { type: ProductType; fit: ProductFit; fee: string; onFee: (v: string) => void; onPlan: () => void }) {
  return (
    <div className="fade-in space-y-3 px-4 pb-4 text-[13px] font-medium leading-snug text-grafito/85">
      <p className="text-pretty">{type.what}</p>
      <p className="text-pretty">
        <span className="font-semibold text-grafito">Para qué: </span>
        {type.goodFor}
      </p>

      <div className="space-y-2 rounded-2xl border border-border bg-background/60 p-3.5">
        <p className="flex items-center gap-1.5 text-[12px] font-bold text-axis-indigo">
          <SparkIcon className="h-3.5 w-3.5" />
          Con tu plan
        </p>
        <VerdictPill verdict={fit.verdict} text={fit.headline} />
        <Bullets items={fit.reasons} />
        <button type="button" onClick={onPlan} className="text-[12.5px] font-bold text-axis-violet hover:text-axis-indigo">
          Ver tu plan →
        </button>
      </div>

      <ScenarioSection type={type} />

      {type.examples && type.examples.length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold text-grafito">Ejemplos de lo que existe</p>
          <div className="flex flex-wrap gap-1.5">
            {type.examples.map((e) => (
              <span key={e} className="rounded-full bg-muted px-2.5 py-1 text-[12px] font-semibold text-grafito/80">
                {e}
              </span>
            ))}
          </div>
          <p className="text-[11.5px] font-medium leading-snug text-muted-foreground text-pretty">{EXAMPLES_NOTICE}</p>
        </div>
      )}

      <div className="space-y-1">
        <p className="font-semibold text-grafito">Ten en cuenta</p>
        <Bullets items={type.warnings} />
      </div>

      <div className="space-y-1">
        <p className="font-semibold text-grafito">Antes de decidir, comprueba</p>
        <Bullets items={fit.checks} />
      </div>

      {type.family !== 'cash' && (
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-grafito/80">¿Miras uno concreto? Su comisión anual, si la sabes (%)</span>
          <input
            inputMode="decimal"
            value={fee}
            onChange={(e) => onFee(e.target.value)}
            placeholder="Ej. 0,2"
            className="w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-[16px] font-medium text-grafito outline-none focus:border-finax-dark"
          />
        </label>
      )}
    </div>
  )
}

function Chips<T extends number>({ options, value, onChange, label }: { options: readonly T[]; value: T; onChange: (v: T) => void; label: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={cn('min-h-8 rounded-full px-3 py-1 text-[12px] font-semibold transition-colors', value === o ? 'bg-finax-dark text-white' : 'bg-muted text-muted-foreground hover:bg-graylight/70')}
        >
          {label(o)}
        </button>
      ))}
    </div>
  )
}

const euros = (cents: number) => formatWholeCurrency(cents / 100)
const yearsLabel = (y: number) => (y === 1 ? '1 año' : `${y} años`)

/**
 * «Cómo podría evolucionar tu dinero»: tres escenarios ilustrativos
 * (lib/axis/guide/scenarios.ts) para la cantidad y el plazo que elijas, más
 * lo que podría caer en un año muy malo. Nunca una previsión.
 */
function ScenarioSection({ type }: { type: ProductType }) {
  const assumption = SCENARIO_ASSUMPTIONS[type.id]
  const [amount, setAmount] = useState<(typeof SCENARIO_AMOUNTS_CENTS)[number]>(100_000)
  const [years, setYears] = useState<(typeof SCENARIO_YEARS)[number]>(() => (assumption ? defaultYears(assumption) : 1))
  if (!assumption) return null

  const badYear =
    assumption.badYearPct && assumption.badYearPct > 0 ? (
      <p className="rounded-xl bg-negative/8 px-3 py-2 text-[12.5px] font-semibold leading-snug text-negative text-pretty">
        En un año muy malo podría caer alrededor de un {assumption.badYearPct} %: {euros(amount)} se quedarían en unos {euros(Math.round((amount * (100 - assumption.badYearPct)) / 100))}.
      </p>
    ) : null

  return (
    <div className="space-y-2.5 rounded-2xl border border-border bg-background/60 p-3.5">
      <p className="font-semibold text-grafito">Cómo podría evolucionar tu dinero</p>
      {assumption.kind === 'none' ? (
        <>
          <p className="text-pretty">{assumption.reason}</p>
          {badYear && <Chips options={SCENARIO_AMOUNTS_CENTS} value={amount} onChange={setAmount} label={euros} />}
          {badYear}
        </>
      ) : (
        <ScenarioBody assumption={assumption} amount={amount} years={years} onAmount={setAmount} onYears={setYears} badYear={badYear} />
      )}
      <p className="text-[11.5px] font-medium leading-snug text-muted-foreground text-pretty">{SCENARIO_NOTICE}</p>
    </div>
  )
}

function ScenarioBody({
  assumption,
  amount,
  years,
  onAmount,
  onYears,
  badYear,
}: {
  assumption: GrowthAssumption
  amount: (typeof SCENARIO_AMOUNTS_CENTS)[number]
  years: (typeof SCENARIO_YEARS)[number]
  onAmount: (v: (typeof SCENARIO_AMOUNTS_CENTS)[number]) => void
  onYears: (v: (typeof SCENARIO_YEARS)[number]) => void
  badYear: ReactNode
}) {
  const result = projectScenario(amount, assumption, years)
  const fixed = assumption.sigma === 0
  const rows = fixed
    ? [{ label: 'Lo esperable', cents: result.midCents, tone: 'text-finax-dark' }]
    : [
        { label: 'Si va bien', cents: result.goodCents, tone: 'text-finax-dark' },
        { label: 'Lo normal', cents: result.midCents, tone: 'text-grafito' },
        { label: 'Si va mal', cents: result.badCents, tone: 'text-negative' },
      ]
  return (
    <>
      <div className="space-y-1.5">
        <p className="text-[12px] font-semibold text-grafito/80">Si pones</p>
        <Chips options={SCENARIO_AMOUNTS_CENTS} value={amount} onChange={onAmount} label={euros} />
        <p className="pt-1 text-[12px] font-semibold text-grafito/80">Y lo dejas</p>
        <Chips options={SCENARIO_YEARS} value={years} onChange={onYears} label={yearsLabel} />
      </div>
      {!fixed && <ScenarioChart series={scenarioSeries(amount, assumption, years)} />}
      <ul className="space-y-1">
        {rows.map((r) => {
          const diff = r.cents - amount
          return (
            <li key={r.label} className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] font-semibold text-grafito/80">{r.label}</span>
              <span className="text-right">
                <span className={cn('text-[15px] font-extrabold tabular-nums', r.tone)}>{euros(r.cents)}</span>
                <span className="ml-1.5 text-[11.5px] font-semibold tabular-nums text-muted-foreground">
                  ({diff >= 0 ? '+' : ''}
                  {euros(diff)})
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      {!fixed && <p className="text-[11.5px] font-medium leading-snug text-muted-foreground text-pretty">«Si va mal» y «si va bien»: más o menos 1 de cada 10 veces saldría peor o mejor que eso.</p>}
      {badYear}
    </>
  )
}
