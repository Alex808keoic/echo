/**
 * Persistencia de AXIS en Dexie (IndexedDB simulada en Node con fake-indexeddb).
 * Sin red, sin IA: solo comprueba que memoria y conversación persisten entre
 * «recargas» (cerrar y reabrir la base) y desaparecen con el borrado completo.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db'
import { clearAllData, exportBackup } from '../backup'
import { clearConversation, getConversation, putConversation } from '../axis-conversation'
import { deleteUserMemory, listUserMemories, resolveMemoryProposal, saveAcceptedProposal } from '../axis-memories'
import { getAxisMemory, rememberConclusion } from '../axis-memory'
import { setInitialBalance } from '../config'
import { appendMessage, EMPTY_CONVERSATION } from '../../axis/chat/history'
import type { ChatMessage, MemoryProposal } from '../../axis/chat/types'
import { analyzeLocally } from '../../axis/local-engine'
import { buildFinancialContext } from '../../axis/context'
import { config, healthyMovements, NOW, snapshot, TODAY } from '../../axis/__tests__/fixtures'

const proposal: MemoryProposal = { content: 'Quiere mantener 200 € de liquidez mínima.', category: 'constraint', importance: 'high', confidence: 0.9, replacesId: null }

function message(role: ChatMessage['role'], text: string): ChatMessage {
  return { id: `${role}-${text}`, role, text, createdAt: Date.now() }
}

/** Simula una recarga: cierra la conexión y vuelve a abrir la misma base. */
async function reload() {
  db.close()
  await db.open()
}

describe('AXIS · persistencia local', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open()
    await clearAllData()
  })

  it('memoria aceptada → persiste tras recargar; rechazada → no existe', async () => {
    const out = await saveAcceptedProposal(proposal, 1_000)
    assert.equal(out.action, 'created')
    await reload()
    const memories = await listUserMemories()
    assert.equal(memories.length, 1)
    assert.equal(memories[0].content, proposal.content)
    assert.equal(memories[0].source, 'conversation')
    // La memoria completa que reciben análisis y conversación la incluye.
    const memory = await getAxisMemory()
    assert.equal(memory?.userMemories?.length, 1)
    assert.equal(memory?.userMemories?.[0].id, memories[0].id)
  })

  it('actualización → replacesId sustituye sin duplicar, también en Dexie', async () => {
    await saveAcceptedProposal(proposal, 1_000)
    const [existing] = await listUserMemories()
    const out = await saveAcceptedProposal({ ...proposal, content: 'Ahora prefiere mantener 100 € de liquidez mínima.', replacesId: existing.id }, 2_000)
    assert.equal(out.action, 'updated')
    await reload()
    const memories = await listUserMemories()
    assert.equal(memories.length, 1)
    assert.equal(memories[0].id, existing.id)
    assert.match(memories[0].content, /100 €/)
  })

  it('una propuesta con secretos no llega a la base', async () => {
    const out = await saveAcceptedProposal({ ...proposal, content: 'Su contraseña del banco es hola123' })
    assert.equal(out.action, 'rejected')
    assert.equal((await listUserMemories()).length, 0)
  })

  it('olvidar una memoria la elimina', async () => {
    await saveAcceptedProposal(proposal)
    const [m] = await listUserMemories()
    await deleteUserMemory(m.id)
    assert.equal((await listUserMemories()).length, 0)
  })

  it('la conversación persiste tras recargar y «Borrar conversación» conserva las memorias', async () => {
    let state = appendMessage(EMPTY_CONVERSATION, message('user', 'Quiero ahorrar 1.000 €.'))
    state = appendMessage(state, message('axis', '¿Para qué fecha?'))
    await putConversation(state)
    await saveAcceptedProposal(proposal)
    await reload()
    const loaded = await getConversation()
    assert.equal(loaded.messages.length, 2)
    assert.equal(loaded.messages[1].text, '¿Para qué fecha?')
    await clearConversation()
    assert.deepEqual(await getConversation(), EMPTY_CONVERSATION)
    assert.equal((await listUserMemories()).length, 1)
  })

  it('«Borrar todos los datos» elimina memoria, historial, resumen y conclusiones de AXIS', async () => {
    await setInitialBalance(150_000)
    await saveAcceptedProposal(proposal)
    await putConversation({ summary: 'Usuario: hola · AXIS: hola', messages: [message('user', 'hola')] })
    const local = analyzeLocally({ context: buildFinancialContext(snapshot({ config: config(150_000), movements: healthyMovements() }), TODAY) }, NOW)
    if (local.status !== 'analysis') throw new Error('unreachable')
    await rememberConclusion(local.analysis)
    assert.ok(await getAxisMemory())

    await clearAllData()
    await reload()
    assert.equal((await listUserMemories()).length, 0)
    assert.deepEqual(await getConversation(), EMPTY_CONVERSATION)
    assert.equal(await getAxisMemory(), null)
    assert.equal(await db.config.count(), 0)
  })

  // Fase 4: la copia (v2) incluye las memorias aceptadas, y solo eso de AXIS. Sustituye al test anterior
  // («el backup no incluye memoria…»), cuya especificación ya no es válida.
  it('el backup incluye las memorias de AXIS, pero no la conversación ni las conclusiones', async () => {
    await saveAcceptedProposal(proposal)
    await putConversation({ summary: null, messages: [message('user', 'secreto de conversación')] })
    const backup = JSON.stringify(await exportBackup())
    assert.match(backup, /liquidez mínima/, 'la memoria aceptada sí está')
    assert.doesNotMatch(backup, /secreto de conversación/, 'la conversación no')
  })
})

