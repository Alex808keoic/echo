/**
 * Validación determinista de la redacción del Weekly Brief, SOLO frente al
 * propio Brief (no necesita el contexto financiero: el servidor no recibe más
 * de lo que recibe el modelo). Si algo falla, no se muestra la redacción.
 *
 *   coverage   cada sección null ⇔ vacía en el Brief; la lectura nombra la fecha de su investigación
 *   figures    toda cifra ∈ cifras del Brief (indicadores actuales, cambios, textos de AXIS);
 *              nunca las de la lectura o los eventos (texto de una investigación, como en 1f047b1);
 *              puntos porcentuales y decimales sin unidad, también; puntos básicos, nunca
 *   dates      toda fecha ∈ fechas del Brief; en «events», solo las de sus eventos
 *   stale      ninguna cifra junto a un indicador sin dato actual
 *   today      «hoy» / «en este momento» no describen datos de mercado
 *   unknown    ni instituciones, índices ni productos que el Brief no menciona
 *   timing     ni momento de mercado, ni «aprovecha», ni predicciones de precios
 *   priority   con prioridad personal, el mercado no se presenta como lo principal
 *   advice     solo el consejo que AXIS decidió (lib/text/advice.ts); compra/venta/inversión, nunca
 *   stance     con recomendación, ningún campo dice que no hace falta actuar
 *   certainty  ninguna certeza indebida (lib/text/certainty.ts)
 *   execution  ninguna afirmación de haber ejecutado una operación
 *   forecast   una cifra prevista no se presenta como dinero real
 */
import { checkAdvice } from '../../text/advice'
import { findCertainty, normalizeForMatching } from '../../text/certainty'
import { checkFigures, extractFigures, FORECAST_MARKER, splitSentences, type AllowedFigure, type AllowedFigureSet } from '../core/figures'
import { EXECUTION_PATTERNS, INACTION_PATTERNS } from '../core/semantic'
import { PHRASING_FIELDS, type WeeklyBriefPhrasing } from './phrasing'
import type { WeeklyBrief } from './weekly'

export type PhrasingInvariant =
  | 'coverage'
  | 'figures'
  | 'dates'
  | 'stale'
  | 'today'
  | 'unknown'
  | 'timing'
  | 'priority'
  | 'advice'
  | 'stance'
  | 'certainty'
  | 'execution'
  | 'forecast'

export interface PhrasingViolation {
  invariant: PhrasingInvariant
  field: (typeof PHRASING_FIELDS)[number]
  detail: string
}

export type PhrasingVerdict = { ok: true } | { ok: false; violations: PhrasingViolation[] }

type Field = PhrasingViolation['field']
const MARKET_FIELDS: ReadonlySet<Field> = new Set(['market', 'changes', 'reading', 'events'])

/* ------------------------------ textos del Brief ------------------------------ */

/** Textos de AXIS (decisión y Brief): licencian cifras. */
function axisTexts(b: WeeklyBrief): string[] {
  const rec = b.conclusion.recommendation
  return [
    b.personal.lead?.fact ?? '',
    b.personal.lead?.interpretation ?? '',
    b.personal.marketRelevance,
    b.conclusion.summary,
    rec?.what ?? '',
    rec?.why ?? '',
    ...b.uncertainties.flatMap((u) => [u.title, u.detail]),
  ].filter(Boolean)
}

const labelsOf = (b: WeeklyBrief) => [...b.market.indicators.map((i) => i.label), ...b.market.notCurrent.map((i) => i.label), ...b.market.changes.map((c) => c.label)]

/** Todo lo que el Brief menciona: licencia nombres (instituciones, índices, productos) y fechas, nunca cifras de mercado. */
function corpusOf(b: WeeklyBrief): string {
  const m = b.market
  return normalizeForMatching(
    [...axisTexts(b), ...labelsOf(b), ...m.indicators.map((i) => i.source), m.reading?.text ?? '', ...m.events.flatMap((e) => [e.title, e.summary, e.source])].join(' \n '),
  )
}

/* --------------------------------- cifras --------------------------------- */

