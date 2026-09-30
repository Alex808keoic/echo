/**
 * Cadena de proveedores de AXIS: Cloudflare → Groq → motor local. Sin red.
 * Comprueba cuándo se pasa al siguiente proveedor (solo fallos DEL
 * PROVEEDOR), el plazo total compartido, la cancelación del llamador, el
 * error final que ve la ruta y que un rechazo de Decision First nunca prueba
 * otro proveedor.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AIProviderError, type AIRequest } from '../ai/provider'
import { analyzeWithProvider, readAIServerConfig } from '../ai/server/analyze'
import { AXIS_AI_LIMITS } from '../ai/server/limits'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { fallbackChain, fromProvider, isProviderFailure, noModel, type AttemptReport, type ChainTiming } from '../language/model'
import { languageModelFromConfig } from '../language/server'
import type { MarketAIProvider } from '../../ai/providers/types'
import type { AxisDecision } from '../types'
import { config, healthyMovements, objective, snapshot, TODAY } from './fixtures'

const req: AIRequest = { system: 's', user: 'u', schema: { type: 'object' } }
const FAST: ChainTiming = { deadlineMs: 400, reserveMs: 150, minAttemptMs: 40 }

type Behavior = (signal?: AbortSignal) => Promise<unknown>

/** Proveedor simulado que cuenta llamadas y guarda el tope de salida recibido. */
function fake(id: string, behavior: Behavior) {
  const seen = { calls: 0, maxOutputTokens: [] as number[] }
  const provider: MarketAIProvider = {
    id,
    model: id,
    async completeWithUsage(_request, options) {
      seen.calls++
      seen.maxOutputTokens.push(options.maxOutputTokens)
      const output = await behavior(options.signal)
      return { output, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, diagnostics: { status: 200, finishReason: 'stop' } }
    },
    complete: async () => ({}),
  }
  return { provider, seen }
}

const ok = (value: unknown): Behavior => async () => value
const fail = (kind: AIProviderError['kind'], status?: number): Behavior => async () => {
  throw new AIProviderError(kind, `fallo ${kind}${status ? ` ${status}` : ''}`, status ? { status } : undefined)
}
/** No responde nunca; al abortar se comporta como los adapters reales (timeout). */
const hang: Behavior = (signal) =>
  new Promise((_resolve, reject) => {
    const abort = () => reject(new AIProviderError('timeout', 'tiempo de espera agotado'))
    if (signal?.aborted) abort()
    signal?.addEventListener('abort', abort)
  })

function chainOf(a: ReturnType<typeof fake>, b: ReturnType<typeof fake>, timing = FAST) {
  return fallbackChain([fromProvider(a.provider), fromProvider(b.provider)], timing)
}

