/**
 * Cifras permitidas: lo único numérico que el modelo de lenguaje puede
 * escribir al expresar una decisión. Las calcula AXIS a partir de la decisión
 * y su contexto; todo lo que AXIS escribe en la decisión (hechos, señales,
 * recomendación…) queda permitido por construcción. Nada de la memoria.
 *
 * `extractFigures` es la única forma de leer cifras de un texto, compartida
 * con la validación semántica: así lo permitido y lo escrito se comparan con
 * la misma normalización.
 */
import { formatPct } from '../../format'
import { formatCents } from '../../money'
import type { AxisDecision, FinancialContext } from '../types'

/** Cifra con etiqueta legible, tal y como se envía al modelo. */
export interface Figure {
  label: string
  value: string
}

const MONEY = /[+\-−]?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?\s?€|[+\-−]?\d+(?:,\d{1,2})?\s?€/g
const PERCENT = /[+\-−]?\d+(?:,\d+)?\s?%/g
const COUNT = /\b(\d+)\s+(meses|mes|d[ií]as?|movimientos?|objetivos?|posiciones|posici[oó]n)\b/gi

/** Clave normalizada de una cifra: `1.300 €` ≡ `1.300,00 €` → `m:1300.00`; `65 %` ≡ `65%` → `p:65`. */
export function figureKey(raw: string): string {
  const s = raw.replace(/\s/g, '').replace('−', '-')
  if (s.endsWith('€')) {
    const negative = s.startsWith('-')
    const n = s.replace(/[+\-€]/g, '').replace(/\./g, '').replace(',', '.')
    return `m:${negative ? '-' : ''}${Number(n).toFixed(2)}`
  }
  if (s.endsWith('%')) return `p:${String(Number(s.replace(/[+\-%]/g, '').replace(',', '.')))}`
  return `c:${s}`
}

/** Todas las cifras (importes, porcentajes y recuentos con unidad) de un texto, ya normalizadas. */
export function extractFigures(text: string): Array<{ raw: string; key: string }> {
  const found: Array<{ raw: string; key: string }> = []
  for (const m of text.matchAll(MONEY)) found.push({ raw: m[0], key: figureKey(m[0]) })
  for (const m of text.matchAll(PERCENT)) found.push({ raw: m[0], key: figureKey(m[0]) })
  for (const m of text.matchAll(COUNT)) found.push({ raw: m[0], key: `c:${m[1]}` })
  return found
}

function contextFigures(ctx: FinancialContext): Figure[] {
  const eur = (label: string, cents: number) => ({ label, value: formatCents(cents) })
  const pct = (label: string, v: number) => ({ label, value: formatPct(Math.round(v)) })
  const count = (label: string, n: number) => ({ label, value: String(n) })
  const figures: Figure[] = [
    eur('Patrimonio total', ctx.wealth.totalCents),
    eur('Patrimonio líquido', ctx.wealth.liquidCents),
    eur('Invertido', ctx.wealth.investedCents),
    eur('Reservado en objetivos', ctx.wealth.reservedForObjectivesCents),
    eur('Saldo inicial', ctx.wealth.initialBalanceCents),
  ]
  for (const [name, p] of [
    ['mes actual', ctx.flows.current],
    ['mes anterior', ctx.flows.previous],
  ] as const) {
    figures.push(eur(`Ingresos ${name}`, p.incomeCents), eur(`Gastos ${name}`, p.expenseCents), eur(`Ahorro ${name}`, p.savingsCents))
    if (p.savingsRatePct !== null) figures.push(pct(`Tasa de ahorro ${name}`, p.savingsRatePct))
    figures.push(count(`Movimientos ${name}`, p.movementCount))
    for (const c of [...p.expensesByCategory, ...p.incomeByCategory]) {
      figures.push(eur(`${c.label} (${name})`, c.cents), pct(`${c.label} sobre el total (${name})`, c.pct))
    }
  }
  if (ctx.flows.incomeChangePct !== null) figures.push(pct('Variación de ingresos', ctx.flows.incomeChangePct))
  if (ctx.flows.expenseChangePct !== null) figures.push(pct('Variación de gastos', ctx.flows.expenseChangePct))
  for (const o of ctx.objectives) {
    figures.push(eur(`Objetivo «${o.name}»: meta`, o.targetCents), eur(`Objetivo «${o.name}»: ahorrado`, o.currentCents), eur(`Objetivo «${o.name}»: restante`, o.remainingCents), pct(`Objetivo «${o.name}»: progreso`, o.progressPct))
    if (o.requiredMonthlyCents !== undefined) figures.push(eur(`Objetivo «${o.name}»: aportación mensual necesaria`, o.requiredMonthlyCents))
    if (o.monthsLeft !== undefined) {
      for (const n of new Set([Math.floor(o.monthsLeft), Math.round(o.monthsLeft), Math.ceil(o.monthsLeft)])) figures.push(count(`Objetivo «${o.name}»: meses restantes`, n))
    }
  }
  for (const p of ctx.investments.positions) {
    figures.push(eur(`Posición «${p.name}»: invertido`, p.investedCents), eur(`Posición «${p.name}»: valor`, p.valueCents), pct(`Posición «${p.name}»: peso en cartera`, p.weightPct))
  }
  figures.push(
    eur('Total invertido (coste)', ctx.investments.totalInvestedCents),
    eur('Total invertido (valor)', ctx.investments.totalValueCents),
    pct('Peso de las inversiones sobre el patrimonio', ctx.investments.shareOfWealthPct),
    count('Movimientos registrados', ctx.quality.movementCount),
    count('Meses con datos', ctx.quality.monthsWithData),
    count('Días con movimientos', ctx.quality.historyDays),
    count('Objetivos', ctx.objectives.length),
    count('Posiciones', ctx.investments.positions.length),
  )
  return figures
}

/** Textos escritos por AXIS en la decisión: sus cifras quedan permitidas por construcción. */
function decisionTexts(d: AxisDecision): string[] {
  return [
    ...d.facts,
    ...d.relevant.flatMap((s) => [s.fact, s.interpretation]),
    ...(d.recommendation ? [d.recommendation.what, d.recommendation.why] : []),
    ...d.alternatives.map((a) => a.summary),
    ...d.uncertainties.map((u) => u.detail),
  ]
}

/** Cifras con etiqueta que se envían al modelo (sin duplicados de valor+etiqueta). */
export function figuresOf(decision: AxisDecision): Figure[] {
  const seen = new Set<string>()
  return contextFigures(decision.context).filter((f) => {
    const k = `${f.label}|${f.value}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Conjunto normalizado contra el que se valida lo que escribe el modelo. */
export function allowedFigureKeys(decision: AxisDecision): Set<string> {
  const keys = new Set<string>()
  for (const f of figuresOf(decision)) {
    if (/^\d+$/.test(f.value)) keys.add(`c:${f.value}`)
    else keys.add(figureKey(f.value))
  }
  for (const t of decisionTexts(decision)) for (const x of extractFigures(t)) keys.add(x.key)
  return keys
}
