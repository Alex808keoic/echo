/**
 * Histórico compacto del chat: un resumen determinista de los movimientos
 * reales (meses cerrados y movimientos más grandes) que permite responder
 * preguntas sobre el pasado sin dar al modelo la base de datos, y que la
 * frontera de validación usa para aceptar esas cifras, y solo esas.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AI_ENGINE_INFO } from '../ai-engine'
import { buildChatFinancialHistory, HISTORY_LIMITS, isChatFinancialHistory, type ChatFinancialHistory } from '../chat/financial-history'
import { buildChatRequest } from '../chat/prompt'
import { redactChatInput } from '../chat/secrets'
import { buildChatGuard, validateChatReply } from '../chat/semantic'
import type { ChatInput } from '../chat/types'
import { parseChatReply } from '../chat/validate'
import { buildFinancialContext } from '../context'
import type { Invariant } from '../core/semantic'
import type { AxisMemory } from '../types'
import type { Movement } from '../../types'
import { config, gasto, ingreso, NOW, snapshot, TODAY } from './fixtures'

/**
 * Hoy: 2026-09-15. Junio, julio y agosto cerrados; septiembre en curso.
 *   julio   ingresos 2.000,00 €, gastos 1.350,00 € (Restaurantes 80,00 €)
 *   agosto  ingresos 2.000,00 €, gastos 1.200,00 € (mayor gasto: «Portátil», 450,00 €)
 *   sept.   ingresos 2.000,00 €, gastos 700,00 € hasta hoy
 */
function movements(): Movement[] {
  return [
    ingreso('2026-06-01', 150_000),
    gasto('2026-06-10', 30_000, 'Comida'),
    ingreso('2026-07-01', 200_000),
    gasto('2026-07-03', 60_000, 'Comida'),
    gasto('2026-07-08', 8_000, 'Restaurantes'),
    gasto('2026-07-15', 22_000, 'Otros', 'Gasolina'),
    gasto('2026-07-21', 45_000, 'Ropa'),
    ingreso('2026-08-01', 200_000),
    gasto('2026-08-05', 40_000, 'Comida'),
    gasto('2026-08-12', 20_000, 'Restaurantes'),
    gasto('2026-08-20', 15_000, 'Ropa'),
    gasto('2026-08-25', 45_000, 'Otros', 'Portátil'),
    ingreso('2026-09-01', 200_000),
    gasto('2026-09-04', 42_000, 'Comida'),
    gasto('2026-09-10', 18_000, 'Restaurantes'),
    gasto('2026-09-12', 10_000, 'Salidas'),
  ]
}

const context = (ms = movements()) => buildFinancialContext(snapshot({ config: config(100_000), movements: ms }), TODAY)
const history = (ms = movements()) => buildChatFinancialHistory(ms, TODAY)
const chatInput = (message: string, extra: Partial<ChatInput> = {}): ChatInput => ({ context: context(), market: null, conversation: { summary: null, recent: [] }, message, history: history(), ...extra })
const withRecurring = (message: string) =>
  chatInput(message, { memory: { profileFacts: [{ id: 'mem-1', updatedAt: 1, fact: { kind: 'recurringIncome', cents: 350_000, frequency: 'monthly', category: 'Paga' } }] } satisfies AxisMemory })

const asReply = (text: string) => parseChatReply({ reply: text, confidence: 'media', nextStep: null, memoryProposal: null, engine: AI_ENGINE_INFO, generatedAt: NOW.toISOString() })
const invariants = (text: string, i: ChatInput) => {
  const v = validateChatReply(asReply(text), buildChatGuard(i))
  return v.ok ? [] : [...new Set(v.violations.map((x) => x.invariant))]
}
const accepts = (text: string, i: ChatInput) => assert.deepEqual(invariants(text, i), [], text)
const rejects = (text: string, invariant: Invariant, i: ChatInput) => assert.ok(invariants(text, i).includes(invariant), `${text} → ${JSON.stringify(invariants(text, i))}`)
const month = (h: ChatFinancialHistory, key: string) => h.closedMonths.find((m) => m.key === key)

