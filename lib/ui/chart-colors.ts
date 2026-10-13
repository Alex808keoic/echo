import type { CategoryTotal } from '@/lib/finance/summary'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type MovementType } from '@/lib/types'

/**
 * Paleta categórica: ocho tonos distintos en un orden validado para daltonismo
 * (cada par vecino ΔE ≥ 9 con protanopía, deuteranopía y tritanopía; ≥ 19 con
 * visión normal). Antes eran seis verdes casi iguales: con más de tres
 * categorías no se distinguían. Tres tonos (aqua, amarillo, magenta) quedan
 * por debajo de 3:1 sobre blanco, así que siempre van con su nombre y su
 * porcentaje al lado (leyenda), nunca solo el color.
 */
export const CHART_COLORS = [
  '#2a78d6', // azul
  '#eb6834', // naranja
  '#1baf7a', // aqua
  '#eda100', // amarillo
  '#e87ba4', // magenta
  '#008300', // verde
  '#6250d6', // violeta
  '#e34948', // rojo
] as const

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

/** Gris de «Resto»: lo que no cabe en la leyenda, sin competir con los colores. */
export const REST_COLOR = '#9a9890'

/** Color por posición fija (inversiones, desglose): el orden de la lista, nunca el tamaño. */
export function chartColor(index: number): string {
  return index < CHART_COLORS.length ? CHART_COLORS[index] : REST_COLOR
}

/**
 * Las categorías cerradas tienen siempre el mismo color (Comida siempre azul),
 * así que al cambiar de mes una categoría no cambia de color. «Otros» no tiene
 * color propio: cada motivo («Luz», «Gasolina») toma los libres por tamaño.
 */
const FIXED_SLOTS: Record<MovementType, readonly string[]> = {
  gasto: EXPENSE_CATEGORIES.filter((c) => c !== 'Otros'),
  ingreso: INCOME_CATEGORIES.filter((c) => c !== 'Otros'),
}

/** Porciones como mucho en el donut (con «Resto»): lo que cabe en la leyenda a 360 px. */
export const MAX_DONUT_SLICES = 6

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
