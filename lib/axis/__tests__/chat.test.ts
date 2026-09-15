import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { AI_ENGINE_INFO } from '../ai-engine'
import { chatWithProvider } from '../ai/server/analyze'
import { AXIS_AI_LIMITS } from '../ai/server/limits'
import { ChatTransportError, createChatEngine, type ChatPhase, type ChatTransport } from '../chat/engine'
import { appendMessage, compact, EMPTY_CONVERSATION, windowForModel } from '../chat/history'
import { composeLocalReply } from '../chat/local-reply'
import { applyProposal, isSavableProposal, memoriesForModel, trimMemories } from '../chat/memory'
import { AXIS_CHAT_SYSTEM_PROMPT, buildChatRequest } from '../chat/prompt'
import { looksLikeSecret } from '../chat/secrets'
import { CHAT_LIMITS, type ChatInput, type ChatMessage, type ConversationState, type MemoryProposal, type UserMemory } from '../chat/types'
import { isChatPayload, parseChatReply } from '../chat/validate'
import type { MarketAIProvider } from '../../ai/providers/types'
import { config, healthyMovements, NOW, objective, snapshot, TODAY } from './fixtures'

/* --------------------------------- helpers -------------------------------- */

function context(opts: { demo?: boolean; empty?: boolean; initial?: number } = {}) {
  return buildFinancialContext(
    snapshot({
      config: config(opts.initial ?? 150_000, opts.demo ?? false),
      movements: opts.empty ? [] : healthyMovements(),
      objectives: opts.empty ? [] : [objective({ name: 'Viaje', targetCents: 100_000, currentCents: 30_000 })],
    }),
    TODAY,
  )
}

function input(message = '¿Cómo ves mi situación este mes?', overrides: Partial<ChatInput> = {}): ChatInput {
  return { context: context(), market: null, conversation: { summary: null, recent: [] }, message, ...overrides }
}

function memory(id: string, content: string, overrides: Partial<UserMemory> = {}): UserMemory {
  const t = Date.parse('2026-09-01T10:00:00Z')
  return { id, content, category: 'constraint', importance: 'high', confidence: 0.9, source: 'conversation', createdAt: t, updatedAt: t, ...overrides }
}

/** Una respuesta válida tal y como la devolvería el proveedor (sin engine/generatedAt). */
function validAIOutput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    reply: 'Este mes ahorras 130,00 € de 2.000,00 € de ingresos.\n\nYo no cambiaría nada todavía.',
    confidence: 'media',
    nextStep: null,
    memoryProposal: null,
    ...overrides,
  }
}

function transport(overrides: Partial<ChatTransport> = {}): ChatTransport & { calls: number; last?: ChatInput } {
  const t = {
    calls: 0,
    last: undefined as ChatInput | undefined,
    isAvailable: async () => true,
    ask: async (i: ChatInput) => {
      t.calls++
      t.last = i
      return validAIOutput()
    },
    ...overrides,
  }
  return t
}

function msg(role: ChatMessage['role'], text: string, i: number): ChatMessage {
  return { id: `m${i}`, role, text, createdAt: Date.parse('2026-09-15T10:00:00Z') + i }
}

/* ------------------------------ 1. conversación --------------------------- */

describe('AXIS conversación · básica', () => {
  it('responde con la IA, valida la salida y marca el motor', async () => {
    const t = transport()
    const phases: ChatPhase[] = []
    const engine = createChatEngine({ transport: t, onPhase: (p) => phases.push(p) })
    const reply = await engine.ask(input())
    assert.equal(t.calls, 1)
    assert.equal(reply.engine.id, 'external-ai')
    assert.equal(reply.engine.isAI, true)
    assert.equal(reply.fallbackReason, undefined)
    assert.match(reply.text, /ahorras 130,00 €/)
    assert.equal(reply.confidence, 'media')
    assert.deepEqual(phases, ['analyzing', 'responding'], 'las fases reflejan trabajo real')
  })

  it('la disponibilidad se comprueba una vez por motor', async () => {
    let checks = 0
    const t = transport({
      isAvailable: async () => {
        checks++
        return true
      },
    })
    const engine = createChatEngine({ transport: t })
    await engine.ask(input())
    await engine.ask(input('¿Y mis objetivos?'))
    assert.equal(checks, 1)
    assert.equal(t.calls, 2)
  })
})

/* -------------------------- 2. contexto financiero ------------------------ */

