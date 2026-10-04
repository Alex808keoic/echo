/**
 * Lógica pura de la memoria de AXIS (sin Dexie): aplicar propuestas,
 * evitar duplicados y contradicciones, y acotar el tamaño.
 *
 * Reglas:
 * - Solo se guarda lo que el usuario acepta explícitamente.
 * - Una propuesta con `replacesId` ACTUALIZA esa memoria (misma id): nunca
 *   conviven dos versiones de la misma decisión.
 * - Contenido equivalente a uno existente → se refresca `updatedAt`, no se duplica.
 * - Nada que parezca un secreto entra en la memoria.
 * - Un hecho estructurado (`fact`) solo entra si es válido; al actualizar una
 *   memoria el hecho anterior NO sobrevive salvo que la propuesta traiga uno:
 *   el hecho debe corresponder al texto aceptado.
 * - Un hecho por hueco del perfil (`factSlot`): un hecho nuevo sustituye a la
 *   memoria que ya ocupaba su hueco, aunque el modelo no indique `replacesId`.
 *   La tarjeta enseña antes y después (`replacementFor`) y pide confirmación.
 * - Al superar el máximo, salen primero las menos importantes y, a igual
 *   importancia, las más antiguas; la memoria recién aceptada nunca sale, y
 *   las expulsadas se devuelven en `evicted` (nunca desaparecen en silencio).
 */
import { isValidMemoryFact, type MemoryFact } from '../profile/types'
import { looksLikeSecret } from './secrets'
import { CHAT_LIMITS, MEMORY_CATEGORIES, MEMORY_IMPORTANCES, type MemoryImportance, type MemoryProposal, type UserMemory } from './types'

const IMPORTANCE_RANK: Record<MemoryImportance, number> = { high: 3, medium: 2, low: 1 }

export function normalizeMemoryContent(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, CHAT_LIMITS.MAX_MEMORY_CHARS)
}

