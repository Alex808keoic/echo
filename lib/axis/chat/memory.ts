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
 *   memoria (`replacesId`) el hecho anterior NO sobrevive salvo que la
 *   propuesta traiga uno: el hecho debe corresponder al texto aceptado.
 * - Al superar el máximo, salen primero las menos importantes y, a igual
 *   importancia, las más antiguas; la memoria recién aceptada nunca sale, y
 *   las expulsadas se devuelven en `evicted` (nunca desaparecen en silencio).
 */
import { isValidMemoryFact } from '../profile/types'
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
  | { action: 'updated' | 'unchanged'; memories: UserMemory[] }
  | { action: 'rejected'; reason: string; memories: UserMemory[] }

/** Aplica una propuesta aceptada por el usuario a la lista actual. No muta. */
export function applyProposal(memories: UserMemory[], proposal: MemoryProposal, now: number, newId: () => string): ApplyOutcome {
  if (!isSavableProposal(proposal)) return { action: 'rejected', reason: 'propuesta no válida o con datos sensibles', memories }
  const content = normalizeMemoryContent(proposal.content)
  const confidence = clamp01(proposal.confidence)

  const fact = proposal.fact ?? undefined
  const target = proposal.replacesId ? memories.find((m) => m.id === proposal.replacesId) : undefined
  if (target) {
    const { fact: _previous, ...rest } = target
    void _previous
    const updated: UserMemory = { ...rest, content, category: proposal.category, importance: proposal.importance, confidence, updatedAt: now, ...(fact ? { fact } : {}) }
    return { action: 'updated', memories: memories.map((m) => (m.id === target.id ? updated : m)) }
  }

  const duplicate = memories.find((m) => comparable(m.content) === comparable(content))
  if (duplicate) {
    return { action: 'unchanged', memories: memories.map((m) => (m.id === duplicate.id ? { ...m, updatedAt: now } : m)) }
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
    .map(({ id, content, category, importance, updatedAt }) => ({
      id,
      content,
      category,
      importance,
      fecha: new Date(updatedAt).toISOString().slice(0, 10),
    }))
}

function clamp01(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0.5
  return Math.min(1, Math.max(0, Math.round(v * 100) / 100))
}
