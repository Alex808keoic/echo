/**
 * Sugerencias para rellenar formularios (valores por defecto inteligentes).
 *
 * Una sugerencia sale SIEMPRE del historial real del usuario: es lo que él
 * mismo ha hecho más veces, no una preferencia del producto ni un dato
 * inventado. Se ofrece ya seleccionada para ahorrarle la decisión, y siempre
 * es visible y modificable antes de guardar.
 *
 * Con poco historial no se sugiere nada: acertar por casualidad una vez no
 * autoriza a decidir por el usuario las siguientes.
 */
import type { Category, Movement, MovementType } from '../types'

/** Movimientos del tipo indicado por debajo de los cuales no se sugiere categoría. */
export const MIN_HISTORY_FOR_SUGGESTION = 3

/** Días de historial que se tienen en cuenta: lo reciente representa mejor el hábito actual. */
export const SUGGESTION_WINDOW_DAYS = 90

/**
 * Categoría más usada por el usuario para ese tipo de movimiento en los
 * últimos `SUGGESTION_WINDOW_DAYS` días. Desempata la usada más recientemente
 * y, si aún hay empate, el orden alfabético (determinista). `null` si no hay
 * historial suficiente.
 */
export function suggestedCategory(movements: Movement[], type: MovementType, today: string): Category | null {
  const from = shiftDays(today, -SUGGESTION_WINDOW_DAYS)
  const recent = movements.filter((m) => m.type === type && m.date >= from && m.date <= today)
  if (recent.length < MIN_HISTORY_FOR_SUGGESTION) return null

  const stats = new Map<string, { count: number; lastDate: string }>()
  for (const m of recent) {
    const previous = stats.get(m.category)
    if (!previous) stats.set(m.category, { count: 1, lastDate: m.date })
    else stats.set(m.category, { count: previous.count + 1, lastDate: m.date > previous.lastDate ? m.date : previous.lastDate })
  }

  const ranked = [...stats.entries()].sort(
    ([aCat, a], [bCat, b]) => b.count - a.count || (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0) || (aCat < bCat ? -1 : aCat > bCat ? 1 : 0),
  )
  return (ranked[0]?.[0] as Category | undefined) ?? null
}

/** `YYYY-MM-DD` desplazada `days` días (puede ser negativo). Sin dependencias del reloj. */
function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
