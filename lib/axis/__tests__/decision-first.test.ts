/**
 * Decision First: AXIS decide, el modelo expresa. Estos tests demuestran que
 * nada de lo que devuelva el modelo puede cambiar la decisión, y que ante
 * cualquier violación la respuesta es la misma decisión en redacción local.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AI_ENGINE_INFO, createAIEngine, type AITransport } from '../ai-engine'
import { AXIS_OUTPUT_SCHEMA } from '../ai/schema'
import { AXIS_EXPRESSION_SCHEMA } from '../ai/schema-expression'
import { analysisModeOf, analyzeWithProvider, readAIServerConfig } from '../ai/server/analyze'
import { render } from '../compose'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { mergeExpression, parseExpression, type Expression } from '../core/expression'
import { allowedFigureKeys, extractFigures, figureKey, figuresOf } from '../core/figures'
import { validateExpression } from '../core/semantic'
import { analyzeLocally, localRulesEngine, LOCAL_RULES_ENGINE_INFO } from '../local-engine'
import { AXIS_EXPRESSION_PROMPT } from '../prompts/expression'
import { AXIS_SYSTEM_PROMPT } from '../prompts'
import type { AxisDecision, AxisInput } from '../types'
import type { MarketAIProvider } from '../../ai/providers/types'
import { config, gasto, healthyMovements, ingreso, NOW, objective, position, snapshot, TODAY } from './fixtures'

/* --------------------------------- helpers -------------------------------- */

function input(partial: Parameters<typeof snapshot>[0] = { config: config(100_000), movements: healthyMovements(), objectives: [objective({ name: 'Viaje', targetCents: 500_000, currentCents: 246_000 })] }): AxisInput {
  return { context: buildFinancialContext(snapshot(partial), TODAY) }
}

/** Expresión correcta: reformula a partir de los textos de la propia decisión (cifras permitidas por construcción). */
function goodExpression(d: AxisDecision): Expression {
  return {
    headline: `Lectura de AXIS: ${d.lead?.fact ?? 'situación estable'}`,
    interpretation: {
      summary: `Con los datos disponibles, ${d.lead?.interpretation ?? 'no hay nada que requiera atención'}`,
      signals: d.relevant.map((s) => ({ id: s.id, text: `Dicho de otro modo: ${s.interpretation}` })),
    },
    recommendationWhy: d.recommendation ? `Tiene sentido porque ${d.recommendation.why}` : null,
    alternatives: d.alternatives.map((a) => ({ name: a.name, summary: `Otra opción: ${a.summary}` })),
    uncertainties: d.uncertainties.map((u) => ({ title: u.title, detail: `Conviene tenerlo presente: ${u.detail}` })),
    conclusion: 'Con esto, la lectura queda clara; sigue registrando movimientos.',
  }
}

/** Salida cruda del modelo (JSON) a partir de una expresión, con campos decisorios que el modelo intenta colar. */
function rawFrom(e: Expression, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    headline: e.headline,
    interpretation: { summary: e.interpretation.summary, signals: e.interpretation.signals },
    recommendation_why: e.recommendationWhy,
    alternatives: e.alternatives,
    uncertainties: e.uncertainties,
    conclusion: e.conclusion,
    ...extra,
  }
}

function modelReturning(output: unknown, seen: { system?: string; schema?: Record<string, unknown>; user?: string } = {}): MarketAIProvider {
  return {
    id: 'gemini:mock',
    model: 'mock',
    async completeWithUsage(request) {
      seen.system = request.system
      seen.schema = request.schema
      seen.user = request.user
      return { output, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }
    },
    complete: async () => output,
  }
}

const withoutDate = (a: unknown) => JSON.parse(JSON.stringify(a, (k, v) => (k === 'generatedAt' ? undefined : v))) as unknown

/* ------------------------------- propiedades ------------------------------ */

