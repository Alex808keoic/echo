/**
 * Fase C: invariantes del reparto automático de objetivos y su coherencia con
 * la previsión y con AXIS. Casos generados con un generador determinista
 * (sin red, sin dependencias de property testing).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { allocateObjectives, displayPct, forecastObjectiveAllocation, type ObjectiveAllocation } from '../../finance/objectives'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { detectSignals } from '../rules'
import type { Objective } from '../../types'
import { config, healthyMovements, snapshot, TODAY } from './fixtures'

/** Generador congruencial: misma semilla, mismos casos. */
function rng(seed: number) {
  let s = seed
  return (n: number) => ((s = (s * 1_103_515_245 + 12_345) % 2_147_483_648), s % n)
}

function randomObjectives(rnd: (n: number) => number): Objective[] {
  return Array.from({ length: rnd(6) }, (_, i) => ({
    id: `o${i}`,
    name: `o${i}`,
    currentCents: rnd(1_000_000), // basura antigua: nunca debe usarse
    targetCents: rnd(6) === 0 ? 0 : 1 + rnd(200_000),
    createdAt: rnd(4),
    updatedAt: 0,
    ...(rnd(2) ? { priority: 1 + rnd(4) } : {}),
    ...(rnd(5) === 0 ? { achievedAt: 1 } : {}),
  }))
}

const active = (items: ObjectiveAllocation[]) => items.filter((i) => i.status !== 'achieved')
const byId = (items: ObjectiveAllocation[]) => new Map(items.map((i) => [i.objective.id, i]))

describe('C · invariantes de allocateObjectives', () => {
  const rnd = rng(20_261_006)
  const cases = Array.from({ length: 1_500 }, () => ({ objectives: randomObjectives(rnd), liquid: rnd(500_000) - 150_000 }))

  it('1 · para cada activo, 0 ≤ asignado ≤ meta', () => {
    for (const { objectives, liquid } of cases) {
      for (const i of active(allocateObjectives(objectives, liquid).items)) {
        assert.ok(i.allocatedCents >= 0 && i.allocatedCents <= Math.max(0, i.objective.targetCents), `${i.objective.id}`)
      }
    }
  })

  it('2 · la suma asignada no supera el líquido positivo', () => {
    for (const { objectives, liquid } of cases) assert.ok(allocateObjectives(objectives, liquid).allocatedCents <= Math.max(0, liquid))
  })

  it('3 · un conseguido no recibe asignación', () => {
    for (const { objectives, liquid } of cases) {
      for (const i of allocateObjectives(objectives, liquid).items) if (i.objective.achievedAt !== undefined) assert.equal(i.allocatedCents, 0)
    }
  })

  it('4 · si aumenta el líquido, ningún activo recibe menos', () => {
    for (const { objectives, liquid } of cases) {
      const before = byId(allocateObjectives(objectives, liquid).items)
      for (const i of allocateObjectives(objectives, liquid + 1 + rnd(100_000)).items) assert.ok(i.allocatedCents >= before.get(i.objective.id)!.allocatedCents, i.objective.id)
    }
  })

  it('5 · si disminuye el líquido, el total asignado no aumenta', () => {
    for (const { objectives, liquid } of cases) {
      assert.ok(allocateObjectives(objectives, liquid - 1 - rnd(100_000)).allocatedCents <= allocateObjectives(objectives, liquid).allocatedCents)
    }
  })

  it('6 · destinado + disponible = líquido, siempre (también con líquido negativo)', () => {
    for (const { objectives, liquid } of cases) {
      const a = allocateObjectives(objectives, liquid)
      assert.equal(a.allocatedCents + a.availableCents, liquid)
    }
  })

  it('el currentCents guardado no influye: mismo reparto con cualquier valor', () => {
    for (const { objectives, liquid } of cases.slice(0, 300)) {
      const scrubbed = objectives.map((o) => ({ ...o, currentCents: 0 }))
      assert.deepEqual(allocateObjectives(objectives, liquid).items.map((i) => i.allocatedCents), allocateObjectives(scrubbed, liquid).items.map((i) => i.allocatedCents))
    }
  })

  it('orden estable: no depende del orden de entrada', () => {
    for (const { objectives, liquid } of cases.slice(0, 300)) {
      const ids = (list: Objective[]) => allocateObjectives(list, liquid).items.map((i) => i.objective.id)
      assert.deepEqual(ids([...objectives].reverse()), ids(objectives))
    }
  })
})

describe('C · porcentaje honesto (regresión)', () => {
  const g = (targetCents: number): Objective => ({ id: 'a', name: 'a', currentCents: 0, targetCents, createdAt: 1, updatedAt: 1 })

  it('casi cubierto no se muestra al 100 %; con algo asignado no se muestra al 0 %', () => {
    const almost = allocateObjectives([g(30_000)], 29_990)
    assert.deepEqual([almost.items[0].status, almost.items[0].pct, almost.activePct], ['in-progress', 99, 99])
    assert.equal(allocateObjectives([g(1_000_000)], 1).items[0].pct, 1)
    assert.equal(allocateObjectives([g(30_000)], 30_000).items[0].pct, 100)
    assert.equal(allocateObjectives([g(30_000)], 0).items[0].pct, 0)
  })

  it('100 % ⇔ cubierto y 0 % ⇔ nada asignado, en todos los casos', () => {
    const rnd = rng(7)
    for (let n = 0; n < 1_000; n++) {
      for (const i of active(allocateObjectives(randomObjectives(rnd), rnd(400_000) - 50_000).items)) {
        if (i.objective.targetCents <= 0) continue
        assert.equal(i.pct === 100, i.status === 'covered', `${i.allocatedCents}/${i.objective.targetCents}`)
        assert.equal(i.pct === 0, i.allocatedCents === 0, `${i.allocatedCents}/${i.objective.targetCents}`)
      }
    }
    assert.deepEqual([displayPct(5, 0), displayPct(0, 100), displayPct(-5, 100), displayPct(150, 100)], [0, 0, 0, 100])
  })
})

