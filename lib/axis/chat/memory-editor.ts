/**
 * Edición de la memoria de AXIS desde «Lo que AXIS sabe de ti» (fase 3).
 *
 * Solo lógica pura: construye propuestas compatibles con el flujo de siempre
 * (`resolveMemoryProposal` → `applyProposal`), previsualiza qué se olvidaría
 * al llegar al tope, agrupa las memorias y explica qué hace AXIS con cada una.
 * No escribe en Dexie ni conoce la interfaz.
 *
 * Reglas:
 * - Notas manuales: categoría fija `context`, importancia `high`, origen manual.
 * - Datos manuales (ingreso mensual, liquidez mínima): mismas reglas y textos
 *   que la tarjeta del chat (`buildEditedProposal`, `contentForFact`).
 * - Editar conserva id, fecha de creación y origen (`replacesId`); un dato
 *   regenera siempre su texto para que nunca lo contradiga.
 * - Los tipos de dato que no se crean ni editan aquí (horizonte, riesgo,
 *   ingresos irregulares, prioridades) se ven y se borran, pero no se editan.
 */
import { formatShortDate, toISODate } from '../../dates'
import { buildEditedProposal, contentForFact, draftFor, isEditableFact, type EditableFact, type ProposalDraft } from './profile-proposal'
import { applyProposal, isSavableProposal, normalizeMemoryContent } from './memory'
import { looksLikeSecret } from './secrets'
import { CHAT_LIMITS, type MemoryProposal, type MemorySource, type UserMemory } from './types'
import type { MemoryFact, RecurringIncomeCategory } from '../profile/types'

export type ManualKind = 'note' | EditableFact['kind']

export type ManualInput =
  | { kind: 'note'; text: string }
  | { kind: 'recurringIncome'; amount: string; category: RecurringIncomeCategory | null }
  | { kind: 'minLiquidity'; amount: string }

export type EditorResult = { ok: true; proposal: MemoryProposal } | { ok: false; error: string }

/** Longitud mínima de una nota: la misma que exige `isSavableProposal`. */
export const MIN_NOTE_CHARS = 8

export const LEGACY_NOT_EDITABLE = 'Este tipo de memoria antigua no se puede editar.'

function noteError(text: string): string | null {
  const raw = text.replace(/\s+/g, ' ').trim()
  if (raw.length < MIN_NOTE_CHARS) return `Escribe al menos ${MIN_NOTE_CHARS} caracteres.`
  if (raw.length > CHAT_LIMITS.MAX_MEMORY_CHARS) return `Como máximo ${CHAT_LIMITS.MAX_MEMORY_CHARS} caracteres.`
  if (looksLikeSecret(raw)) return 'No guardes contraseñas, PIN, claves ni números de cuenta o tarjeta.'
  return null
}

/** Semilla para reutilizar `buildEditedProposal` con un dato todavía vacío. */
function seedFor(kind: EditableFact['kind']): MemoryProposal {
  return kind === 'recurringIncome'
    ? { content: '', category: 'financial_plan', importance: 'high', confidence: 1, replacesId: null, incompleteFact: { kind: 'recurringIncome', cents: 1, frequency: 'monthly' } }
    : { content: '', category: 'constraint', importance: 'high', confidence: 1, replacesId: null, fact: { kind: 'minLiquidity', cents: 1 } }
}

function draftOf(input: Exclude<ManualInput, { kind: 'note' }>): ProposalDraft {
  return { amount: input.amount, category: input.kind === 'recurringIncome' ? input.category : null }
}

/** Valida con las mismas reglas que `applyProposal`: lo que pasa aquí, se puede guardar. */
function savable(proposal: MemoryProposal): EditorResult {
  return isSavableProposal(proposal) ? { ok: true, proposal } : { ok: false, error: 'No se puede guardar tal como está.' }
}

/** Memoria nueva creada a mano: nota, ingreso mensual o liquidez mínima. */
export function manualProposal(input: ManualInput): EditorResult {
  if (input.kind === 'note') {
    const error = noteError(input.text)
    if (error) return { ok: false, error }
    return savable({ content: normalizeMemoryContent(input.text), category: 'context', importance: 'high', confidence: 1, replacesId: null, origin: 'manual' })
  }
  const built = buildEditedProposal(seedFor(input.kind), draftOf(input))
  if (!built.ok) return built
  // Un dato manual lleva siempre su texto generado, aunque el importe coincida con el de la semilla.
  const fact = built.proposal.fact as EditableFact
  return savable({ ...built.proposal, content: contentForFact(fact), importance: 'high', confidence: 1, origin: 'manual' })
}

/** Qué se puede editar de una memoria: el texto de una nota, o el dato de un ingreso o una liquidez. */
export function editableKind(memory: UserMemory): ManualKind | null {
  if (memory.fact === undefined) return 'note'
  return isEditableFact(memory.fact) ? memory.fact.kind : null
}

/** Valores iniciales del formulario de edición. */
export function inputFor(memory: UserMemory): ManualInput | null {
  const kind = editableKind(memory)
  if (kind === null) return null
  if (kind === 'note') return { kind: 'note', text: memory.content }
  const draft = draftFor({ content: memory.content, category: memory.category, importance: memory.importance, confidence: memory.confidence, replacesId: memory.id, fact: memory.fact })!.draft
  return kind === 'recurringIncome' ? { kind, amount: draft.amount, category: draft.category } : { kind, amount: draft.amount }
}

