/**
 * Cifras permitidas: lo único numérico que el modelo de lenguaje puede
 * escribir al expresar una decisión o responder en el chat. Un conjunto
 * CERRADO, tipado y trazable: cada cifra sabe de dónde viene (`source`) y,
 * si es derivada, de qué operación y de qué entradas (`derivedFrom`).
 *
 *   context        calculadas por Finax a partir del FinancialContext
 *   decision-text  escritas por AXIS en la decisión (permitidas por construcción)
 *   message        escritas por el usuario en su mensaje (puede citárselas)
 *   derived        operaciones de una lista cerrada (`DerivedOp`) sobre cifras
 *                  permitidas, calculadas por AXIS; nunca por el modelo
 *   forecast       previsiones (fase 5) calculadas por AXIS con los ingresos
 *                  recurrentes declarados: etiquetadas «Previsión: …», nunca
 *                  dentro de `contextFigures` ni bajo una etiqueta de dato real
 *   history        histórico compacto del chat (chat/financial-history.ts):
 *                  meses cerrados y movimientos más grandes, calculados con los
 *                  movimientos registrados; solo en el chat, nunca en el análisis
 *
 * Nada procede de la memoria en texto libre (`UserMemory.content`).
 *
 * `extractFigures` es la única forma de leer cifras de un texto, compartida
 * con la validación semántica: así lo permitido y lo escrito se comparan con
 * la misma normalización. Detecta también NÚMEROS DESNUDOS (sin unidad), que
 * solo se licencian si coinciden con una cifra permitida o son un año.
 */
import { formatPct } from '../../format'
import { formatCents } from '../../money'
import type { AxisDecision, FinancialContext } from '../types'
import { recurringForecasts, recurringIncomesOf, usualExpenseMonthCount, usualMonthlyExpense } from '../rules/shared'

export type FigureKind = 'money' | 'percent' | 'count'
export type FigureSource = 'context' | 'decision-text' | 'message' | 'derived' | 'forecast' | 'history'
/** Operaciones derivadas admitidas. La lista es cerrada: añadir una exige un commit revisado. */
export type DerivedOp = 'liquid-minus' | 'free-liquid-minus' | 'savings-minus' | 'amount-over-income'

export interface AllowedFigure {
  /** Clave normalizada (`figureKey(text)`): `m:3450.00` · `p:65` · `c:2`. */
  key: string
  kind: FigureKind
  /** Importe en céntimos (money). */
  cents?: number
  /** Valor entero (percent, count). */
  value?: number
  /** Representación canónica que el modelo puede escribir: `3.450,00 €` · `65%` · `2`. */
  text: string
  label: string
  source: FigureSource
  derivedFrom?: { op: DerivedOp; inputs: string[] }
}

export interface AllowedFigureSet {
  figures: AllowedFigure[]
  keys: ReadonlySet<string>
}

/** Cifra con etiqueta legible, tal y como se envía al modelo (vista compatible de `AllowedFigure`). */
export interface Figure {
  label: string
  value: string
}

/* ------------------------------- extracción ------------------------------ */

const MONEY = /[+\-−]?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?\s?(?:€|euros?\b)|[+\-−]?\d+(?:,\d{1,2})?\s?(?:€|euros?\b)/g
/** Importes con unidad transformada («3,55 mil euros», «2 k€», «1,2 millones €»): nunca permitidos. */
const SCALED = /[+\-−]?\d+(?:[.,]\d+)?\s?(?:mil|k|millones?|mill[oó]n|M)\s?(?:€|euros?\b)/gi
const PERCENT = /[+\-−]?\d+(?:,\d+)?\s?%/g
const COUNT = /\b(\d+)\s+(meses|mes|d[ií]as?|movimientos?|objetivos?|posiciones|posici[oó]n)\b/gi
/** Números sin unidad que merecen comprobación: con separador de miles, o de 4+ dígitos. */
const BARE = /(?<![\d,.:/-])\d{1,3}(?:\.\d{3})+(?:,\d+)?(?![\d,.%€]|\s?(?:€|euros?\b|%))|(?<![\d,.:/-])\d{4,}(?![\d,.%€]|\s?(?:€|euros?\b|%))/g
/** Fechas `YYYY-MM` / `YYYY-MM-DD` y años: nunca son cifras financieras. */
const DATE = /\b\d{4}-\d{2}(?:-\d{2})?\b/g
const YEAR_MIN = 1990
const YEAR_MAX = 2100

