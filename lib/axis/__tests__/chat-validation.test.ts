/**
 * Frontera de validación del chat (servidor): la respuesta del proveedor se
 * juzga frente a la decisión determinista de AXIS, como el análisis. Si no
 * pasa, no se muestra: chatWithProvider lanza → 502 → respuesta local.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AI_ENGINE_INFO } from '../ai-engine'
import { AIProviderError } from '../ai/provider'
import { chatWithProvider } from '../ai/server/analyze'
import { ChatTransportError, createChatEngine, type ChatTransport } from '../chat/engine'
import { buildChatGuard, validateChatReply } from '../chat/semantic'
import type { Invariant } from '../core/semantic'
import type { ChatInput } from '../chat/types'
import { parseChatReply } from '../chat/validate'
import { buildFinancialContext } from '../context'
import { forecastFigures, splitSentences } from '../core/figures'
import { formatCents } from '../../money'
import type { AxisMemory } from '../types'
import type { MemoryFact } from '../profile/types'
import type { MarketAIProvider } from '../../ai/providers/types'
import { config, healthyMovements, NOW, objective, snapshot, TODAY } from './fixtures'

const context = (targetCents = 100_000) => buildFinancialContext(snapshot({ config: config(150_000), movements: healthyMovements(), objectives: [objective({ name: 'Viaje', targetCents, currentCents: 30_000 })] }), TODAY)
const memoryWith = (...facts: MemoryFact[]): AxisMemory => ({ profileFacts: facts.map((fact, i) => ({ id: `mem-${i}`, updatedAt: i + 1, fact })) })

/** Contexto sano: ahorro de 1.300,00 € este mes, objetivo «Viaje» en curso. */
const chatInput = (message = '¿Cómo ves mi situación?', extra: Partial<ChatInput> = {}): ChatInput => ({ context: context(), market: null, conversation: { summary: null, recent: [] }, message, ...extra })
/** Con un ingreso recurrente declarado (3.500,00 €/mes) y «Viaje» aún en curso: hay previsión y plazo. */
const withForecast = (message = '¿Cuándo llegaré al viaje?') => chatInput(message, { context: context(2_000_000), memory: memoryWith({ kind: 'recurringIncome', cents: 350_000, frequency: 'monthly', category: 'Paga' }) })
/** Con un mínimo de liquidez muy por encima del líquido: AXIS decide completar el colchón. */
const cushionFirst = (message = '¿Debería invertir?') => chatInput(message, { memory: memoryWith({ kind: 'minLiquidity', cents: 5_000_000 }) })

const asReply = (text: string) => parseChatReply({ reply: text, confidence: 'media', nextStep: null, memoryProposal: null, engine: AI_ENGINE_INFO, generatedAt: NOW.toISOString() })
const invariants = (text: string, i: ChatInput = chatInput()) => {
  const v = validateChatReply(asReply(text), buildChatGuard(i))
  return v.ok ? [] : [...new Set(v.violations.map((x) => x.invariant))]
}
const accepts = (text: string, i?: ChatInput) => assert.deepEqual(invariants(text, i), [], text)
const rejects = (text: string, invariant: Invariant, i?: ChatInput) => assert.ok(invariants(text, i).includes(invariant), `${text} → ${JSON.stringify(invariants(text, i))}`)

function providerReplying(reply: string): MarketAIProvider {
  const output = { reply, confidence: 'media', nextStep: null, memoryProposal: null }
  return { id: 'groq:mock', model: 'mock', completeWithUsage: async () => ({ output, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }), complete: async () => output }
}

describe('AXIS chat · cifras', () => {
  it('una cifra real del contexto pasa; una inventada, alterada o escalada, no', () => {
    accepts('Este mes ahorras 1.300,00 € de 2.000,00 € de ingresos.')
    rejects('Este mes ahorras 1.350,00 €.', 'figures')
    rejects('Tienes unos 4.000 € libres.', 'figures')
    rejects('Tu patrimonio ronda los 3,5 mil euros.', 'figures')
    rejects('Puedes gastar hasta 7500 sin problema.', 'figures')
  })

  it('lo que escribe el usuario (ahora o antes en la conversación) y sus derivadas cerradas pasan', () => {
    const i = chatInput('Si gasto 300 € en un portátil, ¿qué pasa?')
    accepts(`Si gastas 300,00 €, tu liquidez quedaría en ${formatCents(i.context.wealth.liquidCents - 30_000)}.`, i)
    const earlier = chatInput('¿Y si lo dejo para el mes que viene?', { conversation: { summary: null, recent: [{ role: 'user', text: 'Me ofrecen un portátil por 300 €.' }] } })
    accepts('Los 300,00 € del portátil puedes decidirlos el mes que viene.', earlier)
    rejects('Un portátil de 900,00 € sería demasiado.', 'figures', earlier)
  })

  it('un plazo genérico no es una cifra financiera', () => {
    accepts('Vuelve a mirarlo dentro de 2 meses, con más datos.')
  })
})

describe('AXIS chat · previsiones e ingresos recurrentes', () => {
  it('el ingreso recurrente explicado como previsión pasa; como dinero disponible, no', () => {
    const i = withForecast()
    accepts('Tus ingresos previstos son 3.500,00 € al mes, si los recibes como hasta ahora.', i)
    rejects('Ya tienes 3.500,00 € disponibles de tu nómina.', 'figures', i)
    rejects('Dispones de 3.500,00 € para el viaje.', 'figures', i)
  })

  it('regresión: el punto de miles no corta la frase (antes una previsión de 1.000 € o más nunca se detectaba)', () => {
    assert.deepEqual(splitSentences('Ya tienes 3.500,00 € disponibles. Bien hecho.\nSigue así'), ['Ya tienes 3.500,00 € disponibles.', 'Bien hecho.', 'Sigue así'])
  })

  it('un plazo que solo existe como previsión no se presenta como hecho', () => {
    const i = withForecast()
    const months = forecastFigures(buildChatGuard(i).decision).find((f) => f.kind === 'count')?.value
    assert.ok(months !== undefined, 'el escenario tiene un plazo previsto')
    accepts(`Según la previsión, serían ${months} meses hasta «Viaje».`, i)
    rejects(`Llegarás a «Viaje» en ${months} meses.`, 'figures', i)
  })
})