describe('AXIS · cadena de proveedores · cuándo pasa al siguiente', () => {
  it('si el principal responde, el fallback no se llama', async () => {
    const cf = fake('cloudflare:m', ok({ from: 'cf' }))
    const groq = fake('groq:m', ok({ from: 'groq' }))
    assert.deepEqual(await chainOf(cf, groq).complete(req, { maxOutputTokens: 100 }), { from: 'cf' })
    assert.equal(groq.seen.calls, 0)
  })

  for (const [name, behavior] of [
    ['429', fail('rate-limit', 429)],
    ['timeout', fail('timeout')],
    ['error de red (http sin estado)', fail('http')],
    ['5xx', fail('http', 503)],
    ['respuesta vacía, truncada o no JSON (malformed)', fail('malformed')],
    ['401 (credenciales rechazadas)', fail('unavailable', 401)],
    ['403 (credenciales sin permiso)', fail('unavailable', 403)],
  ] as const) {
    it(`fallo del proveedor (${name}) → prueba el siguiente`, async () => {
      const cf = fake('cloudflare:m', behavior)
      const groq = fake('groq:m', ok({ from: 'groq' }))
      assert.deepEqual(await chainOf(cf, groq).complete(req, { maxOutputTokens: 100 }), { from: 'groq' })
      assert.equal(cf.seen.calls, 1)
      assert.equal(groq.seen.calls, 1)
    })
  }

  for (const [name, error] of [
    ['404 (modelo o petición erróneos)', new AIProviderError('http', 'HTTP 404', { status: 404 })],
    ['negativa', new AIProviderError('refusal', 'negativa')],
    ['error que no es del proveedor', new TypeError('bug')],
  ] as const) {
    it(`${name} → NO prueba el siguiente y el error llega tal cual`, async () => {
      const cf = fake('cloudflare:m', async () => {
        throw error
      })
      const groq = fake('groq:m', ok({ from: 'groq' }))
      await assert.rejects(chainOf(cf, groq).complete(req, { maxOutputTokens: 100 }), (e: unknown) => e === error)
      assert.equal(groq.seen.calls, 0)
    })
  }

  it('isProviderFailure: solo 429, timeout, red, 5xx, malformed y 401/403', () => {
    assert.equal(isProviderFailure(new AIProviderError('rate-limit', '')), true)
    assert.equal(isProviderFailure(new AIProviderError('timeout', '')), true)
    assert.equal(isProviderFailure(new AIProviderError('malformed', '')), true)
    assert.equal(isProviderFailure(new AIProviderError('http', '')), true)
    assert.equal(isProviderFailure(new AIProviderError('http', '', { status: 500 })), true)
    assert.equal(isProviderFailure(new AIProviderError('http', '', { status: 400 })), false)
    assert.equal(isProviderFailure(new AIProviderError('unavailable', '', { status: 401 })), true)
    assert.equal(isProviderFailure(new AIProviderError('unavailable', '', { status: 403 })), true)
    assert.equal(isProviderFailure(new AIProviderError('http', '', { status: 404 })), false)
    assert.equal(isProviderFailure(new AIProviderError('refusal', '')), false)
    assert.equal(isProviderFailure(new Error('x')), false)
  })
})

describe('AXIS · cadena de proveedores · error final', () => {
  const finalKind = async (a: Behavior, b: Behavior) => {
    try {
      await chainOf(fake('a', a), fake('b', b)).complete(req, { maxOutputTokens: 100 })
    } catch (e) {
      return e instanceof AIProviderError ? e.kind : 'otro'
    }
    return 'ok'
  }

  it('todos 429 → rate-limit (la ruta responde 429: «sin cupo»)', async () => {
    assert.equal(await finalKind(fail('rate-limit', 429), fail('rate-limit', 429)), 'rate-limit')
  })

  it('si algún fallo no fue un 429, ese es el error (la ruta responde 502)', async () => {
    assert.equal(await finalKind(fail('timeout'), fail('rate-limit', 429)), 'timeout')
    assert.equal(await finalKind(fail('rate-limit', 429), fail('http', 503)), 'http')
    assert.equal(await finalKind(fail('rate-limit', 429), fail('malformed')), 'malformed')
  })
})