/** Clave normalizada de una cifra: `1.300 €` ≡ `1.300,00 €` → `m:1300.00`; `65 %` ≡ `65%` → `p:65`. */
export function figureKey(raw: string): string {
  const s = raw.replace(/\s/g, '').replace('−', '-').replace(/euros?$/i, '€')
  if (s.endsWith('€')) {
    const negative = s.startsWith('-')
    const n = s.replace(/[+\-€]/g, '').replace(/\./g, '').replace(',', '.')
    return `m:${negative ? '-' : ''}${Number(n).toFixed(2)}`
  }
  if (s.endsWith('%')) return `p:${String(Number(s.replace(/[+\-%]/g, '').replace(',', '.')))}`
  return `c:${s}`
}

export interface ExtractedFigure {
  raw: string
  key: string
  kind: FigureKind | 'bare' | 'scaled'
  /** Valor numérico del número desnudo (para licenciarlo contra cifras permitidas). */
  bareValue?: number
}

/** Todas las cifras de un texto, normalizadas: importes, porcentajes, recuentos con unidad y números desnudos. */
export function extractFigures(text: string): ExtractedFigure[] {
  const found: ExtractedFigure[] = []
  const spans: Array<[number, number]> = []
  const take = (m: RegExpMatchArray, f: ExtractedFigure) => {
    const start = m.index ?? 0
    spans.push([start, start + m[0].length])
    found.push(f)
  }
  for (const m of text.matchAll(SCALED)) take(m, { raw: m[0], key: `s:${m[0].replace(/s/g, '')}`, kind: 'scaled' })
  for (const m of text.matchAll(MONEY)) {
    const start = m.index ?? 0
    if (spans.some(([a, b]) => start < b && start + m[0].length > a)) continue
    take(m, { raw: m[0], key: figureKey(m[0]), kind: 'money' })
  }
  for (const m of text.matchAll(PERCENT)) take(m, { raw: m[0], key: figureKey(m[0]), kind: 'percent' })
  for (const m of text.matchAll(COUNT)) take(m, { raw: m[0], key: `c:${m[1]}`, kind: 'count' })
  for (const m of text.matchAll(DATE)) spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length])
  for (const m of text.matchAll(BARE)) {
    const start = m.index ?? 0
    const end = start + m[0].length
    if (spans.some(([a, b]) => start < b && end > a)) continue
    const value = Number(m[0].replace(/\./g, '').replace(',', '.'))
    if (Number.isInteger(value) && value >= YEAR_MIN && value <= YEAR_MAX && /^\d{4}$/.test(m[0])) continue
    found.push({ raw: m[0], key: `b:${value}`, kind: 'bare', bareValue: value })
  }
  return found
}

/* ------------------------------ construcción ----------------------------- */

const money = (label: string, cents: number, source: FigureSource, derivedFrom?: AllowedFigure['derivedFrom']): AllowedFigure => {
  const text = formatCents(cents)
  return { key: figureKey(text), kind: 'money', cents, text, label, source, ...(derivedFrom ? { derivedFrom } : {}) }
}
const percent = (label: string, v: number, source: FigureSource, derivedFrom?: AllowedFigure['derivedFrom']): AllowedFigure => {
  const value = Math.round(v)
  const text = formatPct(value)
  return { key: figureKey(text), kind: 'percent', value, text, label, source, ...(derivedFrom ? { derivedFrom } : {}) }
}
/** Importe permitido con etiqueta y fuente (p. ej. un dato del perfil que el chat puede citar). */
export const moneyFigure = (label: string, cents: number, source: FigureSource): AllowedFigure => money(label, cents, source)
/** Recuento permitido con etiqueta y fuente («18 movimientos»). */
export const countFigure = (label: string, n: number, source: FigureSource): AllowedFigure => count(label, n, source)
const count = (label: string, n: number, source: FigureSource): AllowedFigure => ({ key: `c:${n}`, kind: 'count', value: n, text: String(n), label, source })

