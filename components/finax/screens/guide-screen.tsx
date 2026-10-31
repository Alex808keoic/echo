'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useAllocationPlan } from '@/hooks/use-allocation-plan'
import { type FitVerdict, type ProductFit } from '@/lib/axis/guide/fit'
import { COMPARE_DEFAULT_MONTHLY_CENTS, COMPARE_YEARS, feeComparison, investEstimate, monthlyForType, sleeveGuide, type InvestEstimate, type SleeveGuide } from '@/lib/axis/guide/invest'
import type { AllocationPlan } from '@/lib/axis/plan/allocation'
import { AUTHORIZED_SERVICES, EXAMPLES_NOTICE, groupRiskRange, OFFICIAL_LINKS, RISK_LABEL, type InvestmentGroupId, type ProductType } from '@/lib/axis/guide/products'
import { isRecommended, recommendGuide, VERDICT_SHORT, type GroupFit, type GuideRecommendation } from '@/lib/axis/guide/recommend'
import { defaultYears, monthsLabel, SCENARIO_AMOUNTS_CENTS, SCENARIO_ASSUMPTIONS, SCENARIO_NOTICE, SCENARIO_YEARS, scenarioSeries, type GrowthAssumption } from '@/lib/axis/guide/scenarios'
import { formatWholeCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ScenarioChart } from '../charts/scenario-chart'
import { SubPageHeader } from '../page-header'
import { FinancialCard } from '../card'
import { ScreenLoading } from '../loading'
import { ArrowUpRight, ChevronRight } from '../icons'
import { AxisMark } from '../axis-mark'
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
  const top = useRef<HTMLDivElement>(null)
  if (!result) return <ScreenLoading />
  const { plan, decision } = result
  const rec = recommendGuide(plan, decision.profile.fields)
  const estimate = investEstimate(decision, plan)
  const sleeves = sleeveGuide(plan, decision.profile.fields)
  const minor = decision.profile.fields.adult === false
  // Los escenarios empiezan con lo que tu plan invertiría en un año y con tu plazo.
  const mine: Mine = {
    amountCents: estimate.kind === 'now' ? estimate.yearCents : null,
    years: decision.profile.fields.horizon === 'long' ? 10 : decision.profile.fields.horizon === 'medium' ? 5 : null,
  }

  const go = (id: InvestmentGroupId | null, typeId: string | null = null) => {
    setGroupId(id)
    setOpen(typeId)
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
        <GroupView group={group} open={open} onToggle={(id) => setOpen(open === id ? null : id)} plan={plan} mine={mine} onPlan={() => onNavigate('plan')} />
      ) : (
        <>
          <EstimateCard estimate={estimate} onPlan={() => onNavigate('plan')} />

          {sleeves.length > 0 ? <MixGuide sleeves={sleeves} rec={rec} onOpen={go} /> : <LeadCard rec={rec} onOpen={go} onPlan={() => onNavigate('plan')} />}

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
        <AxisMark size={16} className="mt-0.5 shrink-0" />
        <span>
          Esta guía es información general. AXIS te dice qué tipo de producto encaja con tu plan, no qué producto comprar: los ejemplos solo enseñan qué existe. Finax no recomienda productos, marcas ni entidades, ni
          cuándo comprar o vender.
        </span>
      </p>
    </div>
  )
}

const NONE_TEXT: Record<Extract<InvestEstimate, { kind: 'none' }>['reason'], string> = {
  blocked: 'Ahora, nada: tu plan dice que primero hay que resolver otra cosa. Mira el primer paso de «Tu plan».',
  'no-profile': 'Para calcularlo necesito saber cuándo necesitarás el dinero y cómo llevas el riesgo: responde «Tu perfil».',
  'short-horizon': 'Nada: dijiste que necesitarás tu dinero en menos de 2 años, así que lo que te sobra va mejor en ahorro seguro, sin riesgo.',
  'no-room': 'Este mes, nada: tus objetivos cercanos necesitan todo lo que ahorras.',
}