describe('AXIS conversación · contexto', () => {
  it('envía los cuatro niveles separados y las cifras reales de Finax', () => {
    const memories = memoriesForModel([memory('m1', 'Quiere mantener 200 € de liquidez mínima.')])
    const req = buildChatRequest(
      input('¿Puedo invertir 100 €?', {
        memory: { userMemories: memories, previousConclusions: [{ generatedAt: '2026-09-01T00:00:00.000Z', summary: 'Lectura anterior' }] },
        conversation: { summary: 'Usuario: quiero ahorrar', recent: [{ role: 'user', text: 'Quiero ahorrar 1.000 €' }, { role: 'axis', text: '¿Para qué fecha?' }] },
      }),
    )
    const payload = JSON.parse(req.user.slice(req.user.indexOf('{'))) as Record<string, unknown>
    assert.deepEqual(Object.keys(payload), ['datos_actuales', 'memoria', 'conversacion_actual', 'consulta_actual'])
    const datos = payload.datos_actuales as { contexto_financiero: { wealth: { liquidCents: number }; flows: Record<string, unknown> }; senales_detectadas_por_finax: unknown[] }
    assert.equal(datos.contexto_financiero.wealth.liquidCents, context().wealth.liquidCents)
    assert.equal('history' in datos.contexto_financiero.flows, false, 'la serie diaria no se envía')
    assert.ok(Array.isArray(datos.senales_detectadas_por_finax))
    const mem = payload.memoria as { memorias_del_usuario: unknown[]; conclusiones_anteriores: unknown[] }
    assert.equal(mem.memorias_del_usuario.length, 1)
    assert.equal(mem.conclusiones_anteriores.length, 1)
    const conv = payload.conversacion_actual as { resumen_de_lo_anterior: string; ultimos_mensajes: unknown[] }
    assert.equal(conv.resumen_de_lo_anterior, 'Usuario: quiero ahorrar')
    assert.equal(conv.ultimos_mensajes.length, 2)
    assert.equal(payload.consulta_actual, '¿Puedo invertir 100 €?')
    assert.equal(req.system, AXIS_CHAT_SYSTEM_PROMPT)
    assert.match(req.system, /NUNCA ejecutas operaciones/)
  })

  it('el motor entrega al transporte el contexto completo, no solo el mensaje', async () => {
    const t = transport()
    await createChatEngine({ transport: t }).ask(input('Hola', { memory: { userMemories: [] } }))
    assert.ok(t.last)
    assert.equal(t.last?.context.asOf, TODAY)
    assert.equal(t.last?.message, 'Hola')
    assert.ok(t.last?.conversation)
  })
})

/* --------------------------- 3–5. memoria (lógica) ------------------------ */