function allowedFrom(text: string, label: string): AllowedFigure[] {
  return extractFigures(text).flatMap((f): AllowedFigure[] => {
    const n = Number(f.key.slice(2))
    if (f.kind === 'money') {
      const cents = Math.round(n * 100)
      // El mismo importe sin signo («6.450,00 € por debajo de cero») dice lo mismo.
      return [cents, -cents].map((c) => ({ key: `m:${(c / 100).toFixed(2)}`, kind: 'money' as const, cents: c, text: f.raw, label, source: 'decision-text' as const }))
    }
    if (f.kind === 'percent' || f.kind === 'count') return [{ key: f.key, kind: f.kind, value: n, text: f.raw, label, source: 'decision-text' }]
    if (f.kind === 'bare' && f.bareValue !== undefined) return [{ key: `c:${f.bareValue}`, kind: 'count', value: f.bareValue, text: f.raw, label, source: 'decision-text' }]
    return []
  })
}

interface FigureRules {
  set: AllowedFigureSet
  /** Valores numéricos permitidos para decimales sin unidad. */
  numbers: Set<number>
  /** Valores absolutos permitidos en puntos porcentuales. */
  pp: Set<number>
  /** Claves de cifras que forman parte de un nombre («Euríbor 12 meses», «IBEX 35»): no son datos. */
  labelKeys: Set<string>
}

function figureRules(b: WeeklyBrief): FigureRules {
  const figures: AllowedFigure[] = [...axisTexts(b).flatMap((t) => allowedFrom(t, 'Texto de AXIS'))]
  const labelFigures = labelsOf(b).flatMap((l) => allowedFrom(l, l))
  figures.push(...labelFigures)
  const numbers = new Set<number>()
  const pp = new Set<number>()
  for (const i of b.market.indicators) {
    numbers.add(i.value)
    figures.push(i.unit === '%' ? { key: `p:${i.value}`, kind: 'percent', value: i.value, text: `${i.value} %`, label: i.label, source: 'context' } : { key: `c:${i.value}`, kind: 'count', value: i.value, text: String(i.value), label: i.label, source: 'context' })
  }
  for (const c of b.market.changes) {
    const v = Math.abs(c.delta)
    numbers.add(v)
    if (c.unit === 'p.p.') pp.add(v)
    else figures.push({ key: `p:${v}`, kind: 'percent', value: v, text: `${v} %`, label: c.label, source: 'context' })
  }
  for (const f of figures) {
    if (f.value !== undefined) numbers.add(f.value)
    if (f.cents !== undefined) numbers.add(Math.abs(f.cents) / 100)
  }
  return { set: { figures, keys: new Set(figures.map((f) => f.key)) }, numbers, pp, labelKeys: new Set(labelFigures.map((f) => f.key)) }
}

const num = (s: string) => Number(s.replace(/[+\-−]/g, '').replace(/\./g, '').replace(',', '.'))
const PP = /[+\-−]?\d+(?:,\d+)?\s?(?:p\.\s?p\.|pp\b|puntos? porcentuales?)/gi
const BASIS_POINTS = /\d+(?:,\d+)?\s?(?:pb\b|p\.\s?b\.|puntos? b[aá]sicos?)/gi
/** Decimal sin unidad («el Euríbor, en 2,3»): solo si coincide con un valor del Brief. */
const BARE_DECIMAL = /(?<![\d.,])[+\-−]?\d+,\d+(?![\d.,]|\s?(?:%|€|euros?\b|p\.|pp\b|puntos?|pb\b))/g

function figureViolations(text: string, rules: FigureRules): string[] {
  const out: string[] = []
  for (const f of checkFigures(text, rules.set)) out.push(`${f.reason === 'bare-number' ? 'número sin unidad no permitido' : 'cifra no permitida'} «${f.raw.trim()}»`)
  for (const m of text.matchAll(PP)) if (!rules.pp.has(num(m[0].replace(/[^\d,.+\-−]/g, '').replace(/\.$/, '')))) out.push(`variación no permitida «${m[0].trim()}»`)
  for (const m of text.matchAll(BASIS_POINTS)) out.push(`unidad transformada «${m[0].trim()}»`)
  for (const m of text.matchAll(BARE_DECIMAL)) if (!rules.numbers.has(num(m[0]))) out.push(`número sin unidad no permitido «${m[0]}»`)
  return out
}

