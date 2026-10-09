/**
 * Presentación del Weekly Brief (parte 5a) y comprobación de su forma.
 *
 * - `briefView`: lo que se muestra siempre, con o sin IA. Los datos (indicadores,
 *   cambios, fechas) son exactamente los del Brief; la redacción con IA, si la
 *   hay y es válida, sustituye solo los textos narrativos.
 * - `isWeeklyBrief`: el servidor recibe el Brief del cliente; antes de
 *   redactarlo comprueba su forma y sus límites (defensa: podría ser cualquier cosa).
 */
import { formatShortDate } from '../../dates'
import { changeText, indicatorText } from './phrasing'
import type { WeeklyBrief } from './weekly'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Fecha de un dato: día («11 sept 2026») o mes («agosto de 2026»). */
export function dataDate(asOf: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(asOf)) return formatShortDate(asOf.slice(0, 10))
  if (/^\d{4}-\d{2}$/.test(asOf)) return `${MONTHS[Number(asOf.slice(5, 7)) - 1]} de ${asOf.slice(0, 4)}`
  return asOf
}

export interface BriefView {
  title: string
  /** Investigación de la que procede (fecha y antigüedad), o `null` sin mercado. */
  researchLine: string | null
  indicators: Array<{ label: string; value: string; detail: string }>
  notCurrent: string[]
  changes: Array<{ label: string; value: string }>
  reading: { text: string; date: string; aging: boolean } | null
  events: Array<{ date: string; title: string; summary: string; source: string }>
  personal: { fact: string | null; interpretation: string | null; marketRelevance: string }
  conclusion: string
  recommendation: string | null
  uncertainties: Array<{ title: string; detail: string }>
}

const TITLE: Record<WeeklyBrief['market']['status'], string> = {
  complete: 'Tu resumen semanal del mercado',
  partial: 'Tu resumen semanal del mercado (con algunos datos pendientes)',
  'facts-only': 'Datos de mercado de la semana, sin lectura reciente',
  'no-current-data': 'Esta semana no hay datos de mercado actuales',
  unavailable: 'Sin información de mercado esta semana',
}

export function briefView(brief: WeeklyBrief): BriefView {
  const m = brief.market
  const rec = brief.conclusion.recommendation
  return {
    title: TITLE[m.status],
    researchLine: m.research ? `Investigación del ${formatShortDate(m.research.generatedAt.slice(0, 10))}${m.research.freshness === 'stale' ? ' · desactualizada' : m.research.freshness === 'aging' ? ' · tiene algunos días' : ''}` : null,
    indicators: m.indicators.map((i) => ({ label: i.label, value: indicatorText(i), detail: `Dato de ${dataDate(i.asOf)} · ${i.source}` })),
    notCurrent: m.notCurrent.map((i) => (i.lastAsOf ? `${i.label} (último dato: ${dataDate(i.lastAsOf)})` : `${i.label} (sin fecha fiable)`)),
    changes: m.changes.map((c) => ({ label: c.label, value: changeText(c) })),
    reading: m.reading ? { text: m.reading.text, date: formatShortDate(m.reading.researchGeneratedAt.slice(0, 10)), aging: m.reading.aging } : null,
    events: m.events.map((e) => ({ date: formatShortDate(e.date.slice(0, 10)), title: e.title, summary: e.summary, source: e.source })),
    personal: { fact: brief.personal.lead?.fact ?? null, interpretation: brief.personal.lead?.interpretation ?? null, marketRelevance: brief.personal.marketRelevance },
    conclusion: brief.conclusion.summary,
    recommendation: rec ? rec.what : null,
    uncertainties: brief.uncertainties,
  }
}

/* ------------------------------ forma (servidor) ------------------------------ */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown, max = 600) => typeof v === 'string' && v.length <= max
const isList = (v: unknown, max: number, item: (x: unknown) => boolean) => Array.isArray(v) && v.length <= max && v.every(item)
const STATUSES = ['unavailable', 'no-current-data', 'facts-only', 'partial', 'complete']
const KINDS = ['personal-priority', 'market-caution', 'no-action', 'insufficient-data']

/** Forma y límites de un Brief recibido del cliente. */
export function isWeeklyBrief(v: unknown): v is WeeklyBrief {
  if (!isRecord(v) || !isStr(v.generatedAt, 40) || !isRecord(v.market) || !isRecord(v.personal) || !isRecord(v.conclusion)) return false
  const m = v.market
  const p = v.personal
  const c = v.conclusion
  const indicator = (x: unknown) => isRecord(x) && isStr(x.key, 40) && isStr(x.label, 80) && typeof x.value === 'number' && Number.isFinite(x.value) && (x.unit === '%' || x.unit === 'pts') && isStr(x.asOf, 30) && isStr(x.source, 80)
  const notCurrent = (x: unknown) => isRecord(x) && isStr(x.key, 40) && isStr(x.label, 80) && (x.lastAsOf === null || isStr(x.lastAsOf, 30))
  const change = (x: unknown) => isRecord(x) && isStr(x.key, 40) && isStr(x.label, 80) && typeof x.delta === 'number' && Number.isFinite(x.delta) && (x.unit === 'p.p.' || x.unit === '%')
  const event = (x: unknown) => isRecord(x) && isStr(x.date, 30) && isStr(x.title, 200) && isStr(x.summary, 400) && isStr(x.source, 80)
  const uncertainty = (x: unknown) => isRecord(x) && isStr(x.title, 120) && isStr(x.detail, 400)
  const research = m.research === null || (isRecord(m.research) && isStr(m.research.generatedAt, 40) && isStr(m.research.freshness, 10))
  const reading = m.reading === null || (isRecord(m.reading) && isStr(m.reading.text, 1_200) && isStr(m.reading.researchGeneratedAt, 40))
  const lead = p.lead === null || (isRecord(p.lead) && isStr(p.lead.id, 80) && isStr(p.lead.fact) && isStr(p.lead.interpretation))
  const rec = c.recommendation === null || (isRecord(c.recommendation) && isStr(c.recommendation.what) && isStr(c.recommendation.why) && isRecord(c.recommendation.action))
  return (
    STATUSES.includes(m.status as string) &&
    research &&
    reading &&
    isList(m.indicators, 6, indicator) &&
    isList(m.notCurrent, 9, notCurrent) &&
    isList(m.changes, 6, change) &&
    isList(m.events, 5, event) &&
    KINDS.includes(p.kind as string) &&
    lead &&
    isStr(p.marketRelevance) &&
    isStr(c.summary) &&
    rec &&
    isList(v.uncertainties, 12, uncertainty)
  )
}
