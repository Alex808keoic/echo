/**
 * Consultas de AXIS a los datos (parte 4c, ReAct acotado): el modelo pide UNA
 * consulta cerrada, el dispositivo la ejecuta sobre los movimientos locales y
 * el modelo responde con el resultado. Todo validado: lo que pide, lo que
 * vuelve y la respuesta final (cifras incluidas).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chatTurnWithProvider } from '../ai/server/analyze'
import { AI_ENGINE_INFO } from '../ai-engine'
import { createChatEngine, type ChatPhase, type ChatTransport } from '../chat/engine'
import { buildChatRequest } from '../chat/prompt'
import { isChatToolResults, parseToolRequest, runChatTool, TOOL_LIMITS, toolResultFigures, type ChatToolRequest } from '../chat/tools'
import { buildFinancialContext } from '../context'
import type { AxisLanguageModel } from '../language/model'
import type { ChatInput, ChatReply } from '../chat/types'
import type { Movement } from '../../types'
import { config, gasto, ingreso, movement, NOW, snapshot, TODAY } from './fixtures'

const MOVEMENTS: Movement[] = [
  ingreso('2026-08-01', 200_000),
  gasto('2026-08-05', 4_000, 'Comida'),
  gasto('2026-08-12', 2_550, 'Restaurantes'),
  gasto('2026-08-20', 6_000, 'Ropa'),
  ingreso('2026-09-01', 200_000),
  gasto('2026-09-04', 4_200, 'Comida'),
  gasto('2026-09-10', 1_800, 'Restaurantes'),
  movement({ type: 'gasto', amountCents: 1_500, date: '2026-09-11', category: 'Otros', motivo: 'Gimnasio', nota: 'nota privada que no debe salir' }),
  movement({ type: 'gasto', amountCents: 999, date: '2026-09-12', category: 'Otros', motivo: 'PIN 1234 de la tarjeta' }),
]

function chatInput(message = '¿Cuánto gasté en restaurantes en agosto?', extra: Partial<ChatInput> = {}): ChatInput {
  const context = buildFinancialContext(snapshot({ config: config(100_000), movements: MOVEMENTS }), TODAY)
  return { context, market: null, conversation: { summary: null, recent: [] }, message, ...extra }
}

/** Modelo de prueba que devuelve, en orden, las salidas dadas. */
function scripted(...outputs: unknown[]): AxisLanguageModel & { calls: string[] } {
  const calls: string[] = []
  return {
    id: 'test:mock',
    available: true,
    calls,
    async complete(request) {
      calls.push(request.user)
      const next = outputs.shift()
      if (next === undefined) throw new Error('sin más salidas')
      return next
    },
  }
}
const answer = (reply: string, consulta: unknown = null) => ({ reply, confidence: 'media', nextStep: null, memoryProposal: null, consulta })

describe('lo que el modelo puede pedir (parseToolRequest)', () => {
  it('acepta las tres consultas, con nulls donde no aplica', () => {
    assert.deepEqual(parseToolRequest({ herramienta: 'resumen_mes', mes: '2026-08', categoria: null, texto: null, tipo: null }), { herramienta: 'resumen_mes', mes: '2026-08' })
    assert.deepEqual(parseToolRequest({ herramienta: 'gasto_por_categoria', mes: '2026-08', categoria: 'Restaurantes', texto: null, tipo: null }), { herramienta: 'gasto_por_categoria', mes: '2026-08', categoria: 'Restaurantes' })
    assert.deepEqual(parseToolRequest({ herramienta: 'buscar_movimientos', mes: null, categoria: null, texto: ' gimnasio ', tipo: 'gasto' }), { herramienta: 'buscar_movimientos', texto: 'gimnasio', tipo: 'gasto' })
  })

  it('rechaza todo lo demás', () => {
    for (const bad of [
      null,
      'resumen_mes',
      { herramienta: 'borrar_movimientos', mes: '2026-08' },
      { herramienta: 'resumen_mes' },
      { herramienta: 'resumen_mes', mes: '2026-13' },
      { herramienta: 'resumen_mes', mes: 'agosto' },
      { herramienta: 'gasto_por_categoria', mes: '2026-08', categoria: 'Casinos' },
      { herramienta: 'buscar_movimientos', texto: 'x'.repeat(TOOL_LIMITS.MAX_SEARCH_CHARS + 1) },
      { herramienta: 'buscar_movimientos', texto: 'contraseña: hunter2' },
      { herramienta: 'buscar_movimientos', sql: 'DROP TABLE' },
    ]) {
      assert.equal(parseToolRequest(bad), null, JSON.stringify(bad))
    }
  })
})