describe('Decision First · la decisión manda', () => {
  const i = input()
  const d = decide(i)
  assert.ok(d.recommendation && d.lead, 'el escenario tiene recomendación y señal líder')

  it('una recomendación distinta del modelo no cambia la recomendación final', async () => {
    const raw = rawFrom(goodExpression(d), { recommendation: { what: 'Invierte todo en criptomonedas', why: 'porque sí', nextStep: { label: 'Comprar', to: 'inversiones' } } })
    const analysis = await analyzeWithProvider(modelReturning(raw), i.context, undefined, undefined, null, 'decision-first')
    assert.equal(analysis.recommendation?.what, d.recommendation?.what, 'what verbatim de AXIS')
    assert.deepEqual(analysis.recommendation?.nextStep, d.recommendation?.nextStep)
    assert.match(analysis.recommendation?.why ?? '', /^Tiene sentido porque /, 'el modelo solo aporta el porqué')
  })

  it('una prioridad distinta del modelo no cambia la prioridad final', async () => {
    const e = goodExpression(d)
    const raw = rawFrom(e)
    ;(raw.interpretation as { signals: unknown[] }).signals = e.interpretation.signals.map((s) => ({ ...s, priority: 'critical' }))
    const analysis = await analyzeWithProvider(modelReturning(raw), i.context, undefined, undefined, null, 'decision-first')
    assert.deepEqual(
      analysis.interpretation.signals.map((s) => [s.id, s.priority]),
      d.relevant.map((s) => [s.id, s.priority]),
    )
  })

  it('un nextStep inventado no cambia el siguiente paso; confidence y basedOnDemoData proceden de AXIS', async () => {
    const raw = rawFrom(goodExpression(d), {
      nextStep: { label: 'Vender todo', to: 'inversiones' },
      conclusion_nextStep: { label: 'Vender todo', to: 'inversiones' },
      confidence: 'alta',
      basedOnDemoData: true,
      facts: ['Tienes 999.999,00 €'],
    })
    const analysis = await analyzeWithProvider(modelReturning(raw), i.context, undefined, undefined, null, 'decision-first')
    assert.deepEqual(analysis.conclusion.nextStep, d.nextStep)
    assert.equal(analysis.uncertainty.confidence, d.confidence)
    assert.equal(analysis.basedOnDemoData, d.basedOnDemoData)
    assert.deepEqual(analysis.data.facts, d.facts, 'los hechos son los de AXIS')
    assert.equal(analysis.engine.isAI, true)
  })

  it('con recomendación null, el modelo no puede crear una recomendación', async () => {
    const limited = input({ config: config(0), movements: [ingreso('2026-09-01', 100_000), gasto('2026-09-03', 20_000)] })
    const dl = decide(limited)
    const e = goodExpression(dl)
    if (dl.recommendation) {
      // Si este escenario trae recomendación, forzamos el caso con una decisión sin ella.
      const forced: AxisDecision = { ...dl, recommendation: null, nextStep: undefined }
      const verdict = validateExpression(forced, { ...goodExpression(forced), recommendationWhy: 'Deberías invertir 100,00 €' })
      assert.equal(verdict.ok, false)
      return
    }
    const verdict = validateExpression(dl, { ...e, recommendationWhy: 'Deberías invertir ahora' })
    assert.equal(verdict.ok, false)
    if (!verdict.ok) assert.equal(verdict.violations[0].invariant, 'coverage')
  })
})

