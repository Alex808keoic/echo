/**
 * Objetivos con progreso automático: el líquido real se reparte en cascada
 * entre los objetivos activos por prioridad. Nada se guarda al cambiar los
 * movimientos; un mismo euro nunca cuenta para dos objetivos.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { activeInOrder, allocateObjectives, withDerivedCurrentCents, type ObjectivesAllocation } from '../objectives'
import { computeLiquidCents } from '../patrimonio'
import { db } from '../../db/db'
import { setInitialBalance } from '../../db/config'
import { addMovement, deleteMovement, listMovements, updateMovement } from '../../db/movements'
import { addObjective, listObjectives, markObjectiveAchieved, moveObjective, reactivateObjective, updateObjective } from '../../db/objectives'
import { listPositions } from '../../db/positions'
import { getConfig } from '../../db/config'
import { clearAllData, exportBackup, parseBackup, restoreBackup } from '../../db/backup'
import { buildFinancialContext } from '../../axis/context'
import type { Objective } from '../../types'

const EUR = 100
const goal = (id: string, targetCents: number, extra: Partial<Objective> = {}): Objective => ({ id, name: id, currentCents: 0, targetCents, createdAt: 1, updatedAt: 1, ...extra })
/** [id, asignado, pct, estado] de cada objetivo, en el orden devuelto. */
const view = (a: ObjectivesAllocation) => a.items.map((i) => [i.objective.id, i.allocatedCents, i.pct, i.status])

/* ------------------------------- reparto puro ------------------------------- */

describe('allocateObjectives · un objetivo (meta 400 €)', () => {
  const one = [goal('viaje', 400 * EUR)]
  it('300 € → 300 € (75 %), nada disponible', () => {
    const a = allocateObjectives(one, 300 * EUR)
    assert.deepEqual(view(a), [['viaje', 300 * EUR, 75, 'in-progress']])
    assert.equal(a.availableCents, 0)
  })
  it('350 € → 350 € (88 %)', () => assert.deepEqual(view(allocateObjectives(one, 350 * EUR)), [['viaje', 350 * EUR, 88, 'in-progress']]))
  it('330 € → 330 € (83 %)', () => assert.deepEqual(view(allocateObjectives(one, 330 * EUR)), [['viaje', 330 * EUR, 83, 'in-progress']]))
  it('430 € → 400 € (100 %, cubierto) y 30 € disponibles', () => {
    const a = allocateObjectives(one, 430 * EUR)
    assert.deepEqual(view(a), [['viaje', 400 * EUR, 100, 'covered']])
    assert.equal(a.allocatedCents, 400 * EUR)
    assert.equal(a.availableCents, 30 * EUR)
    assert.equal(a.items[0].remainingCents, 0)
  })
})

describe('allocateObjectives · dos objetivos de 300 €', () => {
  const two = [goal('a', 300 * EUR, { createdAt: 1 }), goal('b', 300 * EUR, { createdAt: 2 })]
  it('100 € → 100 y 0', () => assert.deepEqual(view(allocateObjectives(two, 100 * EUR)).map((v) => v[1]), [100 * EUR, 0]))
  it('500 € → 300 y 200', () => {
    const a = allocateObjectives(two, 500 * EUR)
    assert.deepEqual(view(a), [['a', 300 * EUR, 100, 'covered'], ['b', 200 * EUR, 67, 'in-progress']])
    assert.equal(a.availableCents, 0)
  })
  it('700 € → 300 y 300, con 100 € disponibles', () => {
    const a = allocateObjectives(two, 700 * EUR)
    assert.deepEqual(view(a).map((v) => v[1]), [300 * EUR, 300 * EUR])
    assert.equal(a.availableCents, 100 * EUR)
    assert.equal(a.coveredCount, 2)
  })
  it('un gasto que baja de 500 € a 300 €: retrocede primero el segundo', () => {
    assert.deepEqual(view(allocateObjectives(two, 300 * EUR)).map((v) => v[1]), [300 * EUR, 0])
  })
})