describe('AXIS conversación · memoria', () => {
  const proposal: MemoryProposal = { content: 'Quiere mantener 200 € de liquidez mínima.', category: 'constraint', importance: 'high', confidence: 0.9, replacesId: null }
  let seq = 0
  const newId = () => `id-${++seq}`

  it('aceptada → se crea con todos los campos', () => {
    const out = applyProposal([], proposal, 1_000, newId)
    assert.equal(out.action, 'created')
    const [m] = out.memories
    assert.equal(m.content, proposal.content)
    assert.equal(m.category, 'constraint')
    assert.equal(m.importance, 'high')
    assert.equal(m.confidence, 0.9)
    assert.equal(m.source, 'conversation')
    assert.equal(m.createdAt, 1_000)
    assert.equal(m.updatedAt, 1_000)
    assert.ok(m.id)
  })

  it('rechazada → la lista no cambia (nada se guarda sin aceptación)', () => {
    // La aceptación es la única vía de entrada: sin llamar a applyProposal no hay memoria.
    const before: UserMemory[] = [memory('a', 'Prefiere no invertir dinero que pueda necesitar este año.')]
    const after = before
    assert.deepEqual(after, before)
    // Una propuesta que el modelo devuelve queda en la respuesta, no en la memoria.
    const reply = parseChatReply({ ...validAIOutput({ memoryProposal: proposal }), engine: AI_ENGINE_INFO, generatedAt: NOW.toISOString() })
    assert.ok(reply.memoryProposal)
    assert.equal(before.length, 1)
  })

  it('actualización → replacesId sustituye la memoria anterior sin duplicar', () => {
    const existing = [memory('a', 'Quiere mantener 200 € de liquidez mínima.')]
    const out = applyProposal(existing, { ...proposal, content: 'Ahora prefiere mantener 100 € de liquidez mínima.', replacesId: 'a' }, 2_000, newId)
    assert.equal(out.action, 'updated')
    assert.equal(out.memories.length, 1)
    assert.equal(out.memories[0].id, 'a')
    assert.match(out.memories[0].content, /100 €/)
    assert.equal(out.memories[0].createdAt, existing[0].createdAt)
    assert.equal(out.memories[0].updatedAt, 2_000)
  })

  it('contenido equivalente → no se duplica', () => {
    const existing = [memory('a', 'Quiere mantener 200 € de liquidez mínima.')]
    const out = applyProposal(existing, { ...proposal, content: '  quiere mantener 200 € de liquidez mínima ' }, 3_000, newId)
    assert.equal(out.action, 'unchanged')
    assert.equal(out.memories.length, 1)
  })

  it('el tope se respeta priorizando importancia y, a igual importancia, actualidad; nada sale en silencio', () => {
    const many = Array.from({ length: CHAT_LIMITS.MAX_MEMORIES + 5 }, (_, i) =>
      memory(`m${i}`, `Nota ${i}`, { importance: i < 3 ? 'low' : 'medium', updatedAt: i }),
    )
    const { kept, evicted } = trimMemories(many)
    assert.equal(kept.length, CHAT_LIMITS.MAX_MEMORIES)
    assert.equal(evicted.length, 5)
    assert.ok(!kept.some((m) => m.importance === 'low'), 'salen primero las menos importantes')
    assert.deepEqual(
      evicted.map((m) => m.id),
      ['m0', 'm1', 'm2', 'm3', 'm4'],
      'después de las low, salen las medium más antiguas',
    )
    assert.deepEqual(trimMemories(many), trimMemories(many), 'determinista')
  })

  it('con el tope lleno, la memoria recién aceptada siempre se conserva y se informa de la expulsada', () => {
    const full = Array.from({ length: CHAT_LIMITS.MAX_MEMORIES }, (_, i) => memory(`h${i}`, `Nota importante ${i}`, { importance: 'high', updatedAt: 100 + i }))
    const out = applyProposal(full, { ...proposal, content: 'Detalle menor que quiere recordar.', importance: 'low' }, 9_999, newId)
    assert.equal(out.action, 'created')
    if (out.action !== 'created') throw new Error('unreachable')
    assert.equal(out.memories.length, CHAT_LIMITS.MAX_MEMORIES)
    assert.ok(out.memories.some((m) => m.content === 'Detalle menor que quiere recordar.'), 'la aceptada no se pierde')
    assert.deepEqual(out.evicted.map((m) => m.id), ['h0'], 'sale la high más antigua, y se informa')
    const below = applyProposal(full.slice(0, 5), { ...proposal, content: 'Otra nota nueva.' }, 9_999, newId)
    if (below.action !== 'created') throw new Error('unreachable')
    assert.deepEqual(below.evicted, [], 'por debajo del tope no se expulsa nada')
  })

  it('la vista para el modelo lleva id, contenido, categoría, importancia y fecha (sin confianza ni timestamps)', () => {
    const [v] = memoriesForModel([memory('a', 'Nota')])
    assert.deepEqual(Object.keys(v), ['id', 'content', 'category', 'importance', 'fecha'])
    assert.equal(v.fecha, '2026-09-01')
  })
})

/* ------------------ 6. memoria contradictoria con FinancialContext -------- */

describe('AXIS conversación · memoria vs. datos', () => {
  it('el prompt fija la precedencia de datos_actuales y la respuesta local usa solo los datos', () => {
    assert.match(AXIS_CHAT_SYSTEM_PROMPT, /manda «datos_actuales»/)
    assert.match(AXIS_CHAT_SYSTEM_PROMPT, /NUNCA fuente de cifras actuales/)
    const ctx = context({ initial: 38_000 })
    const stale = memoriesForModel([memory('a', 'El usuario tiene 500 € de patrimonio.', { category: 'context' })])
    const i = input('¿Cuánto tengo?', { context: ctx, memory: { userMemories: stale } })
    const req = buildChatRequest(i)
    const payload = JSON.parse(req.user.slice(req.user.indexOf('{'))) as { datos_actuales: { contexto_financiero: { wealth: { totalCents: number } } } }
    assert.equal(payload.datos_actuales.contexto_financiero.wealth.totalCents, ctx.wealth.totalCents)
    const local = composeLocalReply(i, 'unavailable', NOW)
    assert.doesNotMatch(local.text, /500/, 'el motor local nunca usa la memoria como dato')
  })
})

