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
import { applyProposal, applyProposals, isSavableProposal, normalizeMemoryContent } from './memory'
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

/** Igual que `evictionPreview`, para varias propuestas guardadas a la vez (cuestionario de perfil). */
export function evictionPreviewAll(memories: UserMemory[], proposals: readonly MemoryProposal[], now: number = Date.now()): UserMemory[] {
  let n = 0
  const outcome = applyProposals(memories, proposals, now, () => `__vista_previa_${n++}__`)
  return outcome.action === 'applied' ? outcome.evicted : []
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
 * cifras reales; todos los datos cuentan en «Tu plan»; las notas, no.
 */
export function memoryUsage(fact: MemoryFact | undefined, planIgnored = false): string {
  switch (fact?.kind) {
    case undefined:
      return planIgnored
        ? 'AXIS puede usar esta información como contexto cuando conversa contigo. Has indicado que no cuenta para tu plan.'
        : 'AXIS puede usar esta información como contexto cuando conversa contigo, pero tu plan no cambia con texto libre: conviértela en un dato para que cuente.'
    case 'recurringIncome':
      return 'AXIS lo usa como previsión: estima cuánto tardarías en alcanzar tus objetivos y te avisa si en el mes no hay ingresos registrados. Mientras te falten meses con datos, tu plan lo usa para un plan provisional. No se suma a tu saldo ni a tus ingresos registrados; cuando recibas el dinero, regístralo en Movimientos.'
    case 'minLiquidity':
      return 'AXIS lo tiene en cuenta al recomendarte: si tu dinero líquido baja de esta cifra, te propone completar ese colchón antes que otros fines. En tu plan es la meta mínima de tu «Fondo de emergencia».'
    case 'irregularIncome':
      return 'AXIS lo tiene en cuenta al leer tus ingresos: compara un mes con otro con más cautela. En tu plan, con ingresos que cambian, el colchón es de 6 meses de gasto en vez de 3. Se cambia desde «Tu perfil».'
    case 'priorities':
      return 'AXIS no cambia el orden de tus objetivos: sigue el que tienen en Finax, que es el que usa el reparto automático. Tu plan te avisa si este objetivo no va el primero, para que lo subas tú en Objetivos. Se puede borrar, pero no editar.'
    case 'horizon':
      return 'En las lecturas de AXIS solo matiza cómo te explica la inversión. En tu plan decide si hay parte a largo plazo: con menos de 2 años, ninguna. Se cambia desde «Tu perfil».'
    case 'riskAttitude':
      return 'En las lecturas de AXIS solo matiza cómo te explica la inversión. En tu plan decide qué parte de lo que te sobra va al largo plazo: 20 % si prefieres no arriesgar, 40 % equilibrado y 60 % dinámico. Se cambia desde «Tu perfil».'
    case 'adult':
      return 'AXIS no lo usa para decidir nada: en tu plan solo cambia cómo se explica la parte de inversión (si eres menor, la haría un adulto a tu nombre). Se cambia desde «Tu perfil».'
    case 'work':
      return 'En tu plan cambia el tamaño del colchón: si trabajas por tu cuenta o ahora no trabajas, es de 6 meses de gasto en vez de 3. Se cambia desde «Tu perfil».'
    case 'dependents':
      return 'En tu plan, si alguien depende de tu dinero, el colchón tiene 3 meses de gasto más. Se cambia desde «Tu perfil».'
    case 'investingExperience':
      return 'En tu plan, sin experiencia invirtiendo no hay parte arriesgada: se empieza por lo diversificado. Se cambia desde «Tu perfil».'
    case 'lossCapacity':
      return 'En tu plan, si una caída te obligaría a cambiar tus planes, la inversión es como mucho equilibrada y sin parte arriesgada, aunque lleves bien los altibajos. Se cambia desde «Tu perfil».'
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
      usage: memoryUsage(memory.fact, memory.planIgnored === true),
      source,
      sourceLabel: SOURCE_LABEL[source],
      editable: editableKind(memory) !== null,
    }
  }
  const sorted = [...memories].sort(byRecency)
  return { facts: sorted.filter((m) => m.fact !== undefined).map(view), notes: sorted.filter((m) => m.fact === undefined).map(view) }
}