describe('allocateObjectives · bordes', () => {
  it('líquido 0: nada repartido, nada disponible', () => {
    const a = allocateObjectives([goal('a', 300 * EUR)], 0)
    assert.deepEqual(view(a), [['a', 0, 0, 'in-progress']])
    assert.equal(a.availableCents, 0)
  })
  it('líquido negativo: nada repartido y el disponible refleja el negativo', () => {
    const a = allocateObjectives([goal('a', 300 * EUR)], -50 * EUR)
    assert.equal(a.allocatedCents, 0)
    assert.equal(a.availableCents, -50 * EUR)
  })
  it('meta 0: no recibe nada, 0 %, nunca «cubierto», y no frena a los siguientes', () => {
    const a = allocateObjectives([goal('cero', 0, { createdAt: 1 }), goal('b', 100 * EUR, { createdAt: 2 })], 50 * EUR)
    assert.deepEqual(view(a), [['cero', 0, 0, 'in-progress'], ['b', 50 * EUR, 50, 'in-progress']])
  })
  it('conseguido: fuera del reparto, su parte pasa al siguiente; se muestra al 100 %', () => {
    const a = allocateObjectives([goal('a', 300 * EUR, { createdAt: 1, achievedAt: 9 }), goal('b', 300 * EUR, { createdAt: 2 })], 400 * EUR)
    assert.deepEqual(view(a), [['b', 300 * EUR, 100, 'covered'], ['a', 0, 100, 'achieved']])
    assert.equal(a.items[1].rank, null)
    assert.deepEqual([a.activeCount, a.achievedCount, a.availableCents], [1, 1, 100 * EUR])
  })
  it('el 100 % automático es «cubierto», nunca «conseguido»', () => {
    assert.equal(allocateObjectives([goal('a', 100)], 1_000).items[0].status, 'covered')
  })
  it('sin objetivos: todo el líquido disponible', () => {
    assert.deepEqual(allocateObjectives([], 250 * EUR), {
      liquidCents: 250 * EUR, items: [], allocatedCents: 0, availableCents: 250 * EUR, activeTargetCents: 0, activePct: 0, activeCount: 0, coveredCount: 0, achievedCount: 0,
    })
  })
})

describe('allocateObjectives · prioridad y empates', () => {
  it('la prioridad manda sobre la antigüedad', () => {
    const a = allocateObjectives([goal('viejo', 300 * EUR, { createdAt: 1, priority: 2 }), goal('nuevo', 300 * EUR, { createdAt: 5, priority: 1 })], 300 * EUR)
    assert.deepEqual(view(a).map((v) => [v[0], v[1]]), [['nuevo', 300 * EUR], ['viejo', 0]])
    assert.deepEqual(a.items.map((i) => i.rank), [1, 2])
  })
  it('sin prioridad: por createdAt; detrás de los que sí la tienen', () => {
    const objectives = [goal('c', 1, { createdAt: 3 }), goal('a', 1, { createdAt: 1 }), goal('p', 1, { createdAt: 9, priority: 1 })]
    assert.deepEqual(activeInOrder(objectives).map((o) => o.id), ['p', 'a', 'c'])
  })
  it('empates de prioridad: createdAt y después id, estable con cualquier orden de entrada', () => {
    const objectives = [goal('b', 1, { createdAt: 1, priority: 1 }), goal('a', 1, { createdAt: 1, priority: 1 }), goal('z', 1, { createdAt: 0, priority: 1 })]
    assert.deepEqual(activeInOrder(objectives).map((o) => o.id), ['z', 'a', 'b'])
    assert.deepEqual(activeInOrder([...objectives].reverse()).map((o) => o.id), ['z', 'a', 'b'])
  })
  it('determinista y sin mutar la entrada', () => {
    const objectives = [goal('b', 200, { createdAt: 2 }), goal('a', 300, { createdAt: 1 })]
    const copy = structuredClone(objectives)
    assert.deepEqual(allocateObjectives(objectives, 400), allocateObjectives(copy, 400))
    assert.deepEqual(objectives, copy)
  })
})

