/**
 * El gráfico de evolución dibuja fielmente la serie: tiempo proporcional, el
 * cero siempre en escala y un trazo suave que no inventa valores.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chartGeometry, dayNumber, smoothPath } from '../chart-geometry'

const W = 340
const H = 150
const PAD = 14
const days = (...iso: string[]) => iso.map(dayNumber)

describe('geometría del gráfico de evolución', () => {
  it('eje X proporcional al tiempo: un día ocupa mucho menos que un mes', () => {
    // Caso D: 31 jul, 1 ago, 15 ago, 1 sep, 1 oct.
    const { points } = chartGeometry([100, 150, 130, 170, 160], days('2026-07-31', '2026-08-01', '2026-08-15', '2026-09-01', '2026-10-01'), W, H, PAD)
    const xs = points.map(([x]) => x)
    assert.equal(xs[0], 0)
    assert.equal(xs[4], W)
    assert.ok(xs[1] - xs[0] < (xs[4] - xs[3]) / 20, `1 día (${xs[1] - xs[0]}) frente a 30 (${xs[4] - xs[3]})`)
    assert.ok(Math.abs((xs[1] - xs[0]) / (xs[4] - xs[3]) - 1 / 30) < 1e-9)
  })

  it('sin fechas (o todas iguales), espaciado uniforme como antes', () => {
    assert.deepEqual(chartGeometry([1, 2, 3], null, W, H, PAD).points.map(([x]) => x), [0, W / 2, W])
    assert.deepEqual(chartGeometry([1, 2, 3], [5, 5, 5], W, H, PAD).points.map(([x]) => x), [0, W / 2, W])
  })

  it('el cero está siempre en escala: 50 € sobre 8.000 € apenas se mueven (antes ocupaban toda la altura)', () => {
    const { points, zeroY } = chartGeometry([8_000, 8_050, 8_020], null, W, H, PAD)
    assert.equal(zeroY, H - PAD, 'la base del área es el 0')
    const ys = points.map(([, y]) => y)
    assert.ok(Math.max(...ys) - Math.min(...ys) < 1, `variación dibujada: ${Math.max(...ys) - Math.min(...ys)} px`)
    // Caso A/B: de 100 € a 1.100 € sí es casi toda la altura, porque lo es.
    const b = chartGeometry([100, 1_100, 1_050], null, W, H, PAD).points.map(([, y]) => y)
    assert.ok(b[0] - b[1] > (H - 2 * PAD) * 0.85)
  })

  it('patrimonio negativo: queda por debajo de la base y el área rellena hasta el cero', () => {
    // Caso E: 100 → −200 → −150.
    const { points, zeroY } = chartGeometry([100, -200, -150], null, W, H, PAD)
    assert.ok(zeroY > PAD && zeroY < H - PAD, 'la base está entre el máximo y el mínimo')
    assert.ok(points[0][1] < zeroY, '100 € por encima del cero')
    assert.ok(points[1][1] > zeroY && points[2][1] > zeroY, 'los negativos por debajo')
    assert.equal(points[1][1], H - PAD, 'el mínimo, abajo del todo')
  })

  it('el trazo suave nunca se sale de los valores reales ni retrocede en el tiempo', () => {
    const values = [0, 1_000, 1_000, 400, 5_000, 5_100, -300, -250, 2_000]
    const xs = days('2026-01-01', '2026-01-02', '2026-03-01', '2026-03-02', '2026-03-03', '2026-06-30', '2026-07-01', '2026-07-01', '2026-10-07')
    const { points } = chartGeometry(values, xs, W, H, PAD)
    const segments = smoothPath(points).split(' C ').slice(1).map((s) => s.split(' ').map((p) => p.split(',').map(Number)))
    assert.equal(segments.length, points.length - 1)
    segments.forEach(([c1, c2, end], i) => {
      const [x0, y0] = points[i]
      const [x1, y1] = end
      const [lo, hi] = [Math.min(y0, y1), Math.max(y0, y1)]
      for (const [cx, cy] of [c1, c2]) {
        assert.ok(cx >= x0 - 1e-9 && cx <= x1 + 1e-9, `tramo ${i}: x de control fuera del tramo`)
        assert.ok(cy >= lo - 1e-9 && cy <= hi + 1e-9, `tramo ${i}: el trazo se sale de los valores (${cy} fuera de ${lo}..${hi})`)
      }
    })
  })
})