describe('AXIS · cadena de proveedores · plazo total compartido', () => {
  it('el principal que no responde se corta antes del plazo y el fallback aún responde a tiempo', async () => {
    const cf = fake('cloudflare:m', hang)
    const groq = fake('groq:m', ok({ from: 'groq' }))
    const start = Date.now()
    assert.deepEqual(await chainOf(cf, groq).complete(req, { maxOutputTokens: 100 }), { from: 'groq' })
    const elapsed = Date.now() - start
    // El principal recibe el plazo menos la reserva del fallback (400 − 150).
    assert.ok(elapsed >= FAST.deadlineMs - FAST.reserveMs - 20, `demasiado pronto: ${elapsed} ms`)
    assert.ok(elapsed < FAST.deadlineMs, `excede el plazo total: ${elapsed} ms`)
  })

  it('si los dos se cuelgan, la cadena entera termina dentro del plazo total (no 20 s + 20 s)', async () => {
    const start = Date.now()
    await assert.rejects(chainOf(fake('a', hang), fake('b', hang)).complete(req, { maxOutputTokens: 100 }), (e: unknown) => e instanceof AIProviderError && e.kind === 'timeout')
    assert.ok(Date.now() - start < FAST.deadlineMs + 100)
  })

  it('sin tiempo suficiente, el fallback no se intenta y queda registrado como «skipped»', async () => {
    const reports: AttemptReport[] = []
    const groq = fake('groq:m', ok({ from: 'groq' }))
    const chain = chainOf(fake('cloudflare:m', hang), groq, { deadlineMs: 120, reserveMs: 0, minAttemptMs: 60 })
    await assert.rejects(chain.complete(req, { maxOutputTokens: 100, onAttempt: (r) => reports.push(r) }), (e: unknown) => e instanceof AIProviderError && e.kind === 'timeout')
    assert.equal(groq.seen.calls, 0)
    assert.deepEqual(
      reports.map((r) => [r.model, r.attempt, r.outcome, r.errorKind]),
      [
        ['cloudflare:m', 1, 'error', 'timeout'],
        ['groq:m', 2, 'skipped', 'deadline'],
      ],
    )
  })

  it('si el llamador cancela (el cliente se ha ido), no se prueba el fallback', async () => {
    const controller = new AbortController()
    const groq = fake('groq:m', ok({ from: 'groq' }))
    const pending = chainOf(fake('cloudflare:m', hang), groq).complete(req, { maxOutputTokens: 100, signal: controller.signal })
    setTimeout(() => controller.abort(), 10)
    await assert.rejects(pending)
    assert.equal(groq.seen.calls, 0)
  })

  it('los plazos de producción caben en los 25 s del cliente y reservan tiempo al fallback', () => {
    assert.ok(AXIS_AI_LIMITS.CHAIN_DEADLINE_MS < 25_000)
    assert.ok(AXIS_AI_LIMITS.CHAIN_DEADLINE_MS - AXIS_AI_LIMITS.FALLBACK_RESERVE_MS >= AXIS_AI_LIMITS.MIN_ATTEMPT_MS)
    assert.ok(AXIS_AI_LIMITS.FALLBACK_RESERVE_MS >= AXIS_AI_LIMITS.MIN_ATTEMPT_MS)
  })
})

describe('AXIS · cadena de proveedores · forma', () => {
  it('cada proveedor usa su propio tope de salida, no el del llamador', async () => {
    const cf = fake('cloudflare:m', fail('rate-limit', 429))
    const groq = fake('groq:m', ok({}))
    const chain = fallbackChain([fromProvider(cf.provider, { maxOutputTokens: 1_200 }), fromProvider(groq.provider, { maxOutputTokens: 3_000 })], FAST)
    await chain.complete(req, { maxOutputTokens: 999 })
    assert.deepEqual(cf.seen.maxOutputTokens, [1_200])
    assert.deepEqual(groq.seen.maxOutputTokens, [3_000])
  })

  it('un informe por intento, con el número de intento', async () => {
    const reports: AttemptReport[] = []
    await chainOf(fake('cloudflare:m', fail('rate-limit', 429)), fake('groq:m', ok({}))).complete(req, { maxOutputTokens: 100, onAttempt: (r) => reports.push(r) })
    assert.deepEqual(
      reports.map((r) => [r.model, r.attempt, r.outcome]),
      [
        ['cloudflare:m', 1, 'error'],
        ['groq:m', 2, 'ok'],
      ],
    )
  })

  it('sin modelos → noModel; con uno → ese mismo modelo, sin cadena', () => {
    assert.equal(fallbackChain([], FAST), noModel)
    assert.equal(fallbackChain([noModel], FAST), noModel)
    const only = fromProvider(fake('groq:m', ok({})).provider)
    assert.equal(fallbackChain([only], FAST), only)
    const chain = chainOf(fake('cloudflare:m', ok({})), fake('groq:m', ok({})))
    assert.equal(chain.id, 'cloudflare:m > groq:m')
    assert.equal(chain.available, true)
  })
})

/* ---------------- cadena real desde la configuración (adapters reales, fetch simulado) ---------------- */

