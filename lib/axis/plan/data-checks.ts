/**
 * Datos que parecen mal apuntados (revisión como asesor del 2026-11-08). Pura y
 * determinista, en el dispositivo: mira los movimientos, los fijos, los
 * objetivos y las memorias, y avisa. Nunca cambia nada ni mueve importes del
 * plan: un asesor pregunta antes de corregir, y decide el usuario.
 *
 *   - Préstamo apuntado como gasto: dejar dinero a alguien no es gasto «de cada
 *     mes». Sin marcarlo como puntual, infla el gasto habitual y el colchón.
 *   - Algo habitual marcado como puntual: una suscripción, un fijo o un gasto
 *     que se repite cada mes. Marcado como puntual, el gasto habitual sale más
 *     bajo de lo que es y el plan reparte un ahorro que no existe.
 *   - Objetivo distinto del que le contaste a AXIS: una memoria de objetivo con
 *     una cantidad que no tiene ningún objetivo.
 */
import { isAdvance, movementLabel, type Movement, type Objective, type RecurringMovement } from '../../types'
import type { UserMemory } from '../chat/types'

/** Meses hacia atrás que se revisan (los del gasto habitual). */
export const DATA_CHECK_MONTHS = 6
/** Diferencia de importe para considerar dos gastos «el mismo» (±25 %). */
const SAME_AMOUNT_TOLERANCE = 0.25
/** Diferencia con la que un objetivo «coincide» con lo que dijiste (±5 %). */
const GOAL_MATCH_TOLERANCE = 0.05
/** Cantidades de las memorias que se tienen en cuenta: 50 € o más (lo demás no suele ser una meta). */
const GOAL_MIN_CENTS = 5_000
/** Como mucho, avisos de cada tipo (el paso no es una lista de todo lo apuntado). */
const MAX_PER_KIND = 3

export type DataIssue =
  /** `oneOff`: ya estaba marcado como puntual (no cambia el plan, pero sigue contando como gasto tuyo). */
  | { kind: 'loan-as-expense'; movementId: string; label: string; cents: number; date: string; oneOff?: true }
  | {
      kind: 'habitual-marked-one-off'
      movementId: string
      label: string
      cents: number
      date: string
      /** Por qué parece habitual: es una suscripción, salió de un fijo, o se repite en otros meses. */
      reason: 'subscription' | 'fixed' | 'repeats'
    }
  | {
      kind: 'goal-differs-from-memory'
      memoryId: string
      /** Lo que le contaste a AXIS (el texto de la memoria). */
      said: string
      saidCents: number
      /** El objetivo de cantidad más parecida, si tienes alguno. */
      closest?: { objectiveId: string; name: string; targetCents: number }
    }

export interface DataCheckInput {
  movements: readonly Movement[]
  recurring?: readonly RecurringMovement[]
  objectives: readonly Objective[]
  memories: readonly UserMemory[]
  /** `YYYY-MM-DD` */
  asOf: string
}

export function checkData(input: DataCheckInput): DataIssue[] {
  const from = monthsBack(input.asOf, DATA_CHECK_MONTHS)
  const recent = input.movements.filter((m) => m.date >= from && m.date <= input.asOf && m.amountCents > 0)
  return [...loansAsExpense(recent), ...habitualMarkedOneOff(recent, input.recurring ?? []), ...goalsDifferingFromMemory(input.objectives, input.memories)]
}

/* ----------------------------- préstamos ----------------------------- */

/** «Le presté…», «préstamo a…», «le dejé 20 € a…». No: la cuota de un préstamo del banco (eso sí es de cada mes). */
// `\b` no ve la «é» como letra: los bordes de palabra van con \p{L} (bandera `u`).
const LENT = /(?<!\p{L})(prest[eéó]|prestad[oa]s?|prestarle|pr[eé]stamo a|le dej[eé]|les dej[eé]|dej[eé] dinero)(?!\p{L})/iu
const BANK_LOAN = /(?<!\p{L})(cuota|banco|hipoteca|financiaci[oó]n|letra)(?!\p{L})/iu
const BANK_CATEGORIES = new Set(['Seguros y banco', 'Vivienda'])

function loansAsExpense(recent: readonly Movement[]): DataIssue[] {
  return recent
    // Un «Adelanto» ya está bien apuntado: la parte que te devuelven no cuenta como gasto tuyo. Uno marcado como
    // puntual también se avisa (2026-11-11, QA): no sube el gasto habitual, pero sigue siendo un gasto en tus cuentas.
    .filter((m) => m.type === 'gasto' && !isAdvance(m) && !BANK_CATEGORIES.has(m.category))
    .filter((m) => {
      const text = `${m.motivo ?? ''} ${m.nota ?? ''}`
      return LENT.test(text) && !BANK_LOAN.test(text)
    })
    .sort(newestFirst)
    .slice(0, MAX_PER_KIND)
    .map((m) => ({ kind: 'loan-as-expense' as const, movementId: m.id, label: movementLabel(m), cents: m.amountCents, date: m.date, ...(m.puntual === true ? { oneOff: true as const } : {}) }))
}

