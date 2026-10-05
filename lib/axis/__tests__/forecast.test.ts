/**
 * Previsiones con ingresos recurrentes (fase 5).
 *
 * Una previsión puede explicar el futuro, pero nunca convertirse en dinero
 * presente: el ingreso recurrente alimenta solo una señal secundaria
 * (`objectives.forecast:<id>`, dominio `forecast`) y la interpretación de
 * `income.none`. Ninguna cifra real cambia y ninguna decisión existente cambia.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFinancialContext, closedMonthsOf, type FinancialSnapshot } from '../context'
import { decide } from '../core/decision'
import { buildAllowedFigures, contextFigures, figuresOf, forecastFigures } from '../core/figures'
import { knownEntities, validateExpression } from '../core/semantic'
import type { Expression } from '../core/expression'
import { contextForRequest } from '../ai/browser-transport'
import { buildChatRequest } from '../chat/prompt'
import { recurringForecast, usualMonthlyExpense, FORECAST_MAX_MONTHS } from '../rules/shared'
import { checkAdvice } from '../../text/advice'
import type { AxisDecision, AxisMemory, ClosedMonth, ProfileFactEntry } from '../types'
import type { MemoryFact, RecurringIncome } from '../profile/types'
import { config, gasto, healthyMovements, ingreso, objective, position, snapshot, TODAY } from './fixtures'

const SNAPSHOT = join(dirname(fileURLToPath(import.meta.url)), '__snapshots__', 'forecast', 'con-prevision.json')
const UPDATE = process.env.UPDATE_GOLDEN === '1'

const month = (key: string, expenseCents: number, movementCount = 3, incomeCents = 0): ClosedMonth => ({ key, incomeCents, expenseCents, movementCount })
const income = (cents: number, category: RecurringIncome['category'] = 'Paga', sourceMemoryId = `mem-${category}`): RecurringIncome => ({ category, cents, frequency: 'monthly', sourceMemoryId })
const fact = (cents: number, category: RecurringIncome['category'] = 'Paga'): MemoryFact => ({ kind: 'recurringIncome', cents, frequency: 'monthly', category })
const memoryWith = (...facts: MemoryFact[]): AxisMemory => ({ profileFacts: facts.map((f, i): ProfileFactEntry => ({ id: `mem-${i}`, updatedAt: i + 1, fact: f })) })
const goal = (remainingCents: number, completed = false) => ({ id: 'o1', name: 'Viaje', remainingCents, completed })

/** Cinco meses cerrados con un mes atípico (julio) y el mes en curso (septiembre) con un gasto enorme. */
function historyMovements() {
  return [
    ingreso('2026-04-01', 4_700), gasto('2026-04-10', 2_000),
    ingreso('2026-05-01', 4_700), gasto('2026-05-10', 2_100),
    ingreso('2026-06-01', 4_700), gasto('2026-06-10', 1_900),
    ingreso('2026-07-01', 4_700), gasto('2026-07-10', 12_000),
    ingreso('2026-08-01', 4_700), gasto('2026-08-10', 2_200),
    ingreso('2026-09-01', 4_700), gasto('2026-09-05', 99_000),
  ]
}
const snap = (partial: Partial<FinancialSnapshot> = {}): FinancialSnapshot =>
  snapshot({
    config: config(100_000),
    movements: historyMovements(),
    objectives: [objective({ id: 'obj-viaje', name: 'Viaje', targetCents: 50_000, currentCents: 10_000 }), objective({ id: 'obj-moto', name: 'Moto', targetCents: 30_000, currentCents: 30_000 })],
    positions: [position({ id: 'pos-fondo', name: 'Fondo', valueCents: 20_000, investedCents: 15_000 })],
    ...partial,
  })
const ctx = (partial: Partial<FinancialSnapshot> = {}) => buildFinancialContext(snap(partial), TODAY)
const isForecast = (s: { domain: string }) => s.domain === 'forecast'

/* ------------------------------- meses cerrados ------------------------------ */

