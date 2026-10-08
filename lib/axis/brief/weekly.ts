/**
 * Weekly Market Brief (fase 1): resumen DETERMINISTA y local de qué ha pasado
 * en el mercado y qué significa para el usuario. Es una capa de presentación
 * sobre lo que Finax ya sabe: no decide nada.
 *
 *   decide()            decide (reglas de lib/axis/rules, con su prioridad)
 *   buildWeeklyBrief()  organiza y explica esa decisión junto al mercado
 *
 * - Mercado: los `keyIndicators` del `MarketContext` (mismo orden y misma
 *   frescura que las reglas de AXIS). Solo los `fresh` cuentan como dato
 *   actual; los demás se nombran sin valor. La lectura de la investigación va
 *   fechada y solo si no está desactualizada. Eventos: solo con investigación
 *   reciente y de los últimos 7 días respecto a `now`.
 * - «Qué ha cambiado»: solo `changePct` de cada indicador actual, frente a su
 *   dato anterior (puntos porcentuales en tipos e inflación; % en índices).
 *   Nunca comparando lecturas de investigaciones anteriores.
 * - «Qué significa para ti» y la conclusión: los de la decisión (señal
 *   principal, recomendación y la conclusión de `compose`), nunca nuevos.
 *
 * Pura: sin Dexie, red ni reloj (la fecha llega en `now`). No necesita
 * conversación, movimientos individuales ni memorias.
 */
import { render } from '../compose'
import { LOCAL_RULES_ENGINE_INFO } from '../local-engine'
import type { AxisDecision, AxisUncertainty, DecidedRecommendation, MarketContext, Signal } from '../types'
import type { ContextIndicator, Freshness, IndicatorFreshness, MarketEvent } from '../../market/types'

/** Indicadores actuales que muestra el Brief (como el hecho de mercado de AXIS). */
export const BRIEF_MAX_INDICATORS = 4
/** Antigüedad máxima de un evento, en días, respecto a `now`. */
export const BRIEF_EVENT_MAX_DAYS = 7

const DAY_MS = 86_400_000

/**
 * Estado del mercado en el Brief:
 *   unavailable      no hay contexto de mercado
 *   no-current-data  ningún indicador actual (con o sin lectura fechada)
 *   facts-only       investigación desactualizada: solo indicadores actuales, sin lectura ni eventos
 *   partial          investigación vigente, pero algún indicador clave sin dato actual
 *   complete         investigación vigente y todos los indicadores clave actuales
 */
export type BriefMarketStatus = 'unavailable' | 'no-current-data' | 'facts-only' | 'partial' | 'complete'

export interface BriefIndicator {
  key: string
  label: string
  value: number
  unit: '%' | 'pts'
  /** Fecha del dato (día o periodo), no la de la investigación. */
  asOf: string
  source: string
  /** Cuándo lo descargó el job, si se sabe. */
  fetchedAt?: string
  /** Estado que marca la fuente (avance, estimación, provisional). */
  status?: ContextIndicator['status']
}

/** Variación determinista de un indicador actual frente a su dato anterior. */
export interface BriefChange {
  key: string
  label: string
  /** Puntos porcentuales en tipos e inflación; % en índices. 0 = sin cambios. */
  delta: number
  unit: 'p.p.' | '%'
}

export interface BriefNotCurrent {
  key: string
  label: string
  freshness: Exclude<IndicatorFreshness, 'fresh'>
  /** Fecha del último dato (solo si es antiguo; `null` si no hay fecha fiable). */
  lastAsOf: string | null
}

export interface BriefMarket {
  status: BriefMarketStatus
  /** Investigación semanal de la que procede la lectura. */
  research: { id: string; generatedAt: string; freshness: Freshness; ageDays: number; coversFrom: string; coversTo: string } | null
  indicators: BriefIndicator[]
  notCurrent: BriefNotCurrent[]
  changes: BriefChange[]
  /** Lectura cualitativa de la investigación, fechada. `null` si está desactualizada o no existe. */
  reading: { text: string; researchGeneratedAt: string; aging: boolean } | null
  events: Array<Pick<MarketEvent, 'date' | 'title' | 'summary' | 'source' | 'impact'>>
}

