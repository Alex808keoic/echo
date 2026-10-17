/**
 * Recordatorios del consultor: qué conviene recordarte hoy. Puro y
 * determinista; lo usan Inicio (al abrir la app) y, con la app cerrada, el
 * service worker (public/sw.js), que repite ESTAS MISMAS reglas sobre IndexedDB.
 * Si cambias una regla aquí, cámbiala también allí.
 *
 *   month-ready         días 1–3: tu decisión del mes está lista (sin nada marcado)
 *   income-missing      desde el día 10: has declarado un ingreso fijo y no hay ningún ingreso este mes
 *   update-investments  alguna inversión lleva más de 30 días sin actualizar su valor
 *   month-ending        desde el día 25: te quedan pasos de tu decisión del mes
 */
import { formatMonthYear } from './dates'

export const REMINDER_RULES = Object.freeze({
  MONTH_READY_LAST_DAY: 3,
  INCOME_MISSING_FROM_DAY: 10,
  STALE_INVESTMENT_DAYS: 30,
  MONTH_ENDING_FROM_DAY: 25,
})

export type ReminderId = 'month-ready' | 'income-missing' | 'update-investments' | 'month-ending'

export interface Reminder {
  id: ReminderId
  text: string
  /** Pantalla a la que lleva. */
  to: 'plan' | 'movimientos' | 'inversiones'
}

export interface ReminderInput {
  /** `YYYY-MM-DD` de hoy. */
  today: string
  /** Pasos de «Tu decisión del mes» y cuántos están hechos (`null` si aún no hay plan). */
  checklist: { items: number; done: number } | null
  /** Ingreso fijo declarado (memoria `recurringIncome`), si lo hay. */
  hasRecurringIncome: boolean
  /** Ingresos registrados este mes. */
  incomeThisMonth: number
  /** `updatedAt` (ms) de cada inversión. */
  positionsUpdatedAt: number[]
  now?: number
}

const DAY_MS = 86_400_000

export function dueReminders(input: ReminderInput): Reminder[] {
  const day = Number(input.today.slice(8, 10))
  const month = formatMonthYear(input.today.slice(0, 7))
  const now = input.now ?? Date.now()
  const out: Reminder[] = []
  const c = input.checklist
  if (c && c.items > 0 && c.done === 0 && day <= REMINDER_RULES.MONTH_READY_LAST_DAY) out.push({ id: 'month-ready', text: `Tu decisión de ${month} está lista: ${c.items} pasos.`, to: 'plan' })
  if (input.hasRecurringIncome && input.incomeThisMonth === 0 && day >= REMINDER_RULES.INCOME_MISSING_FROM_DAY)
    out.push({ id: 'income-missing', text: 'Aún no has registrado ningún ingreso este mes. Si ya te ha llegado, apúntalo.', to: 'movimientos' })
  const stale = input.positionsUpdatedAt.filter((t) => now - t > REMINDER_RULES.STALE_INVESTMENT_DAYS * DAY_MS).length
  if (stale > 0)
    out.push({
      id: 'update-investments',
      text: stale === 1 ? 'Una inversión lleva más de 30 días sin actualizar su valor.' : `${stale} inversiones llevan más de 30 días sin actualizar su valor.`,
      to: 'inversiones',
    })
  if (c && c.done < c.items && day >= REMINDER_RULES.MONTH_ENDING_FROM_DAY) {
    const left = c.items - c.done
    out.push({ id: 'month-ending', text: left === 1 ? 'Te queda 1 paso de tu decisión del mes.' : `Te quedan ${left} pasos de tu decisión del mes.`, to: 'plan' })
  }
  return out
}
