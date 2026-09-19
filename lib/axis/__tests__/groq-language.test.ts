/**
 * Groq como modelo de lenguaje de AXIS (producción). Sin red: `fetch` se
 * sustituye por un stub que devuelve respuestas con la forma de Groq.
 * Comprueba selección por configuración, endpoint, autenticación, esquema
 * de Decision First y que la decisión sigue siendo de AXIS.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createGroqProvider, GROQ_DEFAULT_MODEL } from '../../ai/providers/groq'
import { AXIS_EXPRESSION_SCHEMA } from '../ai/schema-expression'
import { AIProviderError } from '../ai/provider'
import { analyzeWithProvider, readAIServerConfig } from '../ai/server/analyze'
import { createAIEngine, type AITransport } from '../ai-engine'
import { render } from '../compose'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { languageModelFromConfig } from '../language/server'
import { noModel } from '../language/model'
import { analyzeLocally, localRulesEngine, LOCAL_RULES_ENGINE_INFO } from '../local-engine'
import { AXIS_EXPRESSION_PROMPT } from '../prompts/expression'
import type { AxisDecision } from '../types'
import { config, healthyMovements, NOW, objective, snapshot, TODAY } from './fixtures'

const TEST_KEY = 'test-groq-key-not-real'
const ENV = { AXIS_AI_PROVIDER: 'groq', GROQ_API_KEY: TEST_KEY, AXIS_AI_MODEL: 'openai/gpt-oss-20b', AXIS_DECISION_FIRST: 'true' }

const input = () => ({ context: buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements(), objectives: [objective({ name: 'Viaje', targetCents: 500_000, currentCents: 246_000 })] }), TODAY) })

/** Expresión válida construida desde la decisión (cifras permitidas por construcción), como la devolvería el modelo. */
function expressionJSON(d: AxisDecision): string {
  return JSON.stringify({
    headline: `Lectura: ${d.lead?.fact ?? 'estable'}`,
    interpretation: { summary: `Con los datos disponibles, ${d.lead?.interpretation ?? 'nada que atender'}`, signals: d.relevant.map((s) => ({ id: s.id, text: `En otras palabras: ${s.interpretation}` })) },
    recommendation_why: d.recommendation ? `Porque ${d.recommendation.why}` : null,
    alternatives: d.alternatives.map((a) => ({ name: a.name, summary: `Otra vía: ${a.summary}` })),
    uncertainties: d.uncertainties.map((u) => ({ title: u.title, detail: `A tener presente: ${u.detail}` })),
    conclusion: 'Sigue así y revisa el mes que viene.',
    // Campos decisorios que el modelo intenta colar: deben ignorarse.
    recommendation: { what: 'Compra acciones ya', nextStep: { label: 'Comprar', to: 'inversiones' } },
    confidence: 'alta',
    nextStep: { label: 'Vender', to: 'inversiones' },
  })
}

const groqResponse = (content: string | null, finish = 'stop') =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { status: 200, headers: { 'content-type': 'application/json' } })

/** Sustituye `fetch` global durante `run` y devuelve lo capturado. */
async function withFetch<T>(respond: (url: string, init: RequestInit) => Response | Promise<Response>, run: () => Promise<T>) {
  const captured: { url?: string; init?: RequestInit; calls: number } = { calls: 0 }
  const real = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured.calls++
    captured.url = String(url)
    captured.init = init
    return respond(String(url), init ?? {})
  }) as typeof fetch
  try {
    return { result: await run(), captured }
  } finally {
    globalThis.fetch = real
  }
}

