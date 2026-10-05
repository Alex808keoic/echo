/**
 * Modelo del Market Research Engine.
 *
 * `MarketResearch` es lo que publica el job (rama `market-data`); la app lo
 * cachea en Dexie. `MarketContext` es la vista reducida y personalizada
 * localmente que recibe AXIS. Ninguno contiene datos del usuario.
 */

export type Freshness = 'fresh' | 'aging' | 'stale'

export type IndicatorGroup = 'index' | 'rate' | 'inflation'

export interface MarketIndicator {
  /** Clave estable: 'spx', 'ecb-dfr', 'ine-ipc'… */
  key: string
  label: string
  group: IndicatorGroup
  value: number | null
  unit: '%' | 'pts'
  /**
   * Fecha de observación del dato: día `YYYY-MM-DD` o periodo `YYYY-MM`. En
   * tipos oficiales, la fecha desde la que el tipo está en vigor.
   */
  asOf: string
  /** Variación % respecto a la observación anterior disponible, cuando se conoce. */
  changePct: number | null
  source: string
  /**
   * Estado del dato cuando la fuente lo marca como no definitivo: `advance`
   * (INE «Avance»), `estimated` (Eurostat `e`, estimación flash) o
   * `provisional`. Ausente: la fuente no lo marca (no afirma que sea definitivo).
   */
  status?: IndicatorStatus
  /** Cuándo lo descargó el job (ISO). Ausente en datos anteriores a este campo. */
  fetchedAt?: string
  /** Cuándo lo publicó o actualizó la fuente (ISO), solo si la fuente lo declara. */
  publishedAt?: string
}

export type IndicatorStatus = 'advance' | 'estimated' | 'provisional'

/**
 * Frescura de un indicador concreto (no de la investigación): `fresh` se
 * puede interpretar como situación actual; `stale` es antiguo; `unknown` no
 * tiene fecha o valor suficientes para saberlo. Ver `indicatorFreshness`.
 */
export type IndicatorFreshness = 'fresh' | 'stale' | 'unknown'

export interface MarketEvent {
  date: string
  title: string
  summary: string
  impact: 'high' | 'medium' | 'low'
  source: string
  /** Claves de `assetClasses` afectadas. */
  affects: string[]
}

export interface MarketTrend {
  title: string
  summary: string
  horizon: 'weeks' | 'months' | 'years'
  confidence: 'alta' | 'media' | 'baja'
}

export interface AssetClassNote {
  /** 'equity-global', 'equity-europe', 'bonds-gov', 'bonds-corp', 'cash', 'gold', 'crypto', 'real-estate' */
  key: string
  label: string
  /** Palabras que identifican esta clase en el nombre de una posición del usuario. */
  aliases: string[]
  note: string
  stance: 'neutral' | 'caution' | 'watch'
}

export interface MarketSource {
  name: string
  url: string
  retrievedAt: string
  type: 'official' | 'data' | 'news'
}

export interface MarketResearch {
  /** 'YYYY-Www' */
  id: string
  kind: 'deep'
  /** ISO con hora (UTC). */
  generatedAt: string
  coversFrom: string
  coversTo: string
  region: 'eurozone'
  overview: string
  indicators: MarketIndicator[]
  events: MarketEvent[]
  trends: MarketTrend[]
  assetClasses: AssetClassNote[]
  uncertainties: string[]
  warnings: string[]
  sources: MarketSource[]
  /** Fuentes que fallaron durante la recopilación. */
  failedSources: string[]
  provider: { id: string; model?: string } | null
  budget: { monthCalls: number; monthLimit: number }
}

/** Resumen compacto de una investigación anterior (history.json). */
export interface MarketHistoryEntry {
  id: string
  generatedAt: string
  overview: string
}

/** Vista reducida para AXIS. Personalizada en el dispositivo; nunca sale de él como tal. */
export interface MarketContext {
  researchId: string
  asOf: string
  freshness: Freshness
  ageDays: number
  coversFrom: string
  coversTo: string
  overview: string
  keyIndicators: MarketIndicator[]
  relevantEvents: MarketEvent[]
  relevantAssetClasses: AssetClassNote[]
  uncertainties: string[]
  warnings: string[]
  sources: string[]
  history: MarketHistoryEntry[]
}

export const MARKET_CONTEXT_LIMITS = {
  indicators: 6,
  events: 3,
  history: 4,
  assetClasses: 4,
} as const
