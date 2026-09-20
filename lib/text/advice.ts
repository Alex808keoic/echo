/**
 * Consejos en un texto y su LICENCIA frente a la acción decidida por AXIS.
 *
 * AXIS decide qué acción recomienda (`AxisAction`, producida por las reglas);
 * el modelo solo puede expresarla. Este módulo detecta, con un léxico
 * CERRADO y por cláusulas, los consejos que el texto contiene y comprueba
 * mecánicamente que cada uno esté autorizado:
 *
 *   - consejo NEGADO («no compres Tesla», «yo no invertiría») → licenciado:
 *     disuadir nunca crea una acción ejecutable;
 *   - consejo BLANDO (revisar, mantener, esperar) sin destino externo →
 *     licenciado: no compromete dinero;
 *   - consejo EJECUTABLE (invertir, comprar, vender, mover, destinar, ahorrar,
 *     crear, registrar, ajustar, gastar menos) → solo con postura «recommend»
 *     y si su verbo es compatible con `action.verb` y su destino con
 *     `action.target`, o si cita una alternativa de AXIS;
 *   - cualquier consejo positivo con destino EXTERNO (un activo que no está en
 *     los datos: «Tesla», «un ETF», «bitcoin») → violación siempre.
 *
 * Invertir, comprar y vender no son compatibles con ninguna acción de AXIS:
 * las reglas no producen esas acciones, así que no son licenciables. Sin
 * clasificador de lenguaje: solo patrones, entidades del contexto y la matriz.
 */
import type { AxisAction } from '../axis/types'
import { normalizeForMatching, splitClauses, type Clause } from './certainty'

export type AdviceVerbClass = 'invest' | 'buy' | 'sell' | 'move' | 'allocate' | 'save' | 'create' | 'review' | 'register' | 'wait' | 'keep' | 'spend-less' | 'adjust'

/** Consejos que comprometen dinero o cambian datos. Los demás (review, keep, wait) son blandos. */
export const EXECUTABLE_CLASSES: ReadonlySet<AdviceVerbClass> = new Set(['invest', 'buy', 'sell', 'move', 'allocate', 'save', 'create', 'register', 'adjust', 'spend-less'])

/** Matriz cerrada: qué clases de consejo puede expresar cada acción de AXIS. Sin invest/buy/sell en ningún lado. */
export const COMPATIBLE: Readonly<Record<AxisAction['verb'], ReadonlySet<AdviceVerbClass>>> = {
  allocate: new Set(['allocate', 'save']),
  reserve: new Set(['allocate', 'save']),
  define: new Set(['create', 'review', 'adjust']),
  decide: new Set(['create', 'review', 'adjust']),
  review: new Set(['review', 'keep', 'wait']),
  register: new Set(['register']),
  adjust: new Set(['adjust', 'spend-less', 'review']),
  hold: new Set(['keep', 'wait', 'review']),
  'complete-cushion': new Set(['save', 'allocate', 'keep']),
}

/* --------------------------------- léxico -------------------------------- */

interface Lexeme {
  cls: AdviceVerbClass
  infinitive: string[]
  imperative: string[]
  conditional: string[]
  /** Subjuntivo de 2.ª persona: forma del imperativo negativo («no compres»). */
  subjunctive: string[]
}