/** «Cuánto deberías invertir»: lo que dice tu plan, a partir de lo que tienes y de lo que ahorras. */
function EstimateCard({ estimate, onPlan }: { estimate: InvestEstimate; onPlan: () => void }) {
  const row = (label: string, cents: number, strong = false) => (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12.5px] font-medium text-grafito/80">{label}</span>
      <span className={cn('whitespace-nowrap tabular-nums', strong ? 'text-[17px] font-extrabold text-grafito' : 'text-[13.5px] font-bold text-grafito')}>{euros(cents)}</span>
    </div>
  )
  return (
    <FinancialCard className="space-y-3 border-axis-blue/30">
      <div className="flex items-center gap-2">
        <AxisMark size={16} />
        <Label>AXIS · cuánto deberías invertir</Label>
      </div>
      {estimate.kind === 'now' ? (
        <>
          <div className="space-y-1.5">
            {estimate.monthlyCents > 0 && row('Cada mes, de lo que ahorras', estimate.monthlyCents, true)}
            {estimate.lumpCents > 0 && row(`Ahora, de una vez o en ${estimate.spreadMonths} meses`, estimate.lumpCents, estimate.monthlyCents === 0)}
            {estimate.monthlyCents > 0 && estimate.lumpCents > 0 && row('En total, en un año', estimate.yearCents)}
          </div>
          <p className="text-[12.5px] font-medium leading-snug text-grafito/80 text-pretty">
            {estimate.lumpCents > 0
              ? `De los ${euros(estimate.liquidCents)} que tienes en líquido, ${euros(estimate.keptCents)} se quedan para tu colchón y tus objetivos; el resto no tiene destino y puede trabajar a largo plazo${estimate.lumpPerMonthCents > 0 ? ` (repartido, unos ${euros(estimate.lumpPerMonthCents)} al mes)` : ''}.`
              : `Tu líquido (${euros(estimate.liquidCents)}) lo necesitan tu colchón y tus objetivos: lo que inviertes sale de lo que ahorras cada mes.`}
          </p>
        </>
      ) : estimate.kind === 'later' ? (
        <p className="text-[13px] font-medium leading-snug text-grafito/85 text-pretty">
          {estimate.reason === 'cushion'
            ? `Ahora, nada: primero se completa tu colchón${estimate.months ? ` (te faltan unos ${estimate.months === 1 ? '1 mes' : `${estimate.months} meses`})` : ''}.${estimate.thenMonthlyCents ? ` Después, con tus números de hoy, invertirías unos ${euros(estimate.thenMonthlyCents)} al mes.` : ''}`
            : `Ahora, nada: tu plan va primero a por tus deudas caras, porque devolverlas rinde más seguro que invertir${estimate.months ? ` (unos ${estimate.months} meses)` : ''}.`}
        </p>
      ) : (
        <p className="text-[13px] font-medium leading-snug text-grafito/85 text-pretty">{NONE_TEXT[estimate.reason]}</p>
      )}
      <button type="button" onClick={onPlan} className="tap text-[12.5px] font-bold text-axis-violet hover:text-axis-indigo">
        Ver tu plan →
      </button>
    </FinancialCard>
  )
}

