/**
 * SOLO SERVIDOR. Búsqueda de mercado para el chat de AXIS (parte 5b).
 *
 * Cuando el usuario pregunta por un activo o un tema («¿invierto en oro?»,
 * «¿cómo están los depósitos?»), AXIS puede pedir esta consulta. Reúne, en el
 * momento y sin coste ni claves:
 *
 *   - titulares recientes (≤ 30 días) de feeds oficiales (BCE, Fed, Banco de
 *     España) que mencionan el tema, como mucho 5, con fuente, fecha y enlace;
 *   - de la investigación de mercado de Finax (rama pública), la nota de la
 *     clase de activo y los eventos del tema, solo si no está desactualizada.
 *
 * Es CONTEXTO fechado, nunca una recomendación: el resultado lo dice, la
 * validación del chat sigue bloqueando productos y timing, y sus cifras no se
 * pueden citar (son texto de terceros, como la lectura del Weekly Brief).
 * Cada fuente tiene su plazo; si falla, se omite.
 */
import { formatShortDate } from '../dates'
import { freshnessOf } from './freshness'
import { parseRSS, type Headline } from './rss'
import { parseMarketResearch } from './validate'
import type { MarketResearch } from './types'

export const MARKET_FEEDS = [
  { name: 'BCE · prensa', url: 'https://www.ecb.europa.eu/rss/press.html' },
  { name: 'Fed · prensa', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { name: 'Banco de España · noticias', url: 'https://www.bde.es/wbe/es/inicio/rss/rss-noticias/' },
] as const

export const SEARCH_LIMITS = Object.freeze({ MAX_HEADLINES: 5, MAX_AGE_DAYS: 30, MAX_EVENTS: 3, TIMEOUT_MS: 4_000, MAX_TEXT: 220 })

/** Sinónimos: el usuario escribe en español; los feeds de la Fed y el BCE, a menudo en inglés. */
const SYNONYMS: Record<string, string[]> = {
  oro: ['oro', 'gold'],
  plata: ['plata', 'silver'],
  deposito: ['deposito', 'depositos', 'plazo fijo', 'deposit', 'deposits'],
  tipos: ['tipos de interes', 'tipo de interes', 'interest rate', 'interest rates', 'policy rate', 'tipos'],
  inflacion: ['inflacion', 'ipc', 'hicp', 'inflation', 'prices'],
  hipoteca: ['hipoteca', 'hipotecas', 'euribor', 'mortgage'],
  bolsa: ['bolsa', 'acciones', 'renta variable', 'equity', 'stock', 'ibex', 'stoxx'],
  bonos: ['bono', 'bonos', 'renta fija', 'bond', 'bonds', 'letras del tesoro'],
  cripto: ['bitcoin', 'cripto', 'criptomonedas', 'crypto'],
  empleo: ['empleo', 'paro', 'employment', 'labor'],
}
const STOPWORDS = new Set(['que', 'como', 'estan', 'esta', 'los', 'las', 'del', 'para', 'con', 'por', 'una', 'uno', 'invertir', 'invierto', 'recomiendas', 'merece', 'pena', 'actual', 'actuales', 'ahora', 'hoy', 'sobre'])

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Términos de búsqueda: las palabras del tema y sus sinónimos. */
export function searchTerms(text: string): string[] {
  const words = fold(text)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  const terms = new Set<string>()
  for (const w of words) {
    terms.add(w)
    for (const [key, list] of Object.entries(SYNONYMS)) if (key === w || list.some((s) => s === w || s.startsWith(`${w} `))) list.forEach((s) => terms.add(s))
  }
  return [...terms]
}

const mentions = (text: string, terms: string[]) => {
  const t = fold(text)
  return terms.some((term) => new RegExp(`(^|[^a-z0-9ñ])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9ñ])`).test(t))
}
const short = (s: string) => (s.length > SEARCH_LIMITS.MAX_TEXT ? `${s.slice(0, SEARCH_LIMITS.MAX_TEXT - 1)}…` : s)

export interface MarketSearchDeps {
  now: Date
  fetchImpl?: typeof fetch
  /** URL de la rama de datos pública (latest.json). Sin ella, solo titulares. */
  dataUrl?: string
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEARCH_LIMITS.TIMEOUT_MS)
  try {
    return await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, application/json, text/xml' }, cache: 'no-store' })
  } finally {
    clearTimeout(timer)
  }
}