const LEXICON: Lexeme[] = [
  { cls: 'invest', infinitive: ['invertir'], imperative: ['invierte'], conditional: ['invertiria'], subjunctive: ['inviertas'] },
  { cls: 'buy', infinitive: ['comprar', 'adquirir'], imperative: ['compra', 'adquiere'], conditional: ['compraria', 'adquiriria'], subjunctive: ['compres', 'adquieras'] },
  { cls: 'sell', infinitive: ['vender', 'liquidar'], imperative: ['vende', 'liquida'], conditional: ['venderia', 'liquidaria'], subjunctive: ['vendas', 'liquides'] },
  { cls: 'move', infinitive: ['mover', 'traspasar', 'transferir', 'pasar'], imperative: ['mueve', 'traspasa', 'transfiere', 'pasa'], conditional: ['moveria', 'traspasaria', 'transferiria', 'pasaria'], subjunctive: ['muevas', 'traspases', 'transfieras', 'pases'] },
  { cls: 'allocate', infinitive: ['destinar', 'aportar', 'asignar', 'meter', 'dedicar'], imperative: ['destina', 'aporta', 'asigna', 'mete', 'dedica'], conditional: ['destinaria', 'aportaria', 'asignaria', 'meteria', 'dedicaria'], subjunctive: ['destines', 'aportes', 'asignes', 'metas', 'dediques'] },
  { cls: 'save', infinitive: ['ahorrar', 'reservar', 'guardar', 'apartar'], imperative: ['ahorra', 'reserva', 'guarda', 'aparta'], conditional: ['ahorraria', 'reservaria', 'guardaria', 'apartaria'], subjunctive: ['ahorres', 'reserves', 'guardes', 'apartes'] },
  { cls: 'create', infinitive: ['crear', 'definir', 'fijar', 'abrir'], imperative: ['crea', 'define', 'fija', 'abre'], conditional: ['crearia', 'definiria', 'fijaria', 'abriria'], subjunctive: ['crees', 'definas', 'fijes', 'abras'] },
  { cls: 'review', infinitive: ['revisar', 'comprobar', 'mirar', 'vigilar', 'repasar'], imperative: ['revisa', 'comprueba', 'mira', 'vigila', 'repasa'], conditional: ['revisaria', 'comprobaria', 'miraria', 'vigilaria', 'repasaria'], subjunctive: ['revises', 'compruebes', 'mires', 'vigiles', 'repases'] },
  { cls: 'register', infinitive: ['registrar', 'anotar', 'apuntar'], imperative: ['registra', 'anota', 'apunta'], conditional: ['registraria', 'anotaria', 'apuntaria'], subjunctive: ['registres', 'anotes', 'apuntes'] },
  { cls: 'wait', infinitive: ['esperar'], imperative: ['espera'], conditional: ['esperaria'], subjunctive: ['esperes'] },
  { cls: 'keep', infinitive: ['mantener', 'conservar', 'seguir'], imperative: ['manten', 'conserva', 'sigue'], conditional: ['mantendria', 'conservaria', 'seguiria'], subjunctive: ['mantengas', 'conserves', 'sigas'] },
  { cls: 'spend-less', infinitive: ['recortar', 'reducir', 'gastar menos'], imperative: ['recorta', 'reduce', 'gasta menos'], conditional: ['recortaria', 'reduciria', 'gastaria menos'], subjunctive: ['recortes', 'reduzcas', 'gastes'] },
  { cls: 'adjust', infinitive: ['ajustar', 'aplazar', 'adaptar'], imperative: ['ajusta', 'aplaza', 'adapta'], conditional: ['ajustaria', 'aplazaria', 'adaptaria'], subjunctive: ['ajustes', 'aplaces', 'adaptes'] },
]

const alt = (forms: string[]) => forms.map((f) => f.replace(/\s/g, '\\s+')).join('|')
const classOf = new Map<string, AdviceVerbClass>()
for (const l of LEXICON) for (const f of [...l.infinitive, ...l.imperative, ...l.conditional, ...l.subjunctive]) classOf.set(f.replace(/\s+/g, ' '), l.cls)

const ALL_INF = alt(LEXICON.flatMap((l) => l.infinitive))
const ALL_IMP = alt(LEXICON.flatMap((l) => l.imperative))
const ALL_COND = alt(LEXICON.flatMap((l) => l.conditional))
const ALL_SUBJ = alt(LEXICON.flatMap((l) => l.subjunctive))

/** Marcador de consejo + infinitivo a pocas palabras. */
const MARKED_INF = new RegExp(`\\b(?:deberias|debes|tendrias que|tienes que|te recomiendo|te aconsejo|te sugiero|conviene|convendria|lo mejor es|mejor|lo ideal es|habria que|hay que|puedes|podrias|yo)\\b(?:\\s+\\S+){0,3}?\\s+(${ALL_INF})\\b`, 'g')
/** Imperativo al inicio de la cláusula (tras conectores suaves). */
const LEADING_IMP = new RegExp(`^\\s*(?:(?:y|entonces|ahora|primero|luego|despues|tambien|mejor|si acaso|quiza|quizas)\\s+)?(${ALL_IMP})\\b`, 'g')
/** Condicional de primera persona («yo invertiría», «destinaría parte»). */
const COND = new RegExp(`\\b(${ALL_COND})\\b`, 'g')
/** Imperativo negativo («no compres»). */
const NEG_SUBJ = new RegExp(`\\bno\\s+(${ALL_SUBJ})\\b`, 'g')

