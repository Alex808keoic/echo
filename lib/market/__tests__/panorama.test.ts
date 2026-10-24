/**
 * «Cómo van las inversiones»: una línea por familia de la Guía con los
 * indicadores vigentes, movimientos fuertes y nada de datos antiguos.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { marketPanorama, panoramaHighlights, type GroupPanorama } from '../panorama'
import { indicatorFreshness } from '../freshness'
import { parseMarketResearch } from '../validate'
import type { AssetClassNote, MarketIndicator } from '../types'
import { research } from './fixtures'

const NOW = new Date('2026-10-24T09:00:00Z')

const ind = (over: Partial<MarketIndicator> & Pick<MarketIndicator, 'key' | 'group' | 'value'>): MarketIndicator => ({
  label: over.key,
  unit: '%',
  asOf: '2026-10-22',
  changePct: null,
  source: 'X',
  ...over,
})

const BASE: MarketIndicator[] = [
  ind({ key: 'ecb-dfr', group: 'rate', value: 2.5, asOf: '2026-09-16', changePct: 0.25 }),
  ind({ key: 'ine-ipc', group: 'inflation', value: 4.9, asOf: '2026-09', changePct: 0.6 }),
  ind({ key: 'ibex', group: 'index', value: 18913.5, unit: 'pts', changePct: -3.37, changeDays: 28 }),
  ind({ key: 'ea-10y', group: 'bond', value: 3.38, changePct: -0.18, changeDays: 28 }),
  ind({ key: 'ine-ipv', group: 'housing', value: 12.2, asOf: '2026-Q2', changePct: -0.7, changeDays: 91 }),
  ind({ key: 'btc', group: 'crypto', value: 71909, unit: 'EUR', asOf: '2026-10-24', changePct: -2.57, changeDays: 28 }),
]

const byId = (groups: GroupPanorama[]) => Object.fromEntries(groups.map((g) => [g.id, g]))

describe('panorama de las familias de inversión', () => {
  it('las 8 familias de la Guía, en su orden', () => {
    assert.deepEqual(
      marketPanorama(BASE, [], NOW).map((g) => g.id),
      ['ahorro', 'renta-fija', 'fondos', 'etf', 'acciones', 'materias', 'inmobiliario', 'cripto'],
    )
  })

  it('con los datos del 24-10-2026: vivienda sube con fuerza, el resto tranquilo o moviéndose', () => {
    const g = byId(marketPanorama(BASE, [], NOW))
    assert.equal(g.ahorro.trend, 'rise')
    assert.match(g.ahorro.headline, /2,5 %.*16 de septiembre.*pierde poder de compra \(unos 2,4 puntos/)
    assert.equal(g['renta-fija'].trend, 'calm')
    assert.match(g['renta-fija'].headline, /eurozona paga hoy un 3,38 %.*−0,18 puntos/)
    assert.equal(g.acciones.trend, 'calm')
    assert.match(g.acciones.headline, /el del IBEX 35, −3,4 %/)
    assert.equal(g.inmobiliario.trend, 'strong-rise')
    assert.match(g.inmobiliario.headline, /12,2 % más que hace un año \(2\.º trimestre de 2026\)/)
    assert.equal(g.materias.trend, 'no-data')
    assert.equal(g.cripto.trend, 'calm')
    assert.deepEqual(panoramaHighlights(Object.values(g)).map((x) => x.id), ['inmobiliario'])
  })

  it('«ha explotado»: cripto +40 % en un mes y bolsa −9 % son movimientos fuertes', () => {
    const hot = BASE.map((i) =>
      i.key === 'btc' ? { ...i, changePct: 40 } : i.key === 'ibex' ? { ...i, changePct: -9 } : i,
    )
    const g = byId(marketPanorama(hot, [], NOW))
    assert.equal(g.cripto.trend, 'strong-rise')
    assert.match(g.cripto.headline, /bitcoin ha subido un 40 %.*darse la vuelta/)
    assert.equal(g.acciones.trend, 'strong-drop')
    assert.match(g.acciones.headline, /suelen recuperarse con tiempo/)
  })

  it('bonos: si la rentabilidad sube con fuerza, los bonos caen de precio', () => {
    const g = byId(marketPanorama(BASE.map((i) => (i.key === 'ea-10y' ? { ...i, changePct: 0.6 } : i)), [], NOW))
    assert.equal(g['renta-fija'].trend, 'strong-drop')
    assert.match(g['renta-fija'].headline, /ha subido 0,6 puntos.*valen algo menos/)
  })

  it('fondos y ETF van como la bolsa y los bonos', () => {
    const g = byId(marketPanorama(BASE, [], NOW))
    assert.equal(g.fondos.trend, 'depends')
    assert.match(g.fondos.headline, /la bolsa está tranquila y los bonos están tranquilos/)
    assert.match(g.etf.headline, /copia un índice/)
  })

  it('un dato antiguo nunca cuenta como situación actual', () => {
    const old = BASE.map((i) => (i.key === 'btc' ? { ...i, asOf: '2026-09-01', changePct: 60 } : i))
    assert.equal(indicatorFreshness(old.find((i) => i.key === 'btc') as MarketIndicator, NOW), 'stale')
    assert.equal(byId(marketPanorama(old, [], NOW)).cripto.trend, 'no-data')
  })

  it('una variación que no es de un mes no decide si el movimiento es fuerte', () => {
    const weekly = BASE.map((i) => (i.key === 'btc' ? { ...i, changePct: 40, changeDays: 7 } : i))
    assert.equal(byId(marketPanorama(weekly, [], NOW)).cripto.trend, 'calm')
  })

  it('las notas de la investigación se enseñan solo si dicen algo', () => {
    const notes: AssetClassNote[] = [
      { key: 'crypto', label: 'Cripto', aliases: [], note: 'El bitcoin ha bajado en el periodo.', stance: 'watch' },
      { key: 'gold', label: 'Oro', aliases: [], note: 'Sin noticias relevantes en el material de esta semana.', stance: 'neutral' },
    ]
    const g = byId(marketPanorama(BASE, notes, NOW))
    assert.equal(g.cripto.note, 'El bitcoin ha bajado en el periodo.')
    assert.equal(g.materias.note, null)
  })
})

describe('compatibilidad de la investigación', () => {
  it('admite los grupos nuevos y descarta un indicador de un grupo desconocido sin rechazar la investigación', () => {
    const r = research()
    const parsed = parseMarketResearch({
      ...r,
      indicators: [...r.indicators, { ...BASE[5] }, { key: 'futuro', label: 'Algo nuevo', group: 'otro', value: 1, unit: '%', asOf: '2026-10', changePct: null, source: 'X' }],
    })
    assert.ok(parsed.indicators.some((i) => i.key === 'btc' && i.changeDays === 28))
    assert.ok(!parsed.indicators.some((i) => i.key === 'futuro'))
  })

  it('trimestres: frescos hasta 165 días después de acabar', () => {
    const q = (asOf: string) => ({ key: 'ine-ipv', value: 1, asOf })
    assert.equal(indicatorFreshness(q('2026-Q2'), NOW), 'fresh')
    assert.equal(indicatorFreshness(q('2026-Q2'), new Date('2026-12-12T00:00:00Z')), 'fresh')
    assert.equal(indicatorFreshness(q('2026-Q2'), new Date('2026-12-13T00:00:00Z')), 'stale')
    assert.equal(indicatorFreshness(q('2026-Q5'), NOW), 'unknown')
  })
})

describe('panorama · fuentes añadidas el 24-10-2026', () => {
  it('ahorro seguro con lo que pagan de verdad los depósitos y las Letras', () => {
    const more = [
      ...BASE,
      ind({ key: 'es-deposit-1y', group: 'rate', value: 2.01, asOf: '2026-08' }),
      ind({ key: 'es-deposit-sight', group: 'rate', value: 0.16, asOf: '2026-08' }),
      ind({ key: 'es-letras-1y', group: 'rate', value: 3.06, asOf: '2026-10-21' }),
    ]
    const g = byId(marketPanorama(more, [], NOW))
    assert.match(g.ahorro.headline, /depósito a 1 año paga de media un 2,01 % \(agosto, Banco de España\); una cuenta a la vista, un 0,16 %\. Las Letras del Tesoro a 1 año rentan un 3,06 %/)
    assert.match(g.ahorro.headline, /pierde poder de compra \(unos 2,9 puntos/)
    assert.equal(g.ahorro.figures.length, 5)
  })

  it('los depósitos se publican con dos meses de retraso: agosto sigue vigente a finales de octubre', () => {
    const dep = { key: 'es-deposit-1y', value: 2, asOf: '2026-08' }
    assert.equal(indicatorFreshness(dep, NOW), 'fresh')
    assert.equal(indicatorFreshness({ ...dep, key: 'ine-ipc' }, NOW), 'stale', 'la regla normal sigue en 45 días')
    assert.equal(indicatorFreshness(dep, new Date('2026-11-20T00:00:00Z')), 'stale')
  })

  it('materias primas: el cobre o el gas también pueden «explotar»', () => {
    const more = [...BASE, ind({ key: 'copper', group: 'commodity', value: 12000, unit: 'USD', asOf: '2026-09', changePct: 14.2, changeDays: 31 })]
    const g = byId(marketPanorama(more, [], NOW))
    assert.equal(g.materias.trend, 'strong-rise')
    assert.match(g.materias.headline, /El cobre ha subido un 14,2 %.*\(media mensual\)/)
  })

  it('renta fija enseña también EE. UU. y los bonos de empresas', () => {
    const more = [...BASE, ind({ key: 'us-10y', group: 'bond', value: 4.4, changePct: 0.1, changeDays: 28 }), ind({ key: 'eu-hy', group: 'bond', value: 5.9, changePct: 0.3, changeDays: 28 })]
    assert.equal(byId(marketPanorama(more, [], NOW))['renta-fija'].figures.length, 3)
  })
})
