/**
 * Objetivos como «dinero apartado» a mano: progreso, cobertura por el líquido
 * y la validación al crear o editar (misma regla que «Aportar»). Los
 * movimientos nunca cambian lo apartado.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isObjectiveCompleted,
  objectiveProgressPct,
  objectivesCoverage,
  reservationError,
  reservationLimitCents,
  summarizeObjectives,
} from '../objectives'
import { db } from '../../db/db'
import { setInitialBalance } from '../../db/config'
import { addMovement, deleteMovement, updateMovement } from '../../db/movements'
import { addObjective, contributeToObjective, listObjectives, saveObjectiveChecked } from '../../db/objectives'
import { clearAllData, parseBackup, restoreBackup } from '../../db/backup'
import { buildFinancialContext } from '../../axis/context'
import type { Objective } from '../../types'

const goal = (id: string, currentCents: number, targetCents: number): Objective => ({ id, name: id, currentCents, targetCents, createdAt: 0, updatedAt: 0 })

/* ------------------------------- funciones puras ------------------------------ */

describe('objectiveProgressPct', () => {
  it('progreso normal, redondeado', () => {
    assert.equal(objectiveProgressPct(goal('a', 2_500, 10_000)), 25)
    assert.equal(objectiveProgressPct(goal('a', 1, 3)), 33)
  })
  it('siempre entre 0 y 100', () => {
    assert.equal(objectiveProgressPct(goal('a', 0, 10_000)), 0)
    assert.equal(objectiveProgressPct(goal('a', -500, 10_000)), 0)
    assert.equal(objectiveProgressPct(goal('a', 10_000, 10_000)), 100)
  })
  it('meta de 0 → 0, sin dividir por cero', () => {
    assert.equal(objectiveProgressPct(goal('a', 500, 0)), 0)
  })
  it('lo apartado por encima de la meta se queda en 100', () => {
    assert.equal(objectiveProgressPct(goal('a', 15_000, 10_000)), 100)
  })
})

describe('isObjectiveCompleted', () => {
  it('conseguido al llegar o pasar la meta; nunca con meta 0', () => {
    assert.equal(isObjectiveCompleted(goal('a', 9_999, 10_000)), false)
    assert.equal(isObjectiveCompleted(goal('a', 10_000, 10_000)), true)
    assert.equal(isObjectiveCompleted(goal('a', 12_000, 10_000)), true)
    assert.equal(isObjectiveCompleted(goal('a', 0, 0)), false)
  })
})

describe('summarizeObjectives', () => {
  it('suma lo apartado sin pasar de cada meta, cuenta activos y calcula el porcentaje', () => {
    assert.deepEqual(summarizeObjectives([goal('a', 2_000, 10_000), goal('b', 8_000, 5_000)]), { count: 2, activeCount: 1, savedCents: 7_000, targetCents: 15_000, pct: 47 })
  })
  it('sin objetivos, todo a 0', () => {
    assert.deepEqual(summarizeObjectives([]), { count: 0, activeCount: 0, savedCents: 0, targetCents: 0, pct: 0 })
  })
})

describe('objectivesCoverage', () => {
  const objectives = [goal('a', 3_000, 10_000), goal('b', 2_000, 5_000)]
  it('líquido suficiente: lo cubre todo', () => {
    assert.deepEqual(objectivesCoverage(objectives, 8_000), { reservedCents: 5_000, coveredCents: 5_000, shortfallCents: 0, covered: true })
    assert.equal(objectivesCoverage(objectives, 5_000).covered, true, 'justo lo apartado')
  })
  it('líquido por debajo de lo apartado: cubre lo que hay y dice cuánto falta', () => {
    assert.deepEqual(objectivesCoverage(objectives, 3_500), { reservedCents: 5_000, coveredCents: 3_500, shortfallCents: 1_500, covered: false })
  })
  it('líquido negativo: no cubre nada', () => {
    assert.deepEqual(objectivesCoverage(objectives, -2_000), { reservedCents: 5_000, coveredCents: 0, shortfallCents: 5_000, covered: false })
  })
  it('sin objetivos: nada que cubrir, incluso con líquido negativo', () => {
    assert.deepEqual(objectivesCoverage([], 1_000), { reservedCents: 0, coveredCents: 0, shortfallCents: 0, covered: true })
    assert.deepEqual(objectivesCoverage([], -1_000), { reservedCents: 0, coveredCents: 0, shortfallCents: 0, covered: true })
  })
  it('lo apartado por encima de una meta no cuenta (como summarizeObjectives)', () => {
    assert.equal(objectivesCoverage([goal('a', 9_000, 5_000)], 6_000).shortfallCents, 0)
  })
})