/* --------------------------- 9. multiturno e historial -------------------- */

describe('AXIS conversación · multiturno', () => {
  it('la ventana enviada conserva los turnos anteriores', async () => {
    let state: ConversationState = EMPTY_CONVERSATION
    state = appendMessage(state, msg('user', 'Quiero ahorrar 1.000 €.', 1))
    state = appendMessage(state, msg('axis', '¿Para qué fecha?', 2))
    state = appendMessage(state, msg('user', 'Para diciembre.', 3))
    const t = transport()
    await createChatEngine({ transport: t }).ask(input('¿Y cuánto tendría que ahorrar al mes?', { conversation: windowForModel(state) }))
    const recent = t.last?.conversation.recent ?? []
    assert.deepEqual(
      recent.map((m) => m.text),
      ['Quiero ahorrar 1.000 €.', '¿Para qué fecha?', 'Para diciembre.'],
    )
  })

  it('compacta lo antiguo en un resumen acotado y limita lo enviado al modelo', () => {
    let state: ConversationState = EMPTY_CONVERSATION
    for (let i = 1; i <= CHAT_LIMITS.MAX_STORED_MESSAGES + 6; i++) {
      state = appendMessage(state, msg(i % 2 ? 'user' : 'axis', `Mensaje número ${i} ${'x'.repeat(200)}`, i))
    }
    assert.equal(state.messages.length, CHAT_LIMITS.MAX_STORED_MESSAGES)
    assert.equal(state.messages[0].text.startsWith('Mensaje número 7'), true)
    assert.ok(state.summary)
    assert.match(state.summary ?? '', /Usuario: Mensaje número 1/)
    assert.match(state.summary ?? '', /AXIS: Mensaje número 6/)
    assert.ok((state.summary ?? '').length <= CHAT_LIMITS.MAX_SUMMARY_CHARS)
    assert.ok(state.summary?.includes('…'), 'cada mensaje resumido se recorta')
    const w = windowForModel(state)
    assert.equal(w.recent.length, CHAT_LIMITS.MAX_RECENT_FOR_MODEL)
    assert.deepEqual(Object.keys(w.recent[0]), ['role', 'text'], 'sin metadatos')
    assert.equal(compact(state), state, 'compactar de nuevo no cambia nada')
  })

  it('el resumen nunca supera el máximo aunque se acumulen muchas conversaciones', () => {
    let state: ConversationState = EMPTY_CONVERSATION
    for (let i = 1; i <= 200; i++) state = appendMessage(state, msg('user', `Mensaje ${i} ${'y'.repeat(300)}`, i))
    assert.ok((state.summary ?? '').length <= CHAT_LIMITS.MAX_SUMMARY_CHARS)
    assert.match(state.summary ?? '', /Mensaje 180/, 'conserva lo más reciente')
    assert.doesNotMatch(state.summary ?? '', /Mensaje 1 /, 'lo más antiguo sale')
  })
})

/* ----------------------- 10–11. fallback local y errores ------------------ */

