/**
 * La guía para invertir en el chat: si el mensaje nombra un tipo de producto,
 * AXIS recibe su ficha y el encaje con el plan, y puede explicarlos; nunca
 * recomendar comprarlo ni nombrar productos concretos.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AI_ENGINE_INFO } from '../ai-engine'
import { chatActions } from '../chat/actions'
import { composeLocalReply } from '../chat/local-reply'
import { buildChatRequest } from '../chat/prompt'
import { buildChatGuard, validateChatReply } from '../chat/semantic'
import { parseChatReply } from '../chat/validate'
import { buildFinancialContext } from '../context'
import { CUSHION_OBJECTIVE_NAME } from '../plan/allocation'
import type { ChatInput } from '../chat/types'
import type { Movement } from '../../types'
import { config, gasto, ingreso, NOW, objective, snapshot, TODAY } from './fixtures'

const history3 = (): Movement[] => [
  ...['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 200_000), gasto(`2026-${m}-10`, 100_000)]),
  ingreso('2026-09-01', 200_000),
  gasto('2026-09-05', 50_000),
]
function input(message: string): ChatInput {
  const movements = history3()
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  const context = buildFinancialContext(snapshot({ config: config(800_000 - net), movements, objectives: [objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 300_000, priority: 1 })] }), TODAY)
  const memory = { profileFacts: [{ id: 'm-1', updatedAt: 1, fact: { kind: 'horizon' as const, value: 'long' as const } }, { id: 'm-2', updatedAt: 2, fact: { kind: 'riskAttitude' as const, value: 'balanced' as const } }] }
  return { context, market: null, memory, conversation: { summary: null, recent: [] }, message }
}
const payloadOf = (i: ChatInput) => {
  const user = buildChatRequest(i).user
  return JSON.parse(user.slice(user.indexOf('{')))
}
const asReply = (text: string) => parseChatReply({ reply: text, confidence: 'media', nextStep: null, memoryProposal: null, engine: AI_ENGINE_INFO, generatedAt: NOW.toISOString() })
const ok = (text: string, i: ChatInput) => validateChatReply(asReply(text), buildChatGuard(i)).ok

describe('el modelo recibe la guía solo si se nombra un tipo de producto', () => {
  it('«¿Qué es un ETF?»: ficha y encaje con su plan', () => {
    const g = payloadOf(input('¿Qué es un ETF?')).guia_para_invertir
    assert.equal(g.tipos[0].nombre, 'ETF')
    assert.equal(g.encaje_con_su_plan[0].veredicto, 'Encaja con tu parte a largo plazo')
    assert.match(g.como_usarlo, /Nunca le digas que compre/)
  })

  it('una pregunta sin productos: sin guía', () => {
    assert.equal('guia_para_invertir' in payloadOf(input('¿Cómo voy este mes?')), false)
  })
})

describe('validación', () => {
  it('explicar el tipo y su encaje pasa, también con las cifras de la guía', () => {
    assert.ok(ok('Un ETF copia un índice y cotiza en bolsa. Con tu plan, encaja con tu parte a largo plazo, pero puede caer más de un 30 % en un año malo.', input('¿Qué es un ETF?')))
    assert.ok(ok('Un depósito está cubierto por el Fondo de Garantía de Depósitos hasta 100.000 € por titular y entidad.', input('¿Es seguro un depósito?')))
  })

  it('recomendar comprar uno concreto, no', () => {
    assert.equal(ok('Te recomiendo comprar un ETF del S&P 500 este mes.', input('¿Qué es un ETF?')), false)
    assert.equal(ok('Compra bitcoin ahora que está bajo.', input('¿Merece la pena el bitcoin?')), false)
  })
})

describe('sin IA y tarjetas', () => {
  it('la respuesta local explica la guía y lleva a ella', () => {
    const reply = composeLocalReply(input('Estoy mirando un fondo indexado'), 'unavailable', NOW)
    assert.match(reply.text, /Sobre fondo indexado/)
    assert.match(reply.text, /Con tu plan: encaja con tu parte a largo plazo/)
    assert.match(reply.text, /no una recomendación/)
    assert.deepEqual(reply.nextStep, { label: 'Ver la guía para invertir', to: 'guia' })
  })

  it('cripto: fuera del plan, con su aviso', () => {
    const reply = composeLocalReply(input('¿Merece la pena el bitcoin?'), 'unavailable', NOW)
    assert.match(reply.text, /queda fuera de tu plan/)
    assert.match(reply.text, /perder entero/)
  })

  it('la tarjeta de la guía va primero', () => {
    const actions = chatActions(input('¿Qué es un ETF?'), {})
    assert.ok(actions[0].kind === 'navigate' && actions[0].to === 'guia')
  })
})