describe('Decision First · validación semántica → fallback', () => {
  const i = input()
  const d = decide(i)

  const expectFallback = async (raw: Record<string, unknown>, invariant: string) => {
    await assert.rejects(() => analyzeWithProvider(modelReturning(raw), i.context, undefined, undefined, null, 'decision-first'), new RegExp(invariant))
  }

  it('una cifra fuera de cifras_permitidas provoca fallback', async () => {
    const e = goodExpression(d)
    await expectFallback(rawFrom({ ...e, conclusion: 'Podrías ahorrar 12.345,00 € más al año.' }), 'figures')
    await expectFallback(rawFrom({ ...e, headline: 'Tu tasa de ahorro es del 99%.' }), 'figures')
    await expectFallback(rawFrom({ ...e, conclusion: 'En 47 meses lo tendrás.' }), 'figures')
  })

  it('una cifra permitida, aunque cambie el formato, pasa', () => {
    const allowed = allowedFigureKeys(d)
    const liquid = d.context.wealth.liquidCents
    const asAxis = figuresOf(d).find((f) => f.label === 'Patrimonio líquido')?.value ?? ''
    assert.ok(allowed.has(figureKey(asAxis)))
    const noDecimals = asAxis.replace(',00 €', ' €')
    assert.equal(figureKey(noDecimals), figureKey(asAxis), `${noDecimals} ≡ ${asAxis}`)
    assert.equal(figureKey('65 %'), figureKey('65%'))
    assert.ok(liquid > 0)
    const verdict = validateExpression(d, { ...goodExpression(d), conclusion: `Tienes ${noDecimals} líquidos.` })
    assert.equal(verdict.ok, true)
  })

  it('una alternativa inventada o eliminada provoca fallback', async () => {
    const e = goodExpression(d)
    await expectFallback(rawFrom({ ...e, alternatives: [...e.alternatives, { name: 'Comprar oro', summary: 'Diversifica.' }] }), 'coverage')
    if (e.alternatives.length > 0) await expectFallback(rawFrom({ ...e, alternatives: [] }), 'coverage')
  })

  it('una incertidumbre inventada, eliminada o negada provoca fallback', async () => {
    const e = goodExpression(d)
    await expectFallback(rawFrom({ ...e, uncertainties: [...e.uncertainties, { title: 'Riesgo de mercado', detail: 'Puede caer.' }] }), 'coverage')
    assert.ok(e.uncertainties.length > 0)
    await expectFallback(rawFrom({ ...e, uncertainties: [] }), 'coverage')
    await expectFallback(rawFrom({ ...e, uncertainties: e.uncertainties.map((u) => ({ ...u, detail: 'No hay incertidumbre: es seguro.' })) }), 'certainty')
  })

  it('una señal inventada o eliminada provoca fallback', async () => {
    const e = goodExpression(d)
    await expectFallback(rawFrom({ ...e, interpretation: { ...e.interpretation, signals: [...e.interpretation.signals, { id: 'market.crash', text: 'El mercado se hunde.' }] } }), 'coverage')
    await expectFallback(rawFrom({ ...e, interpretation: { ...e.interpretation, signals: e.interpretation.signals.slice(1) } }), 'coverage')
  })

  it('lenguaje de ejecución o de certeza provoca fallback', async () => {
    const e = goodExpression(d)
    await expectFallback(rawFrom({ ...e, conclusion: 'He movido el excedente a tu objetivo.' }), 'execution')
    await expectFallback(rawFrom({ ...e, conclusion: 'Voy a crear el objetivo por ti.' }), 'execution')
    await expectFallback(rawFrom({ ...e, headline: 'Tu ahorro va a subir el mes que viene.' }), 'certainty')
    await expectFallback(rawFrom({ ...e, interpretation: { ...e.interpretation, summary: 'Sin duda el próximo mes irá mejor.' } }), 'certainty')
  })

  it('una cifra tomada de la memoria que no está en los datos provoca fallback', async () => {
    const memory = { userMemories: [{ id: 'm1', content: 'Cree que tiene 7.777,00 € ahorrados.', category: 'context', importance: 'low', fecha: '2026-09-01' }] }
    const e = goodExpression(d)
    await assert.rejects(
      () => analyzeWithProvider(modelReturning(rawFrom({ ...e, conclusion: 'Como me dijiste, tienes 7.777,00 € ahorrados.' })), i.context, memory, undefined, null, 'decision-first'),
      /figures/,
    )
    // En cualitativo, sí.
    const ok = await analyzeWithProvider(modelReturning(rawFrom({ ...e, conclusion: 'Como me dijiste, prefieres mantener un colchón.' })), i.context, memory, undefined, null, 'decision-first')
    assert.match(ok.conclusion.summary, /colchón/)
  })

  it('las cifras de una expresión válida proceden exclusivamente de las cifras permitidas', () => {
    const e = goodExpression(d)
    const allowed = allowedFigureKeys(d)
    const written = [e.headline, e.interpretation.summary, ...e.interpretation.signals.map((s) => s.text), e.recommendationWhy ?? '', ...e.alternatives.map((a) => a.summary), ...e.uncertainties.map((u) => u.detail), e.conclusion]
      .flatMap((t) => extractFigures(t))
    assert.ok(written.length > 0, 'la expresión de prueba contiene cifras')
    for (const f of written) assert.ok(allowed.has(f.key), `cifra no permitida: ${f.raw}`)
    assert.equal(validateExpression(d, e).ok, true)
  })

  it('si el modelo falla, el resultado es idéntico a render(decide(input))', async () => {
    const failing: AITransport = { isAvailable: async () => true, analyze: async () => { throw new Error('axis api 502') } }
    const engine = createAIEngine({ transport: failing, fallback: localRulesEngine })
    const viaFallback = await engine.analyze(i)
    const local = render(decide(i), LOCAL_RULES_ENGINE_INFO, NOW)
    assert.deepEqual(withoutDate(viaFallback), withoutDate(local))
    assert.deepEqual(withoutDate(local), withoutDate(analyzeLocally(i, NOW)))
  })

  it('con IA y sin IA, la decisión (recomendación, siguiente paso, confianza, señales) es la misma', async () => {
    const viaAI = await analyzeWithProvider(modelReturning(rawFrom(goodExpression(d))), i.context, undefined, undefined, null, 'decision-first')
    const local = analyzeLocally(i, NOW)
    if (local.status !== 'analysis') throw new Error('unreachable')
    assert.equal(viaAI.recommendation?.what, local.analysis.recommendation?.what)
    assert.deepEqual(viaAI.recommendation?.nextStep, local.analysis.recommendation?.nextStep)
    assert.deepEqual(viaAI.conclusion.nextStep, local.analysis.conclusion.nextStep)
    assert.equal(viaAI.uncertainty.confidence, local.analysis.uncertainty.confidence)
    assert.deepEqual(viaAI.interpretation.signals.map((s) => [s.id, s.priority]), local.analysis.interpretation.signals.map((s) => [s.id, s.priority]))
    assert.deepEqual(viaAI.data.facts, local.analysis.data.facts)
    assert.deepEqual(viaAI.alternatives.map((a) => a.name), local.analysis.alternatives.map((a) => a.name))
    assert.deepEqual(viaAI.uncertainty.items.map((u) => u.title), local.analysis.uncertainty.items.map((u) => u.title))
    assert.notEqual(viaAI.headline, local.analysis.headline, 'solo cambia la expresión')
  })
})