const ENV = {
  AXIS_AI_PROVIDER: 'cloudflare',
  AXIS_AI_FALLBACK_PROVIDER: 'groq',
  CF_ACCOUNT_ID: 'acc-test-0000',
  CF_API_TOKEN: 'test-cf-token-not-real',
  GROQ_API_KEY: 'test-groq-key-not-real',
  AXIS_AI_MODEL_GROQ: 'openai/gpt-oss-20b',
  AXIS_DECISION_FIRST: 'true',
}

const input = () => ({ context: buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements(), objectives: [objective({ name: 'Viaje', targetCents: 500_000, currentCents: 246_000 })] }), TODAY) })

function expressionJSON(d: AxisDecision, conclusion = 'Sigue así y revisa el mes que viene.'): string {
  return JSON.stringify({
    headline: `Lectura: ${d.lead?.fact ?? 'estable'}`,
    interpretation: { summary: `Con los datos disponibles, ${d.lead?.interpretation ?? 'nada que atender'}`, signals: d.relevant.map((s) => ({ id: s.id, text: `En otras palabras: ${s.interpretation}` })) },
    recommendation_why: d.recommendation ? `Porque ${d.recommendation.why}` : null,
    alternatives: d.alternatives.map((a) => ({ name: a.name, summary: `Otra vía: ${a.summary}` })),
    uncertainties: d.uncertainties.map((u) => ({ title: u.title, detail: `A tener presente: ${u.detail}` })),
    conclusion,
  })
}

const chatCompletion = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { status: 200, headers: { 'content-type': 'application/json' } })

/** Sustituye `fetch` y encamina por host: Cloudflare o Groq. */
async function withProviders<T>(routes: { cloudflare: () => Response; groq: () => Response }, run: () => Promise<T>) {
  const calls: Array<{ host: 'cloudflare' | 'groq'; body: Record<string, unknown> }> = []
  const real = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const host = String(url).includes('api.cloudflare.com') ? 'cloudflare' : 'groq'
    calls.push({ host, body: JSON.parse(String(init?.body)) })
    return routes[host]()
  }) as typeof fetch
  try {
    return { result: await run().catch((e: unknown) => e), calls }
  } finally {
    globalThis.fetch = real
  }
}

