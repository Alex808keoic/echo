/**
 * Plan de reparto en el chat (fase 2d). El plan se recalcula con los mismos
 * datos que ya recibe el chat (ningún dato nuevo sale del dispositivo). La IA
 * puede explicarlo con sus importes, pero no cambiarlos, no proponer invertir
 * cuando el plan dice que no toca y nunca nombrar productos.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AI_ENGINE_INFO } from '../ai-engine'
import { buildChatRequest } from '../chat/prompt'
import { buildChatGuard, validateChatReply } from '../chat/semantic'
import { composeLocalReply } from '../chat/local-reply'
import { parseChatReply } from '../chat/validate'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { chatPlanOf, PLAN_QUESTION, planForPrompt } from '../plan/chat'
import { CUSHION_OBJECTIVE_NAME } from '../plan/allocation'
import type { ChatInput } from '../chat/types'
import type { MemoryFact } from '../profile/types'
import type { Movement, Objective } from '../../types'
import { config, gasto, ingreso, NOW, objective, snapshot, TODAY } from './fixtures'

const history3 = (): Movement[] => [
  ...['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 200_000), gasto(`2026-${m}-10`, 100_000)]),
  ingreso('2026-09-01', 200_000),
  gasto('2026-09-05', 50_000),
]
const PROFILE: MemoryFact[] = [
  { kind: 'horizon', value: 'long' },
  { kind: 'riskAttitude', value: 'balanced' },
]
function input(message: string, liquidCents: number, objectives: Objective[] = [], facts: MemoryFact[] = PROFILE): ChatInput {
  const movements = history3()
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  const context = buildFinancialContext(snapshot({ config: config(liquidCents - net), movements, objectives }), TODAY)
  const memory = { profileFacts: facts.map((fact, i) => ({ id: `mem-${i}`, updatedAt: i + 1, fact })) }
  return { context, market: null, memory, conversation: { summary: null, recent: [] }, message }
}
/** Colchón completo y perfil equilibrado: el plan invierte 400,00 € al mes. */
const investing = (message = '¿Cuánto debería invertir?') => input(message, 800_000, [objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 300_000, priority: 1 })])
/** Colchón a medias: el plan dice que aún no toca invertir. */
const cushionIncomplete = (message = '¿Cuánto debería invertir?') => input(message, 100_000, [objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 300_000, priority: 1 })])

const asReply = (text: string) => parseChatReply({ reply: text, confidence: 'media', nextStep: null, memoryProposal: null, engine: AI_ENGINE_INFO, generatedAt: NOW.toISOString() })
const verdict = (text: string, i: ChatInput) => validateChatReply(asReply(text), buildChatGuard(i))
const accepts = (text: string, i: ChatInput) => {
  const v = verdict(text, i)
  assert.ok(v.ok, `${text} → ${v.ok ? '' : v.violations.map((x) => x.detail).join(' | ')}`)
}
const rejects = (text: string, i: ChatInput) => assert.equal(verdict(text, i).ok, false, text)

describe('el modelo recibe el plan, con los mismos textos que «Tu plan»', () => {
  it('bloque plan_de_reparto en los datos actuales', () => {
    const i = investing()
    const payload = JSON.parse(buildChatRequest(i).user.slice(buildChatRequest(i).user.indexOf('{')))
    const expected = planForPrompt(chatPlanOf(decide({ context: i.context, market: null, memory: i.memory })))
    assert.deepEqual(payload.datos_actuales.plan_de_reparto, expected)
    assert.equal(expected.invierte_este_mes, true)
    assert.deepEqual(expected.pasos.map((p) => p.titulo), ['400,00 € al mes a largo plazo', '600,00 € al mes a tus objetivos'])
  })

  it('el prompt de sistema explica cómo usarlo', () => {
    assert.match(buildChatRequest(investing()).system, /«plan_de_reparto» es el plan de Finax/)
  })

  it('no añade datos nuevos: el plan se deriva del contexto y la memoria que ya se enviaban', () => {
    const i = investing()
    const withoutPlan = JSON.parse(buildChatRequest(i).user.slice(buildChatRequest(i).user.indexOf('{')))
    delete withoutPlan.datos_actuales.plan_de_reparto
    assert.deepEqual(Object.keys(withoutPlan.datos_actuales), ['contexto_financiero', 'senales_detectadas_por_finax'])
  })
})

describe('validación: el plan manda', () => {
  it('explicar el plan con sus importes pasa', () => {
    accepts('Según tu plan, este mes puedes destinar 400,00 € a largo plazo, el 40 % de lo que te sobra, y 600,00 € seguirán yendo a tus objetivos.', investing())
  })

  it('cambiar los importes no pasa', () => {
    rejects('Según tu plan, este mes puedes destinar 450,00 € a largo plazo.', investing())
    rejects('Te recomiendo invertir el 70 % de lo que te sobra.', investing())
  })

  it('productos concretos nunca, aunque el plan invierta', () => {
    rejects('Puedes invertir 400,00 € al mes en un ETF del S&P 500.', investing())
    rejects('Te recomiendo comprar oro con esos 400,00 €.', investing())
  })

  it('si el plan dice que aún no toca invertir, la IA no puede proponerlo', () => {
    rejects('Te recomiendo invertir 400,00 € este mes.', cushionIncomplete())
    rejects('Deberías invertir una parte de tu ahorro ya.', cushionIncomplete())
  })

  it('pero puede explicarlo como un paso futuro, condicionado', () => {
    accepts('Primero completa tu colchón; cuando lo tengas, podrías invertir una parte a largo plazo.', cushionIncomplete())
  })

  it('sin datos suficientes, el plan no prohíbe hablar de invertir con prudencia', () => {
    const few = buildFinancialContext(snapshot({ config: config(100_000), movements: [ingreso('2026-09-01', 200_000), gasto('2026-09-05', 50_000)] }), TODAY)
    accepts('Podrías plantearte invertir una parte del excedente, sin prisa.', { context: few, market: null, conversation: { summary: null, recent: [] }, message: '¿Invierto?' })
  })
})

describe('respuesta local (sin IA)', () => {
  it('a una pregunta sobre el plan responde con el plan y lleva a «Tu plan»', () => {
    const reply = composeLocalReply(investing('¿Qué hago con mi dinero?'), 'unavailable', NOW)
    assert.match(reply.text, /Tu plan de este mes/)
    assert.match(reply.text, /1\. 400,00 € al mes a largo plazo/)
    assert.match(reply.text, /no asesoramiento financiero personalizado/)
    assert.deepEqual(reply.nextStep, { label: 'Ver tu plan', to: 'plan' })
  })

  it('una pregunta sobre el ahorro de un objetivo sigue con la lectura de AXIS', () => {
    assert.ok(!PLAN_QUESTION.test('¿Y cuánto tendría que ahorrar al mes?'))
    const reply = composeLocalReply(investing('¿Y cuánto tendría que ahorrar al mes?'), 'unavailable', NOW)
    assert.doesNotMatch(reply.text, /Tu plan de este mes/)
  })

  it('reconoce las preguntas explícitas sobre el plan', () => {
    for (const q of ['¿Cuánto invierto?', 'Explícame mi plan', '¿Qué hago con mi dinero?', '¿Dónde meto mi ahorro?', '¿Cuánto debería tener en el fondo de emergencia?']) {
      assert.ok(PLAN_QUESTION.test(q), q)
    }
  })
})