async function headlines(fetchImpl: typeof fetch, now: Date): Promise<Headline[]> {
  const settled = await Promise.allSettled(
    MARKET_FEEDS.map(async (f) => {
      const res = await fetchWithTimeout(fetchImpl, f.url)
      if (!res.ok) throw new Error(`${f.name} ${res.status}`)
      return parseRSS(await res.text(), f.name, 30)
    }),
  )
  const oldest = now.getTime() - SEARCH_LIMITS.MAX_AGE_DAYS * 86_400_000
  return settled
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((h) => h.title && h.publishedAt && Date.parse(h.publishedAt) >= oldest && Date.parse(h.publishedAt) <= now.getTime())
}

async function research(fetchImpl: typeof fetch, dataUrl: string | undefined): Promise<MarketResearch | null> {
  if (!dataUrl) return null
  try {
    const res = await fetchWithTimeout(fetchImpl, `${dataUrl.replace(/\/$/, '')}/latest.json`)
    return res.ok ? parseMarketResearch(await res.json()) : null
  } catch {
    return null
  }
}

/** Resultado de `buscar_mercado`, ya resumido y fechado (forma de `ChatToolResult.resultado`). */
export async function searchMarket(text: string, { now, fetchImpl = fetch, dataUrl }: MarketSearchDeps): Promise<Record<string, unknown>> {
  const terms = searchTerms(text)
  const [found, latest] = await Promise.all([headlines(fetchImpl, now), research(fetchImpl, dataUrl)])
  const matching = found
    .filter((h) => mentions(h.title, terms))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, SEARCH_LIMITS.MAX_HEADLINES)
    .map((h) => ({ fecha: formatShortDate(h.publishedAt.slice(0, 10)), fuente: h.source, titular: short(h.title), ...(h.link ? { enlace: h.link } : {}) }))

  // La investigación solo cuenta si no está desactualizada (misma regla que el resto de AXIS).
  const freshness = latest ? freshnessOf(latest.generatedAt, now) : null
  const usable = latest && freshness !== 'stale' ? latest : null
  const notes = usable ? usable.assetClasses.filter((a) => mentions([a.key, a.label, ...a.aliases].join(' '), terms)).map((a) => ({ clase: a.label, nota: short(a.note) })) : []
  const events = usable
    ? usable.events
        .filter((e) => mentions(`${e.title} ${e.summary}`, terms))
        .slice(0, SEARCH_LIMITS.MAX_EVENTS)
        .map((e) => ({ fecha: formatShortDate(e.date.slice(0, 10)), titulo: short(e.title), resumen: short(e.summary), fuente: e.source }))
    : []

  return {
    tema: short(text),
    titulares: matching,
    ...(usable ? { investigacion_de_finax: { fecha: formatShortDate(usable.generatedAt.slice(0, 10)), frescura: freshness, notas: notes, eventos: events } } : {}),
    hay_informacion: matching.length > 0 || notes.length > 0 || events.length > 0,
    como_usarlo:
      'Es contexto público y fechado, no una recomendación. Cuéntalo con su fecha y su fuente, sin citar cifras de los titulares ni de las notas. Nunca lo conviertas en comprar, vender o esperar para hacerlo, ni nombres productos. Si no hay información, dilo con naturalidad (las fuentes son oficiales: BCE, Fed, Banco de España y la investigación de Finax) y vuelve a lo que el usuario sí controla: su plan.',
  }
}
