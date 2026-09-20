/**
 * Certeza injustificada en un texto.
 *
 * Único detector compartido por AXIS (expresión Decision First, chat) y el
 * Market Research (síntesis del proveedor). Sustituye a la lista plana de
 * patrones que solo reconocía «garantizado» y castigaba las negaciones.
 *
 * Cómo funciona:
 *   1. Normaliza (minúsculas, sin acentos) conservando la longitud, para poder
 *      citar el fragmento original.
 *   2. Divide el texto en CLÁUSULAS (puntuación y conectores: «pero», «aunque»,
 *      «si», «salvo»…). Cada cláusula se juzga sola: «nada está garantizado,
 *      pero el oro va a subir» viola por la segunda.
 *   3. Busca DISPARADORES por familias (garantía, aseguramiento, muletillas de
 *      certeza, adverbios absolutos, predicciones de mercado, incertidumbre
 *      negada, inglés).
 *   4. LICENCIA un disparador cuando el contexto lo convierte en prudencia:
 *      - negación o imposibilidad en la misma cláusula, pocas palabras antes
 *        («no podemos garantizar», «nada está garantizado», «no es seguro que»,
 *        «nadie puede asegurar», «no se sabe a ciencia cierta»);
 *      - para las predicciones, solo cláusula condicional o un atenuador
 *        («si bajara…», «podría subir», «no creo que vaya a…»): «no va a subir»
 *        sigue siendo una certeza sobre el futuro y no se licencia.
 *
 * No juzga el significado de la prosa: es una garantía mecánica, deliberadamente
 * estricta. Un falso positivo cuesta una respuesta en local; un falso negativo
 * cuesta una promesa al usuario. Sin dependencias.
 */

export type CertaintyKind = 'guarantee' | 'assurance' | 'idiom' | 'adverb' | 'prediction' | 'denied-uncertainty' | 'english'

export interface CertaintyHit {
  kind: CertaintyKind
  /** Fragmento original que disparó la detección. */
  match: string
  /** Cláusula original en la que aparece. */
  clause: string
  /** `true` si el contexto lo convierte en una afirmación prudente (no es violación). */
  licensed: boolean
  /** Qué lo licenció: la palabra negadora/atenuadora o «conditional». */
  licensedBy?: string
}

export interface CertaintyVerdict {
  ok: boolean
  hits: CertaintyHit[]
}

/* ------------------------------ normalización ---------------------------- */

const ACCENTS: Record<string, string> = {
  á: 'a', à: 'a', â: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e', í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', ö: 'o', ú: 'u', ù: 'u', û: 'u', ü: 'u',
}

/** Minúsculas sin acentos, conservando la longitud (para citar el original). */
export function normalizeForMatching(text: string): string {
  let out = ''
  for (const ch of text) {
    const lower = ch.toLowerCase()
    const safe = lower.length === ch.length ? lower : ch
    out += ACCENTS[safe] ?? safe
  }
  return out
}

/* -------------------------------- cláusulas ------------------------------ */

export interface Clause {
  text: string
  start: number
  /** Introducida por «si», «aunque», «cuando»…: las predicciones dentro son hipótesis. */
  conditional: boolean
}