export function contextFigures(ctx: FinancialContext): AllowedFigure[] {
  const eur = (label: string, cents: number) => money(label, cents, 'context')
  const pct = (label: string, v: number) => percent(label, v, 'context')
  const num = (label: string, n: number) => count(label, n, 'context')
  const figures: AllowedFigure[] = [
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
    figures.push(num(`Movimientos ${name}`, p.movementCount))
    for (const c of [...p.expensesByCategory, ...p.incomeByCategory]) {
      figures.push(eur(`${c.label} (${name})`, c.cents), pct(`${c.label} sobre el total (${name})`, c.pct))
    }
  }
  if (ctx.flows.incomeChangePct !== null) figures.push(pct('Variación de ingresos', ctx.flows.incomeChangePct))
  if (ctx.flows.expenseChangePct !== null) figures.push(pct('Variación de gastos', ctx.flows.expenseChangePct))
  for (const o of ctx.objectives) {
    figures.push(eur(`Objetivo «${o.name}»: meta`, o.targetCents), eur(`Objetivo «${o.name}»: ahorrado`, o.currentCents), eur(`Objetivo «${o.name}»: restante`, o.remainingCents), pct(`Objetivo «${o.name}»: progreso`, o.progressPct))
    if (o.requiredMonthlyCents !== undefined) figures.push(eur(`Objetivo «${o.name}»: ahorro mensual necesario`, o.requiredMonthlyCents))
    if (o.monthsLeft !== undefined) {
      for (const n of new Set([Math.floor(o.monthsLeft), Math.round(o.monthsLeft), Math.ceil(o.monthsLeft)])) figures.push(num(`Objetivo «${o.name}»: meses restantes`, n))
    }
  }
  for (const p of ctx.investments.positions) {
    figures.push(eur(`Posición «${p.name}»: invertido`, p.investedCents), eur(`Posición «${p.name}»: valor`, p.valueCents), pct(`Posición «${p.name}»: peso en cartera`, p.weightPct))
  }
  figures.push(
    eur('Total invertido (coste)', ctx.investments.totalInvestedCents),
    eur('Total invertido (valor)', ctx.investments.totalValueCents),
    pct('Peso de las inversiones sobre el patrimonio', ctx.investments.shareOfWealthPct),
    num('Movimientos registrados', ctx.quality.movementCount),
    num('Meses con datos', ctx.quality.monthsWithData),
    num('Días con movimientos', ctx.quality.historyDays),
    num('Objetivos', ctx.objectives.length),
    num('Posiciones', ctx.investments.positions.length),
  )
  return dedupe(figures)
}

/** Textos escritos por AXIS en la decisión: sus cifras quedan permitidas por construcción. */
function decisionTexts(d: AxisDecision): string[] {
  return [
    ...d.facts,
    // La interpretación de una señal de mercado es texto de la investigación semanal (overview, notas):
    // sus cifras pueden estar superadas por los indicadores que el job diario refresca. Solo los HECHOS de
    // mercado (indicadores frescos, con fecha) aportan cifras que se pueden presentar como actuales.
    ...d.relevant.flatMap((s) => (s.domain === 'market' ? [s.fact] : [s.fact, s.interpretation])),
    ...(d.recommendation ? [d.recommendation.what, d.recommendation.why] : []),
    ...d.alternatives.map((a) => a.summary),
    ...d.uncertainties.map((u) => u.detail),
  ]
}

function fromExtracted(f: ExtractedFigure, label: string, source: FigureSource): AllowedFigure | null {
  if (f.kind === 'bare' || f.kind === 'scaled') return null
  const n = Number(f.key.slice(2))
  if (f.kind === 'money') return { key: f.key, kind: 'money', cents: Math.round(n * 100), text: f.raw.trim(), label, source }
  if (f.kind === 'percent') return { key: f.key, kind: 'percent', value: n, text: f.raw.trim(), label, source }
  return { key: f.key, kind: 'count', value: n, text: String(n), label, source }
}

