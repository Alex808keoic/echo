/**
 * Ledger de presupuesto (`budget.json` en la rama de datos).
 *
 * Reglas:
 * - `assertBudget()` se llama ANTES de cada llamada a un proveedor, también
 *   en el fallback. Si cualquier límite se supera, la llamada no se hace.
 * - El intento se registra ANTES de llamar (`recordAttempt`): un error de
 *   red o un timeout consumen cupo igual que una respuesta válida.
 * - El uso real de tokens se registra después (`recordUsage`).
 * - Un ledger ilegible o con forma incorrecta bloquea (nunca se «repara»
 *   silenciosamente a cero, porque eso reabriría el cupo).
 */
import { estimateTokens, LIMITS } from './limits'

export interface BudgetLedger {
  version: 1
  /** Mes en curso `YYYY-MM` (UTC). */
  month: string
  monthCalls: number
  monthTokens: number
  deepResearchThisMonth: number
  /** Día `YYYY-MM-DD` (UTC) y llamadas en ese día. */
  day: string
  dayCalls: number
  /** Semana ISO `YYYY-Www` y nº de investigaciones extra por evento en ella. */
  week: string
  eventResearchThisWeek: number
  /** Últimos intentos, para trazabilidad (máx. 30). */
  attempts: Array<{ at: string; provider: string; reason: string; ok?: boolean; tokens?: number }>
}

export type BudgetDecision = { allowed: true } | { allowed: false; reason: string }

export interface BudgetCheck {
  /** Tokens de entrada estimados de la llamada que se quiere hacer. */
  estimatedInputTokens: number
  /** Si la llamada corresponde a una investigación profunda nueva (cuenta en el tope mensual de profundas). */
  newDeepResearch: boolean
  /** Si la profunda es «extra» por evento (cuenta en el tope semanal). */
  eventResearch?: boolean
}

export function isoDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export function isoMonth(now: Date): string {
  return now.toISOString().slice(0, 7)
}

/** Semana ISO 8601 `YYYY-Www` en UTC. */
export function isoWeek(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function emptyLedger(now: Date): BudgetLedger {
  return {
    version: 1,
    month: isoMonth(now),
    monthCalls: 0,
    monthTokens: 0,
    deepResearchThisMonth: 0,
    day: isoDay(now),
    dayCalls: 0,
    week: isoWeek(now),
    eventResearchThisWeek: 0,
    attempts: [],
  }
}

const isInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0

/** Comprueba la forma del ledger. Devuelve `null` si está corrupto. */
export function parseLedger(raw: unknown): BudgetLedger | null {
  if (typeof raw !== 'object' || raw === null) return null
  const l = raw as Record<string, unknown>
  if (
    l.version !== 1 ||
    typeof l.month !== 'string' ||
    !isInt(l.monthCalls) ||
    !isInt(l.monthTokens) ||
    !isInt(l.deepResearchThisMonth) ||
    typeof l.day !== 'string' ||
    !isInt(l.dayCalls) ||
    typeof l.week !== 'string' ||
    !isInt(l.eventResearchThisWeek) ||
    !Array.isArray(l.attempts)
  ) {
    return null
  }
  return l as unknown as BudgetLedger
}

/** Reinicia los contadores cuyo periodo ha cambiado. */
export function rollover(ledger: BudgetLedger, now: Date): BudgetLedger {
  const next = { ...ledger, attempts: [...ledger.attempts] }
  if (next.month !== isoMonth(now)) {
    next.month = isoMonth(now)
    next.monthCalls = 0
    next.monthTokens = 0
    next.deepResearchThisMonth = 0
  }
  if (next.day !== isoDay(now)) {
    next.day = isoDay(now)
    next.dayCalls = 0
  }
  if (next.week !== isoWeek(now)) {
    next.week = isoWeek(now)
    next.eventResearchThisWeek = 0
  }
  return next
}

/**
 * Decide si se puede hacer UNA llamada. No modifica el ledger.
 * Cualquier límite superado bloquea; el orden solo determina el motivo.
 */
export function assertBudget(ledger: BudgetLedger | null, check: BudgetCheck, now: Date = new Date()): BudgetDecision {
  if (!ledger) return { allowed: false, reason: 'ledger de presupuesto ilegible o corrupto' }
  const l = rollover(ledger, now)
  if (l.dayCalls + 1 > LIMITS.MAX_AI_REQUESTS_PER_DAY) return { allowed: false, reason: `límite diario de llamadas (${LIMITS.MAX_AI_REQUESTS_PER_DAY})` }
  if (l.monthCalls + 1 > LIMITS.MAX_AI_REQUESTS_PER_MONTH) return { allowed: false, reason: `límite mensual de llamadas (${LIMITS.MAX_AI_REQUESTS_PER_MONTH})` }
  if (check.newDeepResearch && l.deepResearchThisMonth + 1 > LIMITS.MAX_DEEP_RESEARCH_PER_MONTH) {
    return { allowed: false, reason: `límite mensual de investigaciones profundas (${LIMITS.MAX_DEEP_RESEARCH_PER_MONTH})` }
  }
  if (check.eventResearch && l.eventResearchThisWeek + 1 > LIMITS.MAX_EVENT_RESEARCH_PER_WEEK) {
    return { allowed: false, reason: `límite semanal de investigaciones por evento (${LIMITS.MAX_EVENT_RESEARCH_PER_WEEK})` }
  }
  if (check.estimatedInputTokens > LIMITS.MAX_INPUT_TOKENS) return { allowed: false, reason: `entrada estimada (${check.estimatedInputTokens}) supera MAX_INPUT_TOKENS` }
  const projected = l.monthTokens + check.estimatedInputTokens + LIMITS.MAX_OUTPUT_TOKENS
  if (projected > LIMITS.MAX_TOTAL_TOKENS) return { allowed: false, reason: `tokens mensuales proyectados (${projected}) superan MAX_TOTAL_TOKENS` }
  return { allowed: true }
}

/** Registra un intento ANTES de llamar. Devuelve el ledger actualizado. */
export function recordAttempt(
  ledger: BudgetLedger,
  attempt: { provider: string; reason: string; newDeepResearch: boolean; eventResearch?: boolean },
  now: Date = new Date(),
): BudgetLedger {
  const l = rollover(ledger, now)
  l.dayCalls += 1
  l.monthCalls += 1
  if (attempt.newDeepResearch) l.deepResearchThisMonth += 1
  if (attempt.eventResearch) l.eventResearchThisWeek += 1
  l.attempts = [...l.attempts, { at: now.toISOString(), provider: attempt.provider, reason: attempt.reason }].slice(-30)
  return l
}

/** Registra el resultado y el uso real de tokens del último intento. */
export function recordUsage(ledger: BudgetLedger, usage: { ok: boolean; totalTokens: number }): BudgetLedger {
  const attempts = [...ledger.attempts]
  const last = attempts[attempts.length - 1]
  if (last) attempts[attempts.length - 1] = { ...last, ok: usage.ok, tokens: usage.totalTokens }
  return { ...ledger, monthTokens: ledger.monthTokens + Math.max(0, Math.round(usage.totalTokens)), attempts }
}

export { estimateTokens }
