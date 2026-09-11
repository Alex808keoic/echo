/**
 * Fechas en formato `YYYY-MM-DD` (hora local, sin componente horario).
 */

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function toISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function shiftedISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

/** Mes en curso `YYYY-MM`. */
export function currentMonthKey(): string {
  return todayISO().slice(0, 7)
}

/** Clave de mes desplazada `offset` meses respecto a hoy. */
export function shiftedMonthKey(offset: number): string {
  const now = new Date()
  return toISODate(new Date(now.getFullYear(), now.getMonth() + offset, 1)).slice(0, 7)
}

/** "15 abr 2025" */
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`
}

/** "15 de abril de 2025" */
export function formatFullDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} de ${MONTHS_LONG[m - 1]} de ${y}`
}

/** Encabezado del grupo de un día en el historial: "Hoy, 15 abr 2025". */
export function formatDayHeading(iso: string): string {
  const today = todayISO()
  const short = formatShortDate(iso)
  if (iso === today) return `Hoy, ${short}`
  if (iso === shiftedISO(today, -1)) return `Ayer, ${short}`
  return short
}

/** Etiqueta corta de mes a partir de `YYYY-MM`: "Abr". */
export function formatMonthLabel(monthKey: string): string {
  const label = MONTHS_SHORT[Number(monthKey.slice(5, 7)) - 1]
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export interface DayGroup<T> {
  date: string
  items: T[]
}

/** Agrupa por día, de más reciente a más antiguo. */
export function groupByDay<T extends { date: string }>(items: T[]): DayGroup<T>[] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const group = groups.get(item.date)
    if (group) group.push(item)
    else groups.set(item.date, [item])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, groupItems]) => ({ date, items: groupItems }))
}