describe('previsión · meses cerrados', () => {
  it('solo meses anteriores al mes en curso, con datos, del más reciente al más antiguo', () => {
    const months = closedMonthsOf(historyMovements(), TODAY)
    assert.deepEqual(months.map((m) => m.key), ['2026-08', '2026-07', '2026-06', '2026-05', '2026-04'])
    assert.deepEqual(months[0], { key: '2026-08', incomeCents: 4_700, expenseCents: 2_200, movementCount: 2 })
  })

  it('como mucho 6 y un mes sin movimientos no aparece', () => {
    const many = [1, 2, 3, 4, 5, 6, 7, 8].map((m) => gasto(`2026-0${m}-05`, 1_000))
    assert.deepEqual(closedMonthsOf(many, TODAY).map((m) => m.key), ['2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03'])
    const gap = [gasto('2026-08-05', 1_000), gasto('2026-06-05', 1_000)]
    assert.deepEqual(closedMonthsOf(gap, TODAY).map((m) => m.key), ['2026-08', '2026-06'], 'julio, sin movimientos, no es un mes de gasto 0')
  })

  it('está en el contexto, no cambia ninguna otra cifra y no va al modelo', () => {
    const c = ctx()
    assert.equal(c.flows.closedMonths.length, 5)
    assert.equal('closedMonths' in contextForRequest(c).flows, true, 'el servidor lo necesita para la previsión')
    const chat = buildChatRequest({ context: c, conversation: { summary: null, recent: [] }, message: '¿Cómo voy?' })
    assert.doesNotMatch(chat.user, /closedMonths/)
  })
})

/* ------------------------------- gasto habitual ------------------------------ */

describe('previsión · gasto habitual', () => {
  it('mediana con 3 meses', () => {
    assert.equal(usualMonthlyExpense([month('2026-08', 2_000), month('2026-07', 2_100), month('2026-06', 1_900)]), 2_000)
  })

  it('mediana con 4 meses: media de los dos centrales, redondeada a euros hacia arriba', () => {
    assert.equal(usualMonthlyExpense([month('2026-08', 2_000), month('2026-07', 2_150), month('2026-06', 1_900), month('2026-05', 2_400)]), 2_100)
  })

  it('con 6 meses y un mes atípico, la mediana lo resiste', () => {
    const months = [2_000, 2_100, 1_900, 12_000, 2_200, 2_050].map((c, i) => month(`2026-0${8 - i}`, c))
    assert.equal(usualMonthlyExpense(months), 2_100)
  })

  it('con 7 o más, solo los 6 más recientes', () => {
    const months = [1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 90_000, 90_000].map((c, i) => month(`2026-0${8 - i}`, c))
    assert.equal(usualMonthlyExpense(months), 1_000)
  })

  it('los meses sin movimientos no cuentan', () => {
    assert.equal(usualMonthlyExpense([month('2026-08', 0, 0), month('2026-07', 0, 0), month('2026-06', 2_000), month('2026-05', 2_000)]), null)
  })

  it('el mes en curso nunca entra (aunque tenga un gasto enorme)', () => {
    assert.equal(usualMonthlyExpense(ctx().flows.closedMonths), 2_100, 'abril–agosto: 1.900, 2.000, 2.100, 2.200, 12.000 → 21,00 €')
  })

  it('menos de 3 meses → null, sin inventar gasto', () => {
    assert.equal(usualMonthlyExpense([month('2026-08', 2_000), month('2026-07', 2_000)]), null)
    assert.equal(usualMonthlyExpense([]), null)
    assert.equal(usualMonthlyExpense(undefined), null, 'un contexto antiguo sin closedMonths')
  })

  it('redondeo a euros enteros hacia arriba y nunca negativo; datos raros se descartan', () => {
    assert.equal(usualMonthlyExpense([month('2026-08', 1_901), month('2026-07', 1_901), month('2026-06', 1_901)]), 2_000)
    assert.equal(usualMonthlyExpense([month('2026-08', 0), month('2026-07', 0), month('2026-06', 0)]), 0)
    assert.equal(usualMonthlyExpense([month('2026-08', -500), month('2026-07', 1.5), month('2026-06', 2_000), month('2026-05', 2_000)]), null, 'solo 2 meses válidos')
  })
})

