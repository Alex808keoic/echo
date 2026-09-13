import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { assertBudget, emptyLedger, parseLedger, recordAttempt, recordUsage, rollover, isoWeek } from '../budget'
import { LIMITS } from '../limits'

const NOW = new Date('2026-09-15T10:00:00Z')

describe('presupuesto (ledger)', () => {
  it('permite una llamada con el ledger vacío', () => {
    assert.deepEqual(assertBudget(emptyLedger(NOW), { estimatedInputTokens: 5_000, newDeepResearch: true }, NOW), { allowed: true })
  })

  it('límite diario', () => {
    let l = emptyLedger(NOW)
    for (let i = 0; i < LIMITS.MAX_AI_REQUESTS_PER_DAY; i++) l = recordAttempt(l, { provider: 'x', reason: 'scheduled', newDeepResearch: false }, NOW)
    const d = assertBudget(l, { estimatedInputTokens: 100, newDeepResearch: false }, NOW)
    assert.equal(d.allowed, false)
    assert.match(d.allowed ? '' : d.reason, /diario/)
    // Al día siguiente vuelve a permitir.
    const tomorrow = new Date('2026-09-16T10:00:00Z')
    assert.equal(assertBudget(l, { estimatedInputTokens: 100, newDeepResearch: false }, tomorrow).allowed, true)
  })

  it('límite mensual de llamadas', () => {
    let l = emptyLedger(NOW)
    for (let i = 0; i < LIMITS.MAX_AI_REQUESTS_PER_MONTH; i++) {
      const day = new Date(Date.UTC(2026, 8, 1 + i, 10))
      l = recordAttempt(l, { provider: 'x', reason: 'scheduled', newDeepResearch: false }, day)
    }
    const d = assertBudget(l, { estimatedInputTokens: 100, newDeepResearch: false }, new Date('2026-09-20T10:00:00Z'))
    assert.equal(d.allowed, false)
    assert.match(d.allowed ? '' : d.reason, /mensual de llamadas/)
    assert.equal(assertBudget(l, { estimatedInputTokens: 100, newDeepResearch: false }, new Date('2026-10-01T10:00:00Z')).allowed, true)
  })

  it('límite mensual de investigaciones profundas', () => {
    let l = emptyLedger(NOW)
    for (let i = 0; i < LIMITS.MAX_DEEP_RESEARCH_PER_MONTH; i++) {
      l = recordAttempt(l, { provider: 'x', reason: 'scheduled', newDeepResearch: true }, new Date(Date.UTC(2026, 8, 1 + i * 2, 10)))
    }
    const d = assertBudget(l, { estimatedInputTokens: 100, newDeepResearch: true }, new Date('2026-09-20T10:00:00Z'))
    assert.equal(d.allowed, false)
    assert.match(d.allowed ? '' : d.reason, /profundas/)
  })

  it('límite de tokens por llamada y por mes', () => {
    const l = emptyLedger(NOW)
    const big = assertBudget(l, { estimatedInputTokens: LIMITS.MAX_INPUT_TOKENS + 1, newDeepResearch: true }, NOW)
    assert.equal(big.allowed, false)
    assert.match(big.allowed ? '' : big.reason, /MAX_INPUT_TOKENS/)
    const used = recordUsage(recordAttempt(l, { provider: 'x', reason: 'scheduled', newDeepResearch: true }, NOW), { ok: true, totalTokens: LIMITS.MAX_TOTAL_TOKENS - 1000 })
    const month = assertBudget(used, { estimatedInputTokens: 500, newDeepResearch: false }, NOW)
    assert.equal(month.allowed, false)
    assert.match(month.allowed ? '' : month.reason, /MAX_TOTAL_TOKENS/)
  })

  it('ledger corrupto → bloqueado (nunca se repara a cero)', () => {
    assert.equal(parseLedger('basura'), null)
    assert.equal(parseLedger({ version: 1, month: '2026-09', monthCalls: -1 }), null)
    assert.equal(parseLedger({ version: 2 }), null)
    const d = assertBudget(null, { estimatedInputTokens: 10, newDeepResearch: true }, NOW)
    assert.equal(d.allowed, false)
    assert.match(d.allowed ? '' : d.reason, /corrupto/)
  })

  it('doble llamada: el intento se registra antes y la segunda comprobación lo ve', () => {
    let l = emptyLedger(NOW)
    l = recordAttempt(l, { provider: 'gemini', reason: 'scheduled', newDeepResearch: true }, NOW)
    l = recordAttempt(l, { provider: 'groq', reason: 'scheduled', newDeepResearch: false }, NOW)
    assert.equal(l.dayCalls, 2)
    assert.equal(l.monthCalls, 2)
    assert.equal(l.deepResearchThisMonth, 1)
    assert.equal(assertBudget(l, { estimatedInputTokens: 10, newDeepResearch: false }, NOW).allowed, false)
  })

  it('el reintento cuenta aunque la primera llamada fallara por red', () => {
    let l = emptyLedger(NOW)
    l = recordAttempt(l, { provider: 'gemini', reason: 'scheduled', newDeepResearch: true }, NOW)
    l = recordUsage(l, { ok: false, totalTokens: 0 })
    l = recordAttempt(l, { provider: 'groq', reason: 'scheduled', newDeepResearch: false }, NOW)
    assert.equal(l.monthCalls, 2)
    assert.equal(l.attempts[0].ok, false)
    assert.equal(l.attempts.length, 2)
  })

  it('cupo semanal de investigaciones por evento', () => {
    let l = emptyLedger(NOW)
    l = recordAttempt(l, { provider: 'gemini', reason: 'event', newDeepResearch: true, eventResearch: true }, NOW)
    const d = assertBudget(l, { estimatedInputTokens: 10, newDeepResearch: true, eventResearch: true }, NOW)
    assert.equal(d.allowed, false)
    assert.match(d.allowed ? '' : d.reason, /evento/)
    const nextWeek = new Date('2026-09-22T10:00:00Z')
    assert.notEqual(isoWeek(NOW), isoWeek(nextWeek))
    assert.equal(rollover(l, nextWeek).eventResearchThisWeek, 0)
  })
})