describe('reservationLimitCents y reservationError', () => {
  const objectives = [goal('a', 3_000, 10_000), goal('b', 2_000, 5_000)]
  it('al crear: el líquido sin apartar en ningún objetivo', () => {
    assert.equal(reservationLimitCents(objectives, 10_000), 5_000)
  })
  it('al editar: lo del propio objetivo vuelve a contar como libre', () => {
    assert.equal(reservationLimitCents(objectives, 10_000, 'a'), 8_000)
  })
  it('nunca negativo', () => {
    assert.equal(reservationLimitCents(objectives, -1_000), 0)
  })
  it('rechaza superar el límite y cantidades no válidas', () => {
    assert.equal(reservationError(5_000, 5_000), null)
    assert.match(reservationError(5_001, 5_000) ?? '', /sin apartar/)
    assert.match(reservationError(-1, 5_000) ?? '', /no válida/)
  })
  it('mantener o reducir lo que ya tenía siempre se permite, aunque supere el límite', () => {
    assert.equal(reservationError(8_000, 1_000, 8_000), null)
    assert.equal(reservationError(6_000, 1_000, 8_000), null)
    assert.match(reservationError(8_001, 1_000, 8_000) ?? '', /sin apartar/)
  })
})

/* ------------------------------- con Dexie ------------------------------- */

const ingreso = (date: string, amountCents: number) => addMovement({ type: 'ingreso', amountCents, date, category: 'Paga' })
const gasto = (date: string, amountCents: number) => addMovement({ type: 'gasto', amountCents, date, category: 'Comida' })
const current = async (id: string) => (await db.objectives.get(id))?.currentCents

describe('crear y editar objetivos con lo apartado validado', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open()
    await clearAllData()
    await setInitialBalance(10_000) // 100 € de líquido
  })

  it('crear rechaza más del líquido sin apartar y no guarda nada', async () => {
    await addObjective({ name: 'Moto', currentCents: 4_000, targetCents: 50_000 })
    const result = await saveObjectiveChecked({ name: 'Viaje', currentCents: 6_001, targetCents: 50_000 })
    assert.deepEqual(result, { ok: false, error: 'Es más del dinero disponible que tienes sin apartar.', limitCents: 6_000 })
    assert.equal(await db.objectives.count(), 1)
  })

  it('crear acepta hasta el líquido sin apartar', async () => {
    const result = await saveObjectiveChecked({ name: 'Viaje', currentCents: 10_000, targetCents: 50_000 })
    assert.equal(result.ok, true)
    assert.equal(result.ok && (await current(result.id)), 10_000)
  })

  it('la validación usa los datos actuales: un gasto reciente reduce el límite', async () => {
    await gasto('2026-09-10', 7_000)
    assert.equal((await saveObjectiveChecked({ name: 'Viaje', currentCents: 3_001, targetCents: 50_000 })).ok, false)
  })

  it('editar permite mantener lo apartado (incluso si el líquido bajó después)', async () => {
    const o = await addObjective({ name: 'Viaje', currentCents: 8_000, targetCents: 50_000 })
    await gasto('2026-09-10', 6_000) // líquido 40 € < 80 € apartados
    const result = await saveObjectiveChecked({ name: 'Viaje a Roma', currentCents: 8_000, targetCents: 50_000 }, o.id)
    assert.deepEqual(result, { ok: true, id: o.id })
    assert.equal((await db.objectives.get(o.id))?.name, 'Viaje a Roma')
  })

  it('editar permite reducirlo', async () => {
    const o = await addObjective({ name: 'Viaje', currentCents: 8_000, targetCents: 50_000 })
    await gasto('2026-09-10', 6_000)
    assert.equal((await saveObjectiveChecked({ name: 'Viaje', currentCents: 2_000, targetCents: 50_000 }, o.id)).ok, true)
    assert.equal(await current(o.id), 2_000)
  })

  it('editar puede subirlo hasta su parte más el líquido libre, no más', async () => {
    const o = await addObjective({ name: 'Viaje', currentCents: 3_000, targetCents: 50_000 })
    await addObjective({ name: 'Moto', currentCents: 2_000, targetCents: 50_000 })
    assert.equal((await saveObjectiveChecked({ name: 'Viaje', currentCents: 8_001, targetCents: 50_000 }, o.id)).ok, false)
    assert.equal(await current(o.id), 3_000)
    assert.equal((await saveObjectiveChecked({ name: 'Viaje', currentCents: 8_000, targetCents: 50_000 }, o.id)).ok, true)
  })

  it('editar un objetivo que no existe falla', async () => {
    await assert.rejects(saveObjectiveChecked({ name: 'X', currentCents: 0, targetCents: 1_000 }, 'no-existe'))
  })
})

