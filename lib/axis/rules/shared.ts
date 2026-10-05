/**
 * Utilidades comunes de las reglas de AXIS.
 */
import { formatCents } from '../../money'
import { formatPct } from '../../format'
import type { Horizon, ReconciledProfile, RecurringIncome, RiskAttitude } from '../profile/types'
import type { ClosedMonth, FinancialContext, MarketContext, ObjectiveContext, Signal } from '../types'

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

/* ------------------------------ previsiones (fase 5) ------------------------------ */
/*
 * Una previsión puede explicar el futuro, pero nunca convertirse en dinero
 * presente: nada de lo de aquí entra en el líquido, el patrimonio, los
 * ingresos registrados ni ninguna cifra real. Solo céntimos enteros.
 */

/** Meses cerrados con datos que hacen falta como mínimo para estimar el gasto habitual. */
export const MIN_USUAL_EXPENSE_MONTHS = 3
/** Meses cerrados con datos que se miran como mucho (los más recientes). */
export const MAX_USUAL_EXPENSE_MONTHS = 6
/** Por encima de esto, una previsión se expresa como «más de 10 años». */
export const FORECAST_MAX_MONTHS = 120

const isCount = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0

/**
 * Meses válidos para el gasto habitual: con movimientos y cifras enteras no
 * negativas (el contexto puede llegar del cliente), los más recientes primero,
 * como mucho `MAX_USUAL_EXPENSE_MONTHS`.
 */
function usualExpenseMonths(closedMonths: readonly ClosedMonth[] | undefined): ClosedMonth[] {
  return (Array.isArray(closedMonths) ? closedMonths : [])
    .filter((m) => typeof m?.key === 'string' && isCount(m.expenseCents) && isCount(m.movementCount) && m.movementCount > 0)
    .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
    .slice(0, MAX_USUAL_EXPENSE_MONTHS)
}

/**
 * Gasto habitual: mediana del gasto de los últimos hasta 6 meses CERRADOS con
 * datos (el mes en curso nunca entra), con un mínimo de 3. Con un número par
 * de meses, media de los dos centrales. Redondeado a euros enteros hacia
 * arriba, como `requiredMonthlyCents`. Sin meses suficientes, `null`: nunca se
 * inventa un gasto.
 */
export function usualMonthlyExpense(closedMonths: readonly ClosedMonth[] | undefined): number | null {
  const months = usualExpenseMonths(closedMonths)
  if (months.length < MIN_USUAL_EXPENSE_MONTHS) return null
  const values = months.map((m) => m.expenseCents).sort((a, b) => a - b)
  const mid = Math.floor(values.length / 2)
  const median = values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2
  return Math.max(0, Math.ceil(median / 100) * 100)
}

/** Cuántos meses entran en el gasto habitual (para decirlo: «mediana de 4 meses»). */
export function usualExpenseMonthCount(closedMonths: readonly ClosedMonth[] | undefined): number {
  return usualExpenseMonths(closedMonths).length
}

/** Ingresos recurrentes declarados con memoria de origen, y su suma mensual. */
export function recurringIncomesOf(profile?: ReconciledProfile): { incomes: readonly RecurringIncome[]; monthlyCents: number } | null {
  const incomes = (profile?.recurringIncomes ?? []).filter((r) => r.frequency === 'monthly' && isCount(r.cents) && r.cents > 0 && r.sourceMemoryId)
  if (incomes.length === 0) return null
  return { incomes, monthlyCents: incomes.reduce((t, r) => t + r.cents, 0) }
}

/** Meses o «más de 10 años» (más de `FORECAST_MAX_MONTHS`): nunca un número exacto por encima del tope. */
export type ForecastMonths = number | 'over-10-years'

