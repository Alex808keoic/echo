/**
 * Voz natural de AXIS (fase 1).
 *
 * `PERSONALITY.voice` está ensamblada en el prompt de expresión (Decision
 * First) y en el del chat, nunca en el legacy del análisis. La voz cambia la
 * FORMA; el FONDO sigue siendo de AXIS: una expresión natural pasa las
 * invariantes, una promesa no, y la fusión conserva cada campo decisorio.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AI_ENGINE_INFO } from '../ai-engine'
import { AXIS_EXPRESSION_SCHEMA } from '../ai/schema-expression'
import { analyzeWithProvider } from '../ai/server/analyze'
import { validateChatReply } from '../chat/semantic'
import { parseChatReply } from '../chat/validate'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { mergeExpression, parseExpression, type Expression } from '../core/expression'
import { validateExpression } from '../core/semantic'
import { PERSONALITY } from '../personality'
import { AXIS_CHAT_SYSTEM_PROMPT, AXIS_SYSTEM_PROMPT } from '../prompts'
import { AXIS_EXPRESSION_PROMPT } from '../prompts/expression'
import type { AxisDecision } from '../types'
import type { MarketAIProvider } from '../../ai/providers/types'
import { findCertainty } from '../../text/certainty'
import { config, healthyMovements, NOW, objective, snapshot, TODAY } from './fixtures'

const input = () => ({ context: buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements(), objectives: [objective({ name: 'Viaje', targetCents: 500_000, currentCents: 246_000 })] }), TODAY) })

/** Expresión con la voz nueva: primera persona, natural, sin cifras nuevas ni certezas. */
function naturalExpression(d: AxisDecision): Expression {
  return {
    headline: 'Ahora mismo estás ahorrando bastante, así que tienes margen.',
    interpretation: {
      summary: `Con lo que sabemos ahora, ${d.lead?.interpretation.toLowerCase() ?? 'la situación está tranquila'} Ojo con una cosa: aún no hay mucho histórico para saber si esto se repite.`,
      signals: d.relevant.map((s) => ({ id: s.id, text: `Aquí lo veo así: ${s.interpretation}` })),
    },
    recommendationWhy: d.recommendation ? `Yo destinaría parte de ese margen ahí porque ${d.recommendation.why}` : null,
    alternatives: d.alternatives.map((a) => ({ name: a.name, summary: `Si prefieres ir con más calma: ${a.summary}` })),
    uncertainties: d.uncertainties.map((u) => ({ title: u.title, detail: `No tenemos suficiente información para estar seguros: ${u.detail}` })),
    conclusion: 'Yo vigilaría el gasto un par de meses más y, si se mantiene así, seguiría con el plan.',
  }
}

const rawFrom = (e: Expression, extra: Record<string, unknown> = {}) => ({
  headline: e.headline,
  interpretation: e.interpretation,
  recommendation_why: e.recommendationWhy,
  alternatives: e.alternatives,
  uncertainties: e.uncertainties,
  conclusion: e.conclusion,
  ...extra,
})

const modelReturning = (output: unknown): MarketAIProvider => ({
  id: 'groq:mock',
  model: 'mock',
  completeWithUsage: async () => ({ output, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }),
  complete: async () => output,
})

const asReply = (text: string) => parseChatReply({ reply: text, confidence: 'media', nextStep: null, memoryProposal: null, engine: AI_ENGINE_INFO, generatedAt: NOW.toISOString() })

