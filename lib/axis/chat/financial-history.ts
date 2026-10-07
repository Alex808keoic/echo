/**
 * Histórico compacto para el chat de AXIS: un resumen DETERMINISTA de los
 * movimientos reales, calculado en el dispositivo, para responder preguntas
 * como «¿cuánto gasté en julio?» o «¿cuál fue mi mayor gasto?» sin enviar
 * todos los movimientos ni dar al modelo acceso a la base de datos.
 *
 *   meses cerrados       los mismos que `closedMonthsOf` (meses anteriores al de
 *                        `asOf` con al menos un movimiento, como mucho 6), con sus
 *                        totales y las principales categorías (`totalsByCategory`)
 *   movimientos grandes  como mucho 5 del mes en curso (hasta `asOf`) y 5 del
 *                        anterior; siempre incluyen el mayor gasto y el mayor
 *                        ingreso del mes, para responder a las dos preguntas
 *
 * Solo movimientos registrados: nunca previsiones, ingresos recurrentes
 * declarados, memoria ni respuestas anteriores del modelo. Sus cifras entran
 * en las permitidas del chat con su propia fuente (`history`).
 */
import { inMonth, totalsByCategory } from '../../finance/summary'
import { movementLabel, type Movement, type MovementType } from '../../types'
import { closedMonthsOf, monthKeyOf } from '../context'
import { countFigure, moneyFigure, type AllowedFigure } from '../core/figures'

export const HISTORY_LIMITS = {
  MONTHS: 6,
  EXPENSE_CATEGORIES: 4,
  INCOME_CATEGORIES: 2,
  LARGEST_MOVEMENTS: 5,
  MAX_LABEL_CHARS: 60,
} as const

export interface HistoryCategory {
  label: string
  cents: number
}

export interface HistoryMonth {
  /** `YYYY-MM` */
  key: string
  incomeCents: number
  expenseCents: number
  movementCount: number
  /** Principales categorías de gasto, de mayor a menor. */
  topExpenses: HistoryCategory[]
  /** Principales categorías de ingreso, de mayor a menor. */
  topIncomes: HistoryCategory[]
}

export interface HistoryMovement {
  /** `YYYY-MM-DD` */
  date: string
  /** Lo que el usuario ve en Movimientos (categoría, o el motivo en «Otros»). */
  label: string
  category: string
  type: MovementType
  amountCents: number
}

export interface ChatFinancialHistory {
  /** Meses cerrados con movimientos, del más reciente al más antiguo. */
  closedMonths: HistoryMonth[]
  largestMovements: {
    /** `YYYY-MM` del mes en curso y sus movimientos más grandes. */
    currentMonth: { key: string; movements: HistoryMovement[] }
    previousMonth: { key: string; movements: HistoryMovement[] }
  }
}

/** De mayor a menor importe; empates por etiqueta (no depende del orden de entrada). */
const byAmount = <T extends { cents: number; label: string }>(a: T, b: T) => b.cents - a.cents || a.label.localeCompare(b.label, 'es')
const top = (movements: Movement[], type: MovementType, n: number): HistoryCategory[] =>
  totalsByCategory(movements, type)
    .map(({ label, cents }) => ({ label, cents }))
    .sort(byAmount)
    .slice(0, n)

const toHistoryMovement = (m: Movement): HistoryMovement => ({ date: m.date, label: movementLabel(m), category: m.category, type: m.type, amountCents: m.amountCents })

/** Mayor importe primero; empates por fecha (más reciente) y después por id. */
const byMovementAmount = (a: Movement, b: Movement) => b.amountCents - a.amountCents || b.date.localeCompare(a.date) || a.id.localeCompare(b.id)

/**
 * Los N movimientos más grandes del mes, con el mayor gasto y el mayor ingreso
 * siempre presentes (si existen): sin eso, «¿cuál fue mi mayor gasto?» podría
 * quedar fuera cuando las nóminas ocupan todo el top.
 */
function largestOf(movements: Movement[], n: number): HistoryMovement[] {
  const sorted = [...movements].sort(byMovementAmount)
  const chosen = sorted.slice(0, n)
  for (const type of ['gasto', 'ingreso'] as const) {
    const biggest = sorted.find((m) => m.type === type)
    if (biggest && !chosen.includes(biggest)) chosen.splice(chosen.length - 1, 1, biggest)
  }
  return chosen.sort(byMovementAmount).map(toHistoryMovement)
}

export function buildChatFinancialHistory(movements: Movement[], asOf: string): ChatFinancialHistory {
  const currentKey = monthKeyOf(asOf)
  const previousKey = monthKeyOf(asOf, -1)
  // Solo hasta hoy: un movimiento con fecha futura no es historia.
  const real = movements.filter((m) => m.date <= asOf)
  const closedMonths = closedMonthsOf(real, asOf).slice(0, HISTORY_LIMITS.MONTHS).map((month): HistoryMonth => {
    const inside = inMonth(real, month.key)
    return {
      ...month,
      topExpenses: top(inside, 'gasto', HISTORY_LIMITS.EXPENSE_CATEGORIES),
      topIncomes: top(inside, 'ingreso', HISTORY_LIMITS.INCOME_CATEGORIES),
    }
  })
  return {
    closedMonths,
    largestMovements: {
      currentMonth: { key: currentKey, movements: largestOf(inMonth(real, currentKey), HISTORY_LIMITS.LARGEST_MOVEMENTS) },
      previousMonth: { key: previousKey, movements: largestOf(inMonth(real, previousKey), HISTORY_LIMITS.LARGEST_MOVEMENTS) },
    },
  }
}