export interface RecurringForecast {
  objectiveId: string
  objectiveName: string
  remainingCents: number
  /** F: suma de los ingresos previstos al mes. */
  monthlyCents: number
  incomes: ReadonlyArray<Pick<RecurringIncome, 'category' | 'cents'>>
  /** Escenario A: toda la previsión. */
  allMonths: ForecastMonths
  /** Escenario B: previsión menos gasto habitual (supone que el gasto se paga con la previsión). */
  afterExpenses:
    | { status: 'no-history' }
    | { status: 'no-margin'; usualExpenseCents: number; basedOnMonths: number }
    | { status: 'ok'; usualExpenseCents: number; basedOnMonths: number; marginCents: number; result: ForecastMonths }
}

function capped(months: number): ForecastMonths {
  return months > FORECAST_MAX_MONTHS ? 'over-10-years' : months
}

/**
 * Previsión de un objetivo con los ingresos recurrentes declarados. `null`
 * para objetivos completados, sin nada que falte o sin previsión positiva.
 * Escenario A: ⌈restante / F⌉. Escenario B: ⌈restante / (F − G)⌉ solo si hay
 * gasto habitual G y queda margen; si no, se dice por qué. Nunca negativos.
 */
export function recurringForecast(
  objective: Pick<ObjectiveContext, 'id' | 'name' | 'remainingCents' | 'completed'>,
  incomes: readonly RecurringIncome[],
  usualExpenseCents: number | null,
  usualMonths = 0,
): RecurringForecast | null {
  if (objective.completed || !isCount(objective.remainingCents) || objective.remainingCents <= 0) return null
  const valid = incomes.filter((r) => isCount(r.cents) && r.cents > 0)
  const monthlyCents = valid.reduce((t, r) => t + r.cents, 0)
  if (monthlyCents <= 0) return null
  const R = objective.remainingCents
  let afterExpenses: RecurringForecast['afterExpenses']
  if (usualExpenseCents === null || !isCount(usualExpenseCents)) afterExpenses = { status: 'no-history' }
  else if (usualExpenseCents >= monthlyCents) afterExpenses = { status: 'no-margin', usualExpenseCents, basedOnMonths: usualMonths }
  else {
    const marginCents = monthlyCents - usualExpenseCents
    afterExpenses = { status: 'ok', usualExpenseCents, basedOnMonths: usualMonths, marginCents, result: capped(Math.ceil(R / marginCents)) }
  }
  return {
    objectiveId: objective.id,
    objectiveName: objective.name,
    remainingCents: R,
    monthlyCents,
    incomes: valid.map(({ category, cents }) => ({ category, cents })),
    allMonths: capped(Math.ceil(R / monthlyCents)),
    afterExpenses,
  }
}

/** Previsiones de todos los objetivos a partir del contexto y del perfil. Misma entrada → misma salida. */
export function recurringForecasts(ctx: FinancialContext, profile?: ReconciledProfile): RecurringForecast[] {
  const declared = recurringIncomesOf(profile)
  if (!declared) return []
  const usual = usualMonthlyExpense(ctx.flows.closedMonths)
  const months = usualExpenseMonthCount(ctx.flows.closedMonths)
  return ctx.objectives.flatMap((o) => recurringForecast(o, declared.incomes, usual, months) ?? [])
}

const INCOME_WORDS: Record<RecurringIncome['category'], string> = { Paga: 'de paga', Regalos: 'en regalos', Otros: 'de otros ingresos' }

/** «35,00 € al mes de paga» · «45,00 € al mes (35,00 € de paga y 10,00 € en regalos)». */
export function describeRecurringIncomes(incomes: ReadonlyArray<Pick<RecurringIncome, 'category' | 'cents'>>): string {
  const total = incomes.reduce((t, r) => t + r.cents, 0)
  if (incomes.length === 1) return `${eur(total)} al mes ${INCOME_WORDS[incomes[0].category]}`
  const parts = incomes.map((r) => `${eur(r.cents)} ${INCOME_WORDS[r.category]}`)
  return `${eur(total)} al mes: ${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}

export function forecastMonthsText(m: ForecastMonths): string {
  return m === 'over-10-years' ? 'más de 10 años' : `${m} ${m === 1 ? 'mes' : 'meses'}`
}
