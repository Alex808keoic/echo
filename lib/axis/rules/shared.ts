/**
 * Utilidades comunes de las reglas de AXIS.
 */
import { formatCents } from '../../money'
import { formatPct } from '../../format'
import type { Horizon, ReconciledProfile, RecurringIncome, RiskAttitude } from '../profile/types'
import type { ClosedMonth, FinancialContext, MarketContext, ObjectiveContext, Signal } from '../types'
import { forecastObjectiveAllocation, type ProjectedMonths } from '../../finance/objectives'
import type { Objective } from '../../types'

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
  /** Escenario A: toda la previsión, en cascada (tras los objetivos anteriores). */
  allMonths: ForecastMonths
  /** Escenario B: previsión menos gasto habitual (supone que el gasto se paga con la previsión). */
  afterExpenses:
    | { status: 'no-history' }
    | { status: 'no-margin'; usualExpenseCents: number; basedOnMonths: number }
    | { status: 'ok'; usualExpenseCents: number; basedOnMonths: number; marginCents: number; result: ForecastMonths }
  /** Objetivos en curso que van antes en la cascada (la previsión les llega primero). */
  after: string[]
}


/**
 * Objetivos del contexto tal como los ve el reparto: mismo orden (`rank`, o el
 * del contexto en uno antiguo) y mismo estado. Con el líquido del contexto,
 * `allocateObjectives` reproduce exactamente su reparto.
 */
export function objectivesForAllocation(objectives: readonly ObjectiveContext[]): Objective[] {
  return objectives.map((o, i) => ({
    id: o.id,
    name: o.name,
    targetCents: o.targetCents,
    currentCents: 0,
    createdAt: 0,
    updatedAt: 0,
    ...(o.status === 'achieved' ? { achievedAt: 1 } : { priority: o.rank ?? i + 1 }),
  }))
}

const toForecastMonths = (m: ProjectedMonths | undefined): ForecastMonths => (m === undefined || m === 'beyond' ? 'over-10-years' : m)

/** Meses por objetivo de la simulación en cascada (`forecastObjectiveAllocation`), o `null` sin capacidad. */
function projectedMonths(objectives: Objective[], liquidCents: number, monthlyCents: number): Map<string, ForecastMonths> | null {
  const projection = forecastObjectiveAllocation(objectives, liquidCents, monthlyCents, FORECAST_MAX_MONTHS)
  return projection ? new Map(projection.map((p) => [p.objective.id, toForecastMonths(p.months)])) : null
}

function forecastEntry(
  objective: Pick<ObjectiveContext, 'id' | 'name' | 'remainingCents'>,
  valid: readonly RecurringIncome[],
  monthlyCents: number,
  usualExpenseCents: number | null,
  usualMonths: number,
  allMonths: ForecastMonths,
  marginMonths: ForecastMonths | null,
  after: string[],
): RecurringForecast {
  let afterExpenses: RecurringForecast['afterExpenses']
  if (usualExpenseCents === null || !isCount(usualExpenseCents)) afterExpenses = { status: 'no-history' }
  else if (usualExpenseCents >= monthlyCents || marginMonths === null) afterExpenses = { status: 'no-margin', usualExpenseCents, basedOnMonths: usualMonths }
  else afterExpenses = { status: 'ok', usualExpenseCents, basedOnMonths: usualMonths, marginCents: monthlyCents - usualExpenseCents, result: marginMonths }
  return {
    objectiveId: objective.id,
    objectiveName: objective.name,
    remainingCents: objective.remainingCents,
    monthlyCents,
    incomes: valid.map(({ category, cents }) => ({ category, cents })),
    allMonths,
    afterExpenses,
    after,
  }
}

const validIncomes = (incomes: readonly RecurringIncome[]) => incomes.filter((r) => isCount(r.cents) && r.cents > 0)

/**
 * Previsión de un objetivo aislado (sin otros por delante). `null` para
 * objetivos completados, sin nada que falte o sin previsión positiva. Usa la
 * misma simulación que la cascada: un único objetivo por lo que falta, sin
 * líquido. Escenario A con toda la previsión F; B con F − G solo si hay gasto
 * habitual G y queda margen; si no, se dice por qué. Nunca negativos.
 */
export function recurringForecast(
  objective: Pick<ObjectiveContext, 'id' | 'name' | 'remainingCents' | 'completed'>,
  incomes: readonly RecurringIncome[],
  usualExpenseCents: number | null,
  usualMonths = 0,
): RecurringForecast | null {
  if (objective.completed || !isCount(objective.remainingCents) || objective.remainingCents <= 0) return null
  const valid = validIncomes(incomes)
  const monthlyCents = valid.reduce((t, r) => t + r.cents, 0)
  if (monthlyCents <= 0) return null
  const alone: Objective[] = [{ id: objective.id, name: objective.name, targetCents: objective.remainingCents, currentCents: 0, createdAt: 0, updatedAt: 0 }]
  const all = projectedMonths(alone, 0, monthlyCents)?.get(objective.id) ?? 'over-10-years'
  const margin = usualExpenseCents !== null && isCount(usualExpenseCents) && usualExpenseCents < monthlyCents ? monthlyCents - usualExpenseCents : 0
  const afterMonths = margin > 0 ? (projectedMonths(alone, 0, margin)?.get(objective.id) ?? 'over-10-years') : null
  return forecastEntry(objective, valid, monthlyCents, usualExpenseCents, usualMonths, all, afterMonths, [])
}

/**
 * Previsiones encadenadas de todos los objetivos en curso: la misma cascada
 * que `allocateObjectives` simulada sobre el líquido actual más la previsión
 * mensual. Un objetivo empieza a recibirla cuando los anteriores están
 * cubiertos; los cubiertos y conseguidos no la consumen. Misma entrada → misma salida.
 */
export function recurringForecasts(ctx: FinancialContext, profile?: ReconciledProfile): RecurringForecast[] {
  const declared = recurringIncomesOf(profile)
  if (!declared) return []
  const valid = validIncomes(declared.incomes)
  const monthlyCents = valid.reduce((t, r) => t + r.cents, 0)
  if (monthlyCents <= 0) return []
  const usual = usualMonthlyExpense(ctx.flows.closedMonths)
  const usualMonths = usualExpenseMonthCount(ctx.flows.closedMonths)
  const pool = objectivesForAllocation(ctx.objectives)
  const all = projectedMonths(pool, ctx.wealth.liquidCents, monthlyCents)
  const margin = usual !== null && usual < monthlyCents ? monthlyCents - usual : 0
  const afterExpenses = margin > 0 ? projectedMonths(pool, ctx.wealth.liquidCents, margin) : null
  const pending = ctx.objectives.filter((o) => !o.completed && isCount(o.remainingCents) && o.remainingCents > 0)
  return pending.map((o, i) =>
    forecastEntry(
      o,
      valid,
      monthlyCents,
      usual,
      usualMonths,
      all?.get(o.id) ?? 'over-10-years',
      afterExpenses ? (afterExpenses.get(o.id) ?? 'over-10-years') : null,
      pending.slice(0, i).map((p) => p.name),
    ),
  )
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
