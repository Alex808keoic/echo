/**
 * Material para la síntesis y detección de eventos (sin IA).
 *
 * `compactMaterial` convierte indicadores y titulares en un texto acotado
 * que cabe en MAX_INPUT_TOKENS (y en el TPM del fallback). `detectEvents`
 * compara la recopilación con la última investigación publicada.
 */
import type { MarketIndicator, MarketResearch } from '../../lib/market/types'
import type { CollectedMaterial } from './sources'
import type { Headline } from './sources/shared'

export interface DetectedEvent {
  kind: 'index-move' | 'rate-change' | 'new-inflation' | 'headline'
  detail: string
}

/** Umbrales de la comprobación ligera. */
export const EVENT_THRESHOLDS = Object.freeze({
  /** Variación del índice frente al último valor publicado. */
  indexMovePct: 3,
  /** Palabras clave de alto impacto en titulares (minúsculas, sin acentos). */
  highImpactKeywords: [
    'decision de politica monetaria',
    'monetary policy decision',
    'tipos de interes',
    'interest rate',
    'fomc',
    'recesion',
    'recession',
    'quiebra',
    'default',
    'rescate',
    'bailout',
    'sancion',
    'sanction',
    'crisis',
    'emergency',
    'emergencia',
    'arancel',
    'tariff',
  ],
})

const DIACRITICS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g')
const strip = (s: string) => s.normalize('NFD').replace(DIACRITICS, '').toLowerCase()

export function detectEvents(material: CollectedMaterial, latest: MarketResearch | null, sinceISO: string): DetectedEvent[] {
  const events: DetectedEvent[] = []
  const prevByKey = new Map((latest?.indicators ?? []).map((i) => [i.key, i]))

  for (const ind of material.indicators) {
    const prev = prevByKey.get(ind.key)
    if (!prev || prev.value === null || ind.value === null) continue
    if (ind.group === 'index' && prev.value !== 0) {
      const move = ((ind.value - prev.value) / prev.value) * 100
      if (Math.abs(move) >= EVENT_THRESHOLDS.indexMovePct) events.push({ kind: 'index-move', detail: `${ind.label}: ${move.toFixed(1)} % desde ${prev.asOf}` })
    }
    // Cambios de tipos: solo tipos oficiales (los de mercado, como el Euríbor, se mueven a diario).
    if (ind.group === 'rate' && ['ecb-dfr', 'fed-funds'].includes(ind.key) && ind.value !== prev.value) {
      events.push({ kind: 'rate-change', detail: `${ind.label}: ${prev.value} → ${ind.value}` })
    }
    if (ind.group === 'inflation' && ind.asOf !== prev.asOf) events.push({ kind: 'new-inflation', detail: `${ind.label}: nuevo dato ${ind.asOf} (${ind.value} %)` })
  }

  for (const h of material.headlines) {
    if (h.publishedAt && h.publishedAt < sinceISO) continue
    const t = strip(h.title)
    const hit = EVENT_THRESHOLDS.highImpactKeywords.find((k) => t.includes(k))
    if (hit) events.push({ kind: 'headline', detail: `${h.source}: ${h.title}` })
  }
  return events
}

function fmtIndicator(i: MarketIndicator): string {
  const change = i.changePct === null ? '' : ` (${i.changePct >= 0 ? '+' : ''}${i.changePct}${i.group === 'rate' ? ' p.p.' : ' %'} vs. anterior)`
  return `- ${i.label}: ${i.value ?? 'n/d'} ${i.unit}${change}, dato de ${i.asOf} [${i.source}]`
}

function fmtHeadline(h: Headline): string {
  return `- ${h.publishedAt.slice(0, 10) || 's/f'} · ${h.source}: ${h.title}`
}

/**
 * Texto compacto para el proveedor. `maxChars` acota el tamaño; los titulares
 * más antiguos se descartan primero.
 */
export function compactMaterial(material: CollectedMaterial, opts: { maxChars: number; coversFrom: string; coversTo: string }): string {
  const header = [
    `Periodo analizado: ${opts.coversFrom} a ${opts.coversTo}. Recopilado el ${material.retrievedAt.slice(0, 16)} UTC.`,
    material.failed.length > 0 ? `Fuentes no disponibles en esta recopilación: ${material.failed.join(', ')}.` : '',
    '',
    'INDICADORES (datos oficiales, no modificar):',
    ...material.indicators.map(fmtIndicator),
    '',
    'TITULARES OFICIALES RECIENTES (solo síntesis; no inventar detalles no presentes):',
  ].join('\n')

  const headlines = [...material.headlines]
    .filter((h) => !h.publishedAt || h.publishedAt >= opts.coversFrom)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map(fmtHeadline)

  let out = header
  for (const line of headlines) {
    if (out.length + line.length + 1 > opts.maxChars) break
    out += `\n${line}`
  }
  return out.slice(0, opts.maxChars)
}

export const MARKET_SYSTEM_PROMPT = `Eres el Market Research Engine de Finax, una app de finanzas personales para usuarios en España. Sintetizas EXCLUSIVAMENTE el material que recibes (indicadores oficiales y titulares de fuentes públicas) en un JSON estructurado en español.

REGLAS
- No inventes datos, cifras, fechas ni acontecimientos que no estén en el material. Si algo no aparece, no lo menciones o dilo como desconocido.
- Los indicadores numéricos ya vienen calculados: no los recalcules ni los contradigas; cítalos con su fuente.
- Describe lo ocurrido en el periodo y lo que es incierto. Nunca presentes predicciones como certezas: prohibido «va a subir», «subirá», «caerá», «garantizado», «seguro que», «sin duda». Usa «ha subido X % en el periodo», «podría», «según los datos disponibles».
- No des recomendaciones de inversión ni menciones productos, brokers o activos concretos para comprar o vender. Las notas por clase de activo describen contexto (stance: neutral | caution | watch), no acciones.
- No uses conocimiento externo sobre el mercado más allá del material; no tienes acceso a Internet.
- Cada evento debe citar la fuente del titular en «source» y llevar la fecha del titular. Impacto: high solo para decisiones de política monetaria, crisis o shocks.
- Tono claro, tranquilo y comprensible; sin alarmismo ni jerga.
- «warnings» debe incluir siempre: «Esta síntesis no es asesoramiento financiero» y «Datos de mercado con posible retraso».
- «uncertainties» debe recoger lo que el material no permite saber (fuentes caídas, datos con retraso, periodos sin titulares).
- Devuelve solo el JSON que exige el esquema; en «assetClasses», rellena «aliases» con palabras que puedan aparecer en el nombre de una posición de un usuario español (p. ej. «indexado», «msci world», «ibex», «bono», «cuenta remunerada», «oro», «bitcoin»).`
