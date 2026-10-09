/**
 * Tarjetas de acción del chat (parte 4b): las calcula Finax en el
 * dispositivo a partir del plan y la decisión, nunca el modelo; solo cuando
 * la pregunta va de qué hacer con el dinero o hay algo importante; como mucho dos.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AI_ENGINE_INFO } from '../ai-engine'
import { chatActions, MAX_CHAT_ACTIONS } from '../chat/actions'
import { createChatEngine, type ChatTransport } from '../chat/engine'
import { buildFinancialContext } from '../context'
import { CUSHION_OBJECTIVE_NAME } from '../plan/allocation'
import type { ChatInput, ChatReply } from '../chat/types'
import type { Movement, Objective } from '../../types'
import { config, gasto, healthyMovements, ingreso, NOW, objective, snapshot, TODAY } from './fixtures'

const history3 = (): Movement[] => [
  ...['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 200_000), gasto(`2026-${m}-10`, 100_000)]),
  ingreso('2026-09-01', 200_000),
  gasto('2026-09-05', 50_000),
]
function input(message: string, liquidCents: number, objectives: Objective[] = [], movements = history3()): ChatInput {
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  const context = buildFinancialContext(snapshot({ config: config(liquidCents - net), movements, objectives }), TODAY)
  return { context, market: null, conversation: { summary: null, recent: [] }, message }
}
const kinds = (i: ChatInput, nextStep?: ChatReply['nextStep']) => chatActions(i, { nextStep }).map((a) => (a.kind === 'navigate' ? `navigate:${a.to}` : a.kind))

describe('cuándo aparecen', () => {
  it('pregunta sobre el plan sin colchón: crear el Fondo de emergencia y ver el plan', () => {
    const actions = chatActions(input('¿Qué hago con mi dinero?', 100_000), {})
    assert.deepEqual(actions.map((a) => a.kind), ['create-cushion', 'navigate'])
    const create = actions[0]
    assert.ok(create.kind === 'create-cushion' && create.targetCents === 300_000)
  })

  it('colchón creado pero no el primero: ponerlo primero', () => {
    const objectives = [objective({ name: 'Viaje', targetCents: 50_000, priority: 1 }), objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 300_000, priority: 2 })]
    assert.deepEqual(kinds(input('Explícame mi plan', 100_000, objectives)), ['move-cushion-first', 'navigate:plan'])
  })

  it('algo importante (líquido negativo), aunque no pregunte por el plan', () => {
    assert.deepEqual(kinds(input('¿Cómo voy?', -50_000)), ['navigate:dinero', 'navigate:plan'])
  })

  it('una pregunta normal sin nada urgente: ninguna', () => {
    const objectives = [objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 300_000, priority: 1 })]
    assert.deepEqual(chatActions(input('¿Cómo voy este mes?', 800_000, objectives), {}), [])
  })

  it('sin datos: ninguna', () => {
    const empty = buildFinancialContext(snapshot(), TODAY)
    assert.deepEqual(chatActions({ context: empty, market: null, conversation: { summary: null, recent: [] }, message: '¿Qué hago con mi dinero?' }, {}), [])
  })
})

describe('límites', () => {
  it('como mucho dos y sin repetir el siguiente paso de la respuesta', () => {
    const i = input('¿Cuánto invierto?', 800_000, [objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 300_000, priority: 1 })])
    assert.ok(chatActions(i, {}).length <= MAX_CHAT_ACTIONS)
    assert.ok(!kinds(i, { label: 'Ver tu plan', to: 'plan' }).includes('navigate:plan'))
  })

  it('con pocos meses de datos: registrar movimientos', () => {
    assert.deepEqual(kinds(input('¿Qué hago con mi dinero?', 300_000, [], healthyMovements())), ['navigate:movimientos', 'navigate:plan'])
  })
})

describe('el motor las añade, con IA o sin ella, y nunca vienen del modelo', () => {
  const engineWith = (transport: ChatTransport) => createChatEngine({ transport })

  it('respuesta local (sin IA)', async () => {
    const engine = engineWith({ isAvailable: async () => false, ask: async () => assert.fail('no debe llamar') })
    const reply = await engine.ask(input('¿Qué hago con mi dinero?', 100_000))
    assert.deepEqual(reply.actions?.map((a) => a.kind), ['create-cushion', 'navigate'])
  })

  it('respuesta con IA: unas «actions» del servidor se descartan y se ponen las de Finax', async () => {
    const fromServer = { text: 'Te explico tu plan.', confidence: 'media', nextStep: null, memoryProposal: null, engine: AI_ENGINE_INFO, generatedAt: NOW.toISOString(), actions: [{ kind: 'create-cushion', label: 'Inventada', targetCents: 1 }] } as unknown as ChatReply
    const engine = engineWith({ isAvailable: async () => true, ask: async () => fromServer })
    const reply = await engine.ask(input('¿Qué hago con mi dinero?', 100_000))
    assert.ok(reply.actions && reply.actions.every((a) => a.label !== 'Inventada'))
    const create = reply.actions?.find((a) => a.kind === 'create-cushion')
    assert.ok(create && create.kind === 'create-cushion' && create.targetCents === 300_000)
  })
})
