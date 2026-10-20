import type { CategoryTotal } from '@/lib/finance/summary'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type MovementType } from '@/lib/types'

/**
 * Paleta categórica de la familia de Finax: del verde de la marca al violeta
 * de AXIS, pasando por bosque, petróleo y azul cielo. Tonos fríos y tranquilos
 * para una app blanca y verde (una paleta multicolor con naranja o amarillo
 * rompía la estética), separados sobre todo por claridad.
 *
 * Validada con TODAS las parejas, no solo las vecinas, porque en el donut
 * cualquier color puede quedar junto a cualquier otro: ΔE ≥ 12,2 con
 * daltonismo (protanopía/deuteranopía) y ≥ 15,5 con visión normal, también
 * frente al gris de «Resto». El azul cielo queda por debajo de 3:1 sobre
 * blanco: como todos, va siempre con su nombre y su porcentaje en la leyenda.
 */
export const CHART_COLORS = [
  '#0ea676', // verde Finax
  '#6d5fd8', // violeta AXIS
  '#4aa3df', // azul cielo
  '#02648c', // petróleo
  '#00672c', // verde bosque
] as const

/** Gris claro de «Resto»: lo que no cabe en la leyenda, sin competir con los colores. */
export const REST_COLOR = '#c4c7cc'

/** Color por posición fija (inversiones): el orden de la lista, nunca el tamaño. */
export function chartColor(index: number): string {
  return index < CHART_COLORS.length ? CHART_COLORS[index] : REST_COLOR
}

/**
 * Verdes de Finax para el desglose del patrimonio (Mi Dinero): como mucho tres
 * partes fijas (objetivos, inversiones, disponible), que se distinguen bien.
 */
export const BRAND_COLORS = {
  objetivos: 'var(--finax)',
  inversiones: '#34d399',
  disponible: '#0b8560',
} as const

/** Color fijo de cada parte del desglose: no cambia cuando otra parte vale 0. */
export function brandColor(key: keyof typeof BRAND_COLORS): string {
  return BRAND_COLORS[key]
}

/**
 * Orden de las categorías cerradas para repartir los colores: el de su lista
 * (Supermercado antes que Restaurantes). Con 15 categorías y 5 colores ya no
 * cabe un color fijo por categoría; repartirlos en este orden, y no por
 * tamaño, hace que una categoría cambie de color solo si cambia qué
 * categorías salen ese mes. «Otros» no tiene puesto: cada motivo («Luz»,
 * «Gasolina») va detrás, por tamaño.
 */
const ORDER: Record<MovementType, readonly string[]> = {
  gasto: EXPENSE_CATEGORIES.filter((c) => c !== 'Otros'),
  ingreso: INCOME_CATEGORIES.filter((c) => c !== 'Otros'),
}

/** Categorías con porción propia como mucho; si hay más, las demás van a «Resto» (decisión del usuario, 2026-10-20). */
export const MAX_NAMED_SLICES = CHART_COLORS.length

export interface DonutSlice extends CategoryTotal {
  color: string
}

/**
 * Porciones del donut de categorías. Recibe las categorías ordenadas de mayor
 * a menor (`totalsByCategory`). Las `MAX_NAMED_SLICES` mayores tienen porción
 * y color propios (nunca repetidos); el resto se junta en «Resto» (gris):
 * todo lo dibujado tiene su fila en la leyenda y la suma sigue siendo el total.
 */
export function donutSlices(categories: readonly CategoryTotal[], type: MovementType): DonutSlice[] {
  const order = ORDER[type]
  const shown = categories.slice(0, MAX_NAMED_SLICES)
  const rest = categories.slice(shown.length)
  const rank = (label: string) => {
    const i = order.indexOf(label)
    return i >= 0 ? i : order.length
  }
  // Colores por orden de categoría; los motivos de «Otros», detrás y por tamaño (orden estable).
  const byOrder = shown.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c.label) - rank(b.c.label) || a.i - b.i)
  const colorOf = new Map(byOrder.map(({ c }, i) => [c.key, CHART_COLORS[i]]))
  const slices: DonutSlice[] = shown.map((c) => ({ ...c, color: colorOf.get(c.key) ?? REST_COLOR }))
  if (rest.length > 0) {
    slices.push({
      key: REST_KEY,
      label: 'Resto',
      cents: rest.reduce((t, c) => t + c.cents, 0),
      pct: rest.reduce((t, c) => t + c.pct, 0),
      color: REST_COLOR,
    })
  }
  return slices
}

/** Clave de la porción «Resto». */
export const REST_KEY = '__resto__'
