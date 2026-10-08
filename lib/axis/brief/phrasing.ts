/**
 * Weekly Market Brief · fase 2: REDACCIÓN con IA. La IA escribe; AXIS decide.
 *
 *   WeeklyBrief ─► buildWeeklyBriefRequest ─► modelo ─► parseWeeklyBriefPhrasing
 *               ─► validateWeeklyBriefPhrasing (phrasing-validate.ts)
 *               ─► válido: se muestra la redacción · inválido: el Brief determinista
 *
 * El modelo recibe SOLO el contenido del Brief (`briefPayload`): ni
 * movimientos, ni memorias, ni conversación, ni el contexto financiero. Devuelve
 * un texto por sección del Brief (`WeeklyBriefPhrasing`), ni una más; las
 * secciones vacías del Brief deben llegar a `null`. Nada decisorio sale del
 * modelo: la recomendación, su acción y la prioridad siguen siendo las del Brief.
 *
 * `briefPayload` es también la firma de la caché (`weeklyBriefSignature`):
 * excluye lo que cambia sin cambiar el contenido (`generatedAt`, `ageDays`),
 * así que la redacción se reutiliza mientras el Brief diga lo mismo.
 */
import type { AIRequest } from '../ai/provider'
import { PERSONALITY } from '../personality'
import { SAFETY } from '../prompts/safety'
import { AxisValidationError } from '../validate'
import type { BriefIndicator, WeeklyBrief } from './weekly'

/** Lo que escribe el modelo: un texto por sección del Brief. `null` = la sección no existe en el Brief. */
export interface WeeklyBriefPhrasing {
  title: string
  /** Indicadores actuales y sin dato actual. `null` solo si no hay información de mercado. */
  market: string | null
  /** `null` si el Brief no tiene cambios. */
  changes: string | null
  /** `null` si el Brief no tiene lectura de la investigación. */
  reading: string | null
  /** `null` si el Brief no tiene eventos. */
  events: string | null
  personal: string
  conclusion: string
}

export const PHRASING_FIELDS = ['title', 'market', 'changes', 'reading', 'events', 'personal', 'conclusion'] as const
export const PHRASING_LIMITS = { titleChars: 120, fieldChars: 700 } as const

/* ------------------------------- formato ------------------------------ */

const grouped = (n: number) => {
  const [int, dec] = String(Math.abs(n)).split('.')
  return `${n < 0 ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${dec ? `,${dec}` : ''}`
}
/** Valor de un indicador tal como debe escribirse (sin redondear: `2,15 %`, `12.000 puntos`). */
export const indicatorText = (i: Pick<BriefIndicator, 'value' | 'unit'>) => (i.unit === '%' ? `${grouped(i.value)} %` : `${grouped(i.value)} puntos`)
/** Variación tal como debe escribirse: `+0,25 p.p.`, `-0,5 %`, `sin cambios`. */
export const changeText = (c: { delta: number; unit: 'p.p.' | '%' }) => (c.delta === 0 ? 'sin cambios' : `${c.delta > 0 ? '+' : ''}${grouped(c.delta)} ${c.unit}`)

/* ------------------------------- entrada ------------------------------- */

