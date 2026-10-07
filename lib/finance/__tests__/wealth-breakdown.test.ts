import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { wealthBreakdown } from '../wealth-breakdown'
import { allocateObjectives } from '../objectives'
import type { Objective } from '../../types'

const objective = (targetCents: number): Objective => ({ id: 'o', name: 'Viaje', targetCents, currentCents: 0, createdAt: 1, updatedAt: 1 })
/** Mismas cifras que usa Mi Dinero: reparto automático sobre el líquido. */
const fromLiquid = (liquidCents: number, investedCents: number, objectives: Objective[] = []) => {
  const a = allocateObjectives(objectives, liquidCents)
  return wealthBreakdown({ liquidCents, destinedCents: a.allocatedCents, availableCents: a.availableCents, investedCents })
}

describe('desglose del patrimonio (donut de Mi Dinero)', () => {
  it('con líquido negativo no se reparte en porcentajes (antes: «Inversiones 100 %» con un total menor)', () => {
    // Líquido −1.740,79 €, inversiones 2.592 €: patrimonio 851,21 € < inversiones.
    assert.deepEqual(fromLiquid(-174_079, 259_200, [objective(300_000)]), { kind: 'negative-liquid' })
    assert.deepEqual(fromLiquid(-1, 0), { kind: 'negative-liquid' })
  })

  it('con líquido positivo, las partes suman el patrimonio y los porcentajes el 100 %', () => {
    const b = fromLiquid(625_921, 259_200, [objective(500_000)])
    assert.equal(b.kind, 'parts')
    if (b.kind !== 'parts') return
    assert.deepEqual(b.parts.map((p) => [p.key, p.amount]), [['disponible', 125_921], ['objetivos', 500_000], ['inversiones', 259_200]])
    assert.equal(b.parts.reduce((t, p) => t + p.amount, 0), 625_921 + 259_200)
    assert.equal(b.parts.reduce((t, p) => t + p.pct, 0), 100)
  })

  it('las partes a cero no aparecen y sin patrimonio no hay desglose', () => {
    const b = fromLiquid(100_000, 0, [objective(100_000)])
    assert.ok(b.kind === 'parts' && b.parts.length === 1 && b.parts[0].key === 'objetivos' && b.parts[0].pct === 100)
    assert.deepEqual(fromLiquid(0, 0), { kind: 'empty' })
    assert.equal(fromLiquid(0, 50_000).kind, 'parts', 'líquido cero con inversiones sí se reparte')
  })
})