/** «Tu mezcla, parte por parte»: cada parte de tu plan, cuánto lleva y qué tipos sirven para ella. */
function MixGuide({ sleeves, rec, onOpen }: { sleeves: SleeveGuide[]; rec: GuideRecommendation; onOpen: (id: InvestmentGroupId, typeId: string) => void }) {
  return (
    <section className="space-y-2">
      <Label>Tu mezcla, parte por parte</Label>
      {sleeves.some((s) => s.rebalancing) && (
        <p className="px-1 text-[12px] font-medium leading-snug text-muted-foreground text-pretty">
          Lo que ya tienes invertido se ha alejado de tu mezcla: este mes lo nuevo va sobre todo a lo que falta, sin vender nada. El porcentaje es el de tu mezcla.
        </p>
      )}
      {sleeves.map((s) => (
        <FinancialCard key={s.key} className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 text-[14px] font-bold leading-snug text-grafito text-pretty">
              {s.label} · {s.pct} %
            </p>
            {s.monthlyCents > 0 && <p className="whitespace-nowrap text-[13px] font-bold tabular-nums text-grafito">{euros(s.monthlyCents)}/mes</p>}
          </div>
          {s.lumpCents > 0 && <p className="text-[12px] font-medium text-muted-foreground">Y {euros(s.lumpCents)} del dinero sin destino.</p>}
          <p className="text-[12.5px] font-medium leading-snug text-grafito/80 text-pretty">{s.choice}</p>
          {s.types.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[12px] font-semibold text-grafito/80">Tipos que sirven para esta parte</p>
              {s.types.map(({ type }) => (
                <button key={type.id} type="button" onClick={() => onOpen(type.group, type.id)} className="flex w-full items-center gap-2 rounded-2xl bg-muted px-3.5 py-2.5 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-grafito">{type.name}</span>
                    <span className="block text-[11.5px] font-medium text-muted-foreground">Cómo elegir uno, comisiones y escenarios</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </FinancialCard>
      ))}
      {rec.shortTerm && (
        <button type="button" onClick={() => onOpen(rec.shortTerm!.group.id, rec.shortTerm!.type.id)} className="flex w-full items-center gap-2 rounded-2xl bg-muted px-3.5 py-2.5 text-left">
          <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-grafito/85 text-pretty">
            Para tu colchón y lo que puedes necesitar pronto: <span className="font-bold text-grafito">{rec.shortTerm.group.name}</span> ({rec.shortTerm.type.name.toLowerCase()})
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      )}
    </section>
  )
}

/** Lo que mejor encaja de toda la guía, o por qué todavía no toca invertir. */
function LeadCard({ rec, onOpen, onPlan }: { rec: GuideRecommendation; onOpen: (id: InvestmentGroupId, typeId: string) => void; onPlan: () => void }) {
  const { lead, shortTerm } = rec
  const recommended = isRecommended(lead.fit.verdict)
  return (
    <FinancialCard className="space-y-3 border-axis-blue/30">
      <div className="flex items-center gap-2">
        <AxisMark size={16} />
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
        <button type="button" onClick={onPlan} className="tap text-[12.5px] font-bold text-axis-violet hover:text-axis-indigo">
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

/** Tu importe (lo que tu plan invertiría en un año) y tu plazo, para empezar los escenarios. */
interface Mine {
  amountCents: number | null
  years: (typeof SCENARIO_YEARS)[number] | null
}

interface GroupViewProps {
  group: GroupFit
  open: string | null
  onToggle: (id: string) => void
  plan: AllocationPlan
  mine: Mine
  onPlan: () => void
}

function GroupView({ group, open, onToggle, plan, mine, onPlan }: GroupViewProps) {
  return (
    <>
      <FinancialCard className="space-y-3">
        <p className="text-[13px] font-medium leading-snug text-grafito/85 text-pretty">{group.group.intro}</p>
        <p className="flex gap-2 rounded-2xl bg-axis-soft px-3.5 py-2.5 text-[12.5px] font-semibold leading-snug text-axis-indigo text-pretty">
          <AxisMark size={16} className="mt-0.5 shrink-0" />
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
              {expanded && <TypeDetail type={type} fit={fit} plan={plan} mine={mine} onPlan={onPlan} />}
            </FinancialCard>
          )
        })}
      </section>
    </>
  )
}

function TypeDetail({ type, fit, plan, mine, onPlan }: { type: ProductType; fit: ProductFit; plan: AllocationPlan; mine: Mine; onPlan: () => void }) {
  return (
    <div className="fade-in space-y-3 px-4 pb-4 text-[13px] font-medium leading-snug text-grafito/85">
      <p className="text-pretty">{type.what}</p>
      <p className="text-pretty">
        <span className="font-semibold text-grafito">Para qué: </span>
        {type.goodFor}
      </p>

      <div className="space-y-2 rounded-2xl border border-border bg-background/60 p-3.5">
        <p className="flex items-center gap-1.5 text-[12px] font-bold text-axis-indigo">
          <AxisMark size={14} />
          Con tu plan
        </p>
        <VerdictPill verdict={fit.verdict} text={fit.headline} />
        <Bullets items={fit.reasons} />
        <button type="button" onClick={onPlan} className="tap text-[12.5px] font-bold text-axis-violet hover:text-axis-indigo">
          Ver tu plan →
        </button>
      </div>

      <ScenarioSection type={type} mine={mine} />

      {type.choose && type.choose.length > 0 && (
        <div className="space-y-1">
          <p className="font-semibold text-grafito">Cómo reconocer uno bueno</p>
          <Bullets items={type.choose} />
        </div>
      )}

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

      {type.family !== 'cash' && <FeeCompare type={type} plan={plan} />}
    </div>
  )
}

const pctInput = (raw: string): number | null => {
  const n = Number(raw.trim().replace(',', '.'))
  return raw.trim() !== '' && Number.isFinite(n) ? n : null
}

/**
 * «¿Dudas entre dos?»: la comisión anual de cada opción (la pone el usuario) y
 * cuánto se lleva la diferencia con tu aportación del plan. Finax solo hace la cuenta.
 */
function FeeCompare({ type, plan }: { type: ProductType; plan: AllocationPlan }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const planMonthly = monthlyForType(type, plan)
  const monthly = planMonthly ?? COMPARE_DEFAULT_MONTHLY_CENTS
  const aPct = pctInput(a)
  const bPct = pctInput(b)
  const result = aPct !== null && bPct !== null ? feeComparison(type, monthly, aPct, bPct) : null
  const input = (value: string, onChange: (v: string) => void, label: string) => (
    <label className="block min-w-0">
      <span className="mb-1 block text-[12px] font-semibold text-grafito/80">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ej. 0,2"
        className="w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-[16px] font-medium text-grafito outline-none focus:border-finax-dark"
      />
    </label>
  )
  const pct = (n: number) => `${String(n).replace('.', ',')} %`
  return (
    <div className="space-y-2.5 rounded-2xl border border-border bg-background/60 p-3.5">
      <p className="font-semibold text-grafito">¿Dudas entre dos? Compara su comisión</p>
      <p className="text-[12px] font-medium leading-snug text-muted-foreground text-pretty">
        Pon la comisión total anual de cada uno (%). Se calcula con {planMonthly !== null ? `lo que tu plan pone aquí, ${euros(monthly)} al mes` : `${euros(monthly)} al mes`}, durante {COMPARE_YEARS} años.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {input(a, setA, 'Opción A')}
        {input(b, setB, 'Opción B')}
      </div>
      {result && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] font-semibold text-grafito/80">Habrías puesto</span>
            <span className="text-[13px] font-bold tabular-nums text-grafito">{euros(result.contributedCents)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] font-semibold text-grafito/80">Con A ({pct(aPct!)})</span>
            <span className="text-[13px] font-bold tabular-nums text-grafito">{euros(result.aCents)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] font-semibold text-grafito/80">Con B ({pct(bPct!)})</span>
            <span className="text-[13px] font-bold tabular-nums text-grafito">{euros(result.bCents)}</span>
          </div>
          <p className="rounded-xl bg-axis-soft px-3 py-2 text-[12.5px] font-semibold leading-snug text-axis-indigo text-pretty">
            {result.cheaper === null
              ? 'Cuestan lo mismo: decide por lo demás (lo que copia, su tamaño, cómo se compra).'
              : `La opción ${result.cheaper === 'a' ? 'A' : 'B'} te dejaría unos ${euros(result.diffCents)} más: es lo que se llevaría de más la comisión de la otra.`}
          </p>
          {(result.aHigh || result.bHigh) && (
            <p className="rounded-xl bg-negative/8 px-3 py-2 text-[12.5px] font-semibold leading-snug text-negative text-pretty">
              {result.aHigh && result.bHigh ? 'Las dos comisiones son altas' : `La comisión de la opción ${result.aHigh ? 'A' : 'B'} es alta`} para este tipo de producto.
            </p>
          )}
          <p className="text-[11.5px] font-medium leading-snug text-muted-foreground text-pretty">Con el crecimiento «normal» supuesto para este tipo, sin impuestos ni inflación. Es una cuenta orientativa, no una previsión.</p>
        </div>
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
function ScenarioSection({ type, mine }: { type: ProductType; mine: Mine }) {
  const assumption = SCENARIO_ASSUMPTIONS[type.id]
  // Con plan, la primera cantidad es lo que tu plan invertiría en un año; el plazo, el tuyo (solo en lo que sube y baja).
  const yours = mine.amountCents !== null && mine.amountCents > 0 && !(SCENARIO_AMOUNTS_CENTS as readonly number[]).includes(mine.amountCents) ? mine.amountCents : null
  const amounts: readonly number[] = yours !== null ? [yours, ...SCENARIO_AMOUNTS_CENTS] : SCENARIO_AMOUNTS_CENTS
  const [amount, setAmount] = useState<number>(mine.amountCents !== null && mine.amountCents > 0 ? mine.amountCents : 100_000)
  const [years, setYears] = useState<(typeof SCENARIO_YEARS)[number]>(() => {
    if (!assumption) return 1
    const base = defaultYears(assumption)
    return mine.years !== null && assumption.kind === 'growth' && assumption.sigma > 10 ? mine.years : base
  })
  if (!assumption) return null
  const amountLabel = (c: number) => (c === yours ? `${euros(c)} (tu plan en un año)` : euros(c))

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
          {badYear && <Chips options={amounts} value={amount} onChange={setAmount} label={amountLabel} />}
          {badYear}
        </>
      ) : (
        <ScenarioBody assumption={assumption} amounts={amounts} amountLabel={amountLabel} amount={amount} years={years} onAmount={setAmount} onYears={setYears} badYear={badYear} />
      )}
      <p className="text-[11.5px] font-medium leading-snug text-muted-foreground text-pretty">{SCENARIO_NOTICE}</p>
    </div>
  )
}

function ScenarioBody({
  assumption,
  amounts,
  amountLabel,
  amount,
  years,
  onAmount,
  onYears,
  badYear,
}: {
  assumption: GrowthAssumption
  amounts: readonly number[]
  amountLabel: (cents: number) => string
  amount: number
  years: (typeof SCENARIO_YEARS)[number]
  onAmount: (v: number) => void
  onYears: (v: (typeof SCENARIO_YEARS)[number]) => void
  badYear: ReactNode
}) {
  const [active, setActive] = useState<number | null>(null)
  const series = scenarioSeries(amount, assumption, years)
  // Tocando la gráfica, las cifras son las de ese mes; si no, las del final del plazo.
  const month = active ?? series.length - 1
  const result = series[month]
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
        <Chips
          options={amounts}
          value={amount}
          onChange={(v) => {
            setActive(null)
            onAmount(v)
          }}
          label={amountLabel}
        />
        <p className="pt-1 text-[12px] font-semibold text-grafito/80">Y lo dejas</p>
        <Chips
          options={SCENARIO_YEARS}
          value={years}
          onChange={(v) => {
            setActive(null)
            onYears(v)
          }}
          label={yearsLabel}
        />
      </div>
      <ScenarioChart series={series} active={active} onActive={setActive} />
      <p className="text-[11.5px] font-medium leading-snug text-muted-foreground text-pretty">
        {fixed ? 'Toca la gráfica para ver cuánto tendrías cada mes.' : 'La línea es «lo normal»; la zona sombreada, entre «si va mal» y «si va bien». Toca la gráfica para ver cada mes.'}
      </p>
      <p className="text-[12px] font-bold text-grafito">{active === null ? `Al cabo de ${monthsLabel(month)}` : `A los ${monthsLabel(month)}`}</p>
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