describe('AXIS · cadena desde la configuración (Cloudflare → Groq)', () => {
  it('la configuración construye la cadena con los modelos de cada proveedor', () => {
    const model = languageModelFromConfig(readAIServerConfig(ENV))
    assert.equal(model.available, true)
    assert.equal(model.id, 'cloudflare:@cf/google/gemma-4-26b-a4b-it > groq:openai/gpt-oss-20b')
  })

  it('Cloudflare responde: una sola llamada, con 1.200 tokens de salida', async () => {
    const i = input()
    const { result, calls } = await withProviders(
      { cloudflare: () => chatCompletion(expressionJSON(decide(i))), groq: () => chatCompletion('{}') },
      () => analyzeWithProvider(languageModelFromConfig(readAIServerConfig(ENV)), i.context, undefined, undefined, null, 'decision-first'),
    )
    assert.deepEqual(calls.map((c) => [c.host, c.body.max_completion_tokens]), [['cloudflare', 1_200]])
    assert.match((result as { engine: { label: string } }).engine.label, /cloudflare:/)
  })

  it('Cloudflare 429 → Groq (con 3.000 tokens) responde y la etiqueta dice que respondió Groq', async () => {
    const i = input()
    const d = decide(i)
    const { result, calls } = await withProviders(
      { cloudflare: () => new Response('{"errors":[{"code":4006}]}', { status: 429 }), groq: () => chatCompletion(expressionJSON(d)) },
      () => analyzeWithProvider(languageModelFromConfig(readAIServerConfig(ENV)), i.context, undefined, undefined, null, 'decision-first'),
    )
    assert.deepEqual(calls.map((c) => [c.host, c.body.max_completion_tokens]), [['cloudflare', 1_200], ['groq', 3_000]])
    const analysis = result as { engine: { label: string }; recommendation?: { what: string } }
    assert.match(analysis.engine.label, /groq:openai\/gpt-oss-20b/)
    assert.equal(analysis.recommendation?.what, d.recommendation?.what, 'la decisión sigue siendo de AXIS')
  })

  for (const status of [401, 403]) {
    it(`Cloudflare ${status} (token mal o caducado) → Groq responde con sus propias credenciales`, async () => {
      const i = input()
      const d = decide(i)
      const { result, calls } = await withProviders(
        { cloudflare: () => new Response('{"errors":[{"code":10000,"message":"Authentication error"}]}', { status }), groq: () => chatCompletion(expressionJSON(d)) },
        () => analyzeWithProvider(languageModelFromConfig(readAIServerConfig(ENV)), i.context, undefined, undefined, null, 'decision-first'),
      )
      assert.deepEqual(calls.map((c) => c.host), ['cloudflare', 'groq'])
      const analysis = result as { engine: { label: string }; recommendation?: { what: string } }
      assert.match(analysis.engine.label, /groq:openai\/gpt-oss-20b/)
      assert.equal(analysis.recommendation?.what, d.recommendation?.what)
    })
  }

  it('Cloudflare 401 y Groq también falla → error (la ruta responde 502 y el cliente usa el motor local)', async () => {
    const i = input()
    const { result, calls } = await withProviders(
      { cloudflare: () => new Response('{}', { status: 401 }), groq: () => new Response('{}', { status: 503 }) },
      () => analyzeWithProvider(languageModelFromConfig(readAIServerConfig(ENV)), i.context, undefined, undefined, null, 'decision-first'),
    )
    assert.deepEqual(calls.map((c) => c.host), ['cloudflare', 'groq'])
    assert.ok(result instanceof AIProviderError)
    assert.notEqual(result.kind, 'rate-limit')
  })

  it('Cloudflare 5xx y Groq 429 → error (la ruta responde 502 y el cliente usa el motor local)', async () => {
    const i = input()
    const { result, calls } = await withProviders(
      { cloudflare: () => new Response('{}', { status: 502 }), groq: () => new Response('{}', { status: 429 }) },
      () => analyzeWithProvider(languageModelFromConfig(readAIServerConfig(ENV)), i.context, undefined, undefined, null, 'decision-first'),
    )
    assert.equal(calls.length, 2)
    assert.ok(result instanceof AIProviderError)
    assert.equal(result.kind, 'http')
  })

  it('Decision First rechaza la expresión de Cloudflare (cifra inventada) → NO se llama a Groq', async () => {
    const i = input()
    const { result, calls } = await withProviders(
      { cloudflare: () => chatCompletion(expressionJSON(decide(i), 'Podrías ahorrar 98.765,00 € más.')), groq: () => chatCompletion(expressionJSON(decide(i))) },
      () => analyzeWithProvider(languageModelFromConfig(readAIServerConfig(ENV)), i.context, undefined, undefined, null, 'decision-first'),
    )
    assert.deepEqual(calls.map((c) => c.host), ['cloudflare'])
    assert.ok(result instanceof AIProviderError)
    assert.match(result.message, /figures/)
  })

  it('una salida con forma inválida para AXIS (JSON válido, esquema no) tampoco prueba Groq', async () => {
    const i = input()
    const { result, calls } = await withProviders(
      { cloudflare: () => chatCompletion('{"headline":42}'), groq: () => chatCompletion(expressionJSON(decide(i))) },
      () => analyzeWithProvider(languageModelFromConfig(readAIServerConfig(ENV)), i.context, undefined, undefined, null, 'decision-first'),
    )
    assert.deepEqual(calls.map((c) => c.host), ['cloudflare'])
    assert.ok(result instanceof Error)
  })

  it('JSON roto de Cloudflare es un fallo del proveedor → Groq', async () => {
    const i = input()
    const { result, calls } = await withProviders(
      { cloudflare: () => chatCompletion('esto no es json'), groq: () => chatCompletion(expressionJSON(decide(i))) },
      () => analyzeWithProvider(languageModelFromConfig(readAIServerConfig(ENV)), i.context, undefined, undefined, null, 'decision-first'),
    )
    assert.deepEqual(calls.map((c) => c.host), ['cloudflare', 'groq'])
    assert.ok(!(result instanceof Error))
  })
})