const NEGATORS = new Set(['no', 'ni', 'nunca', 'jamas', 'tampoco', 'sin', 'nadie'])
const WINDOW = 4

/* -------------------------------- destinos ------------------------------- */

export interface KnownEntities {
  objectives: Array<{ id: string; name: string }>
  positions: Array<{ id: string; name: string }>
  categories: string[]
}

export type AdviceTarget =
  | { kind: 'objective' | 'position' | 'category'; id?: string; name: string }
  | { kind: 'cushion' }
  | { kind: 'data' }
  | { kind: 'external'; text: string }
  | { kind: 'none' }

const STOP_PROPER = new Set(['Yo', 'No', 'Si', 'Sí', 'Y', 'En', 'Con', 'Tu', 'Te', 'El', 'La', 'Los', 'Las', 'Un', 'Una', 'Ojo', 'Ahora', 'Finax', 'AXIS'])
const CUSHION = /\b(?:colchon|liquidez|fondo de emergencia|reserva de emergencia|efectivo)\b/
const DATA = /\b(?:movimientos?|ingresos?|gastos? del mes|datos|registro)\b/
const GENERIC_OBJECTIVE = /\bobjetivos?\b/
const GENERIC_POSITION = /\b(?:posicion(?:es)?|cartera|inversion(?:es)?)\b/
/** Activos e instrumentos que no existen en los datos del usuario: siempre externos. */
const EXTERNAL = /\b(?:acciones?|fondos?|etfs?|etc|indexados?|cripto(?:monedas?)?|bitcoin|ethereum|oro|plata|bonos?|letras|plazo fijo|depositos?|inmuebles?|pisos?|bolsa|criptos?|tesla|nvidia|apple|amazon|microsoft|google|s&p|nasdaq|ibex)\b/

function targetOf(clause: string, original: string, entities: KnownEntities, cls: AdviceVerbClass): AdviceTarget {
  const n = clause
  for (const o of entities.objectives) if (o.name.trim() && n.includes(normalizeForMatching(o.name))) return { kind: 'objective', id: o.id, name: o.name }
  for (const p of entities.positions) if (p.name.trim() && n.includes(normalizeForMatching(p.name))) return { kind: 'position', id: p.id, name: p.name }
  for (const c of entities.categories) if (c.trim() && n.includes(normalizeForMatching(c))) return { kind: 'category', id: c, name: c }
  if (EXTERNAL.test(n)) return { kind: 'external', text: n.match(EXTERNAL)?.[0] ?? 'activo externo' }
  if (CUSHION.test(n)) return { kind: 'cushion' }
  if (GENERIC_OBJECTIVE.test(n)) return { kind: 'objective', name: 'objetivo' }
  if (GENERIC_POSITION.test(n)) return { kind: 'position', name: 'posición' }
  if (DATA.test(n)) return { kind: 'data' }
  // Nombre propio desconocido (no es objetivo, posición ni categoría del usuario) junto a un verbo que
  // compromete dinero: destino externo. Se ignora la primera palabra de la cláusula (imperativo capitalizado).
  if (EXECUTABLE_CLASSES.has(cls) && cls !== 'register') {
    const words = original.trim().split(/\s+/).slice(1)
    const proper = words.map((w) => w.replace(/[^\p{L}]/gu, '')).find((w) => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(w) && !STOP_PROPER.has(w))
    if (proper) return { kind: 'external', text: proper }
  }
  return { kind: 'none' }
}

/* -------------------------------- extracción ----------------------------- */

export interface AdviceClause {
  clause: string
  verb: string
  verbClass: AdviceVerbClass
  executable: boolean
  negated: boolean
  target: AdviceTarget
}

