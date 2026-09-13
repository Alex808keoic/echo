import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AIProviderError, type AIRequest } from '../../../lib/axis/ai/provider'
import { history, NOW, research } from '../../../lib/market/__tests__/fixtures'
import { runDeepResearch, type DeepDeps } from '../deep'
import { runLightCheck } from '../light'
import { LIMITS } from '../limits'
import { emptyLedger, recordAttempt } from '../budget'
import { createGeminiProvider } from '../../../lib/ai/providers/gemini'
import { createGroqProvider } from '../../../lib/ai/providers/groq'
import type { Completion, MarketAIProvider } from '../../../lib/ai/providers/types'
import { collectSources, type CollectedMaterial, type NamedSource } from '../sources'
import { memoryStore } from '../store'
import { compactMaterial } from '../material'
import { freshnessOf } from '../../../lib/market/freshness'

const ENV_OK = { MARKET_AI_ENABLED: 'true', GEMINI_API_KEY: 'k' }

function material(overrides: Partial<CollectedMaterial> = {}): CollectedMaterial {
  const r = research()
  return {
    retrievedAt: NOW.toISOString(),
    indicators: r.indicators,
    headlines: [
      { title: 'Monetary policy decision', link: 'https://www.ecb.europa.eu/', publishedAt: '2026-09-14T12:45:00Z', source: 'BCE · prensa' },
      { title: 'Nota rutinaria', link: 'https://www.federalreserve.gov/', publishedAt: '2026-09-10T12:00:00Z', source: 'Fed · prensa' },
    ],
    sources: r.sources,
    failed: [],
    skipped: [],
    ...overrides,
  }
}

function synthesis() {
  const r = research()
  return { overview: r.overview, events: r.events, trends: r.trends, assetClasses: r.assetClasses, uncertainties: r.uncertainties, warnings: r.warnings }
}

function provider(id: string, impl: (req: AIRequest) => Promise<Completion>): MarketAIProvider & { calls: number } {
  const p = {
    id,
    model: id,
    calls: 0,
    completeWithUsage: async (req: AIRequest) => {
      p.calls++
      return impl(req)
    },
    complete: async (req: AIRequest) => (await impl(req)).output,
  }
  return p
}

const ok = (id: string) => provider(id, async () => ({ output: synthesis(), usage: { inputTokens: 4000, outputTokens: 800, totalTokens: 4800 } }))
const failing = (id: string, kind: AIProviderError['kind']) =>
  provider(id, async () => {
    throw new AIProviderError(kind, `${id}: ${kind}`)
  })

function deps(overrides: Partial<DeepDeps> = {}): DeepDeps {
  return {
    store: memoryStore(),
    collect: async () => material(),
    providers: { primary: ok('gemini'), fallback: ok('groq') },
    env: ENV_OK,
    now: NOW,
    reason: 'scheduled',
    ...overrides,
  }
}