/* --------------------------------- fechas --------------------------------- */

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MONTH = MONTHS.join('|')

interface DateRef {
  y?: number
  m?: number
  d?: number
  raw: string
}

/** Fechas de un texto normalizado: ISO, d/m(/a), «d de mes (de año)», «mes (de) año», mes suelto y año suelto. */
function datesIn(normalized: string): DateRef[] {
  const out: DateRef[] = []
  const spans: Array<[number, number]> = []
  const free = (a: number, b: number) => !spans.some(([x, y]) => a < y && b > x)
  const scan = (re: RegExp, build: (m: RegExpMatchArray) => Omit<DateRef, 'raw'>) => {
    for (const m of normalized.matchAll(re)) {
      const a = m.index ?? 0
      const b = a + m[0].length
      if (!free(a, b)) continue
      spans.push([a, b])
      out.push({ ...build(m), raw: m[0] })
    }
  }
  const month = (s: string) => MONTHS.indexOf(s) + 1
  const year = (s?: string) => (s ? (s.length === 2 ? 2000 + Number(s) : Number(s)) : undefined)
  scan(/\b(\d{4})-(\d{2})(?:-(\d{2}))?\b/g, (m) => ({ y: Number(m[1]), m: Number(m[2]), d: m[3] ? Number(m[3]) : undefined }))
  scan(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/g, (m) => ({ d: Number(m[1]), m: Number(m[2]), y: year(m[3]) }))
  scan(new RegExp(`\\b(\\d{1,2}) de (${MONTH})(?:,? del? (\\d{4}))?`, 'g'), (m) => ({ d: Number(m[1]), m: month(m[2]), y: year(m[3]) }))
  scan(new RegExp(`\\b(${MONTH})(?:,? del?)? (\\d{4})\\b`, 'g'), (m) => ({ m: month(m[1]), y: Number(m[2]) }))
  scan(new RegExp(`\\b(${MONTH})\\b`, 'g'), (m) => ({ m: month(m[1]) }))
  scan(/\b(19\d{2}|20\d{2})\b/g, (m) => ({ y: Number(m[1]) }))
  return out
}

function isoRef(iso: string): DateRef {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return { y, m, d: Number.isNaN(d) ? undefined : d, raw: iso }
}

/** `got` está respaldada por alguna fecha permitida (con la precisión que tenga cada una). */
function licensedDate(got: DateRef, allowed: DateRef[]): boolean {
  return allowed.some((a) => (got.y === undefined || a.y === got.y) && (got.m === undefined || a.m === got.m) && (got.d === undefined || a.d === got.d))
}

function structuredDates(b: WeeklyBrief): DateRef[] {
  const m = b.market
  const isos = [
    m.research?.generatedAt,
    m.research?.coversFrom,
    m.research?.coversTo,
    ...m.indicators.map((i) => i.asOf),
    ...m.notCurrent.map((i) => i.lastAsOf ?? undefined),
    ...m.events.map((e) => e.date),
  ].filter((s): s is string => typeof s === 'string' && /^\d{4}-\d{2}/.test(s))
  return isos.map(isoRef)
}

/* ------------------------------ nombres de mercado ------------------------------ */

/** Grupos de alias: mencionar uno exige que el Brief mencione alguno del grupo. */
const MARKET_NAMES: string[][] = [
  ['bce', 'banco central europeo'],
  ['fed', 'reserva federal'],
  ['banco de inglaterra', 'boe'],
  ['euribor'],
  ['ipc'],
  ['hicp', 'ipca'],
  ['ibex'],
  ['stoxx', 'eurostoxx'],
  ['s&p', 'sp500'],
  ['nasdaq'],
  ['dax'],
  ['cac'],
  ['ftse'],
  ['nikkei'],
  ['dow jones'],
  ['wall street'],
  ['brent', 'petroleo', 'opep'],
]
const PRODUCTS = /\b(etfs?|fondos? indexados?|fondos? de inversion|fondos? cotizados?|acciones (?:de|europeas|americanas|espanolas|cotizadas)|bonos?|letras del tesoro|depositos?|plazo fijo|cripto\w*|bitcoin|ethereum|oro|planes? de pensiones)\b/g

