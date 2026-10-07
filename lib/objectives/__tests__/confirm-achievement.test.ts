/**
 * «Marcar como conseguido» con confirmación: abrir no cambia nada, cancelar
 * tampoco, confirmar marca `achievedAt`. La lógica de conseguir y reactivar
 * es la de siempre (cubierta en lib/finance/__tests__/objectives.test.ts);
 * aquí solo se comprueba que la confirmación la respeta.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../../db/db'
import { addObjective, listObjectives, reactivateObjective } from '../../db/objectives'
import { allocateObjectives } from '../../finance/objectives'
import { achievementConfirmation, requestObjectiveAchievement, type AchievementPrompt } from '../confirm-achievement'

/** Hoja simulada: guarda la confirmación abierta y cuenta los cierres. */
function fakeSheet() {
  const state: { prompt: AchievementPrompt | null; closed: number } = { prompt: null, closed: 0 }
  return {
    state,
    ui: {
      show: (p: AchievementPrompt) => {
        state.prompt = p
      },
      close: () => {
        state.prompt = null
        state.closed++
      },
    },
  }
}

async function setup() {
  await db.delete()
  await db.open()
  const viaje = await addObjective({ name: 'Viaje', targetCents: 100_000 })
  const moto = await addObjective({ name: 'Moto', targetCents: 300_000 })
  // Orden fijo («Viaje» primero): creados en el mismo milisegundo, el desempate sería por id aleatorio.
  await db.objectives.update(viaje.id, { priority: 1 })
  await db.objectives.update(moto.id, { priority: 2 })
  return { viaje, moto }
}

const byId = async (id: string) => (await listObjectives()).find((o) => o.id === id)!

describe('Marcar como conseguido · confirmación', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('abrir la confirmación no cambia el objetivo', async () => {
    const { viaje } = await setup()
    const before = structuredClone(await listObjectives())
    const sheet = fakeSheet()
    requestObjectiveAchievement(viaje, sheet.ui)
    assert.ok(sheet.state.prompt, 'la confirmación queda abierta')
    assert.deepEqual(await listObjectives(), before)
  })

  it('cancelar cierra la confirmación y deja el objetivo exactamente como estaba', async () => {
    const { viaje } = await setup()
    const before = structuredClone(await listObjectives())
    const sheet = fakeSheet()
    requestObjectiveAchievement(viaje, sheet.ui)
    sheet.state.prompt!.onCancel()
    assert.equal(sheet.state.prompt, null)
    assert.equal(sheet.state.closed, 1)
    assert.deepEqual(await listObjectives(), before)
  })

  it('confirmar marca achievedAt y cierra; el objetivo sale del reparto y su parte pasa al siguiente', async () => {
    const { viaje, moto } = await setup()
    const liquid = 250_000
    const before = allocateObjectives(await listObjectives(), liquid)
    assert.deepEqual(before.items.map((i) => [i.objective.id, i.allocatedCents]), [[viaje.id, 100_000], [moto.id, 150_000]])

    const sheet = fakeSheet()
    requestObjectiveAchievement(viaje, sheet.ui)
    await sheet.state.prompt!.onConfirm()
    assert.equal(sheet.state.prompt, null)
    assert.notEqual((await byId(viaje.id)).achievedAt, undefined)
    assert.equal((await byId(moto.id)).achievedAt, undefined, 'solo cambia el confirmado')

    const after = allocateObjectives(await listObjectives(), liquid)
    const item = (id: string) => after.items.find((i) => i.objective.id === id)!
    assert.deepEqual([item(viaje.id).status, item(viaje.id).allocatedCents], ['achieved', 0])
    assert.equal(item(moto.id).allocatedCents, 250_000)
  })

  it('solo se marca al confirmar: markAchieved no se llama al abrir ni al cancelar', async () => {
    const calls: string[] = []
    const sheet = fakeSheet()
    const fake = async (id: string) => {
      calls.push(id)
    }
    requestObjectiveAchievement({ id: 'x', name: 'X' }, sheet.ui, fake)
    sheet.state.prompt!.onCancel()
    assert.deepEqual(calls, [])
    requestObjectiveAchievement({ id: 'x', name: 'X' }, sheet.ui, fake)
    await sheet.state.prompt!.onConfirm()
    assert.deepEqual(calls, ['x'])
  })

  it('sigue siendo reversible: reactivar quita achievedAt y lo devuelve al final del orden', async () => {
    const { viaje, moto } = await setup()
    const sheet = fakeSheet()
    requestObjectiveAchievement(viaje, sheet.ui)
    await sheet.state.prompt!.onConfirm()
    await reactivateObjective(viaje.id)
    assert.equal((await byId(viaje.id)).achievedAt, undefined)
    assert.deepEqual(allocateObjectives(await listObjectives(), 0).items.map((i) => i.objective.id), [moto.id, viaje.id])
  })

  it('el texto explica que deja de recibir dinero líquido del reparto, a dónde va y que se puede reactivar', () => {
    const c = achievementConfirmation('Viaje')
    assert.equal(c.title, '¿Marcar como conseguido?')
    assert.equal(c.confirmLabel, 'Marcar como conseguido')
    assert.match(c.message, /«Viaje» dejará de recibir dinero líquido del reparto automático/)
    assert.match(c.message, /pasará a tus siguientes objetivos activos/)
    assert.match(c.message, /Puedes reactivarlo/)
    // «disponible» solo con su significado: lo que queda después de los objetivos.
    assert.doesNotMatch(c.message, /dinero disponible/)
  })
})
