/**
 * «Aportar» a un objetivo aparta líquido: nunca más de lo que falta ni más
 * del líquido que no está ya apartado en otros objetivos.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { contributionError, contributionLimit } from '../objectives'
import { db } from '../../db/db'
import { addObjective, contributeToObjective } from '../../db/objectives'
import type { Objective } from '../../types'

const goal = (id: string, currentCents: number, targetCents: number): Objective => ({
  id,
  name: id,
  currentCents,
  targetCents,
  createdAt: 0,
  updatedAt: 0,
})

describe('contributionLimit', () => {
  it('limita por lo que falta', () => {
    const a = goal('a', 40_000, 50_000)
    assert.deepEqual(contributionLimit(a, [a], 200_000), { remainingCents: 10_000, freeCents: 160_000, maxCents: 10_000 })
  })

  it('limita por el líquido sin apartar en todos los objetivos', () => {
    const a = goal('a', 10_000, 100_000)
    const b = goal('b', 30_000, 30_000)
    assert.deepEqual(contributionLimit(a, [a, b], 50_000), { remainingCents: 90_000, freeCents: 10_000, maxCents: 10_000 })
  })

  it('nunca es negativo (líquido por debajo de lo apartado o en negativo)', () => {
    const a = goal('a', 50_000, 100_000)
    assert.equal(contributionLimit(a, [a], -5_000).maxCents, 0)
    assert.equal(contributionLimit(a, [a], 20_000).freeCents, 0)
  })
})

describe('contributionError', () => {
  const limit = { remainingCents: 10_000, freeCents: 6_000, maxCents: 6_000 }
  it('acepta hasta el máximo', () => {
    assert.equal(contributionError(6_000, limit), null)
  })
  it('explica cada rechazo', () => {
    assert.match(contributionError(null, limit) ?? '', /mayor que cero/)
    assert.match(contributionError(12_000, limit) ?? '', /le falta/)
    assert.match(contributionError(8_000, limit) ?? '', /sin apartar/)
    assert.match(contributionError(1, { remainingCents: 0, freeCents: 5, maxCents: 0 }) ?? '', /conseguido/)
    assert.match(contributionError(1, { remainingCents: 5, freeCents: 0, maxCents: 0 }) ?? '', /No te queda/)
  })
})

describe('contributeToObjective', () => {
  beforeEach(async () => {
    await db.objectives.clear()
  })

  it('suma a lo ahorrado sin tocar el resto', async () => {
    const o = await addObjective({ name: 'Viaje', currentCents: 1_000, targetCents: 10_000 })
    await contributeToObjective(o.id, 2_500)
    const saved = await db.objectives.get(o.id)
    assert.equal(saved?.currentCents, 3_500)
    assert.equal(saved?.targetCents, 10_000)
    assert.equal(saved?.name, 'Viaje')
  })

  it('rechaza importes no válidos y objetivos inexistentes', async () => {
    const o = await addObjective({ name: 'Viaje', currentCents: 0, targetCents: 10_000 })
    await assert.rejects(contributeToObjective(o.id, 0))
    await assert.rejects(contributeToObjective(o.id, 12.5))
    await assert.rejects(contributeToObjective('no-existe', 100))
    assert.equal((await db.objectives.get(o.id))?.currentCents, 0)
  })
})