const hasWord = (text: string, w: string) => new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').test(text)

/* ------------------------------ timing y prioridad ------------------------------ */

const TIMING: RegExp[] = [
  /\b(?:buen|mal|mejor|peor) momento (?:para|de)\b/,
  /\baprovech\w*/,
  /\b(?:entrar|salir|entra|sal) (?:en |del? )?(?:el )?mercado\b/,
  /\bespera\w*\b[^.]{0,40}?\b(?:a |para |antes de )?(?:comprar|vender|invertir|entrar|salir)\b/,
  /\bva(?:n)? a (?:subir|bajar|caer|repuntar|recuperarse)\b/,
  /\b(?:subira|bajara|caera|repuntara|se recuperara)n?\b/,
  /\bseguira(?:n)? (?:subiendo|bajando|cayendo)\b/,
  /\b(?:rentabilidad|ganancias?|beneficios?) (?:garantizad|asegurad)\w*/,
]
const MARKET_WORDS = '(?:mercado|bolsa|indices?|tipos|euribor|inflacion|bce|fed)'
const MARKET_FIRST: RegExp[] = [
  new RegExp(`\\b(?:lo (?:mas )?importante|lo prioritario|tu prioridad|la prioridad|lo principal|lo urgente|lo primero)\\b[^.]{0,60}\\b${MARKET_WORDS}\\b`),
  new RegExp(`\\b${MARKET_WORDS}\\b[^.]{0,40}\\b(?:es|son) (?:lo (?:mas )?importante|la prioridad|lo prioritario|lo principal|lo urgente)\\b`),
]
const TODAY = /\b(?:hoy|ahora mismo|en este momento)\b/

/* --------------------------------- validación --------------------------------- */

function* fieldsOf(p: WeeklyBriefPhrasing): Generator<[Field, string]> {
  for (const f of PHRASING_FIELDS) {
    const v = p[f]
    if (typeof v === 'string') yield [f, v]
  }
}

/** Primera palabra significativa del nombre de un indicador («Euríbor 12 meses» → «euribor»). */
const keywordOf = (label: string) => normalizeForMatching(label).split(/[\s·]+/)[0]