export function decisionTextFigures(decision: AxisDecision): AllowedFigure[] {
  return dedupe(decisionTexts(decision).flatMap((t) => extractFigures(t).flatMap((f) => fromExtracted(f, 'Escrito por AXIS en la decisión', 'decision-text') ?? [])))
}

/** Cifras que el usuario ha escrito en su mensaje (puede citárselas tal cual). Los números desnudos no cuentan. */
export function messageFigures(message: string): AllowedFigure[] {
  return dedupe(extractFigures(message).flatMap((f) => fromExtracted(f, `Lo que mencionas: ${f.raw.trim()}`, 'message') ?? []))
}

/**
 * Derivadas: operaciones CERRADAS sobre un importe explícito del mensaje y
 * cifras del contexto, calculadas por AXIS con entradas trazables. Sin
 * importe en el mensaje no hay ninguna derivada.
 */
export function deriveFigures(ctx: FinancialContext, message: string): AllowedFigure[] {
  const amounts = messageFigures(message).filter((f) => f.kind === 'money' && (f.cents ?? 0) > 0)
  if (amounts.length === 0) return []
  const liquid = money('Patrimonio líquido', ctx.wealth.liquidCents, 'context')
  const reserved = money('Reservado en objetivos', ctx.wealth.reservedForObjectivesCents, 'context')
  const savings = money('Ahorro mes actual', ctx.flows.current.savingsCents, 'context')
  const income = money('Ingresos mes actual', ctx.flows.current.incomeCents, 'context')
  const out: AllowedFigure[] = []
  for (const a of amounts) {
    const cents = a.cents ?? 0
    out.push(
      money(`Liquidez si restas ${a.text}`, liquid.cents! - cents, 'derived', { op: 'liquid-minus', inputs: [liquid.key, a.key] }),
      // liquid − reserved − amount: las TRES entradas quedan declaradas (todas son cifras de contexto o del mensaje).
      money(`Líquido libre (sin lo reservado) si restas ${a.text}`, liquid.cents! - reserved.cents! - cents, 'derived', { op: 'free-liquid-minus', inputs: [liquid.key, reserved.key, a.key] }),
      money(`Ahorro del mes si restas ${a.text}`, savings.cents! - cents, 'derived', { op: 'savings-minus', inputs: [savings.key, a.key] }),
    )
    if ((income.cents ?? 0) > 0) {
      out.push(percent(`${a.text} sobre tus ingresos del mes`, (cents / income.cents!) * 100, 'derived', { op: 'amount-over-income', inputs: [a.key, income.key] }))
    }
  }
  return dedupe(out)
}