/** Exactamente lo que recibe el modelo. Sin fechas de generación ni antigüedades que cambien solas. */
export function briefPayload(brief: WeeklyBrief) {
  const m = brief.market
  const rec = brief.conclusion.recommendation
  return {
    mercado:
      m.status === 'unavailable'
        ? null
        : {
            estado: m.status,
            investigacion: m.research ? { fecha: m.research.generatedAt.slice(0, 10), frescura: m.research.freshness, cubre_desde: m.research.coversFrom, cubre_hasta: m.research.coversTo } : null,
            indicadores_actuales: m.indicators.map((i) => ({ nombre: i.label, valor: indicatorText(i), fecha_del_dato: i.asOf, fuente: i.source, ...(i.status ? { estado_del_dato: i.status } : {}) })),
            sin_dato_actual: m.notCurrent.map((i) => ({ nombre: i.label, ultimo_dato: i.lastAsOf })),
            cambios_frente_al_dato_anterior: m.changes.map((c) => ({ nombre: c.label, variacion: changeText(c) })),
            lectura: m.reading ? { texto: m.reading.text, fecha_de_la_investigacion: m.reading.researchGeneratedAt.slice(0, 10), con_algunos_dias: m.reading.aging } : null,
            eventos: m.events.map((e) => ({ fecha: e.date.slice(0, 10), titulo: e.title, resumen: e.summary, fuente: e.source })),
          },
    para_ti: {
      tipo: brief.personal.kind,
      senal_principal: brief.personal.lead ? { hecho: brief.personal.lead.fact, interpretacion: brief.personal.lead.interpretation } : null,
      papel_del_mercado: brief.personal.marketRelevance,
    },
    conclusion_de_axis: { conclusion: brief.conclusion.summary, recomendacion: rec ? { que: rec.what, por_que: rec.why } : null },
    incertidumbres: brief.uncertainties.map((u) => ({ titulo: u.title, detalle: u.detail })),
  }
}