describe('histórico compacto · construcción', () => {
  it('meses cerrados con movimientos, del más reciente al más antiguo, con totales y principales categorías', () => {
    const h = history()
    assert.deepEqual(h.closedMonths.map((m) => m.key), ['2026-08', '2026-07', '2026-06'])
    const july = month(h, '2026-07')!
    assert.deepEqual([july.incomeCents, july.expenseCents, july.movementCount], [200_000, 135_000, 5])
    assert.deepEqual(july.topExpenses, [
      { label: 'Comida', cents: 60_000 },
      { label: 'Ropa', cents: 45_000 },
      { label: 'Gasolina', cents: 22_000 },
      { label: 'Restaurantes', cents: 8_000 },
    ])
    assert.deepEqual(july.topIncomes, [{ label: 'Paga', cents: 200_000 }])
  })

  it('mismos totales que los meses cerrados del contexto (misma semántica, sin lógica nueva)', () => {
    const ctx = context()
    for (const c of ctx.flows.closedMonths) {
      const m = month(history(), c.key)!
      assert.deepEqual([m.incomeCents, m.expenseCents, m.movementCount], [c.incomeCents, c.expenseCents, c.movementCount], c.key)
    }
  })

  it('movimientos más grandes del mes en curso (hasta hoy) y del anterior; nunca los futuros', () => {
    const h = history([...movements(), gasto('2026-09-20', 99_900, 'Ropa')])
    assert.equal(h.largestMovements.currentMonth.key, '2026-09')
    assert.deepEqual(h.largestMovements.currentMonth.movements.map((m) => [m.date, m.label, m.amountCents]), [
      ['2026-09-01', 'Paga', 200_000],
      ['2026-09-04', 'Comida', 42_000],
      ['2026-09-10', 'Restaurantes', 18_000],
      ['2026-09-12', 'Salidas', 10_000],
    ])
    assert.equal(h.largestMovements.previousMonth.key, '2026-08')
    assert.deepEqual(h.largestMovements.previousMonth.movements[1], { date: '2026-08-25', label: 'Portátil', category: 'Otros', type: 'gasto', amountCents: 45_000 })
  })

  it('el mayor gasto y el mayor ingreso del mes están siempre, aunque los ingresos llenen el top', () => {
    const many = [1, 2, 3, 4, 5, 6].map((d) => ingreso(`2026-09-0${d}`, 300_000 + d))
    const h = history([...many, gasto('2026-09-09', 5_000, 'Comida')])
    const current = h.largestMovements.currentMonth.movements
    assert.equal(current.length, HISTORY_LIMITS.LARGEST_MOVEMENTS)
    assert.ok(current.some((m) => m.type === 'gasto' && m.amountCents === 5_000))
    assert.equal(current[0].amountCents, 300_006)
  })

  it('determinista: no depende del orden de entrada', () => {
    assert.deepEqual(history([...movements()].reverse()), history())
  })

  it('como mucho 6 meses cerrados y categorías limitadas', () => {
    const long = Array.from({ length: 10 }, (_, i) => gasto(`2025-${String(i + 1).padStart(2, '0')}-10`, 1_000 * (i + 1), 'Comida'))
    const h = history([...long, ...movements()])
    assert.equal(h.closedMonths.length, HISTORY_LIMITS.MONTHS)
    assert.ok(h.closedMonths.every((m) => m.topExpenses.length <= HISTORY_LIMITS.EXPENSE_CATEGORIES && m.topIncomes.length <= HISTORY_LIMITS.INCOME_CATEGORIES))
  })

  it('el histórico son movimientos reales: un ingreso recurrente declarado no lo cambia', () => {
    const block = JSON.parse(buildChatRequest(withRecurring('¿Cuánto ingresé en julio?')).user.split('\n\n').slice(1).join('\n\n')).datos_actuales.historico_de_movimientos
    assert.equal(block.meses_cerrados.find((m: { mes: string }) => m.mes === '2026-07').ingresos, 200_000)
    assert.match(block.nota, /No incluye previsiones ni ingresos recurrentes/)
  })
})

describe('histórico compacto · forma, límites y privacidad', () => {
  it('el servidor solo acepta un histórico con la forma y los límites esperados', () => {
    assert.equal(isChatFinancialHistory(history()), true)
    const h = history()
    assert.equal(isChatFinancialHistory({ ...h, closedMonths: [...h.closedMonths, ...h.closedMonths, ...h.closedMonths] }), false, 'más de 6 meses')
    assert.equal(isChatFinancialHistory({ ...h, closedMonths: [{ ...h.closedMonths[0], expenseCents: -5 }] }), false, 'importe negativo')
    assert.equal(isChatFinancialHistory({ ...h, closedMonths: [{ ...h.closedMonths[0], key: 'julio' }] }), false, 'mes mal formado')
    assert.equal(isChatFinancialHistory('texto'), false)
  })

  it('un concepto que parece un secreto no sale del dispositivo: viaja la categoría', () => {
    const leaky = [...movements(), gasto('2026-09-11', 90_000, 'Otros', 'IBAN ES9121000418450200051332')]
    const redacted = redactChatInput(chatInput('¿Mi mayor gasto?', { history: history(leaky) })).history!
    const labels = redacted.largestMovements.currentMonth.movements.map((m) => m.label)
    assert.ok(!labels.some((l) => /ES9121/.test(l)), labels.join(', '))
    assert.ok(labels.includes('Otros'))
  })

  it('el modelo recibe el bloque histórico en «datos_actuales»', () => {
    const user = buildChatRequest(chatInput('¿Cuánto gasté en julio?')).user
    assert.match(user, /"historico_de_movimientos"/)
    assert.match(user, /"mes":"2026-07","ingresos":200000,"gastos":135000/)
  })
})