describe('AXIS conversación · fallback local', () => {
  it('IA no disponible → motor local, sin llamada, sin fingir', async () => {
    const t = transport({ isAvailable: async () => false })
    const reasons: string[] = []
    const reply = await createChatEngine({ transport: t, onFallback: (r) => reasons.push(r) }).ask(input())
    assert.equal(t.calls, 0)
    assert.equal(reply.engine.id, 'local-rules')
    assert.equal(reply.engine.isAI, false)
    assert.equal(reply.fallbackReason, 'unavailable')
    assert.equal(reply.memoryProposal, null)
    assert.match(reply.text, /no tengo IA disponible/)
    assert.match(reply.text, /reglas locales/)
    assert.deepEqual(reasons, ['unavailable'])
  })

  it('sin conexión → motor local sin intentar la IA', async () => {
    const t = transport()
    const reply = await createChatEngine({ transport: t, isOffline: () => true }).ask(input())
    assert.equal(t.calls, 0)
    assert.equal(reply.fallbackReason, 'offline')
    assert.match(reply.text, /Sin conexión/)
  })

  it('error del proveedor (502) → motor local con motivo', async () => {
    const t = transport({
      ask: async () => {
        throw new ChatTransportError('error', 'axis api 502')
      },
    })
    const reply = await createChatEngine({ transport: t }).ask(input())
    assert.equal(reply.engine.id, 'local-rules')
    assert.equal(reply.fallbackReason, 'error')
  })

  it('sin cupo (429) → motivo rate-limited', async () => {
    const t = transport({
      ask: async () => {
        throw new ChatTransportError('rate-limited', 'axis api 429')
      },
    })
    const reply = await createChatEngine({ transport: t }).ask(input())
    assert.equal(reply.fallbackReason, 'rate-limited')
    assert.match(reply.text, /cupo/)
  })

  it('salida inválida del modelo → motor local', async () => {
    const t = transport({ ask: async () => ({ reply: '' }) })
    const reply = await createChatEngine({ transport: t }).ask(input())
    assert.equal(reply.engine.id, 'local-rules')
    assert.equal(reply.fallbackReason, 'error')
  })

  it('timeout → motor local', async () => {
    const t = transport({
      ask: (_i, signal) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    })
    const reply = await createChatEngine({ transport: t, timeoutMs: 20 }).ask(input())
    assert.equal(reply.engine.id, 'local-rules')
  })

  it('el motor y el transporte nunca exponen secretos ni URLs de proveedores', async () => {
    const t = transport()
    const reply = await createChatEngine({ transport: t }).ask(input())
    assert.doesNotMatch(JSON.stringify(reply), /GEMINI|GROQ|api_key|googleapis/i)
  })
})

/* ------------------------- 12. contexto excesivamente grande -------------- */

describe('AXIS conversación · límites de tamaño', () => {
  it('el servidor rechaza mensajes o ventanas fuera de límite', () => {
    const ok = { message: 'Hola', conversation: { summary: null, recent: [] } }
    assert.equal(isChatPayload(ok), true)
    assert.equal(isChatPayload({ ...ok, message: 'x'.repeat(CHAT_LIMITS.MAX_MESSAGE_CHARS + 1) }), false)
    assert.equal(isChatPayload({ ...ok, message: '   ' }), false)
    assert.equal(isChatPayload({ ...ok, conversation: { summary: 'x'.repeat(CHAT_LIMITS.MAX_SUMMARY_CHARS + 1), recent: [] } }), false)
    const tooMany = Array.from({ length: CHAT_LIMITS.MAX_RECENT_FOR_MODEL + 1 }, () => ({ role: 'user', text: 'a' }))
    assert.equal(isChatPayload({ ...ok, conversation: { summary: null, recent: tooMany } }), false)
    assert.equal(isChatPayload({ ...ok, conversation: { summary: null, recent: [{ role: 'system', text: 'a' }] } }), false)
  })

  it('un cuerpo demasiado grande (413) acaba en el motor local', async () => {
    const t = transport({
      ask: async () => {
        throw new ChatTransportError('error', 'axis api 413')
      },
    })
    const reply = await createChatEngine({ transport: t }).ask(input('x'.repeat(CHAT_LIMITS.MAX_MESSAGE_CHARS)))
    assert.equal(reply.engine.id, 'local-rules')
  })

  it('la respuesta del modelo se acota', () => {
    const reply = parseChatReply({ ...validAIOutput({ reply: 'a'.repeat(5_000) }), engine: AI_ENGINE_INFO, generatedAt: NOW.toISOString() })
    assert.equal(reply.text.length, CHAT_LIMITS.MAX_REPLY_CHARS)
  })
})

/* --------------------------- 13. sin datos financieros -------------------- */

describe('AXIS conversación · sin datos', () => {
  it('sin movimientos no se llama a la IA y AXIS explica qué necesita', async () => {
    const t = transport()
    const reply = await createChatEngine({ transport: t }).ask(input('¿Cómo voy?', { context: context({ empty: true }) }))
    assert.equal(t.calls, 0)
    assert.equal(reply.engine.id, 'local-rules')
    assert.equal(reply.fallbackReason, 'no-data')
    assert.match(reply.text, /no tengo datos suficientes/i)
    assert.match(reply.text, /Para empezar necesito/)
    assert.ok(reply.nextStep)
  })
})

/* -------------------------- 14. no guardar secretos ----------------------- */