describe('AXIS chat · ejecución', () => {
  it('rechaza cualquier afirmación de haber hecho (o ir a hacer) una operación', () => {
    for (const t of [
      'He añadido el gasto de ayer.',
      'He eliminado ese movimiento duplicado.',
      'He cambiado la fecha de tu objetivo.',
      'He marcado «Viaje» como conseguido.',
      'Ya está transferido a tu cuenta.',
      'Voy a reservar dinero para el viaje.',
      'Hemos movido tu ahorro al objetivo.',
    ]) rejects(t, 'execution')
  })

  it('explicar cómo lo hace el usuario no es ejecutar', () => {
    accepts('Puedes registrar el gasto desde Movimientos cuando quieras.')
    accepts('Si ya lo conseguiste, puedes marcar «Viaje» como conseguido en Objetivos.')
  })
})

describe('AXIS chat · objetivos sin aportación manual (B3)', () => {
  it('rechaza proponer aportar, reservar, destinar o añadir dinero a un objetivo, aunque el usuario lo pida', () => {
    const i = chatInput('¿Cuánto debería aportar a mi objetivo cada mes?')
    for (const t of [
      'Te recomiendo aportar parte de tu ahorro al objetivo Viaje.',
      'Reserva dinero para el viaje cada mes.',
      'Destina parte de tu excedente a tu objetivo.',
      'Añade dinero a tu objetivo cuando cobres.',
    ]) rejects(t, 'advice', i)
  })

  it('explicar el reparto automático pasa', () => {
    accepts('Tu objetivo «Viaje» recibe dinero automáticamente de tu líquido, por orden.')
    accepts('No hace falta que aportes nada a mano: el reparto es automático.')
    accepts('Sigue ahorrando y el reparto llevará más dinero a «Viaje».')
    accepts('Ahorra para tu fondo de emergencia antes de pensar en otros fines.')
  })
})

describe('AXIS chat · contradicción con la decisión de AXIS', () => {
  it('en este escenario AXIS decide completar el colchón', () => {
    assert.equal(buildChatGuard(cushionFirst()).decision.recommendation?.action.verb, 'complete-cushion')
  })

  it('recomendar invertir ahora contradice la decisión: se rechaza', () => {
    rejects('Te recomiendo invertir ahora una parte de tu ahorro.', 'advice', cushionFirst())
    rejects('Invierte ya el excedente.', 'advice', cushionFirst())
  })

  it('negar, condicionar o seguir la decisión pasa', () => {
    accepts('No te recomendaría invertir todavía porque tu liquidez es baja.', cushionFirst())
    accepts('Cuando completes el colchón, podrías plantearte invertir una parte.', cushionFirst())
    accepts('Lo prudente ahora es completar tu colchón antes de pensar en otros fines.', cushionFirst())
  })

  it('un activo o producto concreto nunca se recomienda, decida lo que decida AXIS', () => {
    rejects('Compra acciones de Tesla.', 'advice')
    rejects('Te recomiendo invertir en un fondo indexado.', 'advice')
  })

  it('sin una decisión que lo contradiga, hablar de invertir con prudencia pasa', () => {
    assert.notEqual(buildChatGuard(chatInput()).decision.recommendation?.action.verb, 'complete-cushion')
    accepts('Podrías plantearte invertir una parte del excedente, sin prisa.')
  })
})

describe('AXIS chat · fallback: una respuesta inválida nunca se muestra', () => {
  it('cifra inventada, ejecución, aportación manual, contradicción o previsión como hecho: chatWithProvider lanza (→ 502 → local)', async () => {
    const cases: Array<[string, ChatInput]> = [
      ['Este mes ahorras 1.350,00 €.', chatInput()],
      ['He añadido el gasto de ayer.', chatInput()],
      ['Aporta parte de tu ahorro a tu objetivo Viaje.', chatInput()],
      ['Te recomiendo invertir ahora una parte de tu ahorro.', cushionFirst()],
      ['Ya tienes 3.500,00 € disponibles de tu nómina.', withForecast()],
    ]
    for (const [bad, i] of cases) {
      await assert.rejects(() => chatWithProvider(providerReplying(bad), i), (e: unknown) => e instanceof AIProviderError && e.kind === 'malformed', bad)
    }
  })

  it('una respuesta válida llega íntegra', async () => {
    const reply = await chatWithProvider(providerReplying('Este mes ahorras 1.300,00 €; tu objetivo «Viaje» recibe dinero automáticamente.'), chatInput())
    assert.equal(reply.engine.isAI, true)
    assert.match(reply.text, /1\.300,00 €/)
  })

  it('el fallback local pasa la misma frontera (no afirma que la IA hiciera nada)', async () => {
    const t: ChatTransport = {
      isAvailable: async () => true,
      ask: async () => {
        throw new ChatTransportError('error', 'axis api 502')
      },
    }
    for (const i of [chatInput(), withForecast(), cushionFirst()]) {
      const reply = await createChatEngine({ transport: t }).ask(i)
      assert.equal(reply.engine.id, 'local-rules')
      assert.deepEqual(validateChatReply(reply, buildChatGuard(i)), { ok: true }, reply.text)
    }
  })
})