describe('histórico compacto · preguntas que ahora se pueden responder', () => {
  it('1 · «¿Cuánto gasté en julio?»', () => {
    accepts('En julio gastaste 1.350,00 €, sobre todo en Comida (600,00 €).', chatInput('¿Cuánto gasté en julio?'))
  })
  it('2 · «¿Cuánto ingresé el mes pasado?»', () => {
    accepts('El mes pasado, en agosto, ingresaste 2.000,00 €.', chatInput('¿Cuánto ingresé el mes pasado?'))
  })
  it('3 · «¿Cuál fue mi mayor gasto?»', () => {
    accepts('Tu mayor gasto reciente fue «Portátil», de 450,00 €, el 25 de agosto.', chatInput('¿Cuál fue mi mayor gasto?'))
  })
  it('4 · «¿En qué gasté más el mes pasado?»', () => {
    accepts('El mes pasado lo que más pesó fue «Portátil» (450,00 €), seguido de Comida (400,00 €).', chatInput('¿En qué gasté más el mes pasado?'))
  })
  it('5 · «¿Cuánto gasté este mes frente al anterior?»', () => {
    accepts('Este mes llevas 700,00 € de gastos, frente a 1.200,00 € el mes anterior.', chatInput('¿Cuánto gasté este mes frente al anterior?'))
  })
  it('6 · «¿Cuál fue mi movimiento más grande?»', () => {
    accepts('Tu movimiento más grande este mes es la Paga de 2.000,00 € del día 1.', chatInput('¿Cuál fue mi movimiento más grande?'))
  })
})

describe('histórico compacto · seguridad', () => {
  it('no se puede inventar un movimiento ni alterar su importe', () => {
    rejects('En julio gastaste 280,00 € en restaurantes.', 'figures', chatInput('¿Cuánto gasté en restaurantes?'))
    rejects('Tu mayor gasto fue de 520,00 €.', 'figures', chatInput('¿Cuál fue mi mayor gasto?'))
  })

  it('no se puede inventar un mes: sin movimientos de marzo, ninguna cifra es de marzo (aunque exista en otro mes)', () => {
    rejects('En marzo gastaste 1.350,00 €.', 'figures', chatInput('¿Cuánto gasté en marzo?'))
    rejects('En marzo gastaste 1.200,00 €.', 'figures', chatInput('¿Cuánto gasté en marzo?'))
  })

  it('un ingreso recurrente declarado no es lo que se ingresó', () => {
    rejects('En julio ingresaste 3.500,00 €.', 'figures', withRecurring('¿Cuánto ingresé en julio?'))
    accepts('En julio ingresaste 2.000,00 €; tu previsión es de 3.500,00 € al mes.', withRecurring('¿Cuánto ingresé en julio?'))
  })

  it('una previsión no se convierte en pasado: noviembre aún no tiene movimientos', () => {
    rejects('En noviembre gastaste 700,00 €.', 'figures', withRecurring('¿Y en noviembre?'))
    accepts('Para noviembre no tengo movimientos: solo puedo hablar de previsiones, no de lo que gastaste.', withRecurring('¿Y en noviembre?'))
  })

  it('una cifra que solo apareció en una respuesta anterior de AXIS no es fuente', () => {
    const i = chatInput('¿Seguro?', { conversation: { summary: null, recent: [{ role: 'user', text: '¿Cuánto gasté en julio?' }, { role: 'axis', text: 'En julio gastaste 1.999,00 €.' }] } })
    rejects('Sí: en julio gastaste 1.999,00 €.', 'figures', i)
    accepts('En realidad, en julio gastaste 1.350,00 €.', i)
  })

  it('sin histórico, las cifras de meses anteriores no se aceptan (el chat sigue funcionando como antes)', () => {
    rejects('En julio gastaste 1.350,00 €.', 'figures', chatInput('¿Cuánto gasté en julio?', { history: undefined }))
  })
})

describe('histórico compacto · fallback local', () => {
  it('sin proveedor, la respuesta local sigue pasando la frontera y no inventa histórico', async () => {
    const { ChatTransportError, createChatEngine } = await import('../chat/engine')
    const t = {
      isAvailable: async () => true,
      ask: async () => {
        throw new ChatTransportError('error', 'axis api 502')
      },
    }
    const i = chatInput('¿Cuánto gasté en julio?')
    const reply = await createChatEngine({ transport: t }).ask(i)
    assert.equal(reply.engine.id, 'local-rules')
    assert.deepEqual(validateChatReply(reply, buildChatGuard(i)), { ok: true }, reply.text)
  })
})
