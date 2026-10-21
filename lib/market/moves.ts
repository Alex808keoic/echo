/**
 * Movimientos fuertes de la bolsa en el último mes, para decirte que tu plan
 * no cambia. Puro.
 *
 * Se compara cada índice de la investigación actual con el mismo índice en
 * una investigación de hace unas 4 semanas (`MarketBaseline`, descargada de
 * `history/<id>.json`). public/sw.js repite esta regla para la notificación
 * con la app cerrada: cambiarla en los dos sitios. Solo cuenta si el dato actual está vigente y entre
 * las dos observaciones hay entre 3 y 7 semanas: nunca se compara un dato
 * con otro de una fecha que no toca. No predice nada: describe lo que ya ha
 * pasado.
 */
import { indicatorFreshness } from './freshness'
import type { MarketHistoryEntry, MarketIndicator } from './types'

/** Investigación anterior con la que comparar: solo sus indicadores. */
export interface MarketBaseline {
  id: string
  generatedAt: string
  indicators: MarketIndicator[]
}

export const MARKET_MOVES = Object.freeze({
  /** Se busca una investigación de al menos esta antigüedad respecto a la actual. */
  BASELINE_MIN_DAYS: 21,
  /** Entre las dos observaciones de un índice, entre estos días. */
  MIN_GAP_DAYS: 20,
  MAX_GAP_DAYS: 50,
  /** Caída que se considera fuerte (en %). */
  DROP_PCT: -8,
  /** Subida que se considera fuerte (en %). */
  RISE_PCT: 10,
  /** Índices de bolsa, por orden de preferencia si se mueven igual. */
  EQUITY_KEYS: Object.freeze(['stoxx50', 'ibex', 'spx', 'ndq']) as readonly string[],
})

const DAY_MS = 86_400_000

/** Primer día del periodo (`YYYY-MM` → día 1) o el propio día. */
function dayOf(asOf: string): number {
  const t = Date.parse(/^\d{4}-\d{2}$/.test(asOf) ? `${asOf}-15` : asOf)
  return Number.isNaN(t) ? NaN : t
}

/** La investigación más reciente que tenga al menos `BASELINE_MIN_DAYS` más que la actual. */
export function pickBaselineId(history: readonly MarketHistoryEntry[], currentGeneratedAt: string): string | null {
  const now = Date.parse(currentGeneratedAt)
  if (Number.isNaN(now)) return null
  const old = history
    .filter((h) => now - Date.parse(h.generatedAt) >= MARKET_MOVES.BASELINE_MIN_DAYS * DAY_MS)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
  return old[0]?.id ?? null
}

export interface EquityMove {
  key: string
  label: string
  /** Variación en %, con un decimal. */
  pct: number
  direction: 'drop' | 'rise'
  /** Días entre las dos observaciones. */
  days: number
  /** Fecha del dato actual. */
  asOf: string
}

/**
 * El movimiento fuerte más grande de los índices de bolsa, o `null` si
 * ninguno ha caído un 8 % o subido un 10 % (o no hay con qué comparar).
 */
export function strongEquityMove(current: readonly MarketIndicator[], baseline: MarketBaseline | null | undefined, now: Date = new Date()): EquityMove | null {
  if (!baseline) return null
  const moves: EquityMove[] = []
  for (const key of MARKET_MOVES.EQUITY_KEYS) {
    const cur = current.find((i) => i.key === key)
    const old = baseline.indicators.find((i) => i.key === key)
    if (!cur || !old || cur.unit !== 'pts' || old.unit !== 'pts') continue
    if (typeof cur.value !== 'number' || typeof old.value !== 'number' || !(old.value > 0) || !(cur.value > 0)) continue
    if (indicatorFreshness(cur, now) !== 'fresh') continue
    // Mismo tipo de dato (día con día, mes con mes).
    if ((cur.asOf.length === 7) !== (old.asOf.length === 7)) continue
    const days = Math.round((dayOf(cur.asOf) - dayOf(old.asOf)) / DAY_MS)
    if (!(days >= MARKET_MOVES.MIN_GAP_DAYS && days <= MARKET_MOVES.MAX_GAP_DAYS)) continue
    const pct = Math.round(((cur.value - old.value) / old.value) * 1000) / 10
    if (pct <= MARKET_MOVES.DROP_PCT) moves.push({ key, label: cur.label, pct, direction: 'drop', days, asOf: cur.asOf })
    else if (pct >= MARKET_MOVES.RISE_PCT) moves.push({ key, label: cur.label, pct, direction: 'rise', days, asOf: cur.asOf })
  }
  return moves.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0] ?? null
}