/* --------------------------- cifras permitidas --------------------------- */

/**
 * Cifras del histórico que el chat puede citar, con fuente `history` y
 * etiqueta trazable. Solo importes y recuentos que Finax ha calculado aquí.
 */
export function historyFigures(history: ChatFinancialHistory | undefined): AllowedFigure[] {
  if (!history) return []
  const out: AllowedFigure[] = []
  for (const m of history.closedMonths) {
    out.push(
      moneyFigure(`Histórico ${m.key}: ingresos`, m.incomeCents, 'history'),
      moneyFigure(`Histórico ${m.key}: gastos`, m.expenseCents, 'history'),
      moneyFigure(`Histórico ${m.key}: balance`, m.incomeCents - m.expenseCents, 'history'),
      countFigure(`Histórico ${m.key}: movimientos`, m.movementCount, 'history'),
    )
    for (const c of [...m.topExpenses, ...m.topIncomes]) out.push(moneyFigure(`Histórico ${m.key}: ${c.label}`, c.cents, 'history'))
  }
  for (const group of [history.largestMovements.currentMonth, history.largestMovements.previousMonth]) {
    for (const mv of group.movements) out.push(moneyFigure(`Movimiento ${mv.date} «${mv.label}»`, mv.amountCents, 'history'))
  }
  return out
}

/** Meses de los que el chat tiene datos de movimientos: los cerrados del histórico, el actual y el anterior. */
export function monthsWithHistory(history: ChatFinancialHistory | undefined, currentKey: string, previousKey: string): Set<string> {
  return new Set([currentKey, previousKey, ...(history?.closedMonths.map((m) => m.key) ?? [])])
}

/* --------------------------------- forma --------------------------------- */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isCents = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0
const isMonthKey = (v: unknown) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)
const isLabel = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= HISTORY_LIMITS.MAX_LABEL_CHARS
const isCategoryList = (v: unknown, max: number) => Array.isArray(v) && v.length <= max && v.every((c) => isRecord(c) && isLabel(c.label) && isCents(c.cents))
const isMovementList = (v: unknown) =>
  Array.isArray(v) &&
  v.length <= HISTORY_LIMITS.LARGEST_MOVEMENTS &&
  v.every((m) => isRecord(m) && typeof m.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.date) && isLabel(m.label) && isLabel(m.category) && (m.type === 'gasto' || m.type === 'ingreso') && isCents(m.amountCents))
const isGroup = (v: unknown) => isRecord(v) && isMonthKey(v.key) && isMovementList(v.movements)

/** Forma y límites del histórico recibido (servidor): lo que no encaje se descarta entero. */
export function isChatFinancialHistory(v: unknown): v is ChatFinancialHistory {
  return (
    isRecord(v) &&
    Array.isArray(v.closedMonths) &&
    v.closedMonths.length <= HISTORY_LIMITS.MONTHS &&
    v.closedMonths.every(
      (m) =>
        isRecord(m) &&
        isMonthKey(m.key) &&
        isCents(m.incomeCents) &&
        isCents(m.expenseCents) &&
        Number.isSafeInteger(m.movementCount) &&
        (m.movementCount as number) > 0 &&
        isCategoryList(m.topExpenses, HISTORY_LIMITS.EXPENSE_CATEGORIES) &&
        isCategoryList(m.topIncomes, HISTORY_LIMITS.INCOME_CATEGORIES),
    ) &&
    isRecord(v.largestMovements) &&
    isGroup(v.largestMovements.currentMonth) &&
    isGroup(v.largestMovements.previousMonth)
  )
}

/** Para el modelo: compacto y en español, importes en céntimos como el resto del contexto. */
export function historyForPrompt(history: ChatFinancialHistory) {
  return {
    nota: 'Calculado por Finax solo con los movimientos registrados (meses cerrados con movimientos y movimientos más grandes). No incluye previsiones ni ingresos recurrentes declarados. Importes en céntimos.',
    meses_cerrados: history.closedMonths.map((m) => ({
      mes: m.key,
      ingresos: m.incomeCents,
      gastos: m.expenseCents,
      movimientos: m.movementCount,
      principales_gastos: m.topExpenses.map((c) => ({ categoria: c.label, importe: c.cents })),
      principales_ingresos: m.topIncomes.map((c) => ({ categoria: c.label, importe: c.cents })),
    })),
    movimientos_mas_grandes: {
      mes_en_curso: { mes: history.largestMovements.currentMonth.key, movimientos: history.largestMovements.currentMonth.movements.map(promptMovement) },
      mes_anterior: { mes: history.largestMovements.previousMonth.key, movimientos: history.largestMovements.previousMonth.movements.map(promptMovement) },
    },
  }
}

const promptMovement = (m: HistoryMovement) => ({ fecha: m.date, concepto: m.label, categoria: m.category, tipo: m.type, importe: m.amountCents })
