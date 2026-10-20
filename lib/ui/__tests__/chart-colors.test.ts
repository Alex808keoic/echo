/**
 * Colores del donut de categorías (2026-10-20): las 5 mayores tienen porción
 * y color propios, repartidos por el orden de la lista de categorías (no por
 * tamaño), nunca hay dos porciones del mismo color y lo que no cabe va a
 * «Resto», gris, con su suma.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { CategoryTotal } from '../../finance/summary'
import { CHART_COLORS, chartColor, donutSlices, MAX_NAMED_SLICES, REST_COLOR, REST_KEY } from '../chart-colors'

const cat = (label: string, cents: number, pct: number): CategoryTotal => ({ key: label, label, cents, pct })

describe('donutSlices', () => {
  it('con las mismas categorías, cada una conserva su color aunque cambie su puesto', () => {
    const octubre = donutSlices([cat('Supermercado', 15790, 60), cat('Ropa', 4200, 40)], 'gasto')
    const agosto = donutSlices([cat('Ropa', 6100, 65), cat('Supermercado', 3300, 35)], 'gasto')
    const color = (s: ReturnType<typeof donutSlices>, l: string) => s.find((x) => x.label === l)?.color
    assert.equal(color(octubre, 'Supermercado'), color(agosto, 'Supermercado'))
    assert.equal(color(octubre, 'Ropa'), color(agosto, 'Ropa'))
    assert.equal(color(octubre, 'Supermercado'), CHART_COLORS[0])
  })

  it('los colores van por el orden de la lista de categorías; los motivos de «Otros», detrás', () => {
    const s = donutSlices([cat('Luz', 600, 40), cat('Viajes', 500, 35), cat('Supermercado', 300, 25)], 'gasto')
    assert.deepEqual(
      s.map((x) => [x.label, x.color]),
      [
        ['Luz', CHART_COLORS[2]],
        ['Viajes', CHART_COLORS[1]],
        ['Supermercado', CHART_COLORS[0]],
      ],
    )
  })

  it('hasta 5 categorías: todas con porción propia, sin «Resto»', () => {
    const five = ['Supermercado', 'Restaurantes', 'Vivienda', 'Facturas', 'Transporte'].map((l, i) => cat(l, 500 - i * 50, 20))
    const s = donutSlices(five, 'gasto')
    assert.equal(s.length, 5)
    assert.ok(!s.some((x) => x.key === REST_KEY))
  })

  it('más de 5: las 5 mayores y «Resto», gris, con la suma de las demás', () => {
    const many = ['Supermercado', 'Restaurantes', 'Vivienda', 'Caprichos', 'Ropa', 'Luz', 'Gasolina'].map((l, i) => cat(l, 700 - i * 100, 20 - i))
    const s = donutSlices(many, 'gasto')
    assert.equal(s.length, MAX_NAMED_SLICES + 1)
    const rest = s[s.length - 1]
    assert.equal(rest.key, REST_KEY)
    assert.equal(rest.label, 'Resto')
    assert.equal(rest.color, REST_COLOR)
    assert.equal(rest.cents, many.slice(MAX_NAMED_SLICES).reduce((t, c) => t + c.cents, 0))
    assert.equal(rest.pct, many.slice(MAX_NAMED_SLICES).reduce((t, c) => t + c.pct, 0))
    assert.equal(s.reduce((t, c) => t + c.cents, 0), many.reduce((t, c) => t + c.cents, 0))
  })

  it('ingresos: en el orden de su lista', () => {
    const s = donutSlices([cat('Ventas', 50, 10), cat('Paga', 450, 90)], 'ingreso')
    assert.equal(s.find((x) => x.label === 'Paga')?.color, CHART_COLORS[0])
    assert.equal(s.find((x) => x.label === 'Ventas')?.color, CHART_COLORS[1])
  })
})

describe('chartColor', () => {
  it('colores distintos por posición y luego gris', () => {
    assert.equal(new Set(CHART_COLORS.map((_, i) => chartColor(i))).size, CHART_COLORS.length)
    assert.equal(chartColor(CHART_COLORS.length), REST_COLOR)
  })
})

describe('donutSlices: nunca un color repetido', () => {
  it('con cualquier mezcla de categorías cerradas y motivos', () => {
    const labels = ['Supermercado', 'Restaurantes', 'Viajes', 'Caprichos', 'Seguros y banco', 'Luz', 'Gasolina', 'Netflix']
    // Todas las combinaciones de hasta 8 categorías, en el orden de tamaño dado.
    for (let mask = 1; mask < 1 << labels.length; mask++) {
      const picked = labels.filter((_, i) => mask & (1 << i)).map((l, i) => cat(l, 1000 - i, 10))
      const colors = donutSlices(picked, 'gasto').map((s) => s.color)
      assert.equal(new Set(colors).size, colors.length, picked.map((c) => c.label).join(','))
    }
  })
})