export function validateWeeklyBriefPhrasing(brief: WeeklyBrief, p: WeeklyBriefPhrasing): PhrasingVerdict {
  const violations: PhrasingViolation[] = []
  const add = (invariant: PhrasingInvariant, field: Field, detail: string) => violations.push({ invariant, field, detail })
  const m = brief.market

  // coverage: cada sección existe si y solo si el Brief tiene ese contenido.
  const expected: Record<'market' | 'changes' | 'reading' | 'events', boolean> = {
    market: m.status !== 'unavailable',
    changes: m.changes.length > 0,
    reading: m.reading !== null,
    events: m.events.length > 0,
  }
  for (const [field, present] of Object.entries(expected) as Array<[keyof typeof expected, boolean]>) {
    if (present && p[field] === null) add('coverage', field, 'falta una sección que el Brief tiene')
    if (!present && p[field] !== null) add('coverage', field, 'sección sin contenido en el Brief')
  }
  if (m.reading && p.reading && m.research) {
    const research = isoRef(m.research.generatedAt)
    if (!datesIn(normalizeForMatching(p.reading)).some((d) => d.d === research.d && d.m === research.m && (d.y === undefined || d.y === research.y))) {
      add('coverage', 'reading', 'la lectura no nombra la fecha de su investigación')
    }
  }

  const rules = figureRules(brief)
  const corpus = corpusOf(brief)
  const allowedDates = [...structuredDates(brief), ...datesIn(corpus)]
  const eventDates = m.events.map((e) => isoRef(e.date))
  const currentKeywords = new Set(m.indicators.map((i) => keywordOf(i.label)))
  const staleKeywords = [...new Set(m.notCurrent.map((i) => keywordOf(i.label)))].filter((k) => k.length >= 3 && !currentKeywords.has(k))
  const rec = brief.conclusion.recommendation
  const license = { stance: rec ? ('recommend' as const) : ('inform' as const), action: rec?.action, alternatives: [] }
  const entities = { objectives: [], positions: [], categories: [] }

  // forecast: cifras que solo existen en una señal principal de previsión.
  const lead = brief.personal.lead
  const forecastOnly =
    lead?.domain === 'forecast'
      ? (() => {
          const real = new Set([lead.interpretation, brief.conclusion.summary, rec?.what ?? '', rec?.why ?? '', ...brief.uncertainties.map((u) => u.detail)].flatMap((t) => extractFigures(t).map((f) => f.key)))
          return new Set(extractFigures(lead.fact).filter((f) => f.kind === 'money' && !real.has(f.key)).map((f) => f.key))
        })()
      : new Set<string>()

  for (const [field, text] of fieldsOf(p)) {
    const normalized = normalizeForMatching(text)

    for (const detail of figureViolations(text, rules)) add('figures', field, detail)

    for (const d of datesIn(normalized)) {
      const pool = field === 'events' && d.d !== undefined ? eventDates : allowedDates
      if (!licensedDate(d, pool)) add('dates', field, `fecha no respaldada por el Brief «${d.raw}»`)
    }

    for (const sentence of splitSentences(text)) {
      const ns = normalizeForMatching(sentence)
      const hit = staleKeywords.find((k) => hasWord(ns, k))
      if (hit && extractFigures(sentence).some((f) => f.kind !== 'count' && !rules.labelKeys.has(f.key))) add('stale', field, `cifra junto a un indicador sin dato actual (${hit})`)
      if (forecastOnly.size > 0 && !FORECAST_MARKER.test(sentence)) {
        for (const f of extractFigures(sentence)) if (f.kind === 'money' && forecastOnly.has(f.key)) add('forecast', field, `cifra prevista presentada como real «${f.raw.trim()}»`)
      }
    }

    if (MARKET_FIELDS.has(field) && TODAY.test(normalized)) add('today', field, `«${normalized.match(TODAY)?.[0]}» en un dato de mercado`)

    for (const group of MARKET_NAMES) {
      const used = group.find((w) => hasWord(normalized, w))
      if (used && !group.some((w) => hasWord(corpus, w))) add('unknown', field, `nombre de mercado que el Brief no menciona «${used}»`)
    }
    for (const mm of normalized.matchAll(PRODUCTS)) if (!hasWord(corpus, mm[0])) add('unknown', field, `producto que el Brief no menciona «${mm[0]}»`)

    const timing = TIMING.find((re) => re.test(normalized))
    if (timing) add('timing', field, `«${normalized.match(timing)?.[0]}»`)

    if (brief.personal.kind === 'personal-priority') {
      const first = MARKET_FIRST.find((re) => re.test(normalized))
      if (first) add('priority', field, `presenta el mercado como lo principal «${normalized.match(first)?.[0]}»`)
    }

    for (const a of checkAdvice(text, entities, license)) add('advice', field, `consejo no decidido por AXIS: «${a.verb}» (${a.verbClass} → ${a.target.kind})`)

    if (rec) {
      const inaction = INACTION_PATTERNS.find((re) => re.test(text))
      if (inaction) add('stance', field, `AXIS recomienda actuar y el texto dice «${text.match(inaction)?.[0]}»`)
    }

    const certainty = findCertainty(text)
    if (certainty) add('certainty', field, `«${certainty.match}»`)

    const execution = EXECUTION_PATTERNS.find((re) => re.test(text))
    if (execution) add('execution', field, `«${text.match(execution)?.[0]}»`)
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations }
}