/** JSON canónico (claves ordenadas): el mismo contenido da el mismo texto, sea cual sea el orden de las propiedades. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined)
    return `{${entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`
  }
  return JSON.stringify(v)
}

/** cyrb53: hash de 53 bits, determinista y sin dependencias. */
function hash53(s: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

/** Firma de la redacción: hash del contenido que recibe el modelo. Cambia si y solo si cambia ese contenido. */
export function weeklyBriefSignature(brief: WeeklyBrief): string {
  return `wb1:${hash53(canonical(briefPayload(brief)))}`
}

/* ------------------------------- esquema ------------------------------- */

const text = { type: 'string' } as const
const optional = { anyOf: [{ type: 'null' }, text] } as const

export const WEEKLY_BRIEF_PHRASING_SCHEMA = {
  type: 'object',
  properties: { title: text, market: optional, changes: optional, reading: optional, events: optional, personal: text, conclusion: text },
  required: [...PHRASING_FIELDS],
  additionalProperties: false,
} as const

/* -------------------------------- prompt ------------------------------- */

const section = (title: string, lines: readonly string[]) => [title, ...lines].join('\n')

export const WEEKLY_BRIEF_PHRASING_PROMPT = [
  PERSONALITY.identity.analysis,
  'Tu única función es REDACTAR en español el resumen semanal de mercado que AXIS ya ha preparado y que recibes en JSON. Tú no decides nada: AXIS ha elegido los datos, qué significa para la persona, la recomendación y la conclusión. Ese JSON es la ÚNICA fuente de verdad: no existe ninguna otra información de mercado ni financiera, y no puedes usar lo que sepas por tu cuenta.',
  section('QUÉ RECIBES', [
    '- «mercado» (o null): investigación con su fecha, indicadores con dato actual (valor, fecha del dato, fuente), indicadores sin dato actual (sin valor), cambios frente al dato anterior, la lectura de la investigación (o null) y eventos (o lista vacía).',
    '- «para_ti»: qué significa para la persona, decidido por AXIS. «papel_del_mercado» dice qué peso tiene el mercado en su caso: respétalo.',
    '- «conclusion_de_axis»: la conclusión y la recomendación de AXIS (o null si no recomienda actuar).',
    '- «incertidumbres»: lo que no se sabe. Que se note en el tono.',
  ]),
  section('CIFRAS Y FECHAS', [
    '- Escribe cada cifra EXACTAMENTE como aparece en el JSON: «2,15 %», «+0,25 p.p.», «12.000 puntos», «1.300,00 €». No calcules, no sumes, no restes, no redondees, no conviertas unidades. Si una cifra no está en el JSON, no la escribas.',
    '- No escribas ninguna cifra de «lectura» ni de «eventos»: son textos de una investigación, no datos actuales. Cuéntalos sin números.',
    '- De los indicadores de «sin_dato_actual» no escribas ningún valor: di solo que no hay dato actual (y, si quieres, la fecha de su último dato).',
    '- Las fechas, solo las del JSON y con su significado: la del dato no es la de la investigación ni la de un evento. No digas «hoy» de un dato de mercado; di «el último dato disponible, de …». No inventes fechas.',
    '- Los cambios son «frente al dato anterior», nada más: no les atribuyas causas ni consecuencias, ni digas que son buenos o malos.',
  ]),
  section('LO QUE NO PUEDES HACER', [
    '- No cambies, añadas ni quites recomendaciones. Si «recomendacion» es null, no propongas ninguna acción. Si no lo es, la conclusión transmite ESA recomendación, con su sentido y su prioridad, y nunca dice que no hace falta actuar.',
    '- Si «para_ti.tipo» es «personal-priority», la prioridad es la situación personal: el mercado no es lo más importante y no puedes presentarlo así.',
    '- Nunca recomiendes comprar, vender, invertir, entrar o salir del mercado, ni esperar para hacerlo; ni productos, fondos, ETF, acciones, bonos, depósitos o criptoactivos; ni porcentajes de cartera. No digas que es buen o mal momento.',
    '- No predigas precios, tipos ni rentabilidades; no digas que algo subirá o bajará; nada de «seguro», «sin duda» ni «garantizado».',
    '- No inventes eventos, indicadores, instituciones ni datos. Si una sección no tiene contenido en el JSON, devuélvela como null.',
    SAFETY.analysis.neverExecutes,
    SAFETY.analysis.noAssumptions,
  ]),
  section('VOZ', [PERSONALITY.tone.expression, ...Object.values(PERSONALITY.voice)]),
  section('SALIDA', [
    `- Devuelve únicamente el JSON del esquema: «title» (una frase corta, máximo ${PHRASING_LIMITS.titleChars} caracteres), «market» (indicadores con dato actual y los que no lo tienen; null solo si «mercado» es null), «changes» (null si no hay cambios), «reading» (la lectura, nombrando la fecha de la investigación «AAAA-MM-DD» o «D de mes de AAAA», y diciendo que tiene algunos días si «con_algunos_dias» es true; null si «lectura» es null), «events» (solo los eventos de la lista, con su fecha; null si está vacía), «personal» (qué significa para la persona) y «conclusion». Cada texto, máximo ${PHRASING_LIMITS.fieldChars} caracteres.`,
  ]),
].join('\n\n')

export function buildWeeklyBriefRequest(brief: WeeklyBrief): AIRequest {
  return {
    system: WEEKLY_BRIEF_PHRASING_PROMPT,
    user: `Redacta este resumen semanal de AXIS y devuelve el JSON.\n\n${JSON.stringify(briefPayload(brief))}`,
    schema: WEEKLY_BRIEF_PHRASING_SCHEMA as unknown as Record<string, unknown>,
  }
}

/* -------------------------------- forma -------------------------------- */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Comprobación de forma: exactamente los campos del esquema, textos no vacíos y dentro de límites. */
export function parseWeeklyBriefPhrasing(raw: unknown): WeeklyBriefPhrasing {
  if (!isRecord(raw)) throw new AxisValidationError('la redacción no es un objeto')
  const extra = Object.keys(raw).filter((k) => !(PHRASING_FIELDS as readonly string[]).includes(k))
  if (extra.length > 0) throw new AxisValidationError(`campos no permitidos: ${extra.join(', ')}`)
  const field = (k: (typeof PHRASING_FIELDS)[number], nullable: boolean): string | null => {
    const v = raw[k]
    if (v === null && nullable) return null
    if (typeof v !== 'string' || v.trim() === '') throw new AxisValidationError(`«${k}» debe ser un texto no vacío${nullable ? ' o null' : ''}`)
    const max = k === 'title' ? PHRASING_LIMITS.titleChars : PHRASING_LIMITS.fieldChars
    if (v.trim().length > max) throw new AxisValidationError(`«${k}» supera ${max} caracteres`)
    return v.trim()
  }
  return {
    title: field('title', false) as string,
    market: field('market', true),
    changes: field('changes', true),
    reading: field('reading', true),
    events: field('events', true),
    personal: field('personal', false) as string,
    conclusion: field('conclusion', false) as string,
  }
}
