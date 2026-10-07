/**
 * Construcción del `FinancialContext` a partir del estado real de Finax.
 *
 * Es una función pura: recibe una instantánea de los datos (lo que hay en
 * Dexie) y devuelve el contexto que consume el motor. No inventa nada: lo que
 * no existe queda como lista vacía, `null` o un flag en `quality`.
 */
import { roundedShares, summarize, totalsByCategory, inMonth, pctChange } from '../finance/summary'
import { buildPatrimonioSeries, computeLiquidCents } from '../finance/patrimonio'
import { allocateObjectives, totalInvestedCents, totalValueCents, type ObjectiveAllocation } from '../finance/objectives'
import { todayISO } from '../dates'
import type { AppConfig, Movement, Objective, Position } from '../types'
import type {
  CategoryShare,
  ClosedMonth,
  ContextLevel,
  FinancialContext,
  ObjectiveContext,
  PeriodStats,
  PositionContext,
} from './types'

/** Instantánea de los datos locales. Es lo único que AXIS necesita de Finax. */
export interface FinancialSnapshot {
  config: AppConfig | null
  movements: Movement[]
  objectives: Objective[]
  positions: Position[]
}

const DAY_MS = 86_400_000
const MONTH_DAYS = 30.44

/** `YYYY-MM` del mes de `iso`, desplazado `offsetMonths` meses (calendario local). */
export function monthKeyOf(iso: string, offsetMonths = 0): string {
  const [y, m] = iso.split('-').map(Number)
  const d = new Date(y, m - 1 + offsetMonths, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function daysBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split('-').map(Number)
  const [ty, tm, td] = toISO.split('-').map(Number)
  return Math.round((new Date(ty, tm - 1, td).getTime() - new Date(fy, fm - 1, fd).getTime()) / DAY_MS)
}

function toShares(totals: ReturnType<typeof totalsByCategory>): CategoryShare[] {
  return totals.map(({ label, cents, pct }) => ({ label, cents, pct }))
}

function periodStats(movements: Movement[], key: string): PeriodStats {
  const inPeriod = inMonth(movements, key)
  const s = summarize(inPeriod)
  return {
    key,
    incomeCents: s.incomeCents,
    expenseCents: s.expenseCents,
    savingsCents: s.balanceCents,
    savingsRatePct: s.incomeCents > 0 ? (s.balanceCents / s.incomeCents) * 100 : null,
    movementCount: s.movementCount,
    expensesByCategory: toShares(totalsByCategory(inPeriod, 'gasto')),
    incomeByCategory: toShares(totalsByCategory(inPeriod, 'ingreso')),
  }
}

/** Meses cerrados que se conservan en `flows.closedMonths`. */
export const MAX_CLOSED_MONTHS = 6

/**
 * Totales de los meses CERRADOS con datos: meses naturales anteriores al de
 * `asOf` con al menos un movimiento (un mes sin movimientos no es «gasto 0»:
 * es falta de datos). Los más recientes primero, como mucho `MAX_CLOSED_MONTHS`.
 * Misma agregación que `flows.current`/`previous` (`summarize` sobre `inMonth`).
 */
export function closedMonthsOf(movements: Movement[], asOf: string): ClosedMonth[] {
  const currentKey = monthKeyOf(asOf)
  const keys = [...new Set(movements.map((m) => m.date.slice(0, 7)))].filter((k) => k < currentKey).sort().reverse().slice(0, MAX_CLOSED_MONTHS)
  return keys.map((key) => {
    const s = summarize(inMonth(movements, key))
    return { key, incomeCents: s.incomeCents, expenseCents: s.expenseCents, movementCount: s.movementCount }
  })
}

/**
 * Contexto de un objetivo a partir del reparto automático (`allocateObjectives`,
 * la única fuente del progreso): lo asignado, lo que falta y su estado. El
 * `currentCents` guardado no se usa. `aheadRemainingCents` es lo que falta a
 * los objetivos que van antes en la cascada.
 */
function objectiveContext(item: ObjectiveAllocation, aheadRemainingCents: number, asOf: string): ObjectiveContext {
  const o = item.objective
  const achieved = item.status === 'achieved'
  const target = Math.max(0, o.targetCents)
  const currentCents = achieved ? target : item.allocatedCents
  const remainingCents = item.remainingCents
  const completed = item.status !== 'in-progress'
  const createdISO = new Date(o.createdAt).toISOString().slice(0, 10)
  const ctx: ObjectiveContext = {
    id: o.id,
    name: o.name,
    targetCents: o.targetCents,
    currentCents,
    remainingCents,
    progressPct: item.pct,
    completed,
    status: item.status,
    rank: item.rank,
    aheadRemainingCents,
    ageDays: Math.max(0, daysBetween(createdISO, asOf)),
  }
  if (o.targetDate) {
    const monthsLeft = daysBetween(asOf, o.targetDate) / MONTH_DAYS
    ctx.targetDate = o.targetDate
    ctx.monthsLeft = monthsLeft
    if (!completed && monthsLeft > 0) {
      // En cascada: el ahorro cubre antes lo que falta a los objetivos anteriores.
      // Redondeado a euros enteros: una cifra con céntimos sugeriría una precisión que no existe.
      const cumulative = aheadRemainingCents + remainingCents
      ctx.requiredMonthlyCents = Math.ceil(cumulative / Math.max(monthsLeft, 1 / MONTH_DAYS) / 100) * 100
    }
  }
  return ctx
}

function positionContexts(positions: Position[]): PositionContext[] {
  const weights = roundedShares(positions.map((p) => p.valueCents))
  return positions.map((p, i) => ({
    id: p.id,
    name: p.name,
    investedCents: p.investedCents,
    valueCents: p.valueCents,
    weightPct: weights[i],
  }))
}

/**
 * Nivel de contexto:
 * - `none`: sin movimientos, no hay situación que interpretar;
 * - `limited`: hay movimientos pero poco histórico (menos de un periodo
 *   anterior con datos, o muy pocos movimientos);
 * - `sufficient`: hay periodo anterior y un mínimo de movimientos.
 */
function contextLevel(movementCount: number, hasPreviousPeriod: boolean): ContextLevel {
  if (movementCount === 0) return 'none'
  if (!hasPreviousPeriod || movementCount < 5) return 'limited'
  return 'sufficient'
}

export function buildFinancialContext(snapshot: FinancialSnapshot, asOf: string = todayISO()): FinancialContext {
  const { config, movements, objectives, positions } = snapshot
  const initialBalanceCents = config?.initialBalanceCents ?? 0
  const liquidCents = computeLiquidCents(initialBalanceCents, movements, positions)
  const investedCents = totalValueCents(positions)
  const totalCents = liquidCents + investedCents

  const currentKey = monthKeyOf(asOf)
  const current = periodStats(movements, currentKey)
  const previous = periodStats(movements, monthKeyOf(asOf, -1))

  // Reparto automático: única fuente del progreso y del dinero destinado a objetivos.
  // Orden: activos por prioridad (cascada) y, detrás, los conseguidos.
  const allocation = allocateObjectives(objectives, liquidCents)
  let ahead = 0
  // Un objetivo sin meta positiva (solo puede llegar de una copia importada: el formulario la exige)
  // nunca recibe dinero ni se cubre: AXIS no habla de él como pendiente, estancado ni «siguiente».
  const objectiveCtxs = allocation.items.filter((item) => item.objective.targetCents > 0).map((item) => {
    const ctx = objectiveContext(item, item.status === 'achieved' ? 0 : ahead, asOf)
    if (item.status !== 'achieved') ahead += item.remainingCents
    return ctx
  })

  const history = buildPatrimonioSeries(initialBalanceCents, movements, positions)
  const monthsWithData = new Set(movements.map((m) => m.date.slice(0, 7))).size
  const hasPreviousPeriod = previous.movementCount > 0

  return {
    asOf,
    wealth: {
      totalCents,
      liquidCents,
      investedCents,
      // Lo asignado a los objetivos activos; los conseguidos no reservan nada.
      reservedForObjectivesCents: allocation.allocatedCents,
      initialBalanceCents,
    },
    flows: {
      current,
      previous,
      incomeChangePct: pctChange(current.incomeCents, previous.incomeCents),
      expenseChangePct: pctChange(current.expenseCents, previous.expenseCents),
      history,
      closedMonths: closedMonthsOf(movements, asOf),
    },
    objectives: objectiveCtxs,
    investments: {
      positions: positionContexts(positions),
      totalInvestedCents: totalInvestedCents(positions),
      totalValueCents: investedCents,
      shareOfWealthPct: totalCents > 0 ? Math.round((investedCents / totalCents) * 100) : 0,
    },
    quality: {
      level: contextLevel(movements.length, hasPreviousPeriod),
      hasInitialBalance: config !== null,
      movementCount: movements.length,
      historyDays: history.length,
      monthsWithData,
      hasPreviousPeriod,
      hasObjectives: objectives.length > 0,
      hasInvestments: positions.length > 0,
      isDemo: config?.demo === true,
    },
  }
}