const comparable = (text: string) =>
  normalizeMemoryContent(text)
    .toLowerCase()
    .replace(/[.,;:!?¡¿"'«»()]/g, '')
    .trim()

/** Propuesta válida: texto útil, categoría e importancia conocidas, sin secretos y, si trae hecho, un hecho válido. */
export function isSavableProposal(p: MemoryProposal): boolean {
  const content = normalizeMemoryContent(p.content)
  return (
    content.length >= 8 &&
    MEMORY_CATEGORIES.includes(p.category) &&
    MEMORY_IMPORTANCES.includes(p.importance) &&
    !looksLikeSecret(content) &&
    (p.fact === undefined || p.fact === null || isValidMemoryFact(p.fact))
  )
}

export type ApplyOutcome =
  | { action: 'created'; memories: UserMemory[]; evicted: UserMemory[] }
  | { action: 'updated'; memories: UserMemory[]; removed: UserMemory[] }
  | { action: 'unchanged'; memories: UserMemory[] }
  | { action: 'rejected'; reason: string; memories: UserMemory[] }

/**
 * Hueco que ocupa un hecho en el perfil: como mucho una memoria por hueco.
 * Uno por clase de hecho, salvo los ingresos recurrentes: uno por categoría
 * (la paga y los regalos conviven; dos «paga» se sustituyen).
 */
export function factSlot(fact: MemoryFact): string {
  return fact.kind === 'recurringIncome' ? `recurringIncome:${fact.category}` : fact.kind
}

/** Igualdad de hechos por significado (independiente del orden de las claves). */
export function factEquals(a: MemoryFact | undefined, b: MemoryFact | undefined): boolean {
  if (!a || !b) return a === b
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'minLiquidity':
      return a.cents === (b as typeof a).cents
    case 'priorities':
      return a.objectiveIds.join('\n') === (b as typeof a).objectiveIds.join('\n')
    case 'recurringIncome': {
      const o = b as typeof a
      return a.cents === o.cents && a.frequency === o.frequency && a.category === o.category
    }
    default:
      return a.value === (b as typeof a).value
  }
}

/**
 * Qué haría aceptar `proposal` sobre `memories`. Lo usan la tarjeta (para
 * enseñar «antes → ahora» y pedir confirmación) y `applyProposal` (para
 * guardarlo), así que lo que se ve es exactamente lo que se guarda.
 *
 *   update     se reescribe `target` en su sitio (misma id): la indicada en
 *              `replacesId`; si no, la que ocupa el mismo hueco del perfil; si
 *              no, la del mismo texto cuando la propuesta trae un hecho nuevo.
 *   unchanged  mismo texto y nada nuevo que guardar (se refresca la fecha).
 *   create     memoria nueva.
 *
 * `removed`: memorias que la operación sustituye y desaparecen (la que ocupaba
 * el mismo hueco si no es `target`, o una de texto idéntico sin hecho propio).
 * `replacedFacts`: hechos que dejan de estar en el perfil. Las memorias con
 * hechos de otros huecos nunca se eliminan.
 */
export interface Replacement {
  mode: 'create' | 'update' | 'unchanged'
  target?: UserMemory
  removed: UserMemory[]
  replacedFacts: MemoryFact[]
}

export function replacementFor(proposal: MemoryProposal, memories: UserMemory[]): Replacement {
  const fact = proposal.fact ?? undefined
  const content = normalizeMemoryContent(proposal.content)
  const explicit = proposal.replacesId ? memories.find((m) => m.id === proposal.replacesId) : undefined
  const slotHolder = fact ? memories.find((m) => m.fact !== undefined && factSlot(m.fact) === factSlot(fact)) : undefined
  const duplicate = memories.find((m) => comparable(m.content) === comparable(content))

  let target: UserMemory | undefined = explicit ?? slotHolder
  // La misma memoria ya dice exactamente esto (texto y hecho): nada que guardar.
  if (!explicit && target && target === duplicate && factEquals(target.fact, fact)) return { mode: 'unchanged', target, removed: [], replacedFacts: [] }
  if (!target && duplicate) {
    // Mismo texto: solo hay algo que guardar si trae un hecho distinto del que ya tiene.
    if (!fact || factEquals(duplicate.fact, fact)) return { mode: 'unchanged', target: duplicate, removed: [], replacedFacts: [] }
    target = duplicate
  }
  if (!target) return { mode: 'create', removed: [], replacedFacts: [] }

  const removed: UserMemory[] = []
  if (slotHolder && slotHolder.id !== target.id) removed.push(slotHolder)
  // Un texto idéntico sin hecho propio quedaría duplicado: se sustituye. Con un hecho de otro hueco, se conserva.
  if (duplicate && duplicate.id !== target.id && duplicate.fact === undefined && !removed.some((m) => m.id === duplicate.id)) removed.push(duplicate)

  const replacedFacts = [
    ...(target.fact && !factEquals(target.fact, fact) ? [target.fact] : []),
    ...removed.flatMap((m) => (m.fact ? [m.fact] : [])),
  ]
  return { mode: 'update', target, removed, replacedFacts }
}

/** Aplica una propuesta aceptada por el usuario a la lista actual. No muta. */
export function applyProposal(memories: UserMemory[], proposal: MemoryProposal, now: number, newId: () => string): ApplyOutcome {
  if (!isSavableProposal(proposal)) return { action: 'rejected', reason: 'propuesta no válida o con datos sensibles', memories }
  const content = normalizeMemoryContent(proposal.content)
  const confidence = clamp01(proposal.confidence)
  const fact = proposal.fact ?? undefined
  const plan = replacementFor(proposal, memories)

  if (plan.mode === 'unchanged' && plan.target) {
    const id = plan.target.id
    return { action: 'unchanged', memories: memories.map((m) => (m.id === id ? { ...m, updatedAt: now } : m)) }
  }

  if (plan.mode === 'update' && plan.target) {
    // El hecho anterior no sobrevive salvo que la propuesta traiga uno: el hecho debe corresponder al texto aceptado.
    const { fact: _previous, ...rest } = plan.target
    void _previous
    const updated: UserMemory = { ...rest, content, category: proposal.category, importance: proposal.importance, confidence, updatedAt: now, ...(fact ? { fact } : {}) }
    const gone = new Set(plan.removed.map((m) => m.id))
    return {
      action: 'updated',
      memories: memories.filter((m) => !gone.has(m.id)).map((m) => (m.id === updated.id ? updated : m)),
      removed: plan.removed,
    }
  }

  const created: UserMemory = {
    id: newId(),
    content,
    category: proposal.category,
    importance: proposal.importance,
    confidence,
    source: 'conversation',
    createdAt: now,
    updatedAt: now,
    ...(fact ? { fact } : {}),
  }
  // La recién aceptada siempre se conserva: el hueco se hace entre las anteriores.
  const { kept, evicted } = trimMemories(memories, CHAT_LIMITS.MAX_MEMORIES - 1)
  return { action: 'created', memories: [...kept, created], evicted }
}

/**
 * Conserva como máximo `max` memorias, priorizando importancia y, a igual
 * importancia, actualidad. Determinista; devuelve también las expulsadas.
 */
export function trimMemories(memories: UserMemory[], max: number = CHAT_LIMITS.MAX_MEMORIES): { kept: UserMemory[]; evicted: UserMemory[] } {
  if (memories.length <= max) return { kept: memories, evicted: [] }
  const ranked = [...memories].sort((a, b) => IMPORTANCE_RANK[b.importance] - IMPORTANCE_RANK[a.importance] || b.updatedAt - a.updatedAt)
  const ids = new Set(ranked.slice(0, max).map((m) => m.id))
  return { kept: memories.filter((m) => ids.has(m.id)), evicted: memories.filter((m) => !ids.has(m.id)) }
}

/** Vista de la memoria para el modelo: solo lo necesario para razonar y para poder actualizarla (id). */
export function memoriesForModel(memories: UserMemory[]) {
  return [...memories]
    .sort((a, b) => IMPORTANCE_RANK[b.importance] - IMPORTANCE_RANK[a.importance] || b.updatedAt - a.updatedAt)
    .map(({ id, content, category, importance, updatedAt, fact }) => ({
      id,
      content,
      category,
      importance,
      fecha: new Date(updatedAt).toISOString().slice(0, 10),
      // El hecho estructurado, si lo tiene: el modelo lo necesita para actualizarlo con «replacesId».
      ...(fact ? { hecho: fact } : {}),
    }))
}

function clamp01(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0.5
  return Math.min(1, Math.max(0, Math.round(v * 100) / 100))
}
