/**
 * Geometría del gráfico de evolución del patrimonio. Para que la forma sea
 * fiel al dato:
 *
 * - X proporcional al tiempo: dos días seguidos no ocupan lo mismo que dos
 *   meses (antes cada punto estaba a la misma distancia del anterior).
 * - Y ajustado a la serie, con un ancho mínimo (`yDomain`): una variación de
 *   49 € sobre 558 € se ve como una subida, pero 3 € sobre 558 € siguen casi
 *   planos (la escala nunca es más estrecha que el 15 % del patrimonio). El 0
 *   vuelve a la escala si la serie es negativa, lo cruza o se acerca a él.
 *   (Con el 0 siempre en escala, un patrimonio lejos del cero se veía como
 *   una línea plana sobre un bloque verde que no decía nada.)
 */
export interface ChartGeometry {
  points: Array<readonly [number, number]>
  /** Base del área rellena: el 0 si está en escala; si no, el borde inferior (el área se desvanece, no marca una cantidad). */
  baseY: number
  /** Si el 0 está en la escala. */
  zeroInScale: boolean
}

/** La escala nunca es más estrecha que esta fracción del valor absoluto mayor: así no se exageran cambios pequeños. */
export const MIN_SPAN_RATIO = 0.15
/** Con un mínimo por debajo de esta fracción del máximo, la serie está «cerca del cero» y el 0 entra en escala. */
export const NEAR_ZERO_RATIO = 0.25

/** Dominio vertical [lo, hi] para una serie. */
export function yDomain(values: number[]): { lo: number; hi: number; zeroInScale: boolean } {
  const vmin = Math.min(...values)
  const vmax = Math.max(...values)
  const nearZero = vmin <= 0 || vmax <= 0 || vmin <= vmax * NEAR_ZERO_RATIO
  if (nearZero) {
    const lo = Math.min(0, vmin)
    const hi = Math.max(0, vmax)
    return { lo, hi: hi > lo ? hi : lo + 1, zeroInScale: true }
  }
  const span = Math.max(vmax - vmin, Math.max(Math.abs(vmin), Math.abs(vmax)) * MIN_SPAN_RATIO)
  const center = (vmax + vmin) / 2
  // Al ensanchar por el centro, el borde inferior nunca baja del 0 (sería un cero que no está en escala).
  const lo = Math.max(0, center - span / 2)
  return { lo, hi: lo + span, zeroInScale: lo === 0 }
}

export function chartGeometry(values: number[], xs: number[] | null, width: number, height: number, padY: number): ChartGeometry {
  const { lo: min, hi: max, zeroInScale } = yDomain(values)
  const span = max - min
  const y = (v: number) => padY + (1 - (v - min) / span) * (height - padY * 2)

  const hasTime = xs !== null && xs.length === values.length && xs[xs.length - 1] > xs[0]
  const x0 = hasTime ? xs[0] : 0
  const xSpan = hasTime ? xs[xs.length - 1] - xs[0] : values.length - 1 || 1
  const x = (i: number) => ((hasTime ? xs[i] - x0 : i) / xSpan) * width

  return { points: values.map((v, i) => [x(i), y(v)] as const), baseY: zeroInScale ? y(0) : height, zeroInScale }
}

/** Fecha `YYYY-MM-DD` → días (para el eje X). */
export const dayNumber = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000

/**
 * Trazo suave SIN inventar valores: interpolación cúbica monótona
 * (Fritsch–Carlson, como `curveMonotoneX`). Entre dos puntos la curva nunca
 * pasa por encima ni por debajo de ellos, y nunca retrocede en el tiempo (el
 * suavizado anterior, pensado para puntos equidistantes, sí podía hacerlo con
 * fechas irregulares).
 */
export function smoothPath(points: ReadonlyArray<readonly [number, number]>): string {
  const n = points.length
  if (n === 0) return ''
  if (n === 1) return `M ${points[0][0]},${points[0][1]}`
  const h = (i: number) => points[i + 1][0] - points[i][0]
  const slope = (i: number) => (h(i) === 0 ? 0 : (points[i + 1][1] - points[i][1]) / h(i))
  const tangents = points.map((_, i) => {
    if (i === 0) return slope(0)
    if (i === n - 1) return slope(n - 2)
    const s0 = slope(i - 1)
    const s1 = slope(i)
    if (s0 * s1 <= 0) return 0
    const h0 = h(i - 1)
    const h1 = h(i)
    const p = (s0 * h1 + s1 * h0) / (h0 + h1 || 1)
    return Math.sign(s0) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) * 2
  })
  let d = `M ${points[0][0]},${points[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    const dx = (x1 - x0) / 3
    d += ` C ${x0 + dx},${y0 + tangents[i] * dx} ${x1 - dx},${y1 - tangents[i + 1] * dx} ${x1},${y1}`
  }
  return d
}