function dedupe(figures: AllowedFigure[]): AllowedFigure[] {
  const seen = new Set<string>()
  return figures.filter((f) => {
    const k = `${f.label}|${f.key}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Conjunto cerrado de cifras permitidas para una decisión (y, en el chat, para el mensaje del usuario). */
/**
 * Cifras de previsión de una decisión, recalculadas con las mismas funciones
 * que la señal `objectives.forecast` (contexto + perfil aplicado): ingresos
 * previstos, gasto habitual estimado y meses de cada escenario. Sin ingresos
 * recurrentes declarados, ninguna. Siempre con fuente `forecast` y etiqueta
 * «Previsión: …».
 */
export function forecastFigures(decision: AxisDecision): AllowedFigure[] {
  const declared = recurringIncomesOf(decision.profile?.fields)
  if (!declared) return []
  const eur = (label: string, cents: number) => money(`Previsión: ${label}`, cents, 'forecast')
  const num = (label: string, n: number) => count(`Previsión: ${label}`, n, 'forecast')
  const figures: AllowedFigure[] = [eur('ingresos mensuales', declared.monthlyCents)]
  if (declared.incomes.length > 1) for (const r of declared.incomes) figures.push(eur(`ingreso mensual (${r.category})`, r.cents))
  const usual = usualMonthlyExpense(decision.context.flows.closedMonths)
  if (usual !== null) figures.push(eur(`gasto habitual (mediana de ${usualExpenseMonthCount(decision.context.flows.closedMonths)} meses)`, usual))
  for (const f of recurringForecasts(decision.context, decision.profile?.fields)) {
    if (f.allMonths !== 'over-10-years') figures.push(num(`meses hasta «${f.objectiveName}» con toda la previsión`, f.allMonths))
    const b = f.afterExpenses
    if (b.status === 'ok') {
      figures.push(eur(`margen al mes para «${f.objectiveName}» tras el gasto habitual`, b.marginCents))
      if (b.result !== 'over-10-years') figures.push(num(`meses hasta «${f.objectiveName}» tras el gasto habitual`, b.result))
    }
  }
  return dedupe(figures)
}

/**
 * Frases de un texto. Solo corta en un punto (o «!», «?») seguido de espacio o
 * en un salto de línea: el punto de miles («3.500,00 €») no termina una frase.
 * Cortar en cualquier punto partía las cifras de 1.000 € o más («3.» + «500,00 €»),
 * y una previsión así nunca se detectaba presentada como hecho.
 */
export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim() !== '')
}

/** Lo que indica que una frase habla de una previsión y no de dinero que ya existe. */
export const FORECAST_MARKER = /previs|previst|estimad|equival|\bser[ií]an\b|\bquedar[ií]an?\b|supone|si recib/i

/**
 * Una cifra que SOLO existe como previsión (no coincide con ninguna cifra real
 * del contexto) debe ir en una frase que la presente como previsión. «Tus
 * ingresos previstos son 35,00 € al mes» pasa; «Tienes 35,00 € disponibles», no.
 */
export function checkForecastPresentation(text: string, decision: AxisDecision): string[] {
  const real = new Set(contextFigures(decision.context).map((f) => f.key))
  const forecastOnly = new Set(forecastFigures(decision).filter((f) => f.kind === 'money' && !real.has(f.key)).map((f) => f.key))
  if (forecastOnly.size === 0) return []
  const violations: string[] = []
  for (const sentence of splitSentences(text)) {
    if (FORECAST_MARKER.test(sentence)) continue
    for (const f of extractFigures(sentence)) if (f.kind === 'money' && forecastOnly.has(f.key)) violations.push(f.raw.trim())
  }
  return violations
}

export function buildAllowedFigures(decision: AxisDecision, extra: { message?: string } = {}): AllowedFigureSet {
  const figures = [
    ...contextFigures(decision.context),
    ...forecastFigures(decision),
    ...decisionTextFigures(decision),
    ...(extra.message ? [...messageFigures(extra.message), ...deriveFigures(decision.context, extra.message)] : []),
  ]
  return { figures, keys: new Set(figures.map((f) => f.key)) }
}

export interface FigureViolation {
  raw: string
  key: string
  reason: 'not-allowed' | 'bare-number'
}

/** Cifras del texto que no están permitidas. Un número desnudo se licencia si coincide con una cifra permitida. */
export function checkFigures(text: string, set: AllowedFigureSet): FigureViolation[] {
  const violations: FigureViolation[] = []
  for (const f of extractFigures(text)) {
    if (f.kind === 'scaled') {
      violations.push({ raw: f.raw, key: f.key, reason: 'not-allowed' })
    } else if (f.kind === 'bare') {
      const v = f.bareValue ?? NaN
      const licensed = set.figures.some((a) => (a.kind === 'money' ? a.cents === Math.round(v * 100) : a.value === v))
      if (!licensed) violations.push({ raw: f.raw, key: f.key, reason: 'bare-number' })
    } else if (!set.keys.has(f.key)) {
      violations.push({ raw: f.raw, key: f.key, reason: 'not-allowed' })
    }
  }
  return violations
}

/* ----------------------------- compatibilidad ---------------------------- */

/** Cifras con etiqueta que se envían al modelo en la expresión (contexto; sin duplicados de etiqueta+valor). */
export function figuresOf(decision: AxisDecision): Figure[] {
  return [...contextFigures(decision.context), ...forecastFigures(decision)].map((f) => ({ label: f.label, value: f.text }))
}

/** Conjunto normalizado contra el que se valida lo que escribe el modelo (contexto + textos de la decisión). */
export function allowedFigureKeys(decision: AxisDecision): Set<string> {
  return new Set(buildAllowedFigures(decision).keys)
}
