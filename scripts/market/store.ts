/**
 * Almacén de la rama de datos: `latest.json`, `history.json`, `history/<id>.json`,
 * `budget.json`, `light.json`. Implementación en disco (job) y en memoria (tests).
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MarketHistoryEntry, MarketResearch } from '../../lib/market/types'
import { parseMarketHistory, parseMarketResearch } from '../../lib/market/validate'
import { parseLedger, type BudgetLedger } from './budget'

export const HISTORY_KEEP = 12
export const HISTORY_SUMMARY_KEEP = 8

export interface LightReport {
  checkedAt: string
  indicators: MarketResearch['indicators']
  events: Array<{ kind: string; detail: string }>
  failedSources: string[]
  eventTriggered: boolean
}

export interface DataStore {
  readLatest(): Promise<MarketResearch | null>
  writeLatest(research: MarketResearch): Promise<void>
  readHistory(): Promise<MarketHistoryEntry[]>
  writeHistory(entries: MarketHistoryEntry[]): Promise<void>
  writeHistoryEntry(research: MarketResearch): Promise<void>
  listHistoryIds(): Promise<string[]>
  removeHistoryEntry(id: string): Promise<void>
  /** `undefined` = no existe; `null` = existe pero es ilegible/corrupto. */
  readLedger(): Promise<BudgetLedger | null | undefined>
  writeLedger(ledger: BudgetLedger): Promise<void>
  writeLight(report: LightReport): Promise<void>
}

async function readJson(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    return null
  }
}

const stable = (v: unknown) => JSON.stringify(v, null, 2) + '\n'

export function fileStore(dir: string): DataStore {
  const p = (...parts: string[]) => join(dir, ...parts)
  const write = async (path: string, value: unknown) => {
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, stable(value), 'utf8')
  }
  return {
    async readLatest() {
      const raw = await readJson(p('latest.json'))
      if (raw === undefined || raw === null) return null
      try {
        return parseMarketResearch(raw)
      } catch {
        return null
      }
    },
    writeLatest: (r) => write(p('latest.json'), r),
    async readHistory() {
      const raw = await readJson(p('history.json'))
      if (raw === undefined || raw === null) return []
      try {
        return parseMarketHistory(raw)
      } catch {
        return []
      }
    },
    writeHistory: (entries) => write(p('history.json'), entries),
    writeHistoryEntry: (r) => write(p('history', `${r.id}.json`), r),
    async listHistoryIds() {
      try {
        return (await readdir(p('history'))).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()
      } catch {
        return []
      }
    },
    removeHistoryEntry: (id) => rm(p('history', `${id}.json`), { force: true }),
    async readLedger() {
      const raw = await readJson(p('budget.json'))
      if (raw === undefined) return undefined
      return parseLedger(raw)
    },
    writeLedger: (l) => write(p('budget.json'), l),
    writeLight: (r) => write(p('light.json'), r),
  }
}

export function memoryStore(initial: { latest?: MarketResearch | null; history?: MarketHistoryEntry[]; ledger?: BudgetLedger | null; rawLedger?: unknown } = {}): DataStore & {
  files: Map<string, unknown>
} {
  const files = new Map<string, unknown>()
  if (initial.latest) files.set('latest.json', initial.latest)
  if (initial.history) files.set('history.json', initial.history)
  if (initial.ledger !== undefined) files.set('budget.json', initial.ledger)
  if (initial.rawLedger !== undefined) files.set('budget.json', initial.rawLedger)
  return {
    files,
    async readLatest() {
      const raw = files.get('latest.json')
      if (!raw) return null
      try {
        return parseMarketResearch(raw)
      } catch {
        return null
      }
    },
    async writeLatest(r) {
      files.set('latest.json', r)
    },
    async readHistory() {
      return (files.get('history.json') as MarketHistoryEntry[] | undefined) ?? []
    },
    async writeHistory(e) {
      files.set('history.json', e)
    },
    async writeHistoryEntry(r) {
      files.set(`history/${r.id}.json`, r)
    },
    async listHistoryIds() {
      return [...files.keys()].filter((k) => k.startsWith('history/')).map((k) => k.slice(8, -5)).sort()
    },
    async removeHistoryEntry(id) {
      files.delete(`history/${id}.json`)
    },
    async readLedger() {
      if (!files.has('budget.json')) return undefined
      return parseLedger(files.get('budget.json'))
    },
    async writeLedger(l) {
      files.set('budget.json', l)
    },
    async writeLight(r) {
      files.set('light.json', r)
    },
  }
}