/* -------------------------------- escenarios -------------------------------- */

describe('previsión · escenarios', () => {
  it('A normal: ⌈restante / F⌉, hacia arriba', () => {
    assert.equal(recurringForecast(goal(40_000), [income(3_500)], null)?.allMonths, 12)
  })

  it('B normal: ⌈restante / (F − G)⌉ con su margen', () => {
    const f = recurringForecast(goal(40_000), [income(3_500)], 2_000, 4)
    assert.deepEqual(f?.afterExpenses, { status: 'ok', usualExpenseCents: 2_000, basedOnMonths: 4, marginCents: 1_500, result: 27 })
  })

  it('sin gasto habitual, B no disponible', () => {
    assert.deepEqual(recurringForecast(goal(40_000), [income(3_500)], null)?.afterExpenses, { status: 'no-history' })
  })

  it('G ≥ F: sin margen, sin meses ni negativos', () => {
    assert.deepEqual(recurringForecast(goal(40_000), [income(3_500)], 3_500, 3)?.afterExpenses, { status: 'no-margin', usualExpenseCents: 3_500, basedOnMonths: 3 })
    assert.deepEqual(recurringForecast(goal(40_000), [income(3_500)], 9_000, 3)?.afterExpenses.status, 'no-margin')
  })

  it('más de 120 meses → «más de 10 años», en A y en B', () => {
    assert.equal(recurringForecast(goal(40_000), [income(1)], null)?.allMonths, 'over-10-years', '0,01 € al mes')
    assert.equal(recurringForecast(goal(FORECAST_MAX_MONTHS * 100), [income(100)], null)?.allMonths, FORECAST_MAX_MONTHS, 'exactamente 120 se muestra')
    const b = recurringForecast(goal(40_000), [income(3_500)], 3_400, 3)?.afterExpenses
    assert.equal(b?.status === 'ok' && b.result, 'over-10-years')
  })

  it('varios ingresos se suman en una sola previsión', () => {
    const f = recurringForecast(goal(45_000), [income(3_500, 'Paga'), income(1_000, 'Regalos')], null)
    assert.equal(f?.monthlyCents, 4_500)
    assert.equal(f?.allMonths, 10)
    assert.deepEqual(f?.incomes, [{ category: 'Paga', cents: 3_500 }, { category: 'Regalos', cents: 1_000 }])
  })

  it('F = 0, R = 0 u objetivo completado → sin previsión', () => {
    assert.equal(recurringForecast(goal(40_000), [], null), null)
    assert.equal(recurringForecast(goal(40_000), [income(0)], null), null)
    assert.equal(recurringForecast(goal(0), [income(3_500)], null), null)
    assert.equal(recurringForecast(goal(40_000, true), [income(3_500)], null), null)
  })

  it('siempre céntimos y meses enteros, nunca negativos', () => {
    for (const [R, F, G] of [[1, 1, null], [99_999, 333, 7], [12_345, 6_789, 6_788], [500, 499, 0]] as const) {
      const f = recurringForecast(goal(R), [income(F)], G, 3)
      if (!f) continue
      for (const v of [f.remainingCents, f.monthlyCents]) assert.ok(Number.isSafeInteger(v) && v > 0)
      if (typeof f.allMonths === 'number') assert.ok(Number.isSafeInteger(f.allMonths) && f.allMonths > 0)
      const b = f.afterExpenses
      if (b.status === 'ok') assert.ok(b.marginCents > 0 && (b.result === 'over-10-years' || (Number.isSafeInteger(b.result) && b.result > 0)))
    }
  })
})

/* ---------------------------------- señal ---------------------------------- */