describe('ejecución en el dispositivo (runChatTool)', () => {
  it('resumen de un mes', () => {
    assert.deepEqual(runChatTool({ herramienta: 'resumen_mes', mes: '2026-08' }, MOVEMENTS).resultado, {
      mes: '2026-08',
      movimientos: 4,
      ingresos: '2.000,00 €',
      gastos: '125,50 €',
      ahorro: '1.874,50 €',
    })
  })

  it('gasto por categoría: todas ordenadas, o una sola', () => {
    assert.deepEqual(runChatTool({ herramienta: 'gasto_por_categoria', mes: '2026-08' }, MOVEMENTS).resultado, {
      mes: '2026-08',
      por_categoria: [
        { categoria: 'Ropa', gasto: '60,00 €' },
        { categoria: 'Comida', gasto: '40,00 €' },
        { categoria: 'Restaurantes', gasto: '25,50 €' },
      ],
    })
    assert.deepEqual(runChatTool({ herramienta: 'gasto_por_categoria', mes: '2026-08', categoria: 'Restaurantes' }, MOVEMENTS).resultado, { mes: '2026-08', categoria: 'Restaurantes', gasto: '25,50 €' })
  })

  it('buscar movimientos: como mucho 5, más recientes primero, sin notas y sin nada que parezca un secreto', () => {
    const r = runChatTool({ herramienta: 'buscar_movimientos', tipo: 'gasto' }, MOVEMENTS).resultado as { encontrados: number; movimientos: Array<Record<string, string>> }
    assert.equal(r.encontrados, 7)
    assert.equal(r.movimientos.length, TOOL_LIMITS.MAX_MOVEMENTS)
    assert.deepEqual(r.movimientos.map((m) => m.fecha), ['2026-09-12', '2026-09-11', '2026-09-10', '2026-09-04', '2026-08-20'])
    const text = JSON.stringify(r)
    assert.doesNotMatch(text, /nota privada|PIN 1234/)
    assert.match(text, /Gimnasio/)
  })

  it('buscar por texto del concepto', () => {
    const r = runChatTool({ herramienta: 'buscar_movimientos', texto: 'gimnas' }, MOVEMENTS).resultado as { encontrados: number; movimientos: Array<Record<string, string>> }
    assert.equal(r.encontrados, 1)
    assert.equal(r.movimientos[0].importe, '-15,00 €')
  })
})

describe('lo que el servidor acepta del dispositivo (isChatToolResults)', () => {
  const ok = runChatTool({ herramienta: 'resumen_mes', mes: '2026-08' }, MOVEMENTS)
  it('un resultado válido', () => assert.equal(isChatToolResults([ok]), true))
  it('más de una consulta, vacío, consulta inválida, demasiado grande o con un secreto: no', () => {
    assert.equal(isChatToolResults([ok, ok]), false)
    assert.equal(isChatToolResults([]), false)
    assert.equal(isChatToolResults([{ ...ok, consulta: { herramienta: 'borrar' } }]), false)
    assert.equal(isChatToolResults([{ ...ok, resultado: { x: 'y'.repeat(3_000) } }]), false)
    assert.equal(isChatToolResults([{ ...ok, resultado: { nota: 'contraseña: hunter2' } }]), false)
  })
})

describe('prompt: consultas solo en la primera llamada', () => {
  it('primera llamada: consultas disponibles y «consulta» en el esquema', () => {
    const r = buildChatRequest(chatInput(), { tools: true })
    assert.match(r.user, /consultas_disponibles/)
    assert.ok('consulta' in (r.schema as { properties: Record<string, unknown> }).properties)
  })

  it('segunda llamada (con resultados): los resultados y el esquema de siempre', () => {
    const toolResults = [runChatTool({ herramienta: 'gasto_por_categoria', mes: '2026-08', categoria: 'Restaurantes' }, MOVEMENTS)]
    const r = buildChatRequest(chatInput(undefined, { toolResults }), { tools: true })
    assert.match(r.user, /resultados_de_consultas/)
    assert.doesNotMatch(r.user, /consultas_disponibles/)
    assert.ok(!('consulta' in (r.schema as { properties: Record<string, unknown> }).properties))
  })

  it('sin pedirlo (análisis, goldens), nada cambia', () => {
    assert.doesNotMatch(buildChatRequest(chatInput()).user, /consultas_disponibles/)
  })
})