describe('AXIS · voz natural (fase 1)', () => {
  it('1. la voz está integrada en el prompt de expresión', () => {
    for (const text of Object.values(PERSONALITY.voice)) assert.ok(AXIS_EXPRESSION_PROMPT.includes(text))
    assert.ok(AXIS_EXPRESSION_PROMPT.includes(PERSONALITY.tone.expression))
    assert.match(AXIS_EXPRESSION_PROMPT, /\nVOZ\n/)
  })

  it('2. la voz está integrada en el prompt del chat', () => {
    for (const text of Object.values(PERSONALITY.voice)) assert.ok(AXIS_CHAT_SYSTEM_PROMPT.includes(text))
    assert.ok(AXIS_CHAT_SYSTEM_PROMPT.includes(PERSONALITY.tone.chat))
    assert.match(AXIS_CHAT_SYSTEM_PROMPT, /\nVOZ Y FORMATO\n/)
  })

  it('3. la voz NO está en el prompt legacy del análisis (byte a byte, prompts.test.ts)', () => {
    for (const text of Object.values(PERSONALITY.voice)) assert.equal(AXIS_SYSTEM_PROMPT.includes(text), false)
    assert.equal(AXIS_SYSTEM_PROMPT.includes(PERSONALITY.tone.expression), false)
    assert.ok(AXIS_SYSTEM_PROMPT.includes(PERSONALITY.tone.analysis), 'el legacy conserva su tono original')
  })

  it('las reglas de tono impersonal y las muletillas han salido de los prompts con voz (y siguen en el legacy)', () => {
    for (const prompt of [AXIS_EXPRESSION_PROMPT, AXIS_CHAT_SYSTEM_PROMPT]) {
      assert.doesNotMatch(prompt, /nunca de ti mismo|Nunca hables de ti mismo/)
      assert.doesNotMatch(prompt, /«con los datos disponibles…», «una opción sería…»/)
      assert.doesNotMatch(prompt, /hechos primero, después tu interpretación, después qué harías/)
      assert.match(prompt, /yo vigilaría ese gasto/)
      assert.match(prompt, /no digas «la situación presenta», «se recomienda», «es conveniente», «resulta recomendable»/)
      assert.match(prompt, /Sin coloquialismos \(«tío», «bro»\), sin emojis/)
    }
    assert.match(AXIS_SYSTEM_PROMPT, /nunca de ti mismo/)
    assert.match(AXIS_SYSTEM_PROMPT, /«con los datos disponibles parece razonable…»/)
    assert.doesNotMatch(AXIS_EXPRESSION_PROMPT, /puedes reformularlo|en el orden DATOS → INTERPRETACIÓN/)
    assert.match(AXIS_EXPRESSION_PROMPT, /orden lógico de la lectura, no una plantilla de párrafos/)
  })

  it('4. la voz no contiene reglas decisionales ni de seguridad; solo forma', () => {
    const text = Object.values(PERSONALITY.voice).join('\n')
    assert.match(text, /no añades opiniones, recomendaciones ni alternativas nuevas/)
    assert.match(text, /cada cifra es exactamente una de las que recibes/)
    // Ninguna instrucción de la voz elige, prioriza o fija campos que son de AXIS.
    assert.doesNotMatch(text, /elige|decide|prioriza|prioridad de|nextStep|siguiente paso|nivel de confianza|recommendation|what\b|esquema|memoryProposal/i)
    for (const [key, t] of Object.entries(PERSONALITY.voice)) assert.equal(findCertainty(t), null, `${key} enseña a prometer`)
    // Las restricciones de fondo siguen en el prompt de expresión, fuera de la voz.
    for (const rule of ['No añadas recomendaciones, alternativas, incertidumbres, hechos, causas ni datos', 'nunca ejecuta operaciones', 'Nunca conviertas una incertidumbre en una certeza', 'cifras_permitidas', 'Tú no decides']) {
      assert.ok(AXIS_EXPRESSION_PROMPT.includes(rule), rule)
    }
  })

  it('5. una expresión natural válida pasa validateExpression', () => {
    const d = decide(input())
    const verdict = validateExpression(d, naturalExpression(d))
    assert.deepEqual(verdict, { ok: true })
  })

  it('6. una respuesta de chat natural válida pasa validateChatReply', () => {
    for (const text of [
      'Ahora mismo estás ahorrando bastante, así que tienes margen. Yo vigilaría ese gasto durante los próximos meses.',
      'Aquí miraría primero si este aumento del gasto es algo puntual o se está repitiendo. Con lo que sabemos ahora, no tenemos suficiente información para recomendarte nada concreto todavía.',
      'Yo sería prudente con esa posición por ahora: no podemos garantizar una rentabilidad futura.',
    ]) {
      assert.deepEqual(validateChatReply(asReply(text)), { ok: true }, text)
    }
  })

  it('7. «garantiza» y otras certezas injustificadas siguen rechazadas en ambos caminos', () => {
    const d = decide(input())
    for (const bad of ['Esta inversión garantiza una rentabilidad.', 'El oro va a subir sin duda.', 'Te aseguro que esto funcionará.']) {
      const verdict = validateExpression(d, { ...naturalExpression(d), conclusion: bad })
      assert.equal(verdict.ok, false, bad)
      if (!verdict.ok) assert.deepEqual(verdict.violations.map((v) => [v.invariant, v.field]), [['certainty', 'conclusion']])
      assert.equal(validateChatReply(asReply(bad)).ok, false, bad)
    }
  })

  it('8. negaciones y condicionales legítimos siguen pasando en ambos caminos', () => {
    const d = decide(input())
    for (const good of ['No podemos garantizar una rentabilidad futura.', 'No hay certeza sobre lo que ocurrirá.', 'Los datos no garantizan que el precio vaya a subir.']) {
      assert.deepEqual(validateExpression(d, { ...naturalExpression(d), conclusion: good }), { ok: true }, good)
      assert.deepEqual(validateChatReply(asReply(good)), { ok: true }, good)
    }
  })

  it('9. Decision First mantiene exactamente el mismo ownership con la voz nueva', async () => {
    const i = input()
    const d = decide(i)
    assert.ok(d.recommendation && d.lead)
    const e = naturalExpression(d)
    // El modelo intenta colar campos decisorios y el esquema no los admite.
    const props = AXIS_EXPRESSION_SCHEMA.properties as Record<string, unknown>
    for (const forbidden of ['priority', 'nextStep', 'confidence', 'recommendation', 'facts', 'data', 'basedOnDemoData']) assert.equal(forbidden in props, false, forbidden)
    const raw = rawFrom(e, { recommendation: { what: 'Yo compraría oro ya', nextStep: { label: 'Comprar', to: 'inversiones' } }, confidence: 'alta', facts: ['Tienes 999.999,00 €'] })
    const analysis = await analyzeWithProvider(modelReturning(raw), i.context, undefined, undefined, null, 'decision-first')
    assert.equal(analysis.recommendation?.what, d.recommendation?.what)
    assert.deepEqual(analysis.recommendation?.nextStep, d.recommendation?.nextStep)
    assert.deepEqual(analysis.conclusion.nextStep, d.nextStep)
    assert.equal(analysis.uncertainty.confidence, d.confidence)
    assert.deepEqual(analysis.interpretation.signals.map((s) => [s.id, s.priority]), d.relevant.map((s) => [s.id, s.priority]))
    assert.deepEqual(analysis.data.facts, d.facts)
    assert.deepEqual(analysis.alternatives.map((a) => a.name), d.alternatives.map((a) => a.name))
    assert.deepEqual(analysis.uncertainty.items.map((u) => u.title), d.uncertainties.map((u) => u.title))
    // Solo cambia la forma.
    assert.equal(analysis.headline, e.headline)
    assert.match(analysis.recommendation?.why ?? '', /^Yo destinaría/)
    assert.equal(analysis.conclusion.summary, e.conclusion)
    // Y la fusión directa es idéntica con o sin campos colados.
    const merged = mergeExpression(d, parseExpression(raw), AI_ENGINE_INFO, NOW)
    assert.deepEqual(merged, mergeExpression(d, e, AI_ENGINE_INFO, NOW))
  })
})