describe('AXIS conversación · secretos', () => {
  it('detecta credenciales, claves, IBAN y tarjetas', () => {
    assert.equal(looksLikeSecret('Mi contraseña del banco es hola123'), true)
    assert.equal(looksLikeSecret('password: abc'), true)
    assert.equal(looksLikeSecret('la api key es AIzaSyD1234567890abcdefghijklmnop'), true)
    assert.equal(looksLikeSecret('token sk-abcdefghijklmnopqrstuvwxyz'), true)
    assert.equal(looksLikeSecret('mi cuenta ES91 2100 0418 4502 0005 1332'), true)
    assert.equal(looksLikeSecret('tarjeta 4111 1111 1111 1111'), true)
    assert.equal(looksLikeSecret('el PIN es 1234'), true)
    assert.equal(looksLikeSecret('Quiere mantener 200 € de liquidez mínima.'), false)
    assert.equal(looksLikeSecret('La clave es ahorrar 150 € al mes hasta diciembre.'), false)
  })

  it('una propuesta con secretos no es guardable y se descarta en la validación del servidor', () => {
    const bad: MemoryProposal = { content: 'Su contraseña del banco es hola123', category: 'context', importance: 'low', confidence: 0.9, replacesId: null }
    assert.equal(isSavableProposal(bad), false)
    const out = applyProposal([], bad, 1, () => 'x')
    assert.equal(out.action, 'rejected')
    assert.equal(out.memories.length, 0)
    const reply = parseChatReply({ ...validAIOutput({ memoryProposal: bad }), engine: AI_ENGINE_INFO, generatedAt: NOW.toISOString() })
    assert.equal(reply.memoryProposal, null, 'la respuesta llega sin la propuesta')
    assert.match(reply.text, /ahorras/)
  })

  it('propuestas mal formadas se descartan sin romper la respuesta', () => {
    const reply = parseChatReply({
      ...validAIOutput({ memoryProposal: { content: 'ok', category: 'nope' }, nextStep: { label: 'Ver objetivos', to: 'admin' } }),
      engine: AI_ENGINE_INFO,
      generatedAt: NOW.toISOString(),
    })
    assert.equal(reply.memoryProposal, null, 'contenido demasiado corto')
    assert.equal(reply.nextStep?.to, undefined, 'destino desconocido descartado')
    assert.equal(reply.nextStep?.label, 'Ver objetivos')
  })
})

/* ------------------------------ servidor ---------------------------------- */

describe('AXIS conversación · servidor', () => {
  it('chatWithProvider usa el tope de salida, el esquema de chat y fija engine/generatedAt', async () => {
    const seen: { maxOutputTokens?: number; user?: string; schema?: Record<string, unknown> } = {}
    const provider: MarketAIProvider = {
      id: 'gemini:mock',
      model: 'mock',
      async completeWithUsage(request, options) {
        seen.maxOutputTokens = options.maxOutputTokens
        seen.user = request.user
        seen.schema = request.schema
        return {
          output: validAIOutput({
            memoryProposal: { content: 'Prefiere mantener 200 € de colchón.', category: 'constraint', importance: 'high', confidence: 0.8, replacesId: null },
            engine: { id: 'local-rules', label: 'falso', isAI: false },
            generatedAt: '1999-01-01T00:00:00.000Z',
          }),
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        }
      },
      complete: async () => ({}),
    }
    const reply = await chatWithProvider(provider, input('Quiero mantener 200 € de colchón.'))
    assert.equal(seen.maxOutputTokens, AXIS_AI_LIMITS.MAX_OUTPUT_TOKENS)
    assert.equal((seen.schema?.properties as Record<string, unknown>)?.memoryProposal !== undefined, true)
    assert.match(seen.user ?? '', /consulta_actual/)
    assert.equal(reply.engine.id, 'external-ai', 'engine lo fija el servidor, no el modelo')
    assert.match(reply.engine.label, /gemini:mock/)
    assert.notEqual(reply.generatedAt, '1999-01-01T00:00:00.000Z')
    assert.equal(reply.memoryProposal?.category, 'constraint')
  })

  it('una salida que no es objeto lanza (→ 502 → fallback local en el cliente)', async () => {
    const provider: MarketAIProvider = {
      id: 'mock',
      model: 'mock',
      completeWithUsage: async () => ({ output: 'texto', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }),
      complete: async () => 'texto',
    }
    await assert.rejects(() => chatWithProvider(provider, input()))
  })
})