describe('investigación profunda · barreras de coste', () => {
  it('kill switch: sin MARKET_AI_ENABLED=true no se llama a nadie ni se recopilan fuentes', async () => {
    const primary = ok('gemini')
    let collected = 0
    const out = await runDeepResearch(deps({ env: { GEMINI_API_KEY: 'k' }, providers: { primary, fallback: null }, collect: async () => (collected++, material()) }))
    assert.equal(out.status, 'skipped')
    assert.equal(primary.calls, 0)
    assert.equal(collected, 0)
  })

  it('sin secret (sin proveedor principal) → skipped, sin llamadas', async () => {
    const fallback = ok('groq')
    const out = await runDeepResearch(deps({ providers: { primary: null, fallback } }))
    assert.equal(out.status, 'skipped')
    assert.equal(fallback.calls, 0)
  })

  it('presupuesto agotado → blocked, sin llamadas, se conserva la última investigación', async () => {
    let ledger = emptyLedger(NOW)
    for (let i = 0; i < LIMITS.MAX_AI_REQUESTS_PER_DAY; i++) ledger = recordAttempt(ledger, { provider: 'x', reason: 'scheduled', newDeepResearch: false }, NOW)
    const store = memoryStore({ latest: research({ id: '2026-W36' }), ledger })
    const primary = ok('gemini')
    const out = await runDeepResearch(deps({ store, providers: { primary, fallback: ok('groq') } }))
    assert.equal(out.status, 'blocked')
    assert.equal(primary.calls, 0)
    assert.equal((await store.readLatest())?.id, '2026-W36')
  })

  it('ledger corrupto → blocked', async () => {
    const store = memoryStore({ rawLedger: { version: 1, monthCalls: 'muchas' } })
    const primary = ok('gemini')
    const out = await runDeepResearch(deps({ store, providers: { primary, fallback: null } }))
    assert.equal(out.status, 'blocked')
    assert.match(out.status === 'blocked' ? out.reason : '', /corrupto/)
    assert.equal(primary.calls, 0)
  })

  it('camino feliz: publica con Gemini, registra intento y uso, y limita el histórico', async () => {
    const store = memoryStore({ history })
    const out = await runDeepResearch(deps({ store }))
    assert.equal(out.status, 'published')
    if (out.status !== 'published') return
    assert.equal(out.provider, 'gemini')
    assert.equal(out.research.id, '2026-W38')
    assert.equal(out.research.indicators.length, 8, 'los indicadores vienen de las fuentes, no de la IA')
    const ledger = await store.readLedger()
    assert.equal(ledger?.monthCalls, 1)
    assert.equal(ledger?.deepResearchThisMonth, 1)
    assert.equal(ledger?.monthTokens, 4800)
    assert.equal(ledger?.attempts[0].ok, true)
    const hist = await store.readHistory()
    assert.equal(hist[0].id, '2026-W38')
    assert.ok(hist.length <= 8)
    assert.equal((await store.readLatest())?.id, '2026-W38')
  })

  it('Gemini rate limit → Groq una vez (pasando por el presupuesto), ambos intentos contados', async () => {
    const store = memoryStore()
    const primary = failing('gemini', 'rate-limit')
    const fallback = ok('groq')
    const out = await runDeepResearch(deps({ store, providers: { primary, fallback } }))
    assert.equal(out.status, 'published')
    assert.equal(primary.calls, 1)
    assert.equal(fallback.calls, 1)
    const ledger = await store.readLedger()
    assert.equal(ledger?.monthCalls, 2)
    assert.equal(ledger?.attempts.length, 2)
    assert.equal(ledger?.attempts[0].ok, false)
    assert.equal(ledger?.attempts[1].ok, true)
  })

  it('el fallback también está sujeto al presupuesto (límite diario tras el primer intento)', async () => {
    let ledger = emptyLedger(NOW)
    ledger = recordAttempt(ledger, { provider: 'x', reason: 'scheduled', newDeepResearch: false }, NOW) // queda 1 llamada
    const store = memoryStore({ latest: research({ id: '2026-W36' }), ledger })
    const primary = failing('gemini', 'timeout')
    const fallback = ok('groq')
    const out = await runDeepResearch(deps({ store, providers: { primary, fallback } }))
    assert.equal(out.status, 'failed')
    assert.equal(primary.calls, 1)
    assert.equal(fallback.calls, 0, 'Groq no se llama: el presupuesto lo bloquea')
    assert.equal((await store.readLatest())?.id, '2026-W36')
  })

  it('Gemini y Groq fallan → failed, última investigación intacta, exactamente 2 intentos', async () => {
    const store = memoryStore({ latest: research({ id: '2026-W36' }) })
    const primary = failing('gemini', 'http')
    const fallback = failing('groq', 'malformed')
    const out = await runDeepResearch(deps({ store, providers: { primary, fallback } }))
    assert.equal(out.status, 'failed')
    if (out.status !== 'failed') return
    assert.deepEqual(out.attempts, ['gemini', 'groq'])
    assert.equal((await store.readLatest())?.id, '2026-W36')
    assert.equal((await store.readLedger())?.monthCalls, 2)
  })

  it('un error de red cuenta como intento consumido', async () => {
    const store = memoryStore()
    const primary = provider('gemini', async () => {
      throw new Error('ECONNRESET')
    })
    const out = await runDeepResearch(deps({ store, providers: { primary, fallback: null } }))
    assert.equal(out.status, 'failed')
    assert.equal((await store.readLedger())?.monthCalls, 1)
  })

  it('JSON inválido del proveedor → no se publica; se prueba el fallback', async () => {
    const store = memoryStore({ latest: research({ id: '2026-W36' }) })
    const primary = provider('gemini', async () => ({ output: { overview: 'El IBEX va a subir' }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }))
    const fallback = ok('groq')
    const out = await runDeepResearch(deps({ store, providers: { primary, fallback } }))
    assert.equal(out.status, 'published')
    if (out.status !== 'published') return
    assert.equal(out.provider, 'groq')
  })

  it('respuesta inválida y sin fallback → última investigación disponible', async () => {
    const store = memoryStore({ latest: research({ id: '2026-W36' }) })
    const primary = provider('gemini', async () => ({ output: 'no es un objeto', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }))
    const out = await runDeepResearch(deps({ store, providers: { primary, fallback: null } }))
    assert.equal(out.status, 'failed')
    assert.equal((await store.readLatest())?.id, '2026-W36')
  })

  it('el material enviado al proveedor no contiene datos personales', async () => {
    let sent = ''
    const primary = provider('gemini', async (req) => {
      sent = req.system + req.user
      return { output: synthesis(), usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }
    })
    await runDeepResearch(deps({ providers: { primary, fallback: null } }))
    assert.doesNotMatch(sent, /patrimonio|liquidCents|objectives|positions|FinancialContext|amountCents/i)
    assert.match(sent, /INDICADORES/)
  })

  it('el material se compacta por debajo del límite de entrada', () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({ title: `Titular ${i} `.repeat(10), link: '', publishedAt: '2026-09-10T00:00:00Z', source: 'x' }))
    const text = compactMaterial(material({ headlines: many }), { maxChars: 20_000, coversFrom: '2026-09-05', coversTo: '2026-09-12' })
    assert.ok(text.length <= 20_000)
  })
})