/**
 * Cómo se relaciona el mercado con la decisión (solo presentación):
 *   personal-priority  la recomendación viene de tu situación personal: el mercado no la cambia
 *   market-caution     la recomendación es la prudencia de mercado de AXIS (mantener, revisar)
 *   no-action          AXIS no recomienda actuar: el mercado es contexto
 *   insufficient-data  no hay datos personales suficientes para relacionarlos
 */
export type BriefImplicationKind = 'personal-priority' | 'market-caution' | 'no-action' | 'insufficient-data'

export interface WeeklyBrief {
  /** Cuándo se construye el Brief (`now`). Distinto de las fechas de los datos. */
  generatedAt: string
  market: BriefMarket
  personal: {
    kind: BriefImplicationKind
    /** Señal principal de la decisión (su hecho e interpretación). */
    lead: Pick<Signal, 'id' | 'domain' | 'priority' | 'fact' | 'interpretation'> | null
    /** Frase fija según `kind`: qué papel tiene el mercado en tu caso. */
    marketRelevance: string
  }
  conclusion: {
    /** La conclusión de AXIS para esta decisión (la misma que el análisis). */
    summary: string
    /** La recomendación de la decisión, sin cambios; `null` si AXIS no recomienda actuar. */
    recommendation: DecidedRecommendation | null
  }
  uncertainties: AxisUncertainty[]
}

const MARKET_RELEVANCE: Record<BriefImplicationKind, string> = {
  'personal-priority': 'El contexto de mercado no cambia tu prioridad: viene de tu situación personal.',
  'market-caution': 'La única lectura de mercado que afecta a tu caso es de prudencia: mantener y revisar, no comprar ni vender.',
  'no-action': 'Es contexto, no una señal para comprar o vender: no hace falta actuar por el mercado.',
  'insufficient-data': 'Sin datos suficientes de tus finanzas, el mercado no permite sacar conclusiones para ti.',
}

const isCurrent = (i: ContextIndicator) => i.freshness === 'fresh'

function toBriefIndicator(i: ContextIndicator): BriefIndicator {
  return {
    key: i.key,
    label: i.label,
    value: i.value as number,
    unit: i.unit,
    asOf: i.asOf,
    source: i.source,
    ...(i.fetchedAt ? { fetchedAt: i.fetchedAt } : {}),
    ...(i.status ? { status: i.status } : {}),
  }
}

/**
 * Eventos de una investigación vigente cuya propia fecha (día de calendario,
 * UTC) cae entre hoy y `BRIEF_EVENT_MAX_DAYS` días antes. Fechas inválidas o
 * futuras, fuera.
 */
function recentEvents(market: MarketContext, now: Date): BriefMarket['events'] {
  if (market.freshness === 'stale') return []
  const today = Date.parse(now.toISOString().slice(0, 10))
  return market.relevantEvents
    .filter((e) => {
      const day = Date.parse(e.date.slice(0, 10))
      return !Number.isNaN(day) && day <= today && today - day <= BRIEF_EVENT_MAX_DAYS * DAY_MS
    })
    .map(({ date, title, summary, source, impact }) => ({ date, title, summary, source, impact }))
}

function buildMarket(market: MarketContext | null, now: Date): BriefMarket {
  if (!market) return { status: 'unavailable', research: null, indicators: [], notCurrent: [], changes: [], reading: null, events: [] }
  const current = market.keyIndicators.filter((i) => isCurrent(i) && i.value !== null).slice(0, BRIEF_MAX_INDICATORS)
  const notCurrent = market.keyIndicators
    .filter((i) => !isCurrent(i))
    .map((i): BriefNotCurrent => ({ key: i.key, label: i.label, freshness: i.freshness === 'stale' ? 'stale' : 'unknown', lastAsOf: i.freshness === 'stale' ? i.asOf : null }))
  const stale = market.freshness === 'stale'
  const status: BriefMarketStatus = current.length === 0 ? 'no-current-data' : stale ? 'facts-only' : notCurrent.length > 0 ? 'partial' : 'complete'
  return {
    status,
    research: { id: market.researchId, generatedAt: market.asOf, freshness: market.freshness, ageDays: market.ageDays, coversFrom: market.coversFrom, coversTo: market.coversTo },
    indicators: current.map(toBriefIndicator),
    notCurrent,
    changes: current
      .filter((i) => i.changePct !== null)
      .map((i) => ({ key: i.key, label: i.label, delta: i.changePct as number, unit: i.group === 'index' ? '%' : 'p.p.' })),
    reading: stale || !market.overview ? null : { text: market.overview, researchGeneratedAt: market.asOf, aging: market.freshness === 'aging' },
    events: recentEvents(market, now),
  }
}

