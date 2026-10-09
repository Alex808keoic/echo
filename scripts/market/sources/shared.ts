/**
 * Utilidades comunes de las fuentes. Cada fuente es una función `Source` que
 * devuelve indicadores y/o titulares, o lanza. Nunca requiere autenticación
 * (salvo la clave gratuita opcional de FRED) y nunca hace scraping de HTML.
 */
import type { MarketIndicator, MarketSource } from '../../../lib/market/types'
import type { Headline } from '../../../lib/market/rss'

// Headline y parseRSS viven en lib/market/rss.ts: también los usa la búsqueda de mercado de AXIS en el servidor.
export { parseRSS, type Headline } from '../../../lib/market/rss'

export interface SourceResult {
  source: MarketSource
  indicators: MarketIndicator[]
  headlines: Headline[]
}

export type Source = (ctx: SourceContext) => Promise<SourceResult>

export interface SourceContext {
  fetch: typeof fetch
  now: Date
  env: Record<string, string | undefined>
  timeoutMs: number
}

export const SOURCE_TIMEOUT_MS = 10_000

export async function fetchText(
  ctx: SourceContext,
  url: string,
  init: RequestInit = {},
  encoding: 'utf-8' | 'latin1' = 'utf-8',
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs)
  try {
    const res = await ctx.fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'user-agent': 'finax-market-research/1.0', ...(init.headers ?? {}) },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    if (encoding === 'utf-8') return await res.text()
    return new TextDecoder(encoding).decode(await res.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchJSON<T = unknown>(ctx: SourceContext, url: string, init: RequestInit = {}): Promise<T> {
  const text = await fetchText(ctx, url, { ...init, headers: { accept: 'application/json', ...(init.headers ?? {}) } })
  return JSON.parse(text) as T
}

/** Meses abreviados en español tal como aparecen en los CSV del Banco de España. */
const BDE_MONTHS: Record<string, string> = {
  ENE: '01', FEB: '02', MAR: '03', ABR: '04', MAY: '05', JUN: '06',
  JUL: '07', AGO: '08', SEP: '09', OCT: '10', NOV: '11', DIC: '12',
}

/**
 * Lee una tabla CSV del Banco de España (latin1, cabeceras en las primeras
 * filas, fechas «DD MMM AAAA») y devuelve las últimas observaciones numéricas
 * de la columna cuya descripción cumple `match`.
 */
/** Divide una línea CSV respetando comillas (las descripciones del BdE contienen comas). */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted
    else if (ch === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
    } else current += ch
  }
  cells.push(current.trim())
  return cells
}

export function parseBdeTable(csv: string, match: RegExp, last = 2): Array<{ date: string; value: number }> {
  const rows = csv.split(/\r?\n/).map(splitCsvLine)
  const header = rows.find((r) => /DESCRIPCI/i.test(r[0] ?? ''))
  if (!header) throw new Error('cabecera no encontrada')
  const col = header.findIndex((c) => match.test(c))
  if (col < 0) throw new Error('columna no encontrada')
  const points: Array<{ date: string; value: number }> = []
  for (const r of rows) {
    const m = (r[0] ?? '').match(/^(\d{2}) ([A-Z]{3}) (\d{4})$/)
    if (!m) continue
    const value = Number(r[col])
    if (!Number.isFinite(value)) continue
    points.push({ date: `${m[3]}-${BDE_MONTHS[m[2]] ?? '01'}-${m[1]}`, value })
  }
  return points.slice(-last)
}

export interface EcbSdmxJson {
  dataSets: Array<{ series: Record<string, { observations: Record<string, number[]> }> }>
  structure: { dimensions: { observation: Array<{ id: string; values: Array<{ id: string }> }> } }
}

/** Observaciones (fecha, valor) de la primera serie de una respuesta SDMX-JSON del BCE. */
export function parseEcbSeries(data: EcbSdmxJson): Array<{ date: string; value: number }> {
  const series = Object.values(data.dataSets[0]?.series ?? {})[0]
  if (!series) throw new Error('sin series')
  const dates = data.structure.dimensions.observation.find((d) => d.id === 'TIME_PERIOD')?.values ?? []
  return Object.entries(series.observations)
    .map(([idx, obs]) => ({ date: dates[Number(idx)]?.id ?? '', value: obs[0] }))
    .filter((p) => p.date && Number.isFinite(p.value))
}

export function source(name: string, url: string, type: MarketSource['type'], now: Date): MarketSource {
  return { name, url, retrievedAt: now.toISOString(), type }
}

export function round(n: number, decimals = 2): number {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null
  return round(((current - previous) / previous) * 100, 2)
}

