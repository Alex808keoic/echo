/**
 * Geometría del gráfico de evolución del patrimonio. Para que la forma sea
 * fiel al dato:
 *
 * - X proporcional al tiempo: dos días seguidos no ocupan lo mismo que dos
 *   meses (antes cada punto estaba a la misma distancia del anterior).
 * - Y siempre incluye el 0: el área rellena hasta el cero, así que una
 *   variación de 50 € sobre 8.000 € se ve pequeña y un patrimonio negativo
 *   queda por debajo de la línea base (antes el eje iba del mínimo al máximo
 *   de la serie y cualquier cambio ocupaba toda la altura, como si fuera una
 *   rentabilidad).
 */
export interface ChartGeometry {
  points: Array<readonly [number, number]>
  /** Altura (en coordenadas del SVG) del valor 0: base del área rellena. */
  zeroY: number
}

export function chartGeometry(values: number[], xs: number[] | null, width: number, height: number, padY: number): ChartGeometry {
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1
  const y = (v: number) => padY + (1 - (v - min) / span) * (height - padY * 2)

  const hasTime = xs !== null && xs.length === values.length && xs[xs.length - 1] > xs[0]
  const x0 = hasTime ? xs[0] : 0
  const xSpan = hasTime ? xs[xs.length - 1] - xs[0] : values.length - 1 || 1
  const x = (i: number) => ((hasTime ? xs[i] - x0 : i) / xSpan) * width

  return { points: values.map((v, i) => [x(i), y(v)] as const), zeroY: y(0) }
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