describe('C · previsión coherente con el reparto', () => {
  const g = (id: string, targetCents: number, x: Partial<Objective> = {}): Objective => ({ id, name: id, currentCents: 0, targetCents, createdAt: 1, updatedAt: 1, ...x })
  const months = (objectives: Objective[], liquid: number, monthly: number) => forecastObjectiveAllocation(objectives, liquid, monthly, 120)?.map((p) => [p.objective.id, p.months])

  it('tres objetivos, conseguido en medio, capacidad para todos y más de 120 meses', () => {
    const three = [g('a', 30_000, { priority: 1 }), g('b', 20_000, { priority: 2 }), g('c', 50_000, { priority: 3 })]
    assert.deepEqual(months(three, 0, 10_000), [['a', 3], ['b', 5], ['c', 10]])
    assert.deepEqual(months([three[0], { ...three[1], achievedAt: 9 }, three[2]], 0, 10_000), [['a', 3], ['c', 8]])
    assert.deepEqual(months(three, 0, 1_000_000), [['a', 1], ['b', 1], ['c', 1]])
    assert.deepEqual(months(three, 100_000, 10_000), [['a', 0], ['b', 0], ['c', 0]])
    assert.deepEqual(months(three, 0, 70), [['a', 'beyond'], ['b', 'beyond'], ['c', 'beyond']], '70 céntimos/mes: más de 120 meses')
    assert.equal(forecastObjectiveAllocation(three, 0, 0, 120), null)
    assert.equal(forecastObjectiveAllocation(three, 0, -10_000, 120), null)
  })

  it('cada mes previsto es exactamente el primer mes en que el reparto lo cubre; nunca antes que uno anterior', () => {
    const rnd = rng(42)
    for (let n = 0; n < 400; n++) {
      const objectives = randomObjectives(rnd)
      const liquid = rnd(300_000) - 100_000
      const monthly = 1 + rnd(50_000)
      const projection = forecastObjectiveAllocation(objectives, liquid, monthly, 120)!
      let last = 0
      for (const p of projection) {
        if (p.months === 'beyond') {
          last = Number.POSITIVE_INFINITY
          continue
        }
        const coveredAt = (k: number) => allocateObjectives(objectives, liquid + k * monthly).items.find((i) => i.objective.id === p.objective.id)!.status === 'covered'
        assert.ok(coveredAt(p.months), 'cubierto en su mes')
        if (p.months > 0) assert.ok(!coveredAt(p.months - 1), 'no antes')
        assert.ok(p.months >= last, 'el orden de cobertura respeta la prioridad')
        last = p.months
      }
    }
  })

  it('no modifica la entrada (ni ninguna fuente de datos)', () => {
    const list = [g('a', 30_000, { priority: 1 }), g('b', 30_000, { priority: 2 })]
    const copy = structuredClone(list)
    forecastObjectiveAllocation(list, 10_000, 10_000, 120)
    assert.deepEqual(list, copy)
  })
})

describe('C · la interfaz y AXIS ven lo mismo', () => {
  const NET = 255_000
  it('mismo reparto, mismo orden y mismo destinado en el contexto de AXIS que en allocateObjectives', () => {
    const rnd = rng(99)
    for (let n = 0; n < 200; n++) {
      const objectives = randomObjectives(rnd)
      const liquid = rnd(400_000) - 50_000
      const ctx = buildFinancialContext(snapshot({ config: config(liquid - NET), movements: healthyMovements(), objectives }), TODAY)
      const ui = allocateObjectives(objectives, ctx.wealth.liquidCents)
      assert.equal(ctx.wealth.reservedForObjectivesCents, ui.allocatedCents)
      const expected = ui.items.filter((i) => i.objective.targetCents > 0).map((i) => [i.objective.id, i.status, i.status === 'achieved' ? i.objective.targetCents : i.allocatedCents, i.pct])
      assert.deepEqual(ctx.objectives.map((o) => [o.id, o.status, o.currentCents, o.progressPct]), expected)
    }
  })

  it('un objetivo importado sin meta positiva no aparece en AXIS: ni «estancado» ni «siguiente»', () => {
    const objectives: Objective[] = [
      { id: 'cero', name: 'Cero', currentCents: 0, targetCents: 0, createdAt: Date.parse('2026-01-01'), updatedAt: 0 },
      { id: 'neg', name: 'Negativo', currentCents: 0, targetCents: -500, createdAt: Date.parse('2026-01-01'), updatedAt: 0 },
      { id: 'viaje', name: 'Viaje', currentCents: 0, targetCents: 900_000, createdAt: Date.parse('2026-02-01'), updatedAt: 0 },
    ]
    const ctx = buildFinancialContext(snapshot({ config: config(0), movements: healthyMovements(), objectives }), TODAY)
    assert.deepEqual(ctx.objectives.map((o) => o.id), ['viaje'])
    const ids = detectSignals(ctx).map((s) => s.id)
    assert.ok(!ids.some((id) => /:(cero|neg)$/.test(id)), ids.join(', '))
    assert.match(detectSignals(ctx).find((s) => s.id === 'savings.healthy')!.interpretation, /ahora va a «Viaje»/)
    assert.equal(decide({ context: ctx }).context.wealth.reservedForObjectivesCents, 255_000)
  })
})
