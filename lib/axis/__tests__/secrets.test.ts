/**
 * Higiene de secretos (fase 2 · bloque 1): nada detectable como credencial,
 * clave, IBAN o tarjeta se persiste ni sale del dispositivo. Sin secretos, el
 * comportamiento es idéntico (mismas referencias, mismos textos).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AI_ENGINE_INFO } from '../ai-engine'
import { chatWithProvider } from '../ai/server/analyze'
import { browserChatTransport } from '../chat/browser-transport'
import { appendMessage, EMPTY_CONVERSATION, windowForModel } from '../chat/history'
import { looksLikeSecret, REDACTED, redactChatInput, redactMemory, redactSecrets, redactWindow } from '../chat/secrets'
import type { ChatInput, ChatMessage, ConversationState } from '../chat/types'
import { parseChatReply } from '../chat/validate'
import { buildFinancialContext } from '../context'
import type { MarketAIProvider } from '../../ai/providers/types'
import { config, healthyMovements, NOW, objective, snapshot, TODAY } from './fixtures'

const SECRETS = [
  ['IBAN', 'mi cuenta ES91 2100 0418 4502 0005 1332 tiene poco saldo'],
  ['tarjeta', 'la tarjeta 4111 1111 1111 1111 caduca pronto'],
  ['contraseña', 'Mi contraseña del banco es hola123. ¿Puedo invertir 100 €?'],
  ['PIN', 'el PIN es 1234'],
  ['clave API', 'la api key es AIzaSyD1234567890abcdefghijklmnop'],
  ['token', 'token sk-abcdefghijklmnopqrstuvwxyz'],
] as const

const NORMAL = [
  'Este mes ahorras 1.300,00 €: un 65% de tus ingresos (2.000,00 €).',
  'Quiero mantener 200 € de colchón hasta 2027-01-15.',
  'He gastado 42.000 céntimos en comida, unos 420,00 €, en 12 movimientos.',
  'La clave es ahorrar 150 € al mes hasta diciembre.',
  '¿Cómo ves mi situación este mes?',
]

const context = () => buildFinancialContext(snapshot({ config: config(150_000), movements: healthyMovements(), objectives: [objective({ name: 'Viaje', targetCents: 100_000, currentCents: 30_000 })] }), TODAY)
const msg = (role: ChatMessage['role'], text: string, i: number): ChatMessage => ({ id: `m${i}`, role, text, createdAt: NOW.getTime() + i })

describe('AXIS chat · redactSecrets', () => {
  it('redacta IBAN, tarjeta, contraseña, PIN y claves; el resto de la frase se conserva', () => {
    for (const [kind, text] of SECRETS) {
      const out = redactSecrets(text)
      assert.ok(out.redacted >= 1, kind)
      assert.ok(out.text.includes(REDACTED), kind)
      assert.equal(looksLikeSecret(out.text), false, `${kind}: sigue detectándose tras redactar`)
    }
    assert.equal(redactSecrets(SECRETS[2][1]).text, `Mi ${REDACTED}. ¿Puedo invertir 100 €?`, 'el valor que sigue a «contraseña» cae con la frase; lo demás se conserva')
    assert.equal(redactSecrets(SECRETS[0][1]).text, `mi cuenta ${REDACTED} tiene poco saldo`)
    assert.equal(redactSecrets('Mi contraseña es hola123, ¿qué opinas de mis gastos?').text, `Mi ${REDACTED}, ¿qué opinas de mis gastos?`, 'la coma cierra el valor')
    assert.equal(redactSecrets('La tarjeta 4111 1111 1111 1111 y el IBAN ES91 2100 0418 4502 0005 1332').redacted, 2)
  })

  it('tarjeta e IBAN se detectan y redactan con y sin puntuación; un decimal largo no es una tarjeta', () => {
    const cards: Array<[string, string]> = [
      ['tarjeta + punto final', 'mi tarjeta es 4111 1111 1111 1111.'],
      ['tarjeta + coma', 'tarjeta 4111 1111 1111 1111, caduca pronto'],
      ['tarjeta sin puntuación', 'la tarjeta 4111 1111 1111 1111 caduca'],
      ['tarjeta sin espacios + punto', 'tarjeta 4111111111111111.'],
      ['tarjeta con guiones', 'tarjeta 4111-1111-1111-1111'],
      ['tarjeta entre paréntesis', 'la tarjeta (4111 1111 1111 1111) es de crédito'],
      ['IBAN + punto', 'mi cuenta es ES91 2100 0418 4502 0005 1332.'],
      ['IBAN + coma', 'cuenta ES91 2100 0418 4502 0005 1332, la de siempre'],
      ['IBAN sin espacios', 'IBAN ES9121000418450200051332'],
    ]
    for (const [name, text] of cards) {
      assert.equal(looksLikeSecret(text), true, `no detecta: ${name}`)
      const out = redactSecrets(text)
      assert.ok(out.text.includes(REDACTED), name)
      assert.equal(/4111|1332|ES91|418450/.test(out.text), false, `queda rastro: ${name} → ${out.text}`)
    }
    assert.equal(redactSecrets('mi tarjeta es 4111 1111 1111 1111.').text, `mi tarjeta es ${REDACTED}.`, 'la puntuación se conserva')
    assert.equal(redactSecrets('tarjeta 4111 1111 1111 1111, caduca pronto').text, `tarjeta ${REDACTED}, caduca pronto`)
    for (const decimal of ['expenseChangePct":-6.666666666666667,"history', 'un ratio de 0.3333333333333333 sobre el total', 'valor 12345678901234.5 no es tarjeta', '1234567890123,25 tampoco']) {
      assert.equal(looksLikeSecret(decimal), false, `falso positivo: ${decimal}`)
      assert.equal(redactSecrets(decimal).text, decimal)
    }
  })

  it('looksLikeSecret mantiene el comportamiento anterior sobre los casos ya cubiertos', () => {
    for (const [text, expected] of [
      ['Mi contraseña del banco es hola123', true],
      ['password: abc', true],
      ['la api key es AIzaSyD1234567890abcdefghijklmnop', true],
      ['token sk-abcdefghijklmnopqrstuvwxyz', true],
      ['mi cuenta ES91 2100 0418 4502 0005 1332', true],
      ['tarjeta 4111 1111 1111 1111', true],
      ['el PIN es 1234', true],
      ['Quiere mantener 200 € de liquidez mínima.', false],
      ['La clave es ahorrar 150 € al mes hasta diciembre.', false],
      ['tengo 1234567890123 céntimos', true],
    ] as const) {
      assert.equal(looksLikeSecret(text), expected, text)
    }
  })

  it('sin secretos, devuelve el mismo texto (misma referencia) y no toca cifras financieras normales', () => {
    for (const text of NORMAL) {
      const out = redactSecrets(text)
      assert.equal(out.redacted, 0, text)
      assert.equal(out.text, text)
    }
  })
})

describe('AXIS chat · redacción antes de persistir y de enviar', () => {
  const secretMessage = 'Mi contraseña del banco es hola123, ¿qué opinas de mis gastos?'
  const secretRecent = 'Mi IBAN es ES91 2100 0418 4502 0005 1332'
  const state = (): ConversationState => [msg('user', secretRecent, 1), msg('axis', 'No lo guardo.', 2)].reduce(appendMessage, EMPTY_CONVERSATION)

  it('windowForModel redacta mensajes recientes y resumen', () => {
    const window = windowForModel({ ...state(), summary: 'Usuario: la tarjeta 4111 1111 1111 1111 · AXIS: vale' })
    assert.equal(window.recent[0].text, `Mi IBAN es ${REDACTED}`)
    assert.equal(window.summary, `Usuario: la tarjeta ${REDACTED} · AXIS: vale`)
    assert.equal(window.recent[1].text, 'No lo guardo.')
  })

  it('redactWindow / redactMemory / redactChatInput devuelven la misma referencia cuando no hay nada que redactar', () => {
    const window = windowForModel(state())
    assert.equal(redactWindow(window), window)
    const memory = { userMemories: [{ id: 'a', content: 'Prefiere liquidez.', category: 'preference', importance: 'high', fecha: '2026-09-01' }], previousConclusions: [{ generatedAt: NOW.toISOString(), summary: 'Lectura anterior.' }] }
    assert.equal(redactMemory(memory), memory)
    const input: ChatInput = { context: context(), market: null, memory, conversation: window, message: '¿Cómo voy?' }
    assert.equal(redactChatInput(input), input)
  })

  it('el cuerpo que sale por fetch no contiene ningún secreto (mensaje, recent, summary, memorias, conclusiones)', async () => {
    const input: ChatInput = {
      context: context(),
      market: null,
      memory: {
        userMemories: [{ id: 'a', content: 'Su PIN es 1234 y quiere ahorrar.', category: 'context', importance: 'low', fecha: '2026-09-01' }],
        previousConclusions: [{ generatedAt: NOW.toISOString(), summary: 'token gsk_abcdefghijklmnopqrstuvwxyz123' }],
      },
      conversation: { summary: 'Usuario: password: abc', recent: [{ role: 'user', text: secretRecent }] },
      message: secretMessage,
    }
    let body = ''
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      body = String(init?.body ?? '')
      return new Response(JSON.stringify({ reply: parseChatReply({ reply: 'ok', confidence: 'media', nextStep: null, memoryProposal: null, engine: AI_ENGINE_INFO, generatedAt: NOW.toISOString() }) }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    try {
      await browserChatTransport.ask(input, new AbortController().signal)
    } finally {
      globalThis.fetch = realFetch
    }
    assert.ok(body.length > 0)
    for (const needle of ['hola123', 'ES91', '4111', 'PIN es 1234', 'gsk_', 'password: abc']) assert.equal(body.includes(needle), false, needle)
    assert.equal(looksLikeSecret(body), false)
    assert.ok(body.includes(REDACTED))
    assert.match(body, /qué opinas de mis gastos/, 'lo que sigue a la coma se conserva')
    assert.ok(body.includes('Viaje'), 'el contexto financiero viaja íntegro')
  })

  it('el servidor vuelve a redactar antes de construir el prompt (defensa en profundidad)', async () => {
    let seen = ''
    const provider: MarketAIProvider = {
      id: 'mock',
      model: 'mock',
      completeWithUsage: async (request) => {
        seen = request.user
        return { output: { reply: 'Con lo que sabemos ahora, yo vigilaría ese gasto.', confidence: 'media', nextStep: null, memoryProposal: null }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }
      },
      complete: async () => ({}),
    }
    const input: ChatInput = { context: context(), market: null, memory: undefined, conversation: { summary: 'Usuario: mi cuenta ES91 2100 0418 4502 0005 1332', recent: [{ role: 'user', text: 'la tarjeta 4111 1111 1111 1111' }] }, message: secretMessage }
    const reply = await chatWithProvider(provider, input)
    assert.equal(reply.engine.isAI, true)
    for (const needle of ['hola123', 'ES91', '4111']) assert.equal(seen.includes(needle), false, needle)
    assert.ok(seen.includes(REDACTED))
  })
})