describe('Decision First · flag y contrato', () => {
  it('AXIS_DECISION_FIRST=false (o ausente) conserva el comportamiento actual: prompt y esquema anteriores', async () => {
    assert.equal(analysisModeOf(readAIServerConfig({})), 'legacy')
    assert.equal(analysisModeOf(readAIServerConfig({ AXIS_DECISION_FIRST: 'false' })), 'legacy')
    assert.equal(analysisModeOf(readAIServerConfig({ AXIS_DECISION_FIRST: 'true' })), 'decision-first')
    const i = input()
    const local = analyzeLocally(i, NOW)
    if (local.status !== 'analysis') throw new Error('unreachable')
    const { engine, generatedAt, basedOnDemoData, ...legacyOutput } = local.analysis
    void engine
    void generatedAt
    void basedOnDemoData
    const seen: { system?: string; schema?: Record<string, unknown> } = {}
    await analyzeWithProvider(modelReturning(legacyOutput, seen), i.context, undefined, undefined, null, 'legacy')
    assert.equal(seen.system, AXIS_SYSTEM_PROMPT)
    assert.deepEqual(seen.schema, AXIS_OUTPUT_SCHEMA)
  })

  it('AXIS_DECISION_FIRST=true usa el prompt y el esquema de expresión, y envía la decisión y no el contexto bruto', async () => {
    const i = input()
    const d = decide(i)
    const seen: { system?: string; schema?: Record<string, unknown>; user?: string } = {}
    await analyzeWithProvider(modelReturning(rawFrom(goodExpression(d)), seen), i.context, { userMemories: [{ id: 'a', content: 'Prefiere liquidez.', category: 'preference', importance: 'high', fecha: '2026-09-01' }] }, undefined, null, 'decision-first')
    assert.equal(seen.system, AXIS_EXPRESSION_PROMPT)
    assert.deepEqual(seen.schema, AXIS_EXPRESSION_SCHEMA)
    const payload = JSON.parse(seen.user!.slice(seen.user!.indexOf('{'))) as Record<string, unknown>
    assert.deepEqual(Object.keys(payload), ['decision_de_axis', 'cifras_permitidas', 'memoria_relevante'])
    assert.equal('contexto_financiero' in payload, false)
    const dec = payload.decision_de_axis as { recomendacion: { que: string }; senales: unknown[]; confianza: string }
    assert.equal(dec.recomendacion.que, d.recommendation?.what)
    assert.equal(dec.senales.length, d.relevant.length)
    assert.equal(dec.confianza, d.confidence)
    assert.ok((payload.cifras_permitidas as unknown[]).length > 10)
    assert.deepEqual((payload.memoria_relevante as { notas_del_usuario: string[] }).notas_del_usuario, ['Prefiere liquidez.'])
  })

  it('el esquema de expresión no tiene campos decisorios', () => {
    const props = AXIS_EXPRESSION_SCHEMA.properties as Record<string, unknown>
    for (const forbidden of ['priority', 'nextStep', 'confidence', 'recommendation', 'facts', 'data', 'basedOnDemoData']) assert.equal(forbidden in props, false, forbidden)
    const signalProps = (props.interpretation as { properties: { signals: { items: { properties: Record<string, unknown> } } } }).properties.signals.items.properties
    assert.deepEqual(Object.keys(signalProps), ['id', 'text'])
  })

  it('el prompt de expresión no permite decidir', () => {
    assert.match(AXIS_EXPRESSION_PROMPT, /Tú no decides/)
    assert.match(AXIS_EXPRESSION_PROMPT, /cifras_permitidas/)
    assert.match(AXIS_EXPRESSION_PROMPT, /nunca ejecuta operaciones/)
    for (const forbidden of ['Prioriza:', 'recommendation = null', 'operación derivada', 'puedes reformularlas y agruparlas', 'elige la señal', 'decide la prioridad']) {
      assert.equal(AXIS_EXPRESSION_PROMPT.includes(forbidden), false, forbidden)
    }
  })

  it('sin datos (level none) no se llama al modelo', async () => {
    let calls = 0
    const model: MarketAIProvider = { id: 'm', model: 'm', completeWithUsage: async () => { calls++; return { output: {}, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } } }, complete: async () => ({}) }
    await assert.rejects(() => analyzeWithProvider(model, input({}).context, undefined, undefined, null, 'decision-first'), /sin datos suficientes/)
    assert.equal(calls, 0)
  })

  it('parseExpression y mergeExpression: forma mínima y fusión con la decisión', () => {
    const d = decide(input({ config: config(100_000), movements: healthyMovements(), positions: [position({ name: 'Fondo', investedCents: 150_000, valueCents: 158_000 })] }))
    assert.throws(() => parseExpression({ headline: '' }), /headline/)
    assert.throws(() => parseExpression('texto'), /no es un objeto/)
    const e = parseExpression(rawFrom(goodExpression(d)))
    const merged = mergeExpression(d, e, AI_ENGINE_INFO, NOW)
    assert.equal(merged.generatedAt, NOW.toISOString())
    assert.equal(merged.engine, AI_ENGINE_INFO)
    assert.deepEqual(merged.data.facts, d.facts)
    assert.equal(merged.uncertainty.items.length, Math.max(1, d.uncertainties.length))
  })
})
