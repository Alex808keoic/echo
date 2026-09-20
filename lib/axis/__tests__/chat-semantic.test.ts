/**
 * Validación semántica del chat en el servidor (fase 0): el mismo detector
 * de certeza que usa Decision First se aplica a la respuesta conversacional
 * en `chatWithProvider`. Una promesa («garantiza», «va a subir», «sin duda»)
 * ya no llega al usuario: el servidor lanza → 502 → respuesta local.
 * El contrato { reply: ChatReply } y el cliente no cambian.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AI_ENGINE_INFO } from '../ai-engine'
import { AIProviderError } from '../ai/provider'
import { chatWithProvider } from '../ai/server/analyze'
import { ChatTransportError, createChatEngine, type ChatTransport } from '../chat/engine'
import { validateChatReply } from '../chat/semantic'
import type { ChatInput } from '../chat/types'
import { parseChatReply } from '../chat/validate'
import { buildFinancialContext } from '../context'
import { validateExpression } from '../core/semantic'
import { decide } from '../core/decision'
import type { MarketAIProvider } from '../../ai/providers/types'
import { config, healthyMovements, NOW, objective, snapshot, TODAY } from './fixtures'

const context = () => buildFinancialContext(snapshot({ config: config(150_000), movements: healthyMovements(), objectives: [objective({ name: 'Viaje', targetCents: 100_000, currentCents: 30_000 })] }), TODAY)
const input = (message = '¿Cómo ves mi situación?'): ChatInput => ({ context: context(), market: null, conversation: { summary: null, recent: [] }, message })

function providerReplying(reply: string): MarketAIProvider {
  const output = { reply, confidence: 'media', nextStep: null, memoryProposal: null }
  return { id: 'groq:mock', model: 'mock', completeWithUsage: async () => ({ output, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }), complete: async () => output }
}

const asReply = (text: string) => parseChatReply({ reply: text, confidence: 'media', nextStep: null, memoryProposal: null, engine: AI_ENGINE_INFO, generatedAt: NOW.toISOString() })

describe('AXIS chat · certeza injustificada (servidor)', () => {
  it('validateChatReply reutiliza el detector compartido', () => {
    assert.equal(validateChatReply(asReply('Mantener los gastos bajo control garantiza que el excedente siga creciendo.')).ok, false)
    const verdict = validateChatReply(asReply('Te aseguro que esto funcionará.'))
    assert.equal(verdict.ok, false)
    if (!verdict.ok) assert.deepEqual(verdict.violations.map((v) => [v.invariant, v.field]), [['certainty', 'reply']])
    assert.equal(validateChatReply(asReply('No podemos garantizar una rentabilidad futura; con lo que sabemos ahora, yo vigilaría ese gasto.')).ok, true)
  })

  it('la frase que llegó al usuario ya no pasa: chatWithProvider lanza (→ 502)', async () => {
    for (const bad of [
      'Mantener los gastos bajo control garantiza que el excedente siga creciendo y que llegues a tu objetivo.',
      'Esta inversión garantiza una rentabilidad.',
      'El precio va a subir sin duda.',
      'Te aseguro que esto funcionará.',
    ]) {
      await assert.rejects(
        () => chatWithProvider(providerReplying(bad), input()),
        (e: unknown) => e instanceof AIProviderError && e.kind === 'malformed' && /certainty/.test(e.message),
        bad,
      )
    }
  })

  it('una respuesta prudente sigue llegando íntegra, con engine de IA', async () => {
    for (const good of [
      'No podemos garantizar una rentabilidad futura.',
      'Los datos no garantizan que el precio vaya a subir.',
      'No tenemos certeza sobre el resultado, pero ahora mismo estás ahorrando bastante, así que tienes margen.',
    ]) {
      const reply = await chatWithProvider(providerReplying(good), input())
      assert.equal(reply.text, good)
      assert.equal(reply.engine.isAI, true)
      assert.equal(reply.fallbackReason, undefined)
    }
  })

  it('en el cliente, el 502 resultante acaba en el motor local (sin cambios en el contrato)', async () => {
    const t: ChatTransport = {
      isAvailable: async () => true,
      ask: async () => {
        throw new ChatTransportError('error', 'axis api 502')
      },
    }
    const reply = await createChatEngine({ transport: t }).ask(input())
    assert.equal(reply.engine.id, 'local-rules')
    assert.equal(reply.fallbackReason, 'error')
    assert.equal(validateChatReply(reply).ok, true, 'la respuesta local también es prudente')
  })

  it('Decision First usa el mismo detector: «garantiza» y «no es seguro» se juzgan igual en ambos caminos', () => {
    const d = decide({ context: context() })
    const expression = {
      headline: `Lectura: ${d.lead?.fact ?? 'estable'}`,
      interpretation: { summary: 'Con los datos disponibles, esto garantiza que sigas ahorrando.', signals: d.relevant.map((s) => ({ id: s.id, text: s.interpretation })) },
      recommendationWhy: d.recommendation ? d.recommendation.why : null,
      alternatives: d.alternatives.map((a) => ({ name: a.name, summary: a.summary })),
      uncertainties: d.uncertainties.map((u) => ({ title: u.title, detail: 'No es seguro que este patrón se mantenga.' })),
      conclusion: 'Sigue así.',
    }
    const verdict = validateExpression(d, expression)
    assert.equal(verdict.ok, false)
    if (!verdict.ok) {
      assert.deepEqual(verdict.violations.map((v) => [v.invariant, v.field]), [['certainty', 'interpretation.summary']], 'solo el resumen; la incertidumbre negada con prudencia pasa')
    }
    assert.equal(validateChatReply(asReply(expression.interpretation.summary)).ok, false)
    assert.equal(validateChatReply(asReply('No es seguro que este patrón se mantenga.')).ok, true)
  })
})