describe('previsión · señal objectives.forecast', () => {
  const ADVICE_VERBS = /\b(apart|ahorr|guard|reserv|destin|aport)\w*/i

  it('solo aparece con ingreso recurrente, para objetivos no completados (con y sin fecha)', () => {
    assert.deepEqual(decide({ context: ctx() }).signals.filter(isForecast), [])
    const withDate = ctx({ objectives: [objective({ id: 'obj-viaje', name: 'Viaje', targetCents: 50_000, currentCents: 10_000, targetDate: '2027-06-30' })] })
    const ids = (c: typeof withDate) => decide({ context: c, memory: memoryWith(fact(3_500)) }).signals.filter(isForecast).map((s) => s.id)
    assert.deepEqual(ids(ctx()), ['objectives.forecast:obj-viaje'], 'sin fecha sí; «Moto», completado, no')
    assert.deepEqual(ids(withDate), ['objectives.forecast:obj-viaje'], 'con fecha también')
  })

  it('baja prioridad, sin recomendación, detrás de todo, y etiquetada como previsión', () => {
    const d = decide({ context: ctx(), memory: memoryWith(fact(3_500)) })
    const s = d.signals.find(isForecast)
    assert.ok(s)
    assert.equal(s?.priority, 'low')
    assert.equal(s?.recommendation, undefined)
    assert.equal(d.signals.at(-1)?.id, s?.id)
    assert.match(s?.fact ?? '', /^Previsión \(no es dinero disponible\): /)
    assert.match(s?.interpretation ?? '', /^Previsión \(no es dinero disponible\): .*Con un gasto habitual estimado de 21,00 € al mes \(mediana de 5 meses\), quedarían 14,00 € al mes de esa previsión: serían 29 meses\. Supone .* No es una promesa\.$/)
  })

  it('sin historial: A sí, B dice que faltan meses', () => {
    const s = decide({ context: ctx({ movements: [ingreso('2026-09-01', 4_700), gasto('2026-09-05', 2_000)] }), memory: memoryWith(fact(3_500)) }).signals.find(isForecast)
    assert.match(s?.interpretation ?? '', /equivale a 12 meses .* Aún no tengo meses suficientes para estimar tu gasto habitual\./)
  })

  it('sin movimientos, AXIS no evalúa reglas (nivel none): tampoco hay previsión y la decisión no cambia', () => {
    const c = ctx({ movements: [] })
    const withIncome = decide({ context: c, memory: memoryWith(fact(3_500)) })
    assert.deepEqual(withIncome.signals, [])
    assert.deepEqual({ ...withIncome, profile: null }, { ...decide({ context: c }), profile: null })
  })

  it('el texto no lleva verbos de consejo y pasa la licencia de consejos', () => {
    const d = decide({ context: ctx(), memory: memoryWith(fact(3_500), fact(1_000, 'Regalos')) })
    const s = d.signals.find(isForecast)!
    for (const text of [s.fact, s.interpretation]) {
      assert.doesNotMatch(text, ADVICE_VERBS)
      assert.deepEqual(checkAdvice(text, knownEntities(d), { stance: 'inform', alternatives: [] }), [])
    }
    assert.match(s.fact, /ingresos previstos \(45,00 € al mes: 35,00 € de paga y 10,00 € en regalos\)\.$/)
  })

  it('cambiar el ingreso recalcula; eliminarlo devuelve el comportamiento anterior', () => {
    const c = ctx()
    const a = decide({ context: c, memory: memoryWith(fact(3_500)) }).signals.find(isForecast)
    const b = decide({ context: c, memory: memoryWith(fact(7_000)) }).signals.find(isForecast)
    assert.notEqual(a?.fact, b?.fact)
    assert.match(b?.fact ?? '', /equivale a 6 meses/)
    assert.deepEqual(decide({ context: c, memory: memoryWith() }), decide({ context: c }))
  })
})

/* -------------------------------- income.none -------------------------------- */

