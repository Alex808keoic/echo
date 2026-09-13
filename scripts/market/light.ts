/**
 * Comprobación ligera (L–V), SIN IA.
 *
 * Recopila indicadores y titulares, detecta acontecimientos relevantes
 * comparando con la última investigación publicada, escribe `light.json` y
 * refresca los indicadores numéricos de `latest.json` sin tocar `generatedAt`.
 * Devuelve si procede disparar una investigación profunda por evento.
 */
import type { MarketResearch } from '../../lib/market/types'
import { assertBudget, emptyLedger, type BudgetLedger } from './budget'
import { detectEvents, type DetectedEvent } from './material'
import type { CollectedMaterial } from './sources'
import type { DataStore } from './store'

export interface LightDeps {
  store: DataStore
  collect: () => Promise<CollectedMaterial>
  now?: Date
  log?: (line: string) => void
}

export interface LightOutcome {
  events: DetectedEvent[]
  /** `true` si hay evento y el presupuesto permitiría una profunda extra. */
  triggerDeep: boolean
  latestUpdated: boolean
  failedSources: string[]
}

function mergeIndicators(latest: MarketResearch, fresh: MarketResearch['indicators']): MarketResearch['indicators'] {
  const byKey = new Map(latest.indicators.map((i) => [i.key, i]))
  for (const ind of fresh) byKey.set(ind.key, ind)
  return [...byKey.values()]
}

export async function runLightCheck(deps: LightDeps): Promise<LightOutcome> {
  const now = deps.now ?? new Date()
  const log = deps.log ?? (() => {})
  const material = await deps.collect()
  const latest = await deps.store.readLatest()
  const since = new Date(now.getTime() - 2 * 86_400_000).toISOString()
  const events = detectEvents(material, latest, since)

  let latestUpdated = false
  if (latest && material.indicators.length > 0) {
    const merged = mergeIndicators(latest, material.indicators)
    if (JSON.stringify(merged) !== JSON.stringify(latest.indicators)) {
      await deps.store.writeLatest({ ...latest, indicators: merged })
      latestUpdated = true
    }
  }

  // ¿Hay cupo para una profunda extra? Solo se consulta; no se consume nada.
  const stored = await deps.store.readLedger()
  const ledger: BudgetLedger | null = stored === undefined ? emptyLedger(now) : stored
  const decision = assertBudget(ledger, { estimatedInputTokens: 0, newDeepResearch: true, eventResearch: true }, now)
  const triggerDeep = events.length > 0 && decision.allowed

  await deps.store.writeLight({
    checkedAt: now.toISOString(),
    indicators: material.indicators,
    events,
    failedSources: material.failed,
    eventTriggered: triggerDeep,
  })
  log(`ligera: ${material.indicators.length} indicadores, ${events.length} eventos, caídas: ${material.failed.join(', ') || 'ninguna'}${events.length > 0 && !decision.allowed ? `; profunda no disparada (${decision.reason})` : ''}`)
  return { events, triggerDeep, latestUpdated, failedSources: material.failed }
}
