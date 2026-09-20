/**
 * Validación de `MarketResearch`: forma, longitudes, textos limpios y, sobre
 * todo, rechazo de lenguaje que presente predicciones como certezas. Es la
 * única puerta entre el proveedor (o un archivo descargado) y Finax.
 */
import { findCertainty, type CertaintyHit } from '../text/certainty'
import type {
  AssetClassNote,
  MarketEvent,
  MarketHistoryEntry,
  MarketIndicator,
  MarketResearch,
  MarketSource,
  MarketTrend,
} from './types'

export class MarketValidationError extends Error {
  constructor(message: string) {
    super(`Market: ${message}`)
    this.name = 'MarketValidationError'
  }
}

const MAX_TEXT = 800
const MAX_LIST = 12
const CONTROL_CHARS = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`, 'g')

/**
 * Certeza sobre el futuro. Una investigación describe lo que ha pasado y lo
 * que es incierto; nunca lo que «va a» pasar. El detector es el compartido
 * con AXIS (`lib/text/certainty.ts`): por cláusulas y con negación, para que
 * «no podemos garantizar…» siga siendo válido.
 */
export function hasCertaintyLanguage(text: string): CertaintyHit | null {
  return findCertainty(text)
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function text(v: unknown, field: string, { optional = false, max = MAX_TEXT } = {}): string {
  if (v === undefined || v === null) {
    if (optional) return ''
    throw new MarketValidationError(`falta «${field}»`)
  }
  if (typeof v !== 'string') throw new MarketValidationError(`«${field}» debe ser texto`)
  const clean = v.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim()
  if (!optional && clean.length === 0) throw new MarketValidationError(`«${field}» está vacío`)
  const certainty = hasCertaintyLanguage(clean)
  if (certainty) throw new MarketValidationError(`«${field}» presenta una predicción como certeza («${certainty.match}»)`)
  return clean.slice(0, max)
}

function list<T>(v: unknown, field: string, item: (x: unknown, i: number) => T, max = MAX_LIST): T[] {
  if (v === undefined) return []
  if (!Array.isArray(v)) throw new MarketValidationError(`«${field}» debe ser una lista`)
  return v.slice(0, max).map(item)
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    throw new MarketValidationError(`«${field}» no admite ${JSON.stringify(v)}`)
  }
  return v as T
}

function isoDate(v: unknown, field: string): string {
  const s = text(v, field, { max: 32 })
  if (Number.isNaN(Date.parse(s))) throw new MarketValidationError(`«${field}» no es una fecha`)
  return s
}

function numberOrNull(v: unknown, field: string): number | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new MarketValidationError(`«${field}» no es un número`)
  return v
}

export function parseIndicator(v: unknown, i = 0): MarketIndicator {
  if (!isRecord(v)) throw new MarketValidationError(`indicador ${i} no válido`)
  return {
    key: text(v.key, `indicators[${i}].key`, { max: 40 }),
    label: text(v.label, `indicators[${i}].label`, { max: 80 }),
    group: oneOf(v.group, ['index', 'rate', 'inflation'] as const, `indicators[${i}].group`),
    value: numberOrNull(v.value, `indicators[${i}].value`),
    unit: oneOf(v.unit, ['%', 'pts'] as const, `indicators[${i}].unit`),
    asOf: text(v.asOf, `indicators[${i}].asOf`, { max: 16 }),
    changePct: numberOrNull(v.changePct, `indicators[${i}].changePct`),
    source: text(v.source, `indicators[${i}].source`, { max: 80 }),
  }
}

export function parseEvent(v: unknown, i = 0): MarketEvent {
  if (!isRecord(v)) throw new MarketValidationError(`evento ${i} no válido`)
  return {
    date: isoDate(v.date, `events[${i}].date`),
    title: text(v.title, `events[${i}].title`, { max: 160 }),
    summary: text(v.summary, `events[${i}].summary`),
    impact: oneOf(v.impact, ['high', 'medium', 'low'] as const, `events[${i}].impact`),
    source: text(v.source, `events[${i}].source`, { max: 80 }),
    affects: list(v.affects, `events[${i}].affects`, (a, j) => text(a, `events[${i}].affects[${j}]`, { max: 40 })),
  }
}

export function parseTrend(v: unknown, i = 0): MarketTrend {
  if (!isRecord(v)) throw new MarketValidationError(`tendencia ${i} no válida`)
  return {
    title: text(v.title, `trends[${i}].title`, { max: 160 }),
    summary: text(v.summary, `trends[${i}].summary`),
    horizon: oneOf(v.horizon, ['weeks', 'months', 'years'] as const, `trends[${i}].horizon`),
    confidence: oneOf(v.confidence, ['alta', 'media', 'baja'] as const, `trends[${i}].confidence`),
  }
}

export function parseAssetClass(v: unknown, i = 0): AssetClassNote {
  if (!isRecord(v)) throw new MarketValidationError(`clase de activo ${i} no válida`)
  return {
    key: text(v.key, `assetClasses[${i}].key`, { max: 40 }),
    label: text(v.label, `assetClasses[${i}].label`, { max: 80 }),
    aliases: list(v.aliases, `assetClasses[${i}].aliases`, (a, j) => text(a, `assetClasses[${i}].aliases[${j}]`, { max: 40 }).toLowerCase(), 20),
    note: text(v.note, `assetClasses[${i}].note`),
    stance: oneOf(v.stance, ['neutral', 'caution', 'watch'] as const, `assetClasses[${i}].stance`),
  }
}

function parseSource(v: unknown, i: number): MarketSource {
  if (!isRecord(v)) throw new MarketValidationError(`fuente ${i} no válida`)
  const url = text(v.url, `sources[${i}].url`, { max: 300 })
  if (!/^https:\/\//.test(url)) throw new MarketValidationError(`sources[${i}].url debe ser https`)
  return {
    name: text(v.name, `sources[${i}].name`, { max: 80 }),
    url,
    retrievedAt: isoDate(v.retrievedAt, `sources[${i}].retrievedAt`),
    type: oneOf(v.type, ['official', 'data', 'news'] as const, `sources[${i}].type`),
  }
}

/** Convierte una salida desconocida en un `MarketResearch` seguro o lanza. */
export function parseMarketResearch(input: unknown): MarketResearch {
  if (!isRecord(input)) throw new MarketValidationError('la investigación no es un objeto')
  const id = text(input.id, 'id', { max: 24 })
  if (!/^\d{4}-W\d{2}(-\d+)?$/.test(id)) throw new MarketValidationError('«id» debe ser YYYY-Www')
  const sources = list(input.sources, 'sources', parseSource, 30)
  if (sources.length === 0) throw new MarketValidationError('sin fuentes')
  const provider = isRecord(input.provider)
    ? { id: text(input.provider.id, 'provider.id', { max: 60 }), ...(input.provider.model ? { model: text(input.provider.model, 'provider.model', { max: 60 }) } : {}) }
    : null
  const budget = isRecord(input.budget) ? input.budget : {}
  return {
    id,
    kind: 'deep',
    generatedAt: isoDate(input.generatedAt, 'generatedAt'),
    coversFrom: isoDate(input.coversFrom, 'coversFrom'),
    coversTo: isoDate(input.coversTo, 'coversTo'),
    region: 'eurozone',
    overview: text(input.overview, 'overview', { max: 1200 }),
    indicators: list(input.indicators, 'indicators', parseIndicator, 20),
    events: list(input.events, 'events', parseEvent),
    trends: list(input.trends, 'trends', parseTrend, 8),
    assetClasses: list(input.assetClasses, 'assetClasses', parseAssetClass, 10),
    uncertainties: list(input.uncertainties, 'uncertainties', (u, i) => text(u, `uncertainties[${i}]`)),
    warnings: list(input.warnings, 'warnings', (w, i) => text(w, `warnings[${i}]`)),
    sources,
    failedSources: list(input.failedSources, 'failedSources', (f, i) => text(f, `failedSources[${i}]`, { max: 80 }), 20),
    provider,
    budget: {
      monthCalls: typeof budget.monthCalls === 'number' ? budget.monthCalls : 0,
      monthLimit: typeof budget.monthLimit === 'number' ? budget.monthLimit : 0,
    },
  }
}

export function parseMarketHistory(input: unknown): MarketHistoryEntry[] {
  if (!Array.isArray(input)) throw new MarketValidationError('history no es una lista')
  return input.slice(0, MAX_LIST).map((v, i) => {
    if (!isRecord(v)) throw new MarketValidationError(`history[${i}] no válido`)
    return {
      id: text(v.id, `history[${i}].id`, { max: 24 }),
      generatedAt: isoDate(v.generatedAt, `history[${i}].generatedAt`),
      overview: text(v.overview, `history[${i}].overview`, { max: 600 }),
    }
  })
}