describe('previsión · income.none', () => {
  // Agosto con ingresos; septiembre (en curso) solo con gastos.
  const noIncomeCtx = () => buildFinancialContext(snapshot({ config: config(100_000), movements: [ingreso('2026-08-01', 4_700), gasto('2026-08-10', 2_000), gasto('2026-09-03', 1_500)] }), TODAY)
  const signal = (memory?: AxisMemory) => decide({ context: noIncomeCtx(), memory }).signals.find((s) => s.id === 'income.none')!

  it('con ingreso recurrente informa de la previsión; prioridad y recomendación idénticas', () => {
    const before = signal()
    const after = signal(memoryWith(fact(3_500)))
    assert.equal(after.interpretation, 'Tienes previstos 35,00 € al mes de paga; en lo que va de mes no hay ningún ingreso registrado.')
    assert.equal(after.priority, before.priority)
    assert.deepEqual(after.recommendation, before.recommendation)
    assert.equal(after.fact, before.fact)
    assert.deepEqual(after.profileInfluence, [{ field: 'recurringIncomes', sourceMemoryId: 'mem-0', signalId: 'income.none', effect: 'interpretation' }])
  })

  it('no afirma retraso, ni que el ingreso haya llegado, ni que esté pendiente', () => {
    assert.doesNotMatch(signal(memoryWith(fact(3_500))).interpretation, /retras|tarde|deber[ií]as|pendiente|ha llegado|han llegado|todavía no/i)
  })

  it('sin ingreso recurrente, el texto de siempre', () => {
    assert.equal(signal().interpretation, 'El mes pasado sí hubo ingresos, así que o todavía no han llegado o falta registrarlos.')
    assert.equal(signal().profileInfluence, undefined)
  })
})

/* ---------------------------- cifras y Decision First ---------------------------- */

/** Expresión correcta: reformula los textos de la propia decisión. */
function expressionOf(d: AxisDecision, override: (id: string, text: string) => string = (_id, t) => t): Expression {
  return {
    headline: `Lectura de AXIS: ${d.lead?.fact ?? 'situación estable'}`,
    interpretation: { summary: `Con los datos disponibles, ${d.lead?.interpretation ?? 'no hay nada que requiera atención'}`, signals: d.relevant.map((s) => ({ id: s.id, text: override(s.id, s.interpretation) })) },
    recommendationWhy: d.recommendation ? `Tiene sentido porque ${d.recommendation.why}` : null,
    alternatives: d.alternatives.map((a) => ({ name: a.name, summary: `Otra opción: ${a.summary}` })),
    uncertainties: d.uncertainties.map((u) => ({ title: u.title, detail: `Conviene tenerlo presente: ${u.detail}` })),
    conclusion: 'Con esto, la lectura queda clara; sigue registrando movimientos.',
  }
}

describe('previsión · cifras y Decision First', () => {
  // Un contexto sencillo, con pocas señales, para que la previsión esté entre las relevantes.
  const simple = () => buildFinancialContext(snapshot({ config: config(100_000), movements: historyMovements().slice(0, 10), objectives: [objective({ id: 'obj-viaje', name: 'Viaje', targetCents: 50_000, currentCents: 10_000 })] }), '2026-08-15')
  const decision = () => decide({ context: simple(), memory: memoryWith(fact(3_500)) })

  it('figuras con fuente forecast y etiqueta «Previsión: …»; no entran en contextFigures', () => {
    const d = decision()
    const f = forecastFigures(d)
    assert.ok(f.length >= 3)
    assert.ok(f.every((x) => x.source === 'forecast' && x.label.startsWith('Previsión: ')))
    assert.deepEqual(f.find((x) => x.label === 'Previsión: ingresos mensuales')?.text, '35,00 €')
    assert.ok(!contextFigures(d.context).some((x) => x.label.startsWith('Previsión')))
    assert.ok(!contextFigures(d.context).some((x) => /Ingresos/.test(x.label) && x.cents === 3_500 && x.source !== 'context'))
    const allowed = buildAllowedFigures(d)
    assert.ok(f.every((x) => allowed.figures.some((a) => a.key === x.key && a.label === x.label && a.source === 'forecast')))
    assert.ok(figuresOf(d).some((x) => x.label === 'Previsión: ingresos mensuales'), 'el modelo las recibe etiquetadas')
  })

  it('sin ingreso recurrente no hay figuras de previsión', () => {
    assert.deepEqual(forecastFigures(decide({ context: simple() })), [])
  })

  it('la previsión está entre las señales relevantes de este escenario', () => {
    assert.ok(decision().relevant.some(isForecast))
  })

  it('pasa: la expresión cita la previsión como previsión', () => {
    const d = decision()
    const verdict = validateExpression(d, expressionOf(d, (id, t) => (id.startsWith('objectives.forecast:') ? 'Tus ingresos previstos son 35,00 € al mes.' : t)))
    assert.deepEqual(verdict, { ok: true })
  })

  it('pasa: la expresión repite el texto de la señal', () => {
    const d = decision()
    assert.deepEqual(validateExpression(d, expressionOf(d)), { ok: true })
  })

  it('no pasa: la expresión presenta la previsión como dinero disponible', () => {
    const d = decision()
    const verdict = validateExpression(d, expressionOf(d, (id, t) => (id.startsWith('objectives.forecast:') ? 'Tienes 35,00 € disponibles.' : t)))
    assert.equal(verdict.ok, false)
    assert.ok(!verdict.ok && verdict.violations.some((v) => v.invariant === 'figures' && /cifra prevista presentada como real/.test(v.detail)))
  })
})

