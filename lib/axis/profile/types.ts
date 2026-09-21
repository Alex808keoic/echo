/**
 * Perfil estructurado del usuario (fase 2 · bloque 2).
 *
 * Un `MemoryFact` es un hecho TIPADO ligado a una memoria aceptada por el
 * usuario (`UserMemory.fact`). Nunca se infiere del texto libre: o la
 * memoria trae un hecho válido, o no aporta nada al perfil. `UserProfile` es
 * la vista DERIVADA de esos hechos (un valor por clase, el más reciente):
 * nunca se persiste, se recalcula siempre a partir de las memorias.
 *
 * El perfil es contexto para decidir (umbrales y preferencias), no fuente
 * de verdad financiera: no contiene ni sustituye cifras del FinancialContext.
 */

export const HORIZONS = ['short', 'medium', 'long'] as const
/** < 2 años · 2–5 años · > 5 años. */
export type Horizon = (typeof HORIZONS)[number]

export const RISK_ATTITUDES = ['conservative', 'balanced', 'dynamic'] as const
export type RiskAttitude = (typeof RISK_ATTITUDES)[number]

export const MEMORY_FACT_KINDS = ['horizon', 'riskAttitude', 'minLiquidity', 'irregularIncome', 'priorities'] as const
export type MemoryFactKind = (typeof MEMORY_FACT_KINDS)[number]

export const PROFILE_LIMITS = Object.freeze({
  /** Liquidez mínima deseada: entero en céntimos, de 1 céntimo a 1 M€. */
  MIN_LIQUIDITY_MIN_CENTS: 1,
  MIN_LIQUIDITY_MAX_CENTS: 100_000_000,
  /** Objetivos priorizados como máximo. */
  MAX_PRIORITIES: 5,
})

/** Exactamente una clase por hecho; cada clase, con su forma. */
export type MemoryFact =
  | { kind: 'horizon'; value: Horizon }
  | { kind: 'riskAttitude'; value: RiskAttitude }
  | { kind: 'minLiquidity'; cents: number }
  | { kind: 'irregularIncome'; value: boolean }
  | { kind: 'priorities'; objectiveIds: string[] }

export type ProfileField = 'horizon' | 'riskAttitude' | 'minLiquidityCents' | 'irregularIncome' | 'priorities'

export interface ProfileConflict {
  kind: MemoryFactKind
  /** Memoria que ha ganado (la actualizada más recientemente). */
  winnerId: string
  /** Memorias de la misma clase que han perdido, en el mismo orden de desempate. */
  loserIds: string[]
}

export interface UserProfile {
  horizon?: Horizon
  riskAttitude?: RiskAttitude
  minLiquidityCents?: number
  irregularIncome?: boolean
  /** Ids de objetivos, por orden de prioridad. */
  priorities?: string[]
  /** Trazabilidad: id de la memoria que aporta cada campo. */
  sources: Partial<Record<ProfileField, string>>
  conflicts: ProfileConflict[]
}

export const EMPTY_PROFILE: Readonly<UserProfile> = Object.freeze({ sources: Object.freeze({}), conflicts: Object.freeze([]) as unknown as ProfileConflict[] })

export interface DroppedPriority {
  objectiveId: string
  reason: 'missing' | 'completed'
}

/** Perfil contrastado con el FinancialContext: solo quita lo que los datos actuales invalidan. */
export interface ReconciledProfile extends UserProfile {
  droppedPriorities: DroppedPriority[]
}

/* ------------------------- influencia en la decisión ------------------------ */

/**
 * Cómo ha influido el perfil en una señal (bloque 4). Cada efecto es de una
 * lista cerrada y queda ligado al campo del perfil, a la memoria que lo
 * aporta y a la señal afectada: toda influencia es trazable.
 *
 *   added-signal         la señal existe solo por el perfil (su hecho sigue siendo objetivo)
 *   priority-lowered     la prioridad ha bajado un nivel (nunca sube)
 *   interpretation       cambia solo el texto de la interpretación
 *   uncertainty          cambia o añade la incertidumbre de la señal
 *   alternative-removed  la señal deja de ofrecer su alternativa
 *   target-selected      el perfil elige el destino entre candidatos equivalentes
 *
 * En el paso 1 (plomería) ninguna regla produce influencia: el tipo existe
 * para que la estructura sea estable antes de que haya comportamiento.
 */
export const PROFILE_EFFECTS = ['added-signal', 'priority-lowered', 'interpretation', 'uncertainty', 'alternative-removed', 'target-selected'] as const
export type ProfileEffect = (typeof PROFILE_EFFECTS)[number]

export interface ProfileInfluence {
  field: ProfileField
  /** Memoria que aporta el campo (`UserProfile.sources[field]`). */
  sourceMemoryId: string
  signalId: string
  effect: ProfileEffect
  /** Valor anterior y nuevo cuando el efecto los tiene (p. ej. prioridad). */
  from?: string
  to?: string
}

/** Perfil tal y como lo ha aplicado `decide()`: los campos reconciliados y toda su influencia. */
export interface DecisionProfile {
  fields: ReconciledProfile
  influence: ProfileInfluence[]
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Forma estricta de un hecho: clase conocida, campos exactos de su clase, enums y rangos válidos. Sin contexto. */
export function isValidMemoryFact(v: unknown): v is MemoryFact {
  if (!isRecord(v) || typeof v.kind !== 'string') return false
  const keys = Object.keys(v).sort()
  switch (v.kind) {
    case 'horizon':
      return keys.join() === 'kind,value' && HORIZONS.includes(v.value as Horizon)
    case 'riskAttitude':
      return keys.join() === 'kind,value' && RISK_ATTITUDES.includes(v.value as RiskAttitude)
    case 'minLiquidity':
      return keys.join() === 'cents,kind' && Number.isInteger(v.cents) && (v.cents as number) >= PROFILE_LIMITS.MIN_LIQUIDITY_MIN_CENTS && (v.cents as number) <= PROFILE_LIMITS.MIN_LIQUIDITY_MAX_CENTS
    case 'irregularIncome':
      return keys.join() === 'kind,value' && typeof v.value === 'boolean'
    case 'priorities': {
      if (keys.join() !== 'kind,objectiveIds' || !Array.isArray(v.objectiveIds)) return false
      const ids = v.objectiveIds
      return ids.length >= 1 && ids.length <= PROFILE_LIMITS.MAX_PRIORITIES && ids.every((id) => typeof id === 'string' && id.trim().length > 0) && new Set(ids).size === ids.length
    }
    default:
      return false
  }
}

export function isEmptyProfile(p: UserProfile): boolean {
  return p.horizon === undefined && p.riskAttitude === undefined && p.minLiquidityCents === undefined && p.irregularIncome === undefined && p.priorities === undefined && Object.keys(p.sources).length === 0 && p.conflicts.length === 0
}
