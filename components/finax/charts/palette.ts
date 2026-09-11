/** Paleta de segmentos de los donuts (tonos verdes de Finax, como en el prototipo). */
export const CHART_COLORS = [
  'var(--finax)',
  '#34d399',
  '#0b8560',
  '#6ee7b7',
  '#059669',
  '#a7f3d0',
] as const

export function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length]
}