describe('Groq como modelo de lenguaje de AXIS', () => {
  it('provider=groq crea un AxisLanguageModel válido con el modelo de AXIS_AI_MODEL', () => {
    const model = languageModelFromConfig(readAIServerConfig(ENV))
    assert.equal(model.available, true)
    assert.equal(model.id, 'groq:openai/gpt-oss-20b')
    assert.equal(typeof model.complete, 'function')
    assert.equal(languageModelFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'groq', GROQ_API_KEY: TEST_KEY })).id, `groq:${GROQ_DEFAULT_MODEL}`, 'sin AXIS_AI_MODEL, el modelo por defecto del proveedor')
  })

  it('provider=gemini sigue funcionando; proveedor desconocido → noModel (sin llamadas)', () => {
    assert.equal(languageModelFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', AXIS_AI_MODEL: 'gemini-3.5-flash-lite' })).id, 'gemini:gemini-3.5-flash-lite')
    assert.equal(languageModelFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'openai', GROQ_API_KEY: TEST_KEY, GEMINI_API_KEY: 'k' })), noModel)
    assert.equal(languageModelFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'mistral' })), noModel)
  })

  it('GROQ_API_KEY ausente o vacía → no disponible, sin crash; la clave de Gemini no sirve para Groq', async () => {
    const missing = languageModelFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'groq' }))
    assert.equal(missing.available, false)
    await assert.rejects(() => missing.complete({ system: 's', user: 'u', schema: {} }, { maxOutputTokens: 1 }), (e: unknown) => e instanceof AIProviderError && e.kind === 'unavailable')
    assert.equal(languageModelFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'groq', GROQ_API_KEY: '   ' })).available, false)
    assert.equal(languageModelFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'groq', GEMINI_API_KEY: 'k' })).available, false)
  })

  it('el adapter usa el endpoint de Groq, Bearer GROQ_API_KEY, el modelo configurado y json_schema strict con el esquema de expresión', async () => {
    const i = input()
    const d = decide(i)
    const { captured } = await withFetch(
      () => groqResponse(expressionJSON(d)),
      () => analyzeWithProvider(languageModelFromConfig(readAIServerConfig(ENV)), i.context, undefined, undefined, null, 'decision-first'),
    )
    assert.equal(captured.calls, 1)
    assert.equal(captured.url, 'https://api.groq.com/openai/v1/chat/completions')
    assert.equal(captured.init?.method, 'POST')
    const headers = captured.init?.headers as Record<string, string>
    assert.equal(headers.authorization, `Bearer ${TEST_KEY}`)
    const body = JSON.parse(String(captured.init?.body)) as { model: string; messages: Array<{ role: string; content: string }>; response_format: { type: string; json_schema: { strict: boolean; schema: unknown } }; tools?: unknown; max_completion_tokens: number }
    assert.equal(body.model, 'openai/gpt-oss-20b')
    assert.equal(body.messages[0].role, 'system')
    assert.equal(body.messages[0].content, AXIS_EXPRESSION_PROMPT)
    assert.match(body.messages[1].content, /decision_de_axis/)
    assert.equal(body.response_format.type, 'json_schema')
    assert.equal(body.response_format.json_schema.strict, true)
    assert.deepEqual(body.response_format.json_schema.schema, AXIS_EXPRESSION_SCHEMA)
    assert.equal(body.tools, undefined, 'sin herramientas')
    assert.equal(body.max_completion_tokens, 3000, 'mismo tope de salida que antes')
  })

  it('el JSON de Groq pasa por parse/validate/merge de Decision First y la decisión sigue siendo de AXIS', async () => {
    const i = input()
    const d = decide(i)
    assert.ok(d.recommendation, 'el escenario tiene recomendación')
    const { result: analysis } = await withFetch(
      () => groqResponse(expressionJSON(d)),
      () => analyzeWithProvider(languageModelFromConfig(readAIServerConfig(ENV)), i.context, undefined, undefined, null, 'decision-first'),
    )
    assert.equal(analysis.recommendation?.what, d.recommendation?.what, 'what de AXIS, no «Compra acciones ya»')
    assert.deepEqual(analysis.recommendation?.nextStep, d.recommendation?.nextStep)
    assert.deepEqual(analysis.conclusion.nextStep, d.nextStep)
    assert.equal(analysis.uncertainty.confidence, d.confidence, 'confianza de AXIS, no «alta»')
    assert.deepEqual(analysis.interpretation.signals.map((s) => [s.id, s.priority]), d.relevant.map((s) => [s.id, s.priority]))
    assert.deepEqual(analysis.data.facts, d.facts)
    assert.match(analysis.recommendation?.why ?? '', /^Porque /, 'el modelo solo aporta el porqué')
    assert.equal(analysis.engine.isAI, true)
    assert.match(analysis.engine.label, /groq:openai\/gpt-oss-20b/)
  })

  it('una respuesta inválida de Groq (no JSON, truncada, vacía, 401, 429) produce el mismo fallback seguro', async () => {
    const i = input()
    const model = languageModelFromConfig(readAIServerConfig(ENV))
    const expectKind = async (respond: () => Response, kind: AIProviderError['kind'], pattern: RegExp) => {
      await assert.rejects(
        () => withFetch(respond, () => analyzeWithProvider(model, i.context, undefined, undefined, null, 'decision-first')),
        (e: unknown) => e instanceof AIProviderError && e.kind === kind && pattern.test(e.message),
      )
    }
    await expectKind(() => groqResponse('esto no es json'), 'malformed', /no es JSON/)
    await expectKind(() => groqResponse('{"headline":"a"', 'length'), 'malformed', /truncada/)
    await expectKind(() => groqResponse(null), 'malformed', /sin texto/)
    await expectKind(() => new Response('{}', { status: 401 }), 'unavailable', /HTTP 401/)
    await expectKind(() => new Response('{}', { status: 429 }), 'rate-limit', /HTTP 429/)
    // JSON con forma válida pero que viola una invariante (cifra inventada) → también rechazo.
    const d = decide(i)
    const bad = JSON.parse(expressionJSON(d)) as Record<string, unknown>
    bad.conclusion = 'Podrías ahorrar 98.765,00 € más.'
    await assert.rejects(() => withFetch(() => groqResponse(JSON.stringify(bad)), () => analyzeWithProvider(model, i.context, undefined, undefined, null, 'decision-first')), /figures/)
    // Y en el cliente, cualquier fallo del servidor acaba en la misma decisión local.
    const failing: AITransport = { isAvailable: async () => true, analyze: async () => { throw new Error('axis api 502') } }
    const viaFallback = await createAIEngine({ transport: failing, fallback: localRulesEngine }).analyze(i)
    const strip = (a: unknown) => JSON.parse(JSON.stringify(a, (k, v) => (k === 'generatedAt' ? undefined : v))) as unknown
    assert.deepEqual(strip(viaFallback), strip(render(decide(i), LOCAL_RULES_ENGINE_INFO, NOW)))
    assert.deepEqual(strip(viaFallback), strip(analyzeLocally(i, NOW)))
  })

  it('createGroqProvider acepta el modelo de producción y expone id/model coherentes', () => {
    const p = createGroqProvider({ apiKey: TEST_KEY, model: 'openai/gpt-oss-20b' })
    assert.equal(p.id, 'groq:openai/gpt-oss-20b')
    assert.equal(p.model, 'openai/gpt-oss-20b')
  })

  it('ningún módulo de cliente importa proveedores ni la configuración de servidor (la clave solo vive en servidor)', () => {
    const root = join(process.cwd())
    const clientFiles = [
      'lib/axis/ai/browser-transport.ts',
      'lib/axis/chat/browser-transport.ts',
      'lib/axis/engine.ts',
      'lib/axis/ai-engine.ts',
      'lib/axis/chat/engine.ts',
      'hooks/use-axis.ts',
      'hooks/use-axis-chat.ts',
      'components/finax/screens/axis-screen.tsx',
      'components/finax/axis-conversation.tsx',
    ]
    for (const f of clientFiles) {
      const src = readFileSync(join(root, f), 'utf8')
      assert.doesNotMatch(src, /ai\/providers|language\/server|ai\/server\/analyze|GROQ_API_KEY|GEMINI_API_KEY|api\.groq\.com|googleapis/, `${f} no debe conocer proveedores ni claves`)
    }
  })
})