function negatedBefore(clause: string, index: number): boolean {
  const before = clause.slice(0, index).split(/\s+/).filter(Boolean).slice(-WINDOW)
  return before.some((t) => NEGATORS.has(t))
}

/** Consejos del texto (uno por verbo detectado), con clase, destino y si están negados. */
export function extractAdvice(text: string, entities: KnownEntities): AdviceClause[] {
  const normalized = normalizeForMatching(text)
  const out: AdviceClause[] = []
  const seen = new Set<string>()
  const push = (c: Clause, verb: string, index: number, negated: boolean) => {
    const key = `${c.start}:${index}`
    if (seen.has(key)) return
    seen.add(key)
    const norm = verb.replace(/\s+/g, ' ')
    const cls = classOf.get(norm) ?? classOf.get(norm.split(' ')[0])
    if (!cls) return
    const original = text.slice(c.start, c.start + c.text.length)
    out.push({ clause: original.trim(), verb, verbClass: cls, executable: EXECUTABLE_CLASSES.has(cls), negated, target: targetOf(c.text, original, entities, cls) })
  }
  for (const c of splitClauses(normalized)) {
    for (const m of c.text.matchAll(NEG_SUBJ)) push(c, m[1], m.index ?? 0, true)
    for (const m of c.text.matchAll(MARKED_INF)) {
      const at = (m.index ?? 0) + m[0].lastIndexOf(m[1])
      push(c, m[1], at, negatedBefore(c.text, m.index ?? 0) || negatedBefore(c.text, at))
    }
    for (const m of c.text.matchAll(LEADING_IMP)) {
      const at = (m.index ?? 0) + m[0].lastIndexOf(m[1])
      push(c, m[1], at, negatedBefore(c.text, at))
    }
    for (const m of c.text.matchAll(COND)) push(c, m[1], m.index ?? 0, negatedBefore(c.text, m.index ?? 0))
  }
  return out
}

/* --------------------------------- licencia ------------------------------ */

export interface AdviceLicense {
  stance: 'recommend' | 'inform'
  action?: AxisAction
  /** Nombres de las alternativas de AXIS: citarlas es expresar la decisión, no crear una. */
  alternatives: string[]
}

export type LicensedAdvice = AdviceClause & { licensed: boolean; by?: 'negation' | 'soft' | 'action' | 'alternative' }

const stems = (name: string) =>
  normalizeForMatching(name)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 4)
    .map((w) => w.slice(0, 5))

function citesAlternative(clause: string, alternatives: string[]): boolean {
  const n = normalizeForMatching(clause)
  return alternatives.some((name) => {
    const s = stems(name)
    return s.length > 0 && s.every((stem) => n.includes(stem))
  })
}

function targetCompatible(target: AdviceTarget, action: AxisAction): boolean {
  if (target.kind === 'none') return true
  if (target.kind === 'external') return false
  if (target.kind !== action.target) return false
  if (target.kind === 'cushion' || target.kind === 'data') return true
  if (action.targetId && target.id && normalizeForMatching(target.id) !== normalizeForMatching(action.targetId)) return false
  return true
}

export function licenseAdvice(clauses: AdviceClause[], license: AdviceLicense): LicensedAdvice[] {
  return clauses.map((c) => {
    if (c.negated) return { ...c, licensed: true, by: 'negation' }
    if (!c.executable) return c.target.kind === 'external' ? { ...c, licensed: false } : { ...c, licensed: true, by: 'soft' }
    if (c.target.kind === 'external') return { ...c, licensed: false }
    if (citesAlternative(c.clause, license.alternatives)) return { ...c, licensed: true, by: 'alternative' }
    if (license.stance !== 'recommend' || !license.action) return { ...c, licensed: false }
    if (COMPATIBLE[license.action.verb].has(c.verbClass) && targetCompatible(c.target, license.action)) return { ...c, licensed: true, by: 'action' }
    return { ...c, licensed: false }
  })
}

/** Consejos NO licenciados del texto. Vacío = el texto solo expresa lo que AXIS ha decidido. */
export function checkAdvice(text: string, entities: KnownEntities, license: AdviceLicense): LicensedAdvice[] {
  return licenseAdvice(extractAdvice(text, entities), license).filter((c) => !c.licensed)
}