describe('allocateObjectives · invariantes (muchos casos)', () => {
  it('Σ asignado ≤ max(0, líquido), asignado ≤ meta, disponible = líquido − destinado, cascada sin huecos', () => {
    let seed = 12_345
    const rnd = (n: number) => ((seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648), seed % n)
    for (let run = 0; run < 2_000; run++) {
      const objectives = Array.from({ length: rnd(6) }, (_, i) =>
        goal(`o${i}`, rnd(5) === 0 ? 0 : rnd(100_000), { createdAt: rnd(4), ...(rnd(2) ? { priority: 1 + rnd(4) } : {}), ...(rnd(5) === 0 ? { achievedAt: 1 } : {}) }),
      )
      const liquid = rnd(400_000) - 100_000
      const a = allocateObjectives(objectives, liquid)
      const active = a.items.filter((i) => i.status !== 'achieved')
      const sum = active.reduce((t, i) => t + i.allocatedCents, 0)
      assert.equal(a.allocatedCents, sum)
      assert.ok(sum <= Math.max(0, liquid))
      assert.equal(a.availableCents, liquid - sum)
      assert.equal(a.items.length, objectives.length, 'cada objetivo aparece una sola vez')
      for (const i of a.items) {
        assert.ok(Number.isSafeInteger(i.allocatedCents) && i.allocatedCents >= 0 && i.allocatedCents <= Math.max(0, i.objective.targetCents))
        assert.ok(i.pct >= 0 && i.pct <= 100)
        if (i.status === 'achieved') assert.equal(i.allocatedCents, 0)
      }
      // Cascada: si un objetivo no está lleno, nadie detrás recibe nada.
      const firstShort = active.findIndex((i) => i.allocatedCents < i.objective.targetCents)
      if (firstShort >= 0) assert.ok(active.slice(firstShort + 1).every((i) => i.allocatedCents === 0))
    }
  })
})

describe('withDerivedCurrentCents (AXIS y copias)', () => {
  it('currentCents = el reparto; la meta si está conseguido; el resto intacto', () => {
    const objectives = [goal('a', 300 * EUR, { createdAt: 1, currentCents: 999 }), goal('b', 300 * EUR, { createdAt: 2 }), goal('c', 200 * EUR, { achievedAt: 5 })]
    const derived = withDerivedCurrentCents(objectives, 400 * EUR)
    assert.deepEqual(derived.map((o) => o.currentCents), [300 * EUR, 100 * EUR, 200 * EUR])
    assert.deepEqual(derived.map(({ currentCents: _c, ...rest }) => rest), objectives.map(({ currentCents: _c, ...rest }) => rest))
    assert.equal(objectives[0].currentCents, 999, 'no muta la entrada')
  })
  it('AXIS ve el mismo destinado que la pantalla (reservedForObjectivesCents) sin cambios en AXIS', () => {
    const objectives = [goal('a', 300 * EUR, { createdAt: 1 }), goal('b', 300 * EUR, { createdAt: 2 })]
    for (const liquid of [0, 100 * EUR, 500 * EUR, 700 * EUR, -50 * EUR]) {
      const config = { key: 'config' as const, initialBalanceCents: liquid, configuredAt: 1, updatedAt: 1 }
      const ctx = buildFinancialContext({ config, movements: [], objectives: withDerivedCurrentCents(objectives, liquid), positions: [] }, '2026-09-15')
      assert.equal(ctx.wealth.reservedForObjectivesCents, allocateObjectives(objectives, liquid).allocatedCents)
    }
  })
})

/* ------------------------------- con Dexie ------------------------------- */

async function allocationNow(): Promise<ObjectivesAllocation> {
  const [config, movements, objectives, positions] = await Promise.all([getConfig(), listMovements(), listObjectives(), listPositions()])
  return allocateObjectives(objectives, computeLiquidCents(config?.initialBalanceCents ?? 0, movements, positions))
}
const stored = async (id: string) => db.objectives.get(id)
const gasto = (amountCents: number) => addMovement({ type: 'gasto', amountCents, date: '2026-09-10', category: 'Comida' })
const ingreso = (amountCents: number) => addMovement({ type: 'ingreso', amountCents, date: '2026-09-01', category: 'Paga' })

