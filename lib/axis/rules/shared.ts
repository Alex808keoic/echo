/**
 * Utilidades comunes de las reglas de AXIS.
 */
import { formatCents } from '../../money'
import { formatPct } from '../../format'
import type { Horizon, ReconciledProfile, RiskAttitude } from '../profile/types'
import type { FinancialContext, MarketContext, Signal } from '../types'

/**
 * Una regla recibe el contexto financiero, si existe el de mercado y el
 * perfil del usuario ya reconciliado con el contexto. El perfil es contexto
 * para decidir (umbrales y preferencias declaradas), nunca fuente de cifras;
 * una regla que no lo necesita simplemente no lo lee.
 */
export type Rule = (ctx: FinancialContext, market?: MarketContext | null, profile?: ReconciledProfile) => Signal[]

export const eur = (cents: number, withSign = false) => formatCents(cents, withSign)
export const pct = (value: number, withSign = false) => formatPct(Math.round(value), withSign)

/* ------------------------------ perfil ------------------------------- */

/** Liquidez actual por debajo del mínimo declarado por el usuario. */
export interface LiquidityShortfall {
  minCents: number
  liquidCents: number
  /** `minCents − liquidCents`, siempre > 0. Calculado por AXIS. */
  deficitCents: number
  /** Memoria que aporta el mínimo (trazabilidad de la influencia). */
  sourceMemoryId: string
}

/**
 * Única comparación entre la liquidez actual y el mínimo declarado
 * (`profile.minLiquidityCents`). Devuelve el déficit solo cuando:
 *   - el perfil declara un mínimo Y su origen (un campo sin memoria de origen no existe);
 *   - la liquidez es calculable de forma válida: hay saldo inicial (sin él, el
 *     líquido sale solo de los movimientos y no representa lo que hay);
 *   - el líquido está estrictamente por debajo del mínimo (igual = cubierto).
 * En cualquier otro caso, `null`: no se inventa ninguna comparación.
 */
/**
 * Ingresos declarados como irregulares (`profile.irregularIncome === true`)
 * con memoria de origen. Es un hecho declarado sobre los datos, no una
 * preferencia: solo puede rebajar UN nivel (high → medium) las señales que
 * comparan un mes con el anterior por el lado de los ingresos, y cambiar su
 * texto/incertidumbre. Nunca toca `critical`, nunca elimina ni crea señales
 * ni recomendaciones. Sin origen no existe.
 */
export function irregularIncomeOf(profile?: ReconciledProfile): { sourceMemoryId: string } | null {
  if (profile?.irregularIncome !== true) return null
  const sourceMemoryId = profile.sources.irregularIncome
  return sourceMemoryId === undefined ? null : { sourceMemoryId }
}

/**
 * Prioridades declaradas entre objetivos (`profile.priorities`, ya reconciliadas:
 * solo ids de objetivos existentes y no completados) con memoria de origen.
 * Es un mecanismo de SELECCIÓN entre candidatos equivalentes: nunca crea,
 * elimina ni cambia de prioridad ninguna señal. Sin origen no existe.
 */
export function prioritiesOf(profile?: ReconciledProfile): { ids: readonly string[]; sourceMemoryId: string } | null {
  const ids = profile?.priorities
  const sourceMemoryId = profile?.sources.priorities
  if (!ids || ids.length === 0 || sourceMemoryId === undefined) return null
  return { ids, sourceMemoryId }
}

/** Priorizados primero, en el orden declarado; el resto conserva su orden original (sort estable). No muta. */
export function rankByPriorities<T extends { id: string }>(items: T[], ids: readonly string[]): T[] {
  const rank = new Map(ids.map((id, i) => [id, i]))
  return [...items].sort((a, b) => (rank.get(a.id) ?? ids.length) - (rank.get(b.id) ?? ids.length))
}

/** Preferencia declarada con memoria de origen; sin origen no existe. Solo cambia texto, nunca decisión. */
export interface DeclaredPreference<T> {
  value: T
  sourceMemoryId: string
}

/** Horizonte declarado (`profile.horizon`). La única fuente válida es el perfil reconciliado; nunca `AxisMemory.preferences`. */
export function horizonOf(profile?: ReconciledProfile): DeclaredPreference<Horizon> | null {
  const value = profile?.horizon
  const sourceMemoryId = profile?.sources.horizon
  return value === undefined || sourceMemoryId === undefined ? null : { value, sourceMemoryId }
}

/** Actitud ante el riesgo declarada (`profile.riskAttitude`). Misma regla: solo perfil reconciliado con origen. */
export function riskAttitudeOf(profile?: ReconciledProfile): DeclaredPreference<RiskAttitude> | null {
  const value = profile?.riskAttitude
  const sourceMemoryId = profile?.sources.riskAttitude
  return value === undefined || sourceMemoryId === undefined ? null : { value, sourceMemoryId }
}

export function liquidityShortfall(ctx: FinancialContext, profile?: ReconciledProfile): LiquidityShortfall | null {
  const minCents = profile?.minLiquidityCents
  const sourceMemoryId = profile?.sources.minLiquidityCents
  if (minCents === undefined || sourceMemoryId === undefined) return null
  if (!ctx.quality.hasInitialBalance) return null
  const liquidCents = ctx.wealth.liquidCents
  if (liquidCents >= minCents) return null
  return { minCents, liquidCents, deficitCents: minCents - liquidCents, sourceMemoryId }
}

/** Umbrales de las reglas, en un solo sitio para poder ajustarlos y documentarlos. */
export const THRESHOLDS = {
  /** Variación de ingresos o gastos que se considera significativa. */
  significantChangePct: 20,
  /** Subida de ingresos que sugiere un ingreso extraordinario. */
  extraordinaryIncomePct: 50,
  /** Peso de una categoría sobre el gasto del mes que se considera concentración. */
  categoryConcentrationPct: 50,
  /** Tasa de ahorro considerada sólida. */
  healthySavingsRatePct: 20,
  /** Progreso a partir del cual un objetivo está «cerca». */
  objectiveNearPct: 90,
  /** Días de vida de un objetivo sin progreso antes de señalarlo. */
  objectiveStaleDays: 30,
  /** Peso de una posición sobre la cartera que se considera concentración. */
  positionConcentrationPct: 70,
  /** Peso de las inversiones sobre el patrimonio a partir del cual la liquidez es escasa. */
  lowLiquidityInvestedPct: 80,
} as const
