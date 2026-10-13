/**
 * Colores del donut de categorías: cada categoría cerrada tiene siempre el
 * mismo color (cambiar de mes no repinta), nunca hay dos porciones del mismo
 * color y todo lo dibujado tiene su fila en la leyenda («Resto» si no cabe).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { CategoryTotal } from '../../finance/summary'
import { CHART_COLORS, chartColor, donutSlices, MAX_DONUT_SLICES, REST_COLOR } from '../chart-colors'

const cat = (label: string, cents: number, pct: number): CategoryTotal => ({ key: label, label, cents, pct })

describe('donutSlices', () => {
  it('una categoría cerrada conserva su color aunque cambie su puesto', () => {
    const octubre = donutSlices([cat('Comida', 15790, 60), cat('Ropa', 4200, 40)], 'gasto')
    const agosto = donutSlices([cat('Ropa', 6100, 65), cat('Comida', 3300, 35)], 'gasto')
    const color = (s: ReturnType<typeof donutSlices>, l: string) => s.find((x) => x.label === l)?.color
    assert.equal(color(octubre, 'Comida'), color(agosto, 'Comida'))
    assert.equal(color(octubre, 'Ropa'), color(agosto, 'Ropa'))
    assert.equal(color(octubre, 'Comida'), CHART_COLORS[0])
  })

  it('los motivos de «Otros» toman colores libres, distintos de las categorías cerradas', () => {
    const s = donutSlices([cat('Comida', 500, 50), cat('Luz', 300, 30), cat('Gasolina', 200, 20)], 'gasto')
    assert.equal(new Set(s.map((x) => x.color)).size, 3)
    assert.ok(!s.some((x) => x.color === REST_COLOR))
  })

  it('sin colores repetidos aunque casi todo sean motivos de «Otros»', () => {
    const s = donutSlices(
      [cat('Luz', 500, 30), cat('Gasolina', 400, 25), cat('Netflix', 300, 20), cat('Gimnasio', 200, 15), cat('Comida', 100, 10)],
      'gasto',
    )
    assert.equal(new Set(s.map((x) => x.color)).size, s.length)
    assert.ok(!s.some((x) => x.color === REST_COLOR))
  })

  it('más porciones de las que caben: las pequeñas van a «Resto», gris, con su suma', () => {
    const many = ['Comida', 'Restaurantes', 'Salidas', 'Caprichos', 'Ropa', 'Luz', 'Gasolina'].map((l, i) => cat(l, 700 - i * 100, 20 - i))
    const s = donutSlices(many, 'gasto')
    assert.equal(s.length, MAX_DONUT_SLICES)
    const rest = s[s.length - 1]
    assert.equal(rest.label, 'Resto')
    assert.equal(rest.color, REST_COLOR)
    assert.equal(rest.cents, many.slice(MAX_DONUT_SLICES - 1).reduce((t, c) => t + c.cents, 0))
    assert.equal(rest.pct, many.slice(MAX_DONUT_SLICES - 1).reduce((t, c) => t + c.pct, 0))
    assert.equal(s.reduce((t, c) => t + c.cents, 0), many.reduce((t, c) => t + c.cents, 0))
  })

  it('ingresos: Paga y Regalos con color fijo', () => {
    const s = donutSlices([cat('Regalos', 50, 10), cat('Paga', 450, 90)], 'ingreso')
    assert.equal(s.find((x) => x.label === 'Paga')?.color, CHART_COLORS[0])
    assert.equal(s.find((x) => x.label === 'Regalos')?.color, CHART_COLORS[1])
  })
})

describe('chartColor', () => {
  it('ocho colores distintos por posición y luego gris', () => {
    assert.equal(new Set(CHART_COLORS.map((_, i) => chartColor(i))).size, 8)
    assert.equal(chartColor(8), REST_COLOR)
  })
})
