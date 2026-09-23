/**
 * Registro de llamadas al proveedor (`[axis] llamada:`). Sin red: `fetch` se
 * sustituye por stubs con la forma de Groq y Gemini. Comprueba que cada
 * llamada deja una línea con uso de tokens, motivo de fin y límites, que un
 * 429 dice QUÉ límite ha saltado, y que en el log nunca aparecen textos del
 * usuario o del modelo, cifras financieras, identificadores de cuenta ni claves.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createGeminiProvider } from '../../ai/providers/gemini'
import { createGroqProvider } from '../../ai/providers/groq'
import { rateLimitFromBody } from '../../ai/providers/types'
import { AIProviderError, type AIRequest } from '../ai/provider'
import { chatWithProvider, safeDiagnostics } from '../ai/server/analyze'
import { AXIS_AI_LIMITS } from '../ai/server/limits'
import { buildFinancialContext } from '../context'
import { config, healthyMovements, objective, snapshot, TODAY } from './fixtures'

const KEY = 'test-key-not-real-0000'
const ORG = 'org_01abcdefghijklmnop'
const req: AIRequest = { system: 's', user: 'u', schema: { type: 'object' } }

const groqOk = (finish = 'stop', headers: Record<string, string> = {}) =>
  (async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ reply: 'Con tus datos, yo iría poco a poco.', confidence: 'media', nextStep: null, memoryProposal: null }) }, finish_reason: finish }],
        usage: { prompt_tokens: 4321, completion_tokens: 987, total_tokens: 5308 },
      }),
      { status: 200, headers: { 'content-type': 'application/json', ...headers } },
    )) as typeof fetch

const TPM_BODY = JSON.stringify({
  error: {
    message: `Rate limit reached for model \`openai/gpt-oss-20b\` in organization \`${ORG}\` service tier \`on_demand\` on tokens per minute (TPM): Limit 8000, Used 5210, Requested 6480. Please try again in 27.5s.`,
    type: 'tokens',
    code: 'rate_limit_exceeded',
  },
})

const groq429 = (async () =>
  new Response(TPM_BODY, { status: 429, headers: { 'retry-after': '28', 'x-ratelimit-remaining-tokens': '2790', 'x-ratelimit-limit-tokens': '8000' } })) as typeof fetch

/** Captura `console.info` durante `run`. */
async function captureInfo(run: () => Promise<unknown>): Promise<string[]> {
  const lines: string[] = []
  const real = console.info
  console.info = (...args: unknown[]) => void lines.push(args.map(String).join(' '))
  try {
    await run().catch(() => {})
  } finally {
    console.info = real
  }
  return lines
}

const chatInput = () => ({
  context: buildFinancialContext(snapshot({ config: config(987_654), movements: healthyMovements(), objectives: [objective({ name: 'Viaje a Kioto', targetCents: 500_000, currentCents: 246_000 })] }), TODAY),
  conversation: { summary: null, recent: [] },
  message: '¿Puedo meter 7.777,77 € al Viaje a Kioto?',
})