/* ------------------------------- neutralidad ------------------------------- */

describe('previsión · neutralidad financiera y sin doble contabilización', () => {
  it('ninguna cifra real cambia con o sin ingreso recurrente', () => {
    const c = ctx()
    const a = decide({ context: c })
    const b = decide({ context: c, memory: memoryWith(fact(3_500), fact(1_000, 'Regalos')) })
    assert.deepEqual(b.context, a.context, 'wealth, flows (current, previous, history, closedMonths), objetivos, inversiones y calidad')
    assert.equal(b.context.flows.current.incomeCents, c.flows.current.incomeCents, 'la previsión no suma a los ingresos registrados')
    assert.equal(b.context.wealth.liquidCents, c.wealth.liquidCents)
    assert.equal(b.context.wealth.totalCents, c.wealth.totalCents)
    assert.deepEqual(contextFigures(b.context), contextFigures(a.context))
  })

  it('las reglas de ahorro, gasto, liquidez, inversión y objectives.pace dan exactamente lo mismo', () => {
    const withDate = ctx({ objectives: [objective({ id: 'obj-viaje', name: 'Viaje', targetCents: 50_000, currentCents: 10_000, targetDate: '2027-06-30' })] })
    const a = decide({ context: withDate })
    const b = decide({ context: withDate, memory: memoryWith(fact(3_500)) })
    assert.deepEqual(b.signals.filter((s) => !isForecast(s)), a.signals)
    assert.deepEqual(b.signals.find((s) => s.id.startsWith('objectives.pace:')), a.signals.find((s) => s.id.startsWith('objectives.pace:')))
    for (const k of ['lead', 'recommendation', 'alternatives', 'uncertainties', 'confidence'] as const) assert.deepEqual(b[k], a[k], k)
  })

  it('el contexto se construye sin memoria: el ingreso recurrente no puede entrar en él', () => {
    const one = snap()
    assert.deepEqual(buildFinancialContext(one, TODAY), buildFinancialContext(one, TODAY), "misma instantánea → mismo contexto, haya o no memoria")
  })
})

/* -------------------------------- golden nuevo -------------------------------- */

describe('previsión · golden', () => {
  it('decisión completa con ingreso recurrente, objetivo y previsión (regenerable solo con UPDATE_GOLDEN=1)', () => {
    const d = JSON.parse(JSON.stringify(decide({ context: ctx(), memory: memoryWith(fact(3_500), fact(1_000, 'Regalos')) })))
    if (UPDATE || !existsSync(SNAPSHOT)) {
      mkdirSync(dirname(SNAPSHOT), { recursive: true })
      writeFileSync(SNAPSHOT, `${JSON.stringify(d, null, 2)}\n`)
    }
    assert.deepEqual(d, JSON.parse(readFileSync(SNAPSHOT, 'utf8')))
  })
})