/**
 * Edición de una memoria existente: misma id (`replacesId`), mismo origen y
 * misma importancia. Una nota cambia solo su texto; un dato cambia importe (y
 * categoría) y su texto se regenera. Un cambio de categoría a un hueco ya
 * ocupado lo resuelve `replacementFor` (una sola memoria por categoría).
 */
export function editProposal(memory: UserMemory, input: ManualInput): EditorResult {
  const kind = editableKind(memory)
  if (kind === null) return { ok: false, error: LEGACY_NOT_EDITABLE }
  if (kind !== input.kind) return { ok: false, error: 'No se puede cambiar el tipo de una memoria; crea una nueva.' }
  const base: MemoryProposal = { content: memory.content, category: memory.category, importance: memory.importance, confidence: memory.confidence, replacesId: memory.id, ...(memory.fact ? { fact: memory.fact } : {}) }
  if (input.kind === 'note') {
    const error = noteError(input.text)
    if (error) return { ok: false, error }
    return savable({ ...base, content: normalizeMemoryContent(input.text) })
  }
  const built = buildEditedProposal(base, draftOf(input))
  return built.ok ? savable(built.proposal) : built
}

/**
 * Qué memorias olvidaría AXIS al aceptar `proposal`, sin escribir nada: ejecuta
 * la misma `applyProposal` (y por tanto el mismo `trimMemories`) sobre una copia.
 * Vacío por debajo del tope y en ediciones o sustituciones, que no añaden memorias.
 */
export function evictionPreview(memories: UserMemory[], proposal: MemoryProposal, now: number = Date.now()): UserMemory[] {
  const outcome = applyProposal(memories, proposal, now, () => '__vista_previa__')
  return outcome.action === 'created' ? outcome.evicted : []
}

/* ------------------------------ pantalla ------------------------------ */

export interface MemoryView {
  memory: UserMemory
  /** Qué recuerda AXIS, en una línea. */
  title: string
  /** Qué hace AXIS con ello: honesto con lo que AXIS hace hoy. */
  usage: string
  source: MemorySource
  sourceLabel: string
  editable: boolean
}

/** Origen tal y como se guardó; los datos de antes de la fase 3 son de conversación. */
export function memorySource(m: Pick<UserMemory, 'source'>): MemorySource {
  return m.source === 'manual' ? 'manual' : 'conversation'
}

export const SOURCE_LABEL: Record<MemorySource, string> = { conversation: 'De una conversación', manual: 'Añadido manualmente' }

/**
 * Qué hace AXIS con cada tipo de memoria. Solo lo que es cierto en el código
 * actual: el ingreso recurrente solo entra en previsiones (fase 5), nunca en
 * cifras reales.
 */
export function memoryUsage(fact: MemoryFact | undefined): string {
  switch (fact?.kind) {
    case undefined:
      return 'AXIS puede usar esta información como contexto cuando conversa contigo.'
    case 'recurringIncome':
      return 'AXIS lo usa como previsión: estima cuánto tardarías en alcanzar tus objetivos y te avisa si en el mes no hay ingresos registrados. No se suma a tu saldo ni a tus ingresos registrados; cuando recibas el dinero, regístralo en Movimientos.'
    case 'minLiquidity':
      return 'AXIS lo tiene en cuenta al recomendarte: si tu dinero disponible baja de esta cifra, te propone completar ese colchón antes que otros fines.'
    case 'irregularIncome':
      return 'AXIS lo tiene en cuenta al leer tus ingresos: compara un mes con otro con más cautela. Es una memoria antigua: se puede borrar, pero no editar.'
    case 'priorities':
      return 'Ya no cambia el orden de tus objetivos: AXIS sigue el orden que tienen en Finax, que es el que usa el reparto automático. Es una memoria antigua: se puede borrar, pero no editar.'
    case 'horizon':
    case 'riskAttitude':
      return 'AXIS solo lo usa para matizar cómo te explica algunas lecturas de inversión; no cambia sus recomendaciones. Es una memoria antigua: se puede borrar, pero no editar.'
  }
}

/** Fecha corta de la última actualización («3 oct 2026»). */
export function memoryDate(m: Pick<UserMemory, 'updatedAt'>): string {
  return formatShortDate(toISODate(new Date(m.updatedAt)))
}

const byRecency = (a: UserMemory, b: UserMemory) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * «Datos que tengo en cuenta» (memorias con dato estructurado, editables o
 * antiguas) y «Notas» (solo texto). Más reciente primero; orden estable.
 */
export function groupMemories(memories: UserMemory[], describe: (fact: MemoryFact) => string): { facts: MemoryView[]; notes: MemoryView[] } {
  const view = (memory: UserMemory): MemoryView => {
    const source = memorySource(memory)
    return {
      memory,
      title: memory.fact ? describe(memory.fact) : memory.content,
      usage: memoryUsage(memory.fact),
      source,
      sourceLabel: SOURCE_LABEL[source],
      editable: editableKind(memory) !== null,
    }
  }
  const sorted = [...memories].sort(byRecency)
  return { facts: sorted.filter((m) => m.fact !== undefined).map(view), notes: sorted.filter((m) => m.fact === undefined).map(view) }
}
