/**
 * Publicación en la rama de datos: `latest.json`, `history/<id>.json` (máx.
 * HISTORY_KEEP archivos) y `history.json` (resúmenes compactos, máx.
 * HISTORY_SUMMARY_KEEP). El commit lo hace el workflow, y solo si hay diff.
 */
import type { MarketHistoryEntry, MarketResearch } from '../../lib/market/types'
import { HISTORY_KEEP, HISTORY_SUMMARY_KEEP, type DataStore } from './store'

export function summarize(research: MarketResearch): MarketHistoryEntry {
  return { id: research.id, generatedAt: research.generatedAt, overview: research.overview.slice(0, 600) }
}

export async function publishResearch(store: DataStore, research: MarketResearch): Promise<void> {
  await store.writeLatest(research)
  await store.writeHistoryEntry(research)

  const previous = await store.readHistory()
  const merged = [summarize(research), ...previous.filter((h) => h.id !== research.id)]
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .slice(0, HISTORY_SUMMARY_KEEP)
  await store.writeHistory(merged)

  const ids = await store.listHistoryIds()
  const excess = ids.sort().slice(0, Math.max(0, ids.length - HISTORY_KEEP))
  for (const id of excess) await store.removeHistoryEntry(id)
}