describe('AXIS · persistencia local · sustitución de datos (fase 0)', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open()
    await clearAllData()
  })

  const fact = (content: string, f: MemoryProposal['fact']): MemoryProposal => ({ content, category: 'constraint', importance: 'high', confidence: 0.9, replacesId: null, fact: f })

  it('un dato del mismo tipo sustituye al anterior en Dexie y sobrevive a la recarga', async () => {
    await saveAcceptedProposal(fact('Quiere tener siempre 300 € disponibles.', { kind: 'minLiquidity', cents: 30_000 }), 1_000)
    await saveAcceptedProposal(fact('Piensa su dinero a largo plazo.', { kind: 'horizon', value: 'long' }), 2_000)
    const out = await saveAcceptedProposal(fact('Prefiere un colchón de 500 € como mínimo.', { kind: 'minLiquidity', cents: 50_000 }), 3_000)
    assert.equal(out.action, 'updated')
    await reload()
    const memories = await listUserMemories()
    assert.equal(memories.length, 2, 'la de otro tipo se conserva; la sustituida no se duplica')
    assert.deepEqual(memories.filter((m) => m.fact?.kind === 'minLiquidity').map((m) => m.fact), [{ kind: 'minLiquidity', cents: 50_000 }])
    const mem = await getAxisMemory()
    assert.equal(mem?.profileFacts?.length, 2)
  })

  it('olvidar el dato lo quita del perfil que se envía', async () => {
    await saveAcceptedProposal(fact('Quiere tener siempre 300 € disponibles.', { kind: 'minLiquidity', cents: 30_000 }), 1_000)
    const [m] = await listUserMemories()
    await deleteUserMemory(m.id)
    await reload()
    assert.equal((await getAxisMemory())?.profileFacts, undefined)
  })

  it('guardar una conclusión no altera los hechos del perfil', async () => {
    await saveAcceptedProposal(fact('Quiere tener siempre 300 € disponibles.', { kind: 'minLiquidity', cents: 30_000 }), 1_000)
    const before = (await getAxisMemory())?.profileFacts
    const result = analyzeLocally({ context: buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements() }), TODAY) }, NOW)
    assert.equal(result.status, 'analysis')
    if (result.status === 'analysis') await rememberConclusion(result.analysis)
    const after = await getAxisMemory()
    assert.deepEqual(after?.profileFacts, before)
    assert.equal(after?.previousConclusions?.length, 1)
  })
})

describe('AXIS · persistencia local · ingreso recurrente (fase 1)', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open()
    await clearAllData()
  })

  const income = (content: string, cents: number, category: 'Paga' | 'Regalos' | 'Otros' = 'Paga'): MemoryProposal => ({
    content,
    category: 'financial_plan',
    importance: 'high',
    confidence: 0.9,
    replacesId: null,
    fact: { kind: 'recurringIncome', cents, frequency: 'monthly', category },
  })
  const incomes = async () => (await getAxisMemory())?.profileFacts?.map((f) => f.fact).filter((f) => f.kind === 'recurringIncome')

  it('T1 · paga de 20 € → se acepta la de 35 € → persiste tras reabrir → regalos de 10 € no quitan la paga', async () => {
    assert.equal(await resolveMemoryProposal(income('Cada mes le dan 20 € de paga.', 2_000), true, 1_000), 'accepted')
    const [original] = await listUserMemories()

    assert.equal(await resolveMemoryProposal(income('Ahora le dan 35 € de paga al mes.', 3_500), true, 2_000), 'accepted')
    await reload()
    const afterReplace = await listUserMemories()
    assert.equal(afterReplace.length, 1, 'la paga anterior no queda duplicada')
    assert.equal(afterReplace[0].id, original.id, 'se sustituye en su sitio')
    assert.match(afterReplace[0].content, /35 €/)
    assert.deepEqual(await incomes(), [{ kind: 'recurringIncome', cents: 3_500, frequency: 'monthly', category: 'Paga' }])

    assert.equal(await resolveMemoryProposal(income('Cada mes recibe 10 € de regalos.', 1_000, 'Regalos'), true, 3_000), 'accepted')
    await reload()
    assert.equal((await listUserMemories()).length, 2)
    assert.deepEqual(
      (await incomes())?.map((f) => (f.kind === 'recurringIncome' ? [f.category, f.cents] : null)).sort(),
      [['Paga', 3_500], ['Regalos', 1_000]],
    )
  })

  it('T2 · rechazar una sustitución conserva exactamente la memoria anterior, no guarda el dato nuevo y no borra otras', async () => {
    await resolveMemoryProposal(income('Cada mes le dan 20 € de paga.', 2_000), true, 1_000)
    await resolveMemoryProposal({ content: 'Piensa su dinero a largo plazo.', category: 'preference', importance: 'medium', confidence: 0.8, replacesId: null, fact: { kind: 'horizon', value: 'long' } }, true, 2_000)
    await resolveMemoryProposal({ content: 'Prefiere no complicarse.', category: 'preference', importance: 'low', confidence: 0.8, replacesId: null }, true, 3_000)
    const before = await listUserMemories()
    const factsBefore = (await getAxisMemory())?.profileFacts

    assert.equal(await resolveMemoryProposal(income('Ahora le dan 35 € de paga al mes.', 3_500), false, 4_000), 'rejected')
    await reload()
    assert.deepEqual(await listUserMemories(), before, 'mismas memorias, mismos campos y mismas fechas')
    assert.deepEqual((await getAxisMemory())?.profileFacts, factsBefore)
    assert.deepEqual(await incomes(), [{ kind: 'recurringIncome', cents: 2_000, frequency: 'monthly', category: 'Paga' }])
  })
})