describe('comprobación ligera (sin IA)', () => {
  it('detecta eventos, refresca indicadores sin tocar generatedAt y no llama a ningún proveedor', async () => {
    const latest = research({ generatedAt: '2026-09-12T06:00:00.000Z' })
    const store = memoryStore({ latest })
    const fresh = material({ indicators: latest.indicators.map((i) => (i.key === 'ibex' ? { ...i, value: 11500, asOf: '2026-09-14' } : i)) })
    const out = await runLightCheck({ store, collect: async () => fresh, now: NOW })
    assert.ok(out.events.some((e) => e.kind === 'index-move'), 'IBEX −4,2 % supera el umbral')
    assert.ok(out.events.some((e) => e.kind === 'headline'), 'titular de decisión de política monetaria')
    assert.equal(out.triggerDeep, true)
    assert.equal(out.latestUpdated, true)
    const updated = await store.readLatest()
    assert.equal(updated?.generatedAt, '2026-09-12T06:00:00.000Z')
    assert.equal(updated?.indicators.find((i) => i.key === 'ibex')?.value, 11500)
  })

  it('sin cambios relevantes no dispara la profunda ni modifica latest', async () => {
    const latest = research()
    const store = memoryStore({ latest })
    const out = await runLightCheck({ store, collect: async () => material({ headlines: [] }), now: NOW })
    assert.equal(out.events.length, 0)
    assert.equal(out.triggerDeep, false)
    assert.equal(out.latestUpdated, false)
  })

  it('con el cupo de evento agotado, detecta pero no dispara', async () => {
    let ledger = emptyLedger(NOW)
    ledger = recordAttempt(ledger, { provider: 'x', reason: 'event', newDeepResearch: true, eventResearch: true }, NOW)
    const store = memoryStore({ latest: research(), ledger })
    const out = await runLightCheck({ store, collect: async () => material(), now: NOW })
    assert.ok(out.events.length > 0)
    assert.equal(out.triggerDeep, false)
  })
})