describe('integración: los movimientos cambian el progreso sin escribir el objetivo', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open()
    await clearAllData()
    await setInitialBalance(300 * EUR)
  })

  it('ingreso y gasto: el ejemplo de 300 → 350 → 330 → 430 €', async () => {
    const o = await addObjective({ name: 'Viaje', targetCents: 400 * EUR })
    const saved = await stored(o.id)
    const pct = async () => (await allocationNow()).items[0].pct
    assert.equal(await pct(), 75)
    await ingreso(50 * EUR)
    assert.equal(await pct(), 88)
    await gasto(20 * EUR)
    assert.equal(await pct(), 83)
    await ingreso(100 * EUR)
    const a = await allocationNow()
    assert.deepEqual([a.items[0].allocatedCents, a.items[0].status, a.availableCents], [400 * EUR, 'covered', 30 * EUR])
    assert.deepEqual(await stored(o.id), saved, 'el objetivo guardado no cambia')
  })

  it('editar y borrar un movimiento recalculan el reparto', async () => {
    const o = await addObjective({ name: 'Viaje', targetCents: 400 * EUR })
    const saved = await stored(o.id)
    const g = await gasto(100 * EUR)
    assert.equal((await allocationNow()).allocatedCents, 200 * EUR)
    await updateMovement(g.id, { type: 'gasto', amountCents: 250 * EUR, date: '2026-09-10', category: 'Comida' })
    assert.equal((await allocationNow()).allocatedCents, 50 * EUR)
    await deleteMovement(g.id)
    assert.equal((await allocationNow()).allocatedCents, 300 * EUR)
    assert.deepEqual(await stored(o.id), saved)
  })

  it('crear guarda nombre, meta y fecha, sin cantidad (currentCents 0) ni prioridad', async () => {
    const o = await addObjective({ name: ' Viaje ', targetCents: 400 * EUR, targetDate: '2027-06-30' })
    const s = await stored(o.id)
    assert.deepEqual([s?.name, s?.targetCents, s?.targetDate, s?.currentCents, s?.priority, s?.achievedAt], ['Viaje', 400 * EUR, '2027-06-30', 0, undefined, undefined])
  })

  it('editar no toca orden, «Conseguido» ni el currentCents antiguo', async () => {
    await db.objectives.add({ id: 'x', name: 'Viaje', currentCents: 777, targetCents: 400 * EUR, priority: 2, achievedAt: 5, createdAt: 1, updatedAt: 1 })
    await updateObjective('x', { name: 'Japón', targetCents: 500 * EUR })
    const s = await stored('x')
    assert.deepEqual([s?.name, s?.targetCents, s?.currentCents, s?.priority, s?.achievedAt], ['Japón', 500 * EUR, 777, 2, 5])
  })
})

describe('integración: prioridad y «Conseguido»', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open()
    await clearAllData()
    await setInitialBalance(400 * EUR)
    for (const [id, createdAt] of [['a', 1], ['b', 2], ['c', 3]] as const) {
      await db.objectives.add({ id, name: id, currentCents: 0, targetCents: 300 * EUR, createdAt, updatedAt: createdAt })
    }
  })
  const order = async () => (await allocationNow()).items.map((i) => [i.objective.id, i.allocatedCents])

  it('subir un objetivo persiste priority para todos y cambia quién recibe primero', async () => {
    await moveObjective('b', -1)
    assert.deepEqual(await order(), [['b', 300 * EUR], ['a', 100 * EUR], ['c', 0]])
    assert.deepEqual((await db.objectives.orderBy('id').toArray()).map((o) => o.priority), [2, 1, 3])
    db.close()
    await db.open()
    assert.deepEqual((await order()).map((x) => x[0]), ['b', 'a', 'c'], 'sobrevive a la recarga')
  })

  it('bajar y los extremos', async () => {
    await moveObjective('a', 1)
    assert.deepEqual((await order()).map((x) => x[0]), ['b', 'a', 'c'])
    await moveObjective('c', 1)
    await moveObjective('b', -1)
    assert.deepEqual((await order()).map((x) => x[0]), ['b', 'a', 'c'], 'sin efecto en los extremos')
  })

  it('un objetivo nuevo entra el último aunque los demás tengan prioridad', async () => {
    await moveObjective('c', -1)
    const n = await addObjective({ name: 'Nuevo', targetCents: 100 * EUR })
    assert.equal((await order()).at(-1)?.[0], n.id)
  })

  it('marcar conseguido persiste y libera su parte; reactivar lo devuelve al final', async () => {
    await markObjectiveAchieved('a', 1_000)
    assert.equal((await stored('a'))?.achievedAt, 1_000)
    assert.deepEqual(await order(), [['b', 300 * EUR], ['c', 100 * EUR], ['a', 0]])
    assert.equal((await allocationNow()).items.at(-1)?.status, 'achieved')
    await moveObjective('a', -1)
    assert.deepEqual((await order()).map((x) => x[0]), ['b', 'c', 'a'], 'un conseguido no se reordena')

    await reactivateObjective('a', 2_000)
    const s = await stored('a')
    assert.equal(s?.achievedAt, undefined)
    assert.equal('achievedAt' in (s ?? {}), false, 'la clave desaparece')
    assert.deepEqual(await order(), [['b', 300 * EUR], ['c', 100 * EUR], ['a', 0]], 'vuelve al final del reparto')
    assert.deepEqual((await allocationNow()).items.map((i) => i.status), ['covered', 'in-progress', 'in-progress'])
  })

  it('marcar o reactivar un objetivo que no existe falla', async () => {
    await assert.rejects(markObjectiveAchieved('nope'))
    await assert.rejects(reactivateObjective('nope'))
  })
})

