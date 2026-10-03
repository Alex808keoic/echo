/**
 * Derivación y reconciliación del perfil (fase 2 · bloque 2). Dos funciones
 * puras y deterministas, con responsabilidades separadas:
 *
 *   deriveProfile(memories)      solo memorias aceptadas → UserProfile.
 *                                No conoce el contexto financiero.
 *   reconcileProfile(profile, ctx)  contrasta el perfil con los datos actuales:
 *                                solo QUITA lo que el contexto invalida
 *                                (prioridades sobre objetivos inexistentes o
 *                                completados). Nunca añade ni cambia hechos.
 *
 * Precedencia: los datos del FinancialContext mandan siempre. El perfil no
 * contiene cifras del contexto; su única cifra (liquidez mínima) es una
 * preferencia declarada, que las reglas usarán como umbral en el bloque 3.
 */
import type { AxisMemory, FinancialContext, ProfileFactEntry } from '../types'
import type { UserMemory } from '../chat/types'
import { EMPTY_PROFILE, isValidMemoryFact, MEMORY_FACT_KINDS, type DroppedPriority, type MemoryFact, type MemoryFactKind, type ProfileConflict, type ReconciledProfile, type UserProfile } from './types'

/** Lo único que la derivación lee de una memoria. */
type FactSource = Pick<UserMemory, 'id' | 'updatedAt' | 'fact'>
type Candidate = { memory: FactSource; fact: MemoryFact }

/** Mismo tope que las memorias guardadas (`CHAT_LIMITS.MAX_MEMORIES`). */
const MAX_PROFILE_FACTS = 30

/** Hechos de perfil de las memorias aceptadas, para enviarlos con `AxisMemory.profileFacts`. */
export function profileFactsOf(memories: UserMemory[]): ProfileFactEntry[] {
  return memories.flatMap(({ id, updatedAt, fact }) => (isValidMemoryFact(fact) ? [{ id, updatedAt, fact }] : []))
}

/**
 * Firma determinista de los hechos de perfil de la memoria: cambia si y solo
 * si cambia lo que `profileFromMemory` puede derivar (alta, edición u olvido
 * de un hecho). No incluye conclusiones ni el texto de las memorias, así que
 * guardar la conclusión de un análisis no la altera y no relanza el análisis.
 * Independiente del orden de entrada.
 */
export function profileSignature(memory: AxisMemory | null | undefined): string {
  const raw: unknown = memory?.profileFacts
  if (!Array.isArray(raw) || raw.length === 0) return ''
  return raw
    .map((e: unknown) => {
      const { id, updatedAt, fact } = (typeof e === 'object' && e !== null ? e : {}) as Record<string, unknown>
      return JSON.stringify([id, updatedAt, fact])
    })
    .sort()
    .join('|')
}

/**
 * Perfil a partir de `memory.profileFacts`. La memoria puede venir del
 * cliente: se descarta cualquier entrada sin id, sin fecha entera o con un
 * hecho inválido, y se acota el número de entradas. Sin hechos → perfil vacío.
 */
export function profileFromMemory(memory: AxisMemory | null | undefined): UserProfile {
  const raw: unknown = memory?.profileFacts
  if (!Array.isArray(raw)) return { sources: {}, conflicts: [] }
  const entries = raw.slice(0, MAX_PROFILE_FACTS).flatMap((e: unknown): FactSource[] => {
    if (typeof e !== 'object' || e === null) return []
    const { id, updatedAt, fact } = e as Record<string, unknown>
    if (typeof id !== 'string' || id.length === 0 || id.length > 64 || !Number.isSafeInteger(updatedAt)) return []
    return isValidMemoryFact(fact) ? [{ id, updatedAt: updatedAt as number, fact }] : []
  })
  return deriveProfile(entries)
}

/** Más reciente primero; a igual `updatedAt`, id lexicográfico ascendente (estable e independiente del orden de entrada). */
const byRecency = (a: Candidate, b: Candidate) => b.memory.updatedAt - a.memory.updatedAt || (a.memory.id < b.memory.id ? -1 : a.memory.id > b.memory.id ? 1 : 0)