function implicationKind(decision: AxisDecision): BriefImplicationKind {
  if (decision.level === 'none') return 'insufficient-data'
  if (!decision.recommendation) return 'no-action'
  // La recomendación de la decisión es la de la primera señal que recomienda: su dominio dice de dónde viene.
  const source = decision.signals.find((s) => s.recommendation === decision.recommendation)
  return source?.domain === 'market' ? 'market-caution' : 'personal-priority'
}

function marketUncertainties(m: BriefMarket): AxisUncertainty[] {
  const out: AxisUncertainty[] = []
  if (m.status === 'unavailable') {
    out.push({ title: 'Sin información de mercado', detail: 'No hay una investigación de mercado disponible en este dispositivo.' })
    return out
  }
  const date = m.research?.generatedAt.slice(0, 10)
  if (m.research?.freshness === 'stale') {
    out.push({ title: 'Sin lectura de mercado reciente', detail: `La última investigación es del ${date}: solo se usan los indicadores con dato actual.` })
  } else if (m.research?.freshness === 'aging') {
    out.push({ title: 'Lectura de mercado con algunos días', detail: `La lectura es de la investigación del ${date} y puede no reflejar datos publicados después.` })
  }
  if (m.notCurrent.length > 0) {
    const names = m.notCurrent.map((i) => (i.lastAsOf ? `${i.label} (último dato de ${i.lastAsOf})` : `${i.label} (sin fecha fiable)`))
    out.push({ title: 'Indicadores sin dato actual', detail: `Sin dato actual: ${names.join(', ')}.` })
  }
  if (m.indicators.length === 0) out.push({ title: 'Sin datos de mercado actuales', detail: 'Ningún indicador tiene un dato lo bastante reciente para describir la situación actual.' })
  return out
}

/** Une incertidumbres sin repetir título (las de la decisión primero). */
function mergeUncertainties(...groups: AxisUncertainty[][]): AxisUncertainty[] {
  const seen = new Set<string>()
  return groups.flat().filter((u) => (seen.has(u.title) ? false : (seen.add(u.title), true)))
}

/**
 * Construye el Brief. `decision` es la de `decide()` con el MISMO `market`
 * (y el mismo instante) que se pasa aquí.
 */
export function buildWeeklyBrief(decision: AxisDecision, market: MarketContext | null, now: Date): WeeklyBrief {
  const briefMarket = buildMarket(market, now)
  const kind = implicationKind(decision)
  const rendered = render(decision, LOCAL_RULES_ENGINE_INFO, now)
  const summary = rendered.status === 'analysis' ? rendered.analysis.conclusion.summary : rendered.message
  const lead = decision.lead
  return {
    generatedAt: now.toISOString(),
    market: briefMarket,
    personal: {
      kind,
      lead: lead ? { id: lead.id, domain: lead.domain, priority: lead.priority, fact: lead.fact, interpretation: lead.interpretation } : null,
      marketRelevance: MARKET_RELEVANCE[kind],
    },
    conclusion: { summary, recommendation: decision.recommendation },
    // Las de calidad de datos («Sin mes anterior», «Histórico corto»…) ya vienen en la decisión; con
    // `level none` la decisión no trae ninguna y se dice explícitamente.
    uncertainties: mergeUncertainties(
      decision.level === 'none' ? [{ title: 'Sin datos personales suficientes', detail: 'Todavía no hay datos de tus finanzas para relacionar el mercado con tu situación.' }] : decision.uncertainties,
      marketUncertainties(briefMarket),
    ),
  }
}
