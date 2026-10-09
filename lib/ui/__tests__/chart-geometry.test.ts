/**
 * El gráfico de evolución dibuja fielmente la serie: tiempo proporcional, la
 * escala ajustada sin exagerar (el 0 cuando importa) y un trazo suave que no inventa valores.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chartGeometry, dayNumber, formatTick, MAX_TICKS, MIN_SPAN_RATIO, niceTicks, smoothPath, yDomain } from '../chart-geometry'

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

  const drawn = (values: number[]) => {
    const ys = chartGeometry(values, null, W, H, PAD).points.map(([, y]) => y)
    return (Math.max(...ys) - Math.min(...ys)) / (H - 2 * PAD)
  }

  it('lejos del cero, la escala se ajusta a la serie: +48,75 € sobre ~558 € se ven como una subida', () => {
    // El caso real: con el 0 siempre en escala, esta variación ocupaba < 10 % de la altura (línea plana).
    const { zeroInScale, baseY } = chartGeometry([509.4, 520, 515, 558.15], null, W, H, PAD)
    assert.equal(zeroInScale, false)
    assert.equal(baseY, H, 'sin 0 en escala, el área llega al borde inferior')
    // Con el eje ampliado a valores redondos (450–600 €), la subida sigue viéndose (antes, < 10 %).
    const share = drawn([509.4, 520, 515, 558.15])
    assert.ok(share > 0.25 && share < 0.65, `ocupa ${Math.round(share * 100)} % de la altura`)
  })

  it('pero no exagera: la escala nunca es más estrecha que el 15 % del patrimonio', () => {
    // 3 € sobre 558 € y 50 € sobre 8.000 € siguen casi planos.
    assert.ok(drawn([555, 556, 558]) < 0.05)
    assert.ok(drawn([8_000, 8_050, 8_020]) < 0.05)
    const { lo, hi } = yDomain([555, 556, 558])
    assert.ok(Math.abs(hi - lo - 558 * MIN_SPAN_RATIO) < 1e-9)
    // Una serie constante no divide entre cero y queda en medio.
    const flat = chartGeometry([500, 500, 500], null, W, H, PAD).points.map(([, y]) => y)
    assert.ok(flat.every((y) => Math.abs(y - H / 2) < 1e-9))
  })

  it('cerca del cero, el 0 vuelve a la escala: de 100 € a 1.100 € es gran parte de la altura, porque lo es', () => {
    const { zeroInScale, baseY } = chartGeometry([100, 1_100, 1_050], null, W, H, PAD)
    assert.equal(zeroInScale, true)
    assert.equal(baseY, H - PAD, 'la base del área es el 0')
    // Eje 0–1.500 € de 500 en 500: la subida ocupa dos tercios.
    assert.ok(drawn([100, 1_100, 1_050]) > 0.6)
  })

  it('patrimonio negativo: queda por debajo de la base y el área rellena hasta el cero', () => {
    // Caso E: 100 → −200 → −150.
    const { points, baseY, zeroInScale } = chartGeometry([100, -200, -150], null, W, H, PAD)
    assert.equal(zeroInScale, true)
    assert.ok(baseY > PAD && baseY < H - PAD, 'la base está entre el máximo y el mínimo')
    assert.ok(points[0][1] < baseY, '100 € por encima del cero')
    assert.ok(points[1][1] > baseY && points[2][1] > baseY, 'los negativos por debajo')
    assert.equal(points[1][1], H - PAD, 'el mínimo, abajo del todo')
    // Todo negativo: el 0 arriba.
    assert.equal(chartGeometry([-500, -300], null, W, H, PAD).baseY, PAD)
  })

  it('al ensanchar la escala, el borde inferior nunca baja del 0', () => {
    const { lo } = yDomain([30, 34])
    assert.ok(lo >= 0)
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

describe('eje vertical con valores redondos', () => {
  const axis = (values: number[]) => {
    const g = chartGeometry(values, null, W, H, PAD)
    return g.ticks.map((t) => formatTick(t.value, g.tickStep))
  }

  it('de 300 € a 700 €: de 100 en 100', () => {
    assert.deepEqual(axis([500, 300, 700, 500]), ['300 €', '400 €', '500 €', '600 €', '700 €'])
  })

  it('el caso real (~450 € a 558 €): de 50 en 50, de un valor redondo por debajo del mínimo a uno por encima del máximo', () => {
    assert.deepEqual(axis([452, 470, 520, 558.15]), ['450 €', '500 €', '550 €', '600 €'])
    assert.deepEqual(axis([509.4, 520, 515, 558.15]), ['450 €', '500 €', '550 €', '600 €'])
  })

  it('con una diferencia grande, el salto sube a 75 o 100', () => {
    assert.deepEqual(axis([450, 600, 750]), ['450 €', '525 €', '600 €', '675 €', '750 €'])
    assert.deepEqual(axis([500, 300, 700, 500]), ['300 €', '400 €', '500 €', '600 €', '700 €'])
  })

  it('el salto depende de la diferencia: miles, negativos y céntimos (sin saltos raros como 0,75 €)', () => {
    assert.deepEqual(axis([12_000, 13_500, 18_250]), ['12.000 €', '14.000 €', '16.000 €', '18.000 €', '20.000 €'])
    assert.deepEqual(axis([100, -200, -150, 558.15]), ['-200 €', '0 €', '200 €', '400 €', '600 €'])
    assert.deepEqual(axis([3, 4.2, 5.8]), ['3 €', '4 €', '5 €', '6 €'])
    assert.deepEqual(niceTicks(1, 1.4).ticks, [1, 1.1, 1.2, 1.3, 1.4])
    assert.equal(formatTick(1.1, 0.1), '1,1 €')
    assert.equal(formatTick(2.5, 2.5), '2,5 €')
    assert.equal(formatTick(0.25, 0.25), '0,25 €')
  })

  it('siempre entre 2 y 5 valores, cubriendo de lo mínimo a lo máximo y a su altura', () => {
    const series = [[1, 2, 3], [500, 500, 500], [0, 0, 50], [-500, -300], [8_000, 8_050], [0.5, 0.7, 0.9], [1_000_000, 1_250_000]]
    for (const values of series) {
      const g = chartGeometry(values, null, W, H, PAD)
      assert.ok(g.ticks.length >= 2 && g.ticks.length <= MAX_TICKS, `${values}: ${g.ticks.length} valores`)
      assert.ok(g.ticks[0].value <= Math.min(...values) + 1e-9, `${values}: el eje empieza por encima del mínimo`)
      assert.ok(g.ticks[g.ticks.length - 1].value >= Math.max(...values) - 1e-9, `${values}: el eje acaba por debajo del máximo`)
      for (const t of g.ticks) {
        assert.ok(t.y >= PAD - 1e-9 && t.y <= H - PAD + 1e-9)
      }
      // Valores redondos: múltiplos exactos del salto.
      for (const t of g.ticks) assert.ok(Math.abs(t.value / g.tickStep - Math.round(t.value / g.tickStep)) < 1e-6)
    }
  })
})