/**
 * Perfil a partir de las memorias aceptadas. Solo cuentan las memorias con un
 * hecho estructurado válido (`fact`); el texto libre no aporta nada. Por clase
 * gana la memoria actualizada más recientemente (empate: id); el resto queda
 * en `conflicts`. Sin hechos → perfil vacío.
 */
export function deriveProfile(memories: readonly FactSource[]): UserProfile {
  const candidates: Candidate[] = memories.flatMap((memory) => (isValidMemoryFact(memory.fact) ? [{ memory, fact: memory.fact }] : []))
  if (candidates.length === 0) return { sources: {}, conflicts: [] }

  const profile: UserProfile = { sources: {}, conflicts: [] }
  for (const kind of MEMORY_FACT_KINDS) {
    const ofKind = candidates.filter((c) => c.fact.kind === kind).sort(byRecency)
    const winner = ofKind[0]
    if (!winner) continue
    if (ofKind.length > 1) {
      const conflict: ProfileConflict = { kind, winnerId: winner.memory.id, loserIds: ofKind.slice(1).map((c) => c.memory.id) }
      profile.conflicts.push(conflict)
    }
    apply(profile, winner.fact, winner.memory.id)
  }
  return profile
}

function apply(profile: UserProfile, fact: MemoryFact, sourceId: string): void {
  switch (fact.kind) {
    case 'horizon':
      profile.horizon = fact.value
      profile.sources.horizon = sourceId
      return
    case 'riskAttitude':
      profile.riskAttitude = fact.value
      profile.sources.riskAttitude = sourceId
      return
    case 'minLiquidity':
      profile.minLiquidityCents = fact.cents
      profile.sources.minLiquidityCents = sourceId
      return
    case 'irregularIncome':
      profile.irregularIncome = fact.value
      profile.sources.irregularIncome = sourceId
      return
    case 'priorities':
      profile.priorities = [...fact.objectiveIds]
      profile.sources.priorities = sourceId
      return
  }
}

/**
 * Contrasta el perfil con los datos actuales. Solo las prioridades dependen
 * del contexto: se conservan las que apuntan a un objetivo existente y no
 * completado; el resto se elimina y se explica en `droppedPriorities`. Si no
 * queda ninguna, el campo desaparece (y su `source`). Idempotente: reconciliar
 * un perfil ya reconciliado devuelve exactamente lo mismo.
 */
export function reconcileProfile(profile: UserProfile | ReconciledProfile, ctx: FinancialContext): ReconciledProfile {
  const previouslyDropped: DroppedPriority[] = 'droppedPriorities' in profile ? profile.droppedPriorities : []
  const byId = new Map(ctx.objectives.map((o) => [o.id, o]))
  const kept: string[] = []
  const dropped: DroppedPriority[] = []
  for (const id of profile.priorities ?? []) {
    const objective = byId.get(id)
    if (!objective) dropped.push({ objectiveId: id, reason: 'missing' })
    else if (objective.completed) dropped.push({ objectiveId: id, reason: 'completed' })
    else kept.push(id)
  }
  const sources = { ...profile.sources }
  const out: ReconciledProfile = {
    ...(profile.horizon !== undefined ? { horizon: profile.horizon } : {}),
    ...(profile.riskAttitude !== undefined ? { riskAttitude: profile.riskAttitude } : {}),
    ...(profile.minLiquidityCents !== undefined ? { minLiquidityCents: profile.minLiquidityCents } : {}),
    ...(profile.irregularIncome !== undefined ? { irregularIncome: profile.irregularIncome } : {}),
    sources,
    conflicts: profile.conflicts.map((c) => ({ ...c, loserIds: [...c.loserIds] })),
    droppedPriorities: [...previouslyDropped, ...dropped],
  }
  if (kept.length > 0) out.priorities = kept
  else delete out.sources.priorities
  return out
}

/** Perfil vacío reconciliado (lo que devuelve `reconcileProfile(EMPTY_PROFILE, ctx)`). */
export const EMPTY_RECONCILED_PROFILE: Readonly<ReconciledProfile> = Object.freeze({ ...EMPTY_PROFILE, droppedPriorities: Object.freeze([]) as unknown as DroppedPriority[] })

export type { MemoryFactKind }
