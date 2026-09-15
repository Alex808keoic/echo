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
import { deleteUserMemory, listUserMemories, saveAcceptedProposal } from '../axis-memories'
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

  it('el backup no incluye memoria ni conversación de AXIS', async () => {
    await saveAcceptedProposal(proposal)
    await putConversation({ summary: null, messages: [message('user', 'secreto de conversación')] })
    const backup = JSON.stringify(await exportBackup())
    assert.doesNotMatch(backup, /liquidez mínima|secreto de conversación/)
  })
})
