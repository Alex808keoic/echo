/**
 * Cloudflare Workers AI como modelo de lenguaje de AXIS (proveedor principal).
 * Sin red: `fetch` se sustituye por stubs con la forma de Cloudflare.
 * Comprueba configuración, endpoint, autenticación, `enable_thinking: false`,
 * tope de salida propio, clasificación de errores, que la decisión sigue
 * siendo de AXIS y que la cuenta y el token nunca salen en errores ni logs.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CLOUDFLARE_DEFAULT_MODEL, createCloudflareProvider } from '../../ai/providers/cloudflare'
import { AXIS_EXPRESSION_SCHEMA } from '../ai/schema-expression'
import { AIProviderError, type AIRequest } from '../ai/provider'
import { analyzeWithProvider, readAIServerConfig } from '../ai/server/analyze'
import { AXIS_AI_LIMITS } from '../ai/server/limits'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { languageModelFromConfig } from '../language/server'
import { AXIS_EXPRESSION_PROMPT } from '../prompts/expression'
import type { AxisDecision } from '../types'
import { config, healthyMovements, objective, snapshot, TODAY } from './fixtures'

const ACCOUNT = 'acc0123456789abcdef0123456789abcd'
const TOKEN = 'test-cf-token-not-real-0000'
const GEMMA = '@cf/google/gemma-4-26b-a4b-it'
const ENV = { AXIS_AI_PROVIDER: 'cloudflare', CF_ACCOUNT_ID: ACCOUNT, CF_API_TOKEN: TOKEN, AXIS_DECISION_FIRST: 'true' }
const req: AIRequest = { system: 's', user: 'u', schema: { type: 'object' } }

const input = () => ({ context: buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements(), objectives: [objective({ name: 'Viaje', targetCents: 500_000, currentCents: 246_000 })] }), TODAY) })

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
  })
}

const cfResponse = (content: string | null, finish = 'stop') =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }], usage: { prompt_tokens: 3210, completion_tokens: 420, total_tokens: 3630, neurons: 57.5 } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const stub = (respond: () => Response | Promise<Response>) => (async () => respond()) as typeof fetch

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

describe('Cloudflare Workers AI · configuración', () => {
  it('provider=cloudflare con CF_ACCOUNT_ID y CF_API_TOKEN crea el modelo con Gemma 4 por defecto', () => {
    const model = languageModelFromConfig(readAIServerConfig(ENV))
    assert.equal(model.available, true)
    assert.equal(model.id, `cloudflare:${CLOUDFLARE_DEFAULT_MODEL}`)
    assert.equal(CLOUDFLARE_DEFAULT_MODEL, GEMMA)
    assert.equal(model.maxOutputTokens, AXIS_AI_LIMITS.MAX_OUTPUT_TOKENS_BY_PROVIDER.cloudflare)
  })

  it('sin la cuenta o sin el token no hay Cloudflare (ni crash); la clave de Groq no sirve', () => {
    assert.equal(languageModelFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'cloudflare', CF_API_TOKEN: TOKEN })).available, false)
    assert.equal(languageModelFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'cloudflare', CF_ACCOUNT_ID: ACCOUNT })).available, false)
    assert.equal(languageModelFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'cloudflare', CF_ACCOUNT_ID: ACCOUNT, CF_API_TOKEN: '  ' })).available, false)
    assert.equal(languageModelFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'cloudflare', GROQ_API_KEY: 'k' })).available, false)
    assert.equal(languageModelFromConfig(readAIServerConfig({ ...ENV, AXIS_AI_ENABLED: 'false' })).available, false)
  })

  it('AXIS_AI_MODEL_CLOUDFLARE fija el modelo; AXIS_AI_MODEL solo vale si Cloudflare es el principal', () => {
    assert.equal(languageModelFromConfig(readAIServerConfig({ ...ENV, AXIS_AI_MODEL_CLOUDFLARE: '@cf/otro/modelo' })).id, 'cloudflare:@cf/otro/modelo')
    assert.equal(languageModelFromConfig(readAIServerConfig({ ...ENV, AXIS_AI_MODEL: '@cf/heredado' })).id, 'cloudflare:@cf/heredado')
    assert.equal(languageModelFromConfig(readAIServerConfig({ ...ENV, AXIS_AI_MODEL: '@cf/heredado', AXIS_AI_MODEL_CLOUDFLARE: '@cf/propio' })).id, 'cloudflare:@cf/propio')
  })
})

describe('Cloudflare Workers AI · adapter', () => {
  it('endpoint de la cuenta, Bearer CF_API_TOKEN, Gemma 4 sin razonamiento, json_schema strict, sin tools y tope de 1.200', async () => {
    const i = input()
    const d = decide(i)
    const { captured } = await withFetch(
      () => cfResponse(expressionJSON(d)),
      () => analyzeWithProvider(languageModelFromConfig(readAIServerConfig(ENV)), i.context, undefined, undefined, null, 'decision-first'),
    )
    assert.equal(captured.calls, 1)
    assert.equal(captured.url, `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/v1/chat/completions`)
    assert.equal(captured.init?.method, 'POST')
    assert.equal((captured.init?.headers as Record<string, string>).authorization, `Bearer ${TOKEN}`)
    const body = JSON.parse(String(captured.init?.body))
    assert.equal(body.model, GEMMA)
    assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false })
    assert.equal(body.messages[0].role, 'system')
    assert.equal(body.messages[0].content, AXIS_EXPRESSION_PROMPT)
    assert.match(body.messages[1].content, /decision_de_axis/)
    assert.equal(body.response_format.type, 'json_schema')
    assert.equal(body.response_format.json_schema.strict, true)
    assert.deepEqual(body.response_format.json_schema.schema, AXIS_EXPRESSION_SCHEMA)
    assert.equal(body.tools, undefined, 'sin herramientas')
    assert.equal(body.max_completion_tokens, 1_200)
    assert.equal(body.max_completion_tokens, AXIS_AI_LIMITS.MAX_OUTPUT_TOKENS_BY_PROVIDER.cloudflare)
  })

  it('la salida pasa por parse/validate/merge de Decision First y la decisión sigue siendo de AXIS', async () => {
    const i = input()
    const d = decide(i)
    assert.ok(d.recommendation)
    const { result: analysis } = await withFetch(
      () => cfResponse(expressionJSON(d)),
      () => analyzeWithProvider(languageModelFromConfig(readAIServerConfig(ENV)), i.context, undefined, undefined, null, 'decision-first'),
    )
    assert.equal(analysis.recommendation?.what, d.recommendation?.what)
    assert.equal(analysis.uncertainty.confidence, d.confidence)
    assert.deepEqual(analysis.data.facts, d.facts)
    assert.match(analysis.engine.label, /cloudflare:@cf\/google\/gemma-4/)
  })

  it('uso de tokens, neuronas y motivo de fin en el diagnóstico', async () => {
    const p = createCloudflareProvider({ accountId: ACCOUNT, apiToken: TOKEN, fetchImpl: stub(() => cfResponse('{"a":1}')) })
    const c = await p.completeWithUsage(req, { maxOutputTokens: 100 })
    assert.deepEqual(c.output, { a: 1 })
    assert.deepEqual(c.usage, { inputTokens: 3210, outputTokens: 420, totalTokens: 3630 })
    assert.deepEqual(c.diagnostics, { status: 200, finishReason: 'stop', promptTokens: 3210, completionTokens: 420, totalTokens: 3630, neurons: 57.5 })
  })

  it('JSON envuelto en ```json se acepta', async () => {
    const p = createCloudflareProvider({ accountId: ACCOUNT, apiToken: TOKEN, fetchImpl: stub(() => cfResponse('```json\n{"a":2}\n```')) })
    assert.deepEqual((await p.completeWithUsage(req, { maxOutputTokens: 100 })).output, { a: 2 })
  })

  it('clasifica los fallos: truncada, sin texto, no JSON, cuerpo roto, 429, 5xx, 401, 404, red y timeout', async () => {
    const expectKind = async (fetchImpl: typeof fetch, kind: AIProviderError['kind'], pattern: RegExp, timeoutMs?: number) => {
      const p = createCloudflareProvider({ accountId: ACCOUNT, apiToken: TOKEN, fetchImpl, timeoutMs })
      await assert.rejects(p.completeWithUsage(req, { maxOutputTokens: 100 }), (e: unknown) => {
        assert.ok(e instanceof AIProviderError)
        assert.equal(e.kind, kind, e.message)
        assert.match(e.message, pattern)
        for (const secret of [ACCOUNT, TOKEN]) assert.ok(!`${e.message} ${JSON.stringify(e.diagnostics ?? {})}`.includes(secret), 'sin cuenta ni token')
        return true
      })
    }
    await expectKind(stub(() => cfResponse('{"a"', 'length')), 'malformed', /truncada/)
    await expectKind(stub(() => cfResponse(null)), 'malformed', /sin texto/)
    await expectKind(stub(() => cfResponse('esto no es json')), 'malformed', /no es JSON/)
    await expectKind(stub(() => new Response('<html>502</html>', { status: 200 })), 'malformed', /cuerpo/)
    await expectKind(stub(() => new Response('{"errors":[{"code":4006}]}', { status: 429, headers: { 'retry-after': '30' } })), 'rate-limit', /HTTP 429/)
    await expectKind(stub(() => new Response('{}', { status: 503 })), 'http', /HTTP 503/)
    await expectKind(stub(() => new Response('{}', { status: 401 })), 'unavailable', /HTTP 401/)
    await expectKind(stub(() => new Response('{}', { status: 404 })), 'http', /HTTP 404/)
    await expectKind((async () => { throw new TypeError('fetch failed') }) as typeof fetch, 'http', /red/)
    const hanging = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as typeof fetch
    await expectKind(hanging, 'timeout', /tiempo de espera/, 20)
  })

  it('un 429 conserva el estado y retry-after para los logs', async () => {
    const p = createCloudflareProvider({ accountId: ACCOUNT, apiToken: TOKEN, fetchImpl: stub(() => new Response('{"errors":[{"code":4006,"message":"daily free allocation"}]}', { status: 429, headers: { 'retry-after': '30' } })) })
    await assert.rejects(p.completeWithUsage(req, { maxOutputTokens: 100 }), (e: unknown) => e instanceof AIProviderError && e.diagnostics?.status === 429 && e.diagnostics.retryAfter === '30')
  })
})