const CONDITIONAL_MARKERS = ['si', 'aunque', 'cuando', 'en caso de que', 'siempre que', 'a menos que', 'salvo que', 'salvo', 'excepto', 'if', 'unless']
const OTHER_MARKERS = ['pero', 'sino', 'sin embargo', 'no obstante', 'mientras que', 'de lo contrario', 'but', 'however']
const MARKER_RE = new RegExp(`\\b(${[...CONDITIONAL_MARKERS, ...OTHER_MARKERS].sort((a, b) => b.length - a.length).join('|')})\\b`, 'g')
const PUNCT_RE = /[.;:!?,\n()[\]«»"“”…]/g

/** Divide un texto normalizado en cláusulas con su posición y si son condicionales. */
export function splitClauses(normalized: string): Clause[] {
  const boundaries: Array<{ index: number; length: number; conditional: boolean }> = []
  for (const m of normalized.matchAll(PUNCT_RE)) boundaries.push({ index: m.index ?? 0, length: m[0].length, conditional: false })
  for (const m of normalized.matchAll(MARKER_RE)) boundaries.push({ index: m.index ?? 0, length: 0, conditional: CONDITIONAL_MARKERS.includes(m[1]) })
  boundaries.sort((a, b) => a.index - b.index)
  const clauses: Clause[] = []
  let start = 0
  let conditional = false
  const push = (end: number) => {
    const text = normalized.slice(start, end)
    if (text.trim().length > 0) clauses.push({ text, start, conditional })
  }
  for (const b of boundaries) {
    if (b.index < start) continue
    push(b.index)
    start = b.index + b.length
    conditional = b.conditional
  }
  push(normalized.length)
  return clauses
}

/* ------------------------------ disparadores ----------------------------- */

const PRONOUNS = '(?:(?:te|le|os|les|nos|me|lo|la|se) )?'

const TRIGGERS: Array<{ kind: CertaintyKind; re: RegExp }> = [
  { kind: 'guarantee', re: new RegExp(`\\b${PRONOUNS}garantiz(?:a|an|o|ara|aran|aria|arian|ado|ada|ados|adas|ar|e|en)\\b`, 'g') },
  { kind: 'assurance', re: new RegExp(`\\b${PRONOUNS}asegur(?:o|a|an|amos|ara|aran|aria|arian|e|en|ar)\\b`, 'g') },
  { kind: 'assurance', re: /\bes seguro\b|\bseguro que\b|\b(?:100|cien) ?(?:%|por ciento) ?segur[oa]\b|\b(?:completamente|totalmente|absolutamente) segur[oa]\b/g },
  { kind: 'idiom', re: /\bsin (?:ninguna |la menor |ningun tipo de )?duda\b|\bsin lugar a dudas\b|\bno (?:hay|cabe|existe|tengo|tenemos|queda) (?:ninguna |la menor |ningun tipo de )?duda\b/g },
  { kind: 'idiom', re: /\bcon (?:total |toda |absoluta |plena )?(?:certeza|seguridad)\b|\ba ciencia cierta\b|\bde (?:seguro|fijo)\b/g },
  { kind: 'adverb', re: /\b(?:definitivamente|obviamente|evidentemente|indudablemente|indiscutiblemente|inevitablemente|inevitable)\b/g },
  { kind: 'prediction', re: /\bva(?:n)? a (?:subir|bajar|caer|dispararse|desplomarse|recuperarse|repuntar|mejorar|empeorar|crecer|rentar|funcionar)\b/g },
  { kind: 'prediction', re: /\b(?:subir|bajar|caer|desplomar|repuntar|recuperar|rentar|funcionar|mejorar|empeorar|crecer)(?:a|an)\b/g },
  { kind: 'prediction', re: /\bsiempre (?:sube|suben|funciona|gana|rinde|compensa|acaba subiendo)\b|\bnunca (?:baja|bajan|falla|pierde|pierden)\b/g },
  { kind: 'denied-uncertainty', re: /\bno (?:hay|existe|queda|tengo|tenemos) (?:ninguna |la menor |ningun tipo de )?incertidumbre\b/g },
  { kind: 'english', re: /\bwill (?:rise|fall|drop|surge|rally|crash|recover|go up|go down)\b|\bguaranteed?\b|\bdefinitely\b|\bfor sure\b|\bno doubt\b|\bcertainly\b|\bwithout (?:a )?doubt\b/g },
]

/** Cuántas palabras antes del disparador se busca el contexto que lo licencia. */
const WINDOW = 5

const NEGATORS = new Set(['no', 'ni', 'nadie', 'nada', 'nunca', 'jamas', 'sin', 'tampoco', 'imposible', 'dificilmente', 'lejos', 'not', 'never', 'cannot', "can't", 'cant', 'nobody', 'nothing'])
const HEDGES = new Set(['creo', 'parece', 'quiza', 'quizas', 'tal', 'probablemente', 'posiblemente', 'podria', 'podrian', 'puede', 'pueden', 'might', 'may', 'could', 'probably', 'perhaps'])
/** Negaciones de vaya (kinds no predictivos) y atenuadores (predicciones). */
const NEGATION_LICENSES: ReadonlySet<CertaintyKind> = new Set(['guarantee', 'assurance', 'idiom', 'adverb', 'denied-uncertainty', 'english'])

function licenseFor(kind: CertaintyKind, clause: Clause, matchIndex: number, match: string): string | undefined {
  const before = clause.text
    .slice(0, matchIndex)
    .split(/\s+/)
    .filter(Boolean)
    .slice(-WINDOW)
  if (kind === 'prediction' || (kind === 'english' && /^will\b/.test(match))) {
    if (clause.conditional) return 'conditional'
    const hedge = before.find((t) => HEDGES.has(t))
    return hedge
  }
  if (!NEGATION_LICENSES.has(kind)) return undefined
  for (let i = before.length - 1; i >= 0; i--) {
    const token = before[i]
    if (!NEGATORS.has(token)) continue
    // «no solo garantiza…» no es una negación de la garantía.
    if (token === 'no' && /^(solo|solamente)$/.test(before[i + 1] ?? '')) continue
    return token
  }
  return undefined
}

/* --------------------------------- análisis ------------------------------ */

/** Todos los disparadores del texto, licenciados o no. `ok` si ninguno queda sin licencia. */
export function analyzeCertainty(text: string): CertaintyVerdict {
  const normalized = normalizeForMatching(text)
  const sameLength = normalized.length === text.length
  const found: Array<CertaintyHit & { at: number }> = []
  for (const clause of splitClauses(normalized)) {
    for (const { kind, re } of TRIGGERS) {
      re.lastIndex = 0
      for (const m of clause.text.matchAll(re)) {
        const index = m.index ?? 0
        const licensedBy = licenseFor(kind, clause, index, m[0])
        const absolute = clause.start + index
        found.push({
          at: absolute,
          kind,
          match: sameLength ? text.slice(absolute, absolute + m[0].length) : m[0],
          clause: (sameLength ? text.slice(clause.start, clause.start + clause.text.length) : clause.text).trim(),
          licensed: licensedBy !== undefined,
          ...(licensedBy !== undefined ? { licensedBy } : {}),
        })
      }
    }
  }
  // En orden de aparición, para que el primer hallazgo sea el primero que leería el usuario.
  const hits: CertaintyHit[] = found.sort((a, b) => a.at - b.at).map(({ at: _at, ...hit }) => hit)
  return { ok: hits.every((h) => h.licensed), hits }
}

/** Primer disparador NO licenciado, o `null` si el texto es prudente. */
export function findCertainty(text: string): CertaintyHit | null {
  return analyzeCertainty(text).hits.find((h) => !h.licensed) ?? null
}
