/**
 * Construcción del `MarketContext` reducido que recibe AXIS.
 *
 * Se ejecuta en el dispositivo. Las posiciones del usuario se usan aquí
 * únicamente para decidir qué clases de activo y qué eventos son relevantes;
 * no se copian al contexto ni salen de la app.
 */
import { ageInDays, freshnessOf } from './freshness'
import {
  MARKET_CONTEXT_LIMITS,
  type AssetClassNote,
  type MarketContext,
  type MarketEvent,
  type MarketHistoryEntry,
  type MarketIndicator,
  type MarketResearch,
} from './types'

/** Indicadores que siempre interesan, por orden de prioridad. */
const KEY_INDICATOR_ORDER = ['ecb-dfr', 'euribor-12m', 'ine-ipc', 'ea-hicp', 'ibex', 'stoxx50', 'spx', 'fed-funds', 'ndq']

const IMPACT_RANK: Record<MarketEvent['impact'], number> = { high: 0, medium: 1, low: 2 }

// Marcas diacríticas combinantes (U+0300–U+036F), para comparar sin acentos.
const DIACRITICS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g')

function normalize(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS, '').toLowerCase()
}

/** Clases de activo cuyo alias aparece en el nombre de alguna posición. */
export function matchAssetClasses(assetClasses: AssetClassNote[], positionNames: string[]): AssetClassNote[] {
  const names = positionNames.map(normalize)
  return assetClasses.filter((ac) => ac.aliases.some((alias) => names.some((n) => n.includes(normalize(alias)))))
}

function pickIndicators(indicators: MarketIndicator[]): MarketIndicator[] {
  const byKey = new Map(indicators.map((i) => [i.key, i]))
  const ordered = KEY_INDICATOR_ORDER.flatMap((k) => (byKey.has(k) ? [byKey.get(k) as MarketIndicator] : []))
  const rest = indicators.filter((i) => !KEY_INDICATOR_ORDER.includes(i.key))
  return [...ordered, ...rest].slice(0, MARKET_CONTEXT_LIMITS.indicators)
}

function pickEvents(events: MarketEvent[], relevantKeys: string[]): MarketEvent[] {
  return [...events]
    .sort((a, b) => {
      const ra = a.affects.some((k) => relevantKeys.includes(k)) ? 0 : 1
      const rb = b.affects.some((k) => relevantKeys.includes(k)) ? 0 : 1
      return ra - rb || IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] || b.date.localeCompare(a.date)
    })
    .slice(0, MARKET_CONTEXT_LIMITS.events)
}

export function buildMarketContext(
  research: MarketResearch,
  history: MarketHistoryEntry[],
  positionNames: string[],
  now: Date = new Date(),
): MarketContext {
  const relevant = matchAssetClasses(research.assetClasses, positionNames).slice(0, MARKET_CONTEXT_LIMITS.assetClasses)
  const relevantKeys = relevant.map((a) => a.key)
  return {
    researchId: research.id,
    asOf: research.generatedAt,
    freshness: freshnessOf(research.generatedAt, now),
    ageDays: Math.floor(ageInDays(research.generatedAt, now)),
    coversFrom: research.coversFrom,
    coversTo: research.coversTo,
    overview: research.overview,
    keyIndicators: pickIndicators(research.indicators),
    relevantEvents: pickEvents(research.events, relevantKeys),
    relevantAssetClasses: relevant,
    uncertainties: research.uncertainties.slice(0, 3),
    warnings: research.warnings.slice(0, 3),
    // Nombres cortos y sin repetir: «BCE · Data Portal (DFR)» → «BCE».
    sources: [...new Set(research.sources.map((s) => s.name.split(' · ')[0].trim()))].slice(0, 8),
    history: history.filter((h) => h.id !== research.id).slice(0, MARKET_CONTEXT_LIMITS.history),
  }
}
