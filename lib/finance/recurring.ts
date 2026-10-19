/**
 * Movimientos fijos: cuándo toca cada uno y cuáles quedan por confirmar.
 * Puro y determinista (la fecha de hoy llega como argumento). Lo usan la app
 * y, con la app cerrada, el service worker (public/sw.js), que repite
 * `occurrencesThrough` y `pendingOccurrences` sobre IndexedDB: si cambias el
 * calendario aquí, cámbialo también allí.
 *
 * Calendario: el día del mes (y el mes, si es anual) de `startDate`. Si ese
 * mes no tiene ese día (31 en abril, 29 de febrero), toca el último del mes.
 */
import { requiresMotivo, type MovementInput, type RecurringMovement } from '../types'

export const RECURRING_LIMITS = Object.freeze({
  /** Como mucho se proponen estas veces pendientes por fijo (las más recientes). */
  MAX_PENDING: 24,
  /** Tope de vueltas al recorrer el calendario (100 años de meses). */
  MAX_STEPS: 1200,
})

export interface PendingOccurrence {
  recurring: RecurringMovement
  /** `YYYY-MM-DD` en que tocaba. */
  occurrence: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate()

/** La vez número `step` (0 = `startDate`). */
export function occurrenceAt(r: Pick<RecurringMovement, 'frequency' | 'startDate'>, step: number): string {
  const [y, m, d] = r.startDate.split('-').map(Number)
  const index = r.frequency === 'monthly' ? m - 1 + step : m - 1
  const year = r.frequency === 'monthly' ? y + Math.floor(index / 12) : y + step
  const month = (index % 12) + 1
  return `${year}-${pad(month)}-${pad(Math.min(d, daysInMonth(year, month)))}`
}

/** Todas las veces desde `startDate` hasta `to` (incluido), de la más antigua a la más reciente. */
export function occurrencesThrough(r: Pick<RecurringMovement, 'frequency' | 'startDate'>, to: string): string[] {
  const out: string[] = []
  for (let step = 0; step < RECURRING_LIMITS.MAX_STEPS; step++) {
    const date = occurrenceAt(r, step)
    if (date > to) break
    out.push(date)
  }
  return out
}

/** La vez ya está confirmada u omitida. */
export function isHandled(r: Pick<RecurringMovement, 'doneThrough' | 'handled'>, occurrence: string): boolean {
  return (r.doneThrough !== undefined && occurrence <= r.doneThrough) || (r.handled ?? []).includes(occurrence)
}

/** Veces que ya tocaban (hasta `today`) y siguen sin confirmar ni omitir. Como mucho las `MAX_PENDING` más recientes. */
export function pendingOccurrences(r: RecurringMovement, today: string): string[] {
  return occurrencesThrough(r, today)
    .filter((o) => !isHandled(r, o))
    .slice(-RECURRING_LIMITS.MAX_PENDING)
}

/** Lo pendiente de todos los fijos, de lo más antiguo a lo más reciente. */
export function pendingRecurring(recurring: readonly RecurringMovement[], today: string): PendingOccurrence[] {
  return recurring
    .flatMap((r) => pendingOccurrences(r, today).map((occurrence) => ({ recurring: r, occurrence })))
    .sort((a, b) => (a.occurrence !== b.occurrence ? a.occurrence.localeCompare(b.occurrence) : a.recurring.name.localeCompare(b.recurring.name)))
}

/** La próxima vez sin confirmar ni omitir (puede haber pasado ya, si está pendiente). */
export function nextOccurrence(r: RecurringMovement): string {
  for (let step = 0; step < RECURRING_LIMITS.MAX_STEPS; step++) {
    const date = occurrenceAt(r, step)
    if (!isHandled(r, date)) return date
  }
  return occurrenceAt(r, RECURRING_LIMITS.MAX_STEPS)
}

/**
 * Marca una vez como confirmada u omitida. Las seguidas desde `doneThrough`
 * se compactan en `doneThrough`; las sueltas quedan en `handled`.
 */
export function markHandled(
  r: Pick<RecurringMovement, 'frequency' | 'startDate' | 'doneThrough' | 'handled'>,
  occurrence: string,
): Pick<RecurringMovement, 'doneThrough' | 'handled'> {
  const handled = new Set(r.handled ?? [])
  handled.add(occurrence)
  let doneThrough = r.doneThrough
  for (let step = 0; step < RECURRING_LIMITS.MAX_STEPS; step++) {
    const date = occurrenceAt(r, step)
    if (doneThrough !== undefined && date <= doneThrough) continue
    if (!handled.has(date)) break
    doneThrough = date
    handled.delete(date)
  }
  // Lo que quede por debajo de doneThrough ya no hace falta guardarlo.
  const rest = [...handled].filter((d) => doneThrough === undefined || d > doneThrough).sort()
  return { doneThrough, handled: rest.length > 0 ? rest : undefined }
}

/** Movimiento que crea confirmar una vez, con el importe y la fecha previstos. */
export function movementFromOccurrence(r: RecurringMovement, occurrence: string): MovementInput {
  return {
    type: r.type,
    amountCents: r.amountCents,
    date: occurrence,
    category: r.category,
    // En «Otros», el nombre del fijo hace de motivo (lo que se ve en el historial).
    ...(requiresMotivo(r.category) ? { motivo: r.name } : {}),
    recurringId: r.id,
    occurrence,
  }
}

/** Lo que supone al mes (un fijo anual cuenta su doceava parte). */
export function monthlyEquivalentCents(r: Pick<RecurringMovement, 'amountCents' | 'frequency'>): number {
  return r.frequency === 'monthly' ? r.amountCents : Math.round(r.amountCents / 12)
}

const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «Cada mes, el día 28» · «Cada año, el 5 de marzo». */
export function describeSchedule(r: Pick<RecurringMovement, 'frequency' | 'startDate'>): string {
  const [, m, d] = r.startDate.split('-').map(Number)
  if (r.frequency === 'yearly') return `Cada año, el ${d} de ${MONTHS_LONG[m - 1]}`
  return d > 28 ? `Cada mes, el día ${d} (o el último del mes)` : `Cada mes, el día ${d}`
}