describe('AXIS · registro de llamadas · proveedores', () => {
  it('Groq: una respuesta correcta trae uso de tokens, motivo de fin y cabeceras de límite', async () => {
    const p = createGroqProvider({ apiKey: KEY, fetchImpl: groqOk('stop', { 'x-ratelimit-remaining-tokens': '3100', 'x-ratelimit-remaining-requests': '28', 'x-ratelimit-reset-tokens': '7.2s' }) })
    const c = await p.completeWithUsage(req, { maxOutputTokens: 100 })
    assert.deepEqual(c.diagnostics, { status: 200, finishReason: 'stop', promptTokens: 4321, completionTokens: 987, totalTokens: 5308, remainingTokens: '3100', remainingRequests: '28', resetTokens: '7.2s' })
  })

  it('Groq 429: dice qué límite ha saltado (TPM), cuánto se pidió y cuándo reintentar, sin el identificador de la organización', async () => {
    const p = createGroqProvider({ apiKey: KEY, fetchImpl: groq429 })
    await assert.rejects(p.completeWithUsage(req, { maxOutputTokens: 100 }), (e: unknown) => {
      assert.ok(e instanceof AIProviderError)
      assert.equal(e.kind, 'rate-limit')
      assert.deepEqual(e.diagnostics, { status: 429, retryAfter: '28', limitTokens: '8000', remainingTokens: '2790', limitType: 'TPM', limit: 8000, used: 5210, requested: 6480 })
      assert.doesNotMatch(JSON.stringify(e.diagnostics), /org_|gpt-oss|organization/)
      return true
    })
  })

  it('el cuerpo de un 429 solo aporta el tipo de límite y sus cifras', () => {
    assert.deepEqual(rateLimitFromBody('on requests per day (RPD): Limit 1000, Used 1000, Requested 1.'), { limitType: 'RPD', limit: 1000, used: 1000, requested: 1 })
    assert.deepEqual(rateLimitFromBody('algo inesperado'), {})
  })

  it('Groq truncado (finish_reason length): el error lleva los tokens de salida consumidos', async () => {
    const p = createGroqProvider({ apiKey: KEY, fetchImpl: groqOk('length') })
    await assert.rejects(p.completeWithUsage(req, { maxOutputTokens: 100 }), (e: unknown) => e instanceof AIProviderError && e.kind === 'malformed' && e.diagnostics?.finishReason === 'length' && e.diagnostics.completionTokens === 987)
  })

  it('Gemini: uso de tokens en la respuesta y código en el error', async () => {
    const ok = createGeminiProvider({
      apiKey: KEY,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 14 } }), { status: 200 })) as typeof fetch,
    })
    assert.deepEqual((await ok.completeWithUsage(req, { maxOutputTokens: 100 })).diagnostics, { status: 200, finishReason: 'STOP', promptTokens: 10, completionTokens: 4, totalTokens: 14 })
    const limited = createGeminiProvider({ apiKey: KEY, fetchImpl: (async () => new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', { status: 429 })) as typeof fetch })
    await assert.rejects(limited.completeWithUsage(req, { maxOutputTokens: 100 }), (e: unknown) => e instanceof AIProviderError && e.kind === 'rate-limit' && e.diagnostics?.status === 429)
  })
})

describe('AXIS · registro de llamadas · servidor', () => {
  it('cada llamada deja UNA línea con tipo, modelo, resultado, tamaño y uso de tokens', async () => {
    const model = createGroqProvider({ apiKey: KEY, model: 'openai/gpt-oss-20b', fetchImpl: groqOk() })
    const lines = await captureInfo(() => chatWithProvider(model, chatInput()))
    assert.equal(lines.length, 1)
    assert.match(lines[0], /^\[axis\] llamada: /)
    const entry = JSON.parse(lines[0].slice(lines[0].indexOf('{')))
    assert.equal(entry.kind, 'chat')
    assert.equal(entry.model, 'groq:openai/gpt-oss-20b')
    assert.equal(entry.outcome, 'ok')
    assert.equal(entry.maxOutputTokens, AXIS_AI_LIMITS.MAX_OUTPUT_TOKENS)
    assert.ok(entry.requestChars > 1000)
    assert.equal(entry.diagnostics.promptTokens, 4321)
    assert.equal(entry.diagnostics.finishReason, 'stop')
  })

  it('un 429 del proveedor queda registrado como error con el límite concreto', async () => {
    const model = createGroqProvider({ apiKey: KEY, fetchImpl: groq429 })
    const lines = await captureInfo(() => chatWithProvider(model, chatInput()))
    const entry = JSON.parse(lines[0].slice(lines[0].indexOf('{')))
    assert.equal(entry.outcome, 'error')
    assert.equal(entry.errorKind, 'rate-limit')
    assert.equal(entry.diagnostics.limitType, 'TPM')
    assert.equal(entry.diagnostics.requested, 6480)
  })

  it('el log nunca contiene textos del usuario o del modelo, cifras financieras, la organización ni la clave', async () => {
    for (const fetchImpl of [groqOk(), groq429]) {
      const lines = await captureInfo(() => chatWithProvider(createGroqProvider({ apiKey: KEY, fetchImpl }), chatInput()))
      const all = lines.join('\n')
      for (const forbidden of [KEY, ORG, 'Kioto', '7.777,77', '9.876,54', 'poco a poco', 'Rate limit reached']) {
        assert.ok(!all.includes(forbidden), `el log contiene «${forbidden}»`)
      }
    }
  })

  it('safeDiagnostics deja pasar solo los campos conocidos y con su tipo', () => {
    const dirty = { status: 429, limitType: 'TPM', message: 'texto del proveedor', finishReason: 42, promptTokens: Number.NaN, retryAfter: 'x'.repeat(100) } as never
    assert.deepEqual(safeDiagnostics(dirty), { status: 429, limitType: 'TPM', retryAfter: 'x'.repeat(32) })
    assert.deepEqual(safeDiagnostics(undefined), {})
  })
})