describe('compatibilidad: datos antiguos y copias v1/v2', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open()
    await clearAllData()
  })
  const legacy: Objective = { id: 'antiguo', name: 'Viaje', currentCents: 90_000, targetCents: 100_000, createdAt: 1, updatedAt: 1 }

  it('un objetivo antiguo se carga intacto; su currentCents manual se ignora en el progreso', async () => {
    await setInitialBalance(10 * EUR)
    await db.objectives.add(legacy)
    assert.deepEqual(await listObjectives(), [legacy])
    assert.deepEqual(view(await allocationNow()), [['antiguo', 10 * EUR, 1, 'in-progress']])
  })

  it('copia v1 sin priority ni achievedAt: se importa', async () => {
    const backup = { format: 'finax-backup', version: 1, exportedAt: '', config: null, movements: [], objectives: [legacy], positions: [] }
    await restoreBackup(parseBackup(JSON.stringify(backup)))
    assert.deepEqual(await listObjectives(), [legacy])
  })

  it('copia v2 con priority y achievedAt: se importa y se conservan', async () => {
    const withState = { ...legacy, priority: 1, achievedAt: 5 }
    const backup = { format: 'finax-backup', version: 2, exportedAt: '', config: null, movements: [], objectives: [withState], positions: [], memories: [] }
    await restoreBackup(parseBackup(JSON.stringify(backup)))
    assert.deepEqual(await listObjectives(), [withState])
  })

  it('priority o achievedAt mal formados se rechazan', () => {
    const bad = (o: object) => JSON.stringify({ format: 'finax-backup', version: 2, exportedAt: '', config: null, movements: [], objectives: [{ ...legacy, ...o }], positions: [], memories: [] })
    assert.throws(() => parseBackup(bad({ priority: 0 })), /objetivos no válidos/)
    assert.throws(() => parseBackup(bad({ priority: 1.5 })), /objetivos no válidos/)
    assert.throws(() => parseBackup(bad({ achievedAt: 'ayer' })), /objetivos no válidos/)
  })

  it('exportar escribe en currentCents el progreso calculado, sin tocar la base', async () => {
    await setInitialBalance(500 * EUR)
    await db.objectives.bulkAdd([
      { id: 'a', name: 'a', currentCents: 1, targetCents: 300 * EUR, createdAt: 1, updatedAt: 1 },
      { id: 'b', name: 'b', currentCents: 2, targetCents: 300 * EUR, createdAt: 2, updatedAt: 2 },
      { id: 'c', name: 'c', currentCents: 3, targetCents: 50 * EUR, createdAt: 3, updatedAt: 3, achievedAt: 9 },
    ])
    const exported = await exportBackup()
    assert.deepEqual(exported.objectives.map((o) => [o.id, o.currentCents]), [['a', 300 * EUR], ['b', 200 * EUR], ['c', 50 * EUR]])
    assert.deepEqual((await db.objectives.orderBy('id').toArray()).map((o) => o.currentCents), [1, 2, 3])
    assert.doesNotThrow(() => parseBackup(JSON.stringify(exported)), 'la copia nueva sigue siendo válida')
  })
})
