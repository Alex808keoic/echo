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
 * Las categorías cerradas tienen siempre el mismo color (Comida siempre verde),
 * así que al cambiar de mes una categoría no cambia de color. «Otros» no tiene
 * color propio: cada motivo («Luz», «Gasolina») toma los libres por tamaño.
 */
const FIXED_SLOTS: Record<MovementType, readonly string[]> = {
  gasto: EXPENSE_CATEGORIES.filter((c) => c !== 'Otros'),
  ingreso: INCOME_CATEGORIES.filter((c) => c !== 'Otros'),
}

/**
 * Porciones como mucho en el donut (con «Resto»): tantas como colores, así que
 * nunca se repite uno (las cerradas que no salen dejan su color a los motivos).
 */
export const MAX_DONUT_SLICES = CHART_COLORS.length

export interface DonutSlice extends CategoryTotal {
  color: string
}

/**
 * Porciones del donut de categorías. Recibe las categorías ordenadas de mayor
 * a menor (`totalsByCategory`). Si hay más de `MAX_DONUT_SLICES`, las más
 * pequeñas se juntan en «Resto» (gris): todo lo dibujado tiene su fila en la
 * leyenda y la suma sigue siendo el total.
 */
export function donutSlices(categories: readonly CategoryTotal[], type: MovementType): DonutSlice[] {
  const fixed = FIXED_SLOTS[type]
  const shown = categories.length > MAX_DONUT_SLICES ? categories.slice(0, MAX_DONUT_SLICES - 1) : categories
  const rest = categories.slice(shown.length)

  // Para los motivos de «Otros»: primero los colores sin categoría cerrada y, si no bastan, los de
  // categorías cerradas que no salen en este donut. Nunca dos porciones con el mismo color.
  const usedSlots = new Set(shown.map((c) => fixed.indexOf(c.label)).filter((i) => i >= 0))
  const free: string[] = [
    ...CHART_COLORS.filter((_, i) => i >= fixed.length),
    ...CHART_COLORS.filter((_, i) => i < fixed.length && !usedSlots.has(i)),
  ]
  const slices: DonutSlice[] = shown.map((c) => {
    const slot = fixed.indexOf(c.label)
    return { ...c, color: slot >= 0 ? CHART_COLORS[slot] : (free.shift() ?? REST_COLOR) }
  })
  if (rest.length > 0) {
    slices.push({
      key: '__resto__',
      label: 'Resto',
      cents: rest.reduce((t, c) => t + c.cents, 0),
      pct: rest.reduce((t, c) => t + c.pct, 0),
      color: REST_COLOR,
    })
  }
  return slices
}