describe('movimientos y «Aportar»', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open()
    await clearAllData()
    await setInitialBalance(10_000)
  })

  it('ingresos y gastos (alta, edición y borrado) no cambian lo apartado', async () => {
    const o = await addObjective({ name: 'Viaje', currentCents: 4_000, targetCents: 50_000 })
    const i = await ingreso('2026-09-01', 20_000)
    const g = await gasto('2026-09-05', 15_000)
    await updateMovement(g.id, { type: 'gasto', amountCents: 25_000, date: '2026-09-05', category: 'Comida' })
    await deleteMovement(i.id)
    assert.equal(await current(o.id), 4_000)
    assert.equal(await db.movements.count(), 1)
  })

  it('«Aportar» sí cambia lo apartado y no crea movimientos', async () => {
    const o = await addObjective({ name: 'Viaje', currentCents: 4_000, targetCents: 50_000 })
    await contributeToObjective(o.id, 1_500)
    assert.equal(await current(o.id), 5_500)
    assert.equal(await db.movements.count(), 0)
  })
})

describe('datos antiguos con lo apartado por encima del líquido', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open()
    await clearAllData()
  })

  const old: Objective = { id: 'obj-antiguo', name: 'Viaje', currentCents: 90_000, targetCents: 100_000, createdAt: 1, updatedAt: 1 }

  it('se cargan sin recortes ni cambios', async () => {
    await setInitialBalance(1_000)
    await db.objectives.add(old)
    assert.deepEqual(await listObjectives(), [old])
  })

  it('se importan desde una copia v1 sin recortes', async () => {
    const backup = { format: 'finax-backup', version: 1, exportedAt: '', config: { key: 'config', initialBalanceCents: 1_000, configuredAt: 1, updatedAt: 1 }, movements: [], objectives: [old], positions: [] }
    await restoreBackup(parseBackup(JSON.stringify(backup)))
    assert.deepEqual(await listObjectives(), [old])
  })

  it('se importan desde una copia v2 sin recortes', async () => {
    const backup = { format: 'finax-backup', version: 2, exportedAt: '', config: null, movements: [], objectives: [old], positions: [], memories: [] }
    await restoreBackup(parseBackup(JSON.stringify(backup)))
    assert.deepEqual(await listObjectives(), [old])
  })
})

describe('AXIS ve la misma cobertura (sin cambios en AXIS)', () => {
  it('reservedForObjectivesCents coincide con coveredCents', () => {
    const objectives = [goal('a', 3_000, 10_000), goal('b', 2_000, 5_000)]
    for (const initial of [10_000, 3_500, -2_000]) {
      const ctx = buildFinancialContext({ config: { key: 'config', initialBalanceCents: initial, configuredAt: 1, updatedAt: 1 }, movements: [], objectives, positions: [] }, '2026-09-15')
      assert.equal(ctx.wealth.reservedForObjectivesCents, objectivesCoverage(objectives, ctx.wealth.liquidCents).coveredCents)
    }
  })
})
