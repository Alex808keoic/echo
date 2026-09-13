/**
 * Recopilación de todas las fuentes con `Promise.allSettled`: una fuente
 * caída no rompe la investigación; queda en `failed`.
 */
import type { MarketIndicator, MarketSource } from '../../../lib/market/types'
import { bdeEuribor12m, bdeIbex35 } from './bde'
import { ecbDepositRate, ecbEuribor12m, ecbEuroStoxx50 } from './ecb'
import { fredSeries, SourceSkipped } from './fred'
import { eurostatHicp, ineIpc } from './inflation'
import { rssFeeds } from './rss'
import { SOURCE_TIMEOUT_MS, type Headline, type Source, type SourceContext } from './shared'

export interface NamedSource {
  name: string
  run: Source
}

/** Orden = prioridad: si dos fuentes dan el mismo indicador, gana la primera que responde. */
export const ALL_SOURCES: NamedSource[] = [
  { name: 'BCE (DFR)', run: ecbDepositRate },
  { name: 'Banco de España (Euríbor)', run: bdeEuribor12m },
  { name: 'BCE (Euríbor)', run: ecbEuribor12m },
  { name: 'INE', run: ineIpc },
  { name: 'Eurostat', run: eurostatHicp },
  { name: 'Banco de España (IBEX 35)', run: bdeIbex35 },
  { name: 'BCE (EURO STOXX 50)', run: ecbEuroStoxx50 },
  { name: 'FRED', run: fredSeries },
  ...rssFeeds,
]

export interface CollectedMaterial {
  retrievedAt: string
  indicators: MarketIndicator[]
  headlines: Headline[]
  sources: MarketSource[]
  failed: string[]
  skipped: string[]
}

export async function collectSources(
  sources: NamedSource[] = ALL_SOURCES,
  ctx: Partial<SourceContext> = {},
): Promise<CollectedMaterial> {
  const full: SourceContext = { fetch: globalThis.fetch, now: new Date(), env: process.env, timeoutMs: SOURCE_TIMEOUT_MS, ...ctx }
  const results = await Promise.allSettled(sources.map((s) => s.run(full)))
  const material: CollectedMaterial = { retrievedAt: full.now.toISOString(), indicators: [], headlines: [], sources: [], failed: [], skipped: [] }
  const seen = new Set<string>()
  results.forEach((r, i) => {
    const name = sources[i].name
    if (r.status === 'fulfilled') {
      for (const ind of r.value.indicators) {
        if (seen.has(ind.key)) continue
        seen.add(ind.key)
        material.indicators.push(ind)
      }
      material.headlines.push(...r.value.headlines)
      material.sources.push(r.value.source)
    } else if (r.reason instanceof SourceSkipped) {
      material.skipped.push(name)
    } else {
      material.failed.push(name)
    }
  })
  return material
}