/* -------------------------- habitual como puntual -------------------------- */

function habitualMarkedOneOff(recent: readonly Movement[], recurring: readonly RecurringMovement[]): DataIssue[] {
  const fixedIds = new Set(recurring.filter((r) => r.type === 'gasto').map((r) => r.id))
  const expenses = recent.filter((m) => m.type === 'gasto')
  const seen = new Set<string>()
  const out: DataIssue[] = []
  for (const m of [...expenses].sort(newestFirst)) {
    if (m.puntual !== true) continue
    // Un préstamo marcado como puntual está bien apuntado (2026-11-08: «Se lo he prestado a Lucas» salía como «se repite»).
    if (LENT.test(textOf(m))) continue
    const label = movementLabel(m)
    // «Se repite» solo con un texto propio (motivo o nota): la categoría sola se repite siempre («Restaurantes»).
    const own = ownText(m)
    const seenKey = own ?? `#${m.id}`
    if (seen.has(seenKey)) continue
    const reason: 'subscription' | 'fixed' | 'repeats' | null =
      m.recurringId !== undefined && fixedIds.has(m.recurringId)
        ? 'fixed'
        : m.category === 'Suscripciones'
          ? 'subscription'
          : own !== null && expenses.some((o) => o.id !== m.id && o.date.slice(0, 7) !== m.date.slice(0, 7) && ownText(o) === own && sameAmount(o.amountCents, m.amountCents))
            ? 'repeats'
            : null
    if (!reason) continue
    seen.add(seenKey)
    out.push({ kind: 'habitual-marked-one-off', movementId: m.id, label, cents: m.amountCents, date: m.date, reason })
    if (out.length >= MAX_PER_KIND) break
  }
  return out
}

const sameAmount = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * SAME_AMOUNT_TOLERANCE
const textOf = (m: Movement) => `${m.motivo ?? ''} ${m.nota ?? ''}`
/** El texto que identifica un movimiento más allá de su categoría (motivo o nota), normalizado; `null` si no tiene. */
const ownText = (m: Movement): string | null => {
  const t = normalize(m.motivo || m.nota || '')
  return t.length > 0 ? t : null
}

/* ------------------------- objetivo frente a memoria ------------------------- */

/** «5.000 €», «5000 euros», «1.250,50 €». Sin lo que va «al mes» o «a la semana» (eso es un ritmo, no una meta). */
const AMOUNT = /(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d{1,2}))?\s*(?:€|euros?\b)(?!\s*(?:al|a la|por|cada|\/)\s*(?:mes|semana|año|día|dia))/gi

/** La cantidad más alta de un texto, en céntimos (`null` si no hay ninguna de `GOAL_MIN_CENTS` o más). */
export function goalAmountOf(text: string): number | null {
  let best: number | null = null
  for (const match of text.matchAll(AMOUNT)) {
    const euros = Number(match[1].replace(/[.\s]/g, ''))
    const cents = euros * 100 + (match[2] ? Number(match[2].padEnd(2, '0')) : 0)
    if (Number.isSafeInteger(cents) && cents >= GOAL_MIN_CENTS && (best === null || cents > best)) best = cents
  }
  return best
}

function goalsDifferingFromMemory(objectives: readonly Objective[], memories: readonly UserMemory[]): DataIssue[] {
  // Los conseguidos también cuentan: si ya llegaste a esa meta, la memoria no contradice nada.
  const targets = objectives.filter((o) => o.targetCents > 0)
  const out: DataIssue[] = []
  for (const memory of memories) {
    if (memory.category !== 'goal' || memory.planIgnored === true) continue
    const said = goalAmountOf(memory.content)
    if (said === null) continue
    if (targets.some((o) => Math.abs(o.targetCents - said) <= said * GOAL_MATCH_TOLERANCE)) continue
    const closest = [...targets].filter((o) => o.achievedAt === undefined).sort((a, b) => Math.abs(a.targetCents - said) - Math.abs(b.targetCents - said))[0]
    out.push({
      kind: 'goal-differs-from-memory',
      memoryId: memory.id,
      said: memory.content,
      saidCents: said,
      ...(closest ? { closest: { objectiveId: closest.id, name: closest.name, targetCents: closest.targetCents } } : {}),
    })
    if (out.length >= MAX_PER_KIND) break
  }
  return out
}

/* --------------------------------- utilidades --------------------------------- */

const newestFirst = (a: Movement, b: Movement) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** Primer día del mes `months - 1` meses antes del de `asOf` (incluye el mes en curso). */
function monthsBack(asOf: string, months: number): string {
  const y = Number(asOf.slice(0, 4))
  const m = Number(asOf.slice(5, 7)) - (months - 1)
  const d = new Date(Date.UTC(y, m - 1, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}