describe('servidor (chatTurnWithProvider)', () => {
  const request: ChatToolRequest = { herramienta: 'gasto_por_categoria', mes: '2026-08', categoria: 'Restaurantes' }
  const results = [runChatTool(request, MOVEMENTS)]

  it('el modelo pide una consulta → se devuelve validada, sin respuesta', async () => {
    const turn = await chatTurnWithProvider(scripted(answer('Lo consulto.', { herramienta: 'gasto_por_categoria', mes: '2026-08', categoria: 'Restaurantes', texto: null, tipo: null })), chatInput())
    assert.deepEqual(turn, { toolRequest: request })
  })

  it('con el resultado, la respuesta puede citar sus cifras', async () => {
    const turn = await chatTurnWithProvider(scripted(answer('En agosto gastaste 25,50 € en restaurantes.')), chatInput(undefined, { toolResults: results }))
    assert.ok('reply' in turn && turn.reply.text.includes('25,50 €'))
  })

  it('pero no inventarlas: se rechaza (→ motor local)', async () => {
    await assert.rejects(chatTurnWithProvider(scripted(answer('En agosto gastaste 99,00 € en restaurantes.')), chatInput(undefined, { toolResults: results })))
  })

  it('con resultados, una segunda consulta se ignora y se juzga la respuesta', async () => {
    const turn = await chatTurnWithProvider(scripted(answer('En agosto gastaste 25,50 € en restaurantes.', { herramienta: 'resumen_mes', mes: '2026-07', categoria: null, texto: null, tipo: null })), chatInput(undefined, { toolResults: results }))
    assert.ok('reply' in turn)
  })

  it('una consulta no válida se ignora y se juzga la respuesta', async () => {
    const turn = await chatTurnWithProvider(scripted(answer('Este mes vas bien.', { herramienta: 'borrar_todo', mes: null, categoria: null, texto: null, tipo: null })), chatInput('¿Cómo voy?'))
    assert.ok('reply' in turn)
  })
})

describe('motor del dispositivo: una consulta como mucho', () => {
  const reply = (text: string): ChatReply => ({ text, confidence: 'media', memoryProposal: null, engine: AI_ENGINE_INFO, generatedAt: NOW.toISOString() })

  it('pide → el dispositivo la ejecuta → responde', async () => {
    const seen: ChatInput[] = []
    const phases: ChatPhase[] = []
    const ran: ChatToolRequest[] = []
    const request: ChatToolRequest = { herramienta: 'resumen_mes', mes: '2026-08' }
    const transport: ChatTransport = {
      isAvailable: async () => true,
      ask: async (input) => {
        seen.push(input)
        return seen.length === 1 ? { toolRequest: request } : reply('En agosto ahorraste 1.874,50 €.')
      },
    }
    const engine = createChatEngine({ transport, onPhase: (p) => phases.push(p), runTool: (r) => (ran.push(r), runChatTool(r, MOVEMENTS)) })
    const out = await engine.ask(chatInput('¿Cuánto ahorré en agosto?'))
    assert.equal(out.text, 'En agosto ahorraste 1.874,50 €.')
    assert.deepEqual(ran, [request])
    assert.equal(seen.length, 2)
    assert.equal(seen[0].toolResults, undefined)
    assert.equal(seen[1].toolResults?.length, 1)
    assert.ok(phases.includes('consulting'))
  })

  it('si pide una segunda consulta: motor local (sin bucles)', async () => {
    const transport: ChatTransport = { isAvailable: async () => true, ask: async () => ({ toolRequest: { herramienta: 'resumen_mes', mes: '2026-08' } }) }
    const out = await createChatEngine({ transport, runTool: (r) => runChatTool(r, MOVEMENTS) }).ask(chatInput())
    assert.equal(out.fallbackReason, 'error')
  })

  it('sin quien ejecute la consulta: motor local', async () => {
    const transport: ChatTransport = { isAvailable: async () => true, ask: async () => ({ toolRequest: { herramienta: 'resumen_mes', mes: '2026-08' } }) }
    const out = await createChatEngine({ transport }).ask(chatInput())
    assert.equal(out.fallbackReason, 'error')
  })
})

describe('cifras del resultado', () => {
  it('se pueden citar con y sin signo', () => {
    const keys = new Set(toolResultFigures([runChatTool({ herramienta: 'buscar_movimientos', texto: 'gimnasio' }, MOVEMENTS)]).map((f) => f.key))
    assert.ok(keys.has('m:-15.00') && keys.has('m:15.00'))
  })
})
