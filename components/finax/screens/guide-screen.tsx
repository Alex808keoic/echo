'use client'

import { useState } from 'react'
import { useAllocationPlan } from '@/hooks/use-allocation-plan'
import { productFit, type FitVerdict } from '@/lib/axis/guide/fit'
import { AUTHORIZED_SERVICES, OFFICIAL_LINKS, PRODUCT_TYPES, RISK_LABEL } from '@/lib/axis/guide/products'
import { cn } from '@/lib/utils'
import { SubPageHeader } from '../page-header'
import { FinancialCard } from '../card'
import { ScreenLoading } from '../loading'
import { ArrowUpRight, ChevronRight, LeafLogo } from '../icons'
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

/**
 * «Guía para invertir»: información general sobre tipos de producto, si un
 * tipo encaja con TU plan (reglas, guide/fit.ts) y cómo buscar una entidad
 * autorizada si quieres una recomendación concreta. Nunca dice qué comprar.
 */
export function GuideScreen({ overview, onNavigate, onBack }: ScreenProps) {
  const result = useAllocationPlan(overview)
  const [selected, setSelected] = useState<string | null>(null)
  const [fee, setFee] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  if (!result) return <ScreenLoading />
  const { plan, decision } = result
  const product = PRODUCT_TYPES.find((p) => p.id === selected) ?? null
  const feeNumber = fee.trim() === '' ? undefined : Number(fee.replace(',', '.'))
  const fit = product ? productFit(product, plan, decision.profile.fields, feeNumber !== undefined && Number.isFinite(feeNumber) ? feeNumber : undefined) : null

  return (
    <div className="space-y-5 px-5 pb-8 pt-3">
      <SubPageHeader title="Guía para invertir" subtitle="Información general, no recomendaciones" onBack={onBack} />

      <FinancialCard className="space-y-3">
        <Label>Revisar una opción</Label>
        <p className="text-[13px] font-medium leading-snug text-grafito/85 text-pretty">¿Estás mirando algún tipo de producto? Te digo si encaja con tu plan y qué comprobar.</p>
        <div className="flex flex-wrap gap-2">
          {PRODUCT_TYPES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={selected === p.id}
              onClick={() => setSelected(selected === p.id ? null : p.id)}
              className={cn(
                'min-h-9 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors',
                selected === p.id ? 'bg-finax-dark text-white' : 'bg-muted text-muted-foreground hover:bg-graylight/70',
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
        {product && (
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-grafito/80">Comisión anual, si la sabes (%)</span>
            <input
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="Ej. 0,2"
              className="w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-[16px] font-medium text-grafito outline-none focus:border-finax-dark"
            />
          </label>
        )}
        {fit && (
          <div className="space-y-2 rounded-2xl border border-border bg-background/60 p-3.5">
            <p className={cn('inline-block rounded-full px-3 py-1 text-[12.5px] font-bold', VERDICT_TONE[fit.verdict])}>{fit.headline}</p>
            <ul className="space-y-1.5">
              {fit.reasons.map((r) => (
                <li key={r} className="text-[13px] font-medium leading-snug text-grafito/85 text-pretty">
                  {r}
                </li>
              ))}
            </ul>
            <p className="pt-1 text-[12px] font-bold text-grafito">Antes de decidir, comprueba:</p>
            <ul className="space-y-1">
              {fit.checks.map((c) => (
                <li key={c} className="flex gap-2 text-[12.5px] font-medium leading-snug text-muted-foreground">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                  <span className="text-pretty">{c}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => onNavigate('plan')} className="text-[12.5px] font-bold text-axis-violet hover:text-axis-indigo">
              Ver tu plan →
            </button>
          </div>
        )}
      </FinancialCard>

      <section className="space-y-2">
        <Label>Tipos de producto</Label>
        {PRODUCT_TYPES.map((p) => {
          const expanded = open === p.id
          return (
            <FinancialCard key={p.id} padded={false}>
              <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : p.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-grafito">{p.name}</span>
                  <span className="block text-[12px] font-medium text-muted-foreground">
                    Riesgo: {RISK_LABEL[p.risk].toLowerCase()} · {p.horizon}
                  </span>
                </span>
                <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', expanded && 'rotate-90')} />
              </button>
              {expanded && (
                <div className="fade-in space-y-2 px-4 pb-4 text-[13px] font-medium leading-snug text-grafito/85">
                  <p className="text-pretty">{p.what}</p>
                  <p className="text-pretty">
                    <span className="font-semibold text-grafito">Para qué: </span>
                    {p.goodFor}
                  </p>
                  <p className="font-semibold text-grafito">Cómo compararlo</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-grafito/80">
                    {p.compare.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                  <p className="font-semibold text-grafito">Ten en cuenta</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-grafito/80">
                    {p.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </FinancialCard>
          )
        })}
      </section>

      <FinancialCard className="space-y-3">
        <Label>Si quieres una recomendación concreta</Label>
        <p className="text-[13px] font-medium leading-snug text-grafito/85 text-pretty">{AUTHORIZED_SERVICES.intro}</p>
        <p className="text-[12.5px] font-bold text-grafito">Comprueba que:</p>
        <ul className="list-disc space-y-0.5 pl-5 text-[12.5px] font-medium leading-snug text-grafito/80">
          {AUTHORIZED_SERVICES.checks.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="text-[12.5px] font-bold text-negative">Desconfía si:</p>
        <ul className="list-disc space-y-0.5 pl-5 text-[12.5px] font-medium leading-snug text-grafito/80">
          {AUTHORIZED_SERVICES.redFlags.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
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
        {decision.profile.fields.adult === false && <p className="rounded-xl bg-axis-soft px-3 py-2 text-[12.5px] font-semibold text-axis-indigo text-pretty">{AUTHORIZED_SERVICES.minors}</p>}
      </FinancialCard>

      <p className="flex gap-2.5 rounded-2xl bg-muted px-4 py-3 text-[12px] font-medium leading-snug text-muted-foreground text-pretty">
        <LeafLogo className="mt-0.5 h-4 w-4 shrink-0 text-axis-violet" />
        <span>Esta guía es información general. Finax no recomienda productos, marcas ni entidades, ni cuándo comprar o vender: eso solo puede hacerlo una entidad autorizada que conozca tu situación.</span>
      </p>
    </div>
  )
}