describe('fuentes', () => {
  it('una fuente caída no rompe la recopilación y queda registrada', async () => {
    const sources: NamedSource[] = [
      { name: 'OK', run: async (ctx) => ({ source: { name: 'OK', url: 'https://ok.example', retrievedAt: ctx.now.toISOString(), type: 'data' }, indicators: [research().indicators[0]], headlines: [] }) },
      { name: 'Caída', run: async () => { throw new Error('HTTP 503') } },
    ]
    const m = await collectSources(sources, { fetch: async () => { throw new Error('no network in tests') }, now: NOW, env: {}, timeoutMs: 100 })
    assert.equal(m.indicators.length, 1)
    assert.deepEqual(m.failed, ['Caída'])
    const store = memoryStore()
    const out = await runDeepResearch(deps({ store, collect: async () => m }))
    assert.equal(out.status, 'published')
    if (out.status !== 'published') return
    assert.deepEqual(out.research.failedSources, ['Caída'])
  })

  it('investigación stale se detecta al leerla', () => {
    assert.equal(freshnessOf(research({ generatedAt: '2026-07-01T00:00:00Z' }).generatedAt, NOW), 'stale')
  })
})

describe('proveedores (sin red)', () => {
  const req: AIRequest = { system: 's', user: 'u', schema: { type: 'object' } }
  const fakeFetch = (status: number, body: unknown): typeof fetch => (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch

  it('Gemini: no envía tools ni grounding; clasifica 429 como rate-limit; parsea usage', async () => {
    let sentBody = ''
    const spy: typeof fetch = (async (_url: unknown, init?: RequestInit) => {
      sentBody = String(init?.body)
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 } }), { status: 200 })
    }) as typeof fetch
    const p = createGeminiProvider({ apiKey: 'k', fetchImpl: spy })
    const c = await p.completeWithUsage(req, { maxOutputTokens: 6000 })
    assert.deepEqual(c.output, { a: 1 })
    assert.equal(c.usage.totalTokens, 15)
    assert.doesNotMatch(sentBody, /"tools"|google_search|grounding|codeExecution/)
    assert.match(sentBody, /"maxOutputTokens":6000/)
    const limited = createGeminiProvider({ apiKey: 'k', fetchImpl: fakeFetch(429, {}) })
    await assert.rejects(limited.completeWithUsage(req, { maxOutputTokens: 100 }), (e: unknown) => e instanceof AIProviderError && e.kind === 'rate-limit')
    const truncated = createGeminiProvider({ apiKey: 'k', fetchImpl: fakeFetch(200, { candidates: [{ content: { parts: [{ text: '{' }] }, finishReason: 'MAX_TOKENS' }] }) })
    await assert.rejects(truncated.completeWithUsage(req, { maxOutputTokens: 100 }), (e: unknown) => e instanceof AIProviderError && e.kind === 'malformed')
  })

  it('Groq: usa json_schema strict, sin tools; clasifica errores', async () => {
    let sentBody = ''
    const spy: typeof fetch = (async (_url: unknown, init?: RequestInit) => {
      sentBody = String(init?.body)
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"b":2}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }), { status: 200 })
    }) as typeof fetch
    const p = createGroqProvider({ apiKey: 'k', fetchImpl: spy })
    const c = await p.completeWithUsage(req, { maxOutputTokens: 6000 })
    assert.deepEqual(c.output, { b: 2 })
    assert.match(sentBody, /"strict":true/)
    assert.doesNotMatch(sentBody, /"tools"/)
    assert.match(sentBody, /"max_completion_tokens":6000/)
    const unauthorized = createGroqProvider({ apiKey: 'k', fetchImpl: fakeFetch(401, {}) })
    await assert.rejects(unauthorized.completeWithUsage(req, { maxOutputTokens: 100 }), (e: unknown) => e instanceof AIProviderError && e.kind === 'unavailable')
  })
})
