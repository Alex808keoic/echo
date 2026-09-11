import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { analyzeLocally } from '../local-engine'
import { detectSignals } from '../rules'
import { parseAxisAnalysis, AxisValidationError } from '../validate'
import type { AxisAnalysis, AxisResult } from '../types'
import { config, gasto, healthyMovements, ingreso, NOW, objective, position, snapshot, TODAY } from './fixtures'

function run(partial: Parameters<typeof snapshot>[0]): AxisResult {
  return analyzeLocally({ context: buildFinancialContext(snapshot(partial), TODAY) }, NOW)
}

function analysisOf(result: AxisResult): AxisAnalysis {
  assert.equal(result.status, 'analysis')
  if (result.status !== 'analysis') throw new Error('unreachable')
  return result.analysis
}

describe('AxisEngine (motor local de reglas)', () => {
  it('caso 1 · sin datos → sin análisis, y dice qué necesita', () => {
    const result = run({})
    assert.equal(result.status, 'no-analysis')
    if (result.status !== 'no-analysis') return
    assert.match(result.message, /todavía no puede/)
    assert.ok(result.needs.some((n) => /saldo inicial/i.test(n.label)))
    assert.ok(result.needs.some((n) => /ingresos y gastos/i.test(n.label)))
    assert.equal(result.facts.length, 0)
    assert.equal(result.engine.isAI, false)
  })

  it('caso 2 · solo saldo inicial → datos disponibles pero contexto limitado', () => {
    const ctx = buildFinancialContext(snapshot({ config: config(150_000) }), TODAY)
    assert.equal(ctx.quality.level, 'none')
    assert.equal(ctx.quality.hasInitialBalance, true)
    assert.equal(ctx.wealth.totalCents, 150_000)

    const result = run({ config: config(150_000) })
    assert.equal(result.status, 'no-analysis')
    if (result.status !== 'no-analysis') return
    assert.ok(result.facts.some((f) => f.includes('1.500,00 €')), 'expone el patrimonio conocido')
    assert.ok(!result.needs.some((n) => /saldo inicial/i.test(n.label)), 'ya no pide el saldo inicial')
    assert.equal(result.nextStep.to, 'movimientos')
  })

  it('caso 3 · ingresos y gastos → lectura correcta de ahorro y gasto', () => {
    const ctx = buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements() }), TODAY)
    assert.equal(ctx.flows.current.incomeCents, 200_000)
    assert.equal(ctx.flows.current.expenseCents, 70_000)
    assert.equal(ctx.flows.current.savingsCents, 130_000)
    assert.equal(ctx.flows.current.savingsRatePct, 65)
    assert.equal(ctx.flows.current.expensesByCategory[0].label, 'Comida')
    assert.equal(ctx.wealth.liquidCents, 100_000 + 200_000 - 75_000 + 200_000 - 70_000)

    const analysis = analysisOf(run({ config: config(100_000), movements: healthyMovements() }))
    assert.match(analysis.headline, /65%/)
    assert.match(analysis.headline, /1\.300,00 €/)
    assert.ok(analysis.interpretation.signals.some((s) => s.id === 'savings.healthy'))
    assert.ok(analysis.data.facts.some((f) => f.includes('balance +1.300,00 €')))
  })

  it('caso 4 · aumento de gastos → AXIS detecta la señal y la conecta con la categoría', () => {
    const movements = [
      ingreso('2026-08-01', 200_000),
      gasto('2026-08-10', 50_000, 'Comida'),
      ingreso('2026-09-01', 200_000),
      gasto('2026-09-05', 50_000, 'Comida'),
      gasto('2026-09-08', 60_000, 'Otros', 'Reparación coche'),
    ]
    const analysis = analysisOf(run({ config: config(50_000), movements }))
    const increase = analysis.interpretation.signals.find((s) => s.id === 'expenses.increase')
    assert.ok(increase, 'señal de aumento de gastos')
    assert.match(analysis.data.facts.join(' '), /subido un 120%/)
    assert.match(increase.text, /Reparación coche/)
    assert.ok(analysis.alternatives.length > 0, 'ofrece una alternativa')
    assert.ok(analysis.uncertainty.items.some((u) => /no es una tendencia/i.test(u.title)))
  })

  it('caso 5 · objetivo con progreso → progreso y cantidad restante correctos', () => {
    const goal = objective({ name: 'Viaje', targetCents: 500_000, currentCents: 246_000 })
    const ctx = buildFinancialContext(snapshot({ config: config(300_000), movements: healthyMovements(), objectives: [goal] }), TODAY)
    const o = ctx.objectives[0]
    assert.equal(o.progressPct, 49)
    assert.equal(o.remainingCents, 254_000)
    assert.equal(o.completed, false)
    assert.equal(o.targetDate, undefined)

    const analysis = analysisOf(analyzeLocally({ context: ctx }, NOW))
    assert.ok(analysis.recommendation, 'hay recomendación')
    assert.match(analysis.recommendation.what, /Viaje/)
    assert.match(analysis.recommendation.why, /2\.540,00 €/)
    assert.ok(analysis.uncertainty.items.some((u) => /Sin fecha/.test(u.title)), 'sin fecha no puede valorar el ritmo')
  })

  it('caso 6 · objetivo conseguido → no recomienda seguir aportando al mismo objetivo', () => {
    const done = objective({ name: 'Colchón', targetCents: 100_000, currentCents: 100_000 })
    const ctx = buildFinancialContext(snapshot({ config: config(300_000), movements: healthyMovements(), objectives: [done] }), TODAY)
    assert.equal(ctx.objectives[0].completed, true)
    const analysis = analysisOf(analyzeLocally({ context: ctx }, NOW))
    assert.ok(analysis.recommendation)
    assert.doesNotMatch(analysis.recommendation.what, /Destina parte del excedente a «Colchón»/)
    assert.ok(analysis.data.facts.some((f) => /conseguido/.test(f)))
  })

  it('caso 7 · inversión existente → el patrimonio incorpora su valor', () => {
    const ctx = buildFinancialContext(
      snapshot({
        config: config(100_000),
        movements: healthyMovements(),
        positions: [position({ name: 'Fondo', investedCents: 150_000, valueCents: 158_000 })],
      }),
      TODAY,
    )
    assert.equal(ctx.wealth.investedCents, 158_000)
    assert.equal(ctx.wealth.totalCents, ctx.wealth.liquidCents + 158_000)
    assert.equal(ctx.investments.positions[0].weightPct, 100)
    const analysis = analysisOf(analyzeLocally({ context: ctx }, NOW))
    assert.match(analysis.data.facts[0], /invertido 1\.580,00 €/)
    assert.ok(analysis.uncertainty.items.some((u) => /Valores manuales/.test(u.title)))
  })

  it('caso 8 · datos insuficientes → expresa incertidumbre y confianza baja', () => {
    const movements = [ingreso('2026-09-01', 100_000), gasto('2026-09-03', 20_000)]
    const ctx = buildFinancialContext(snapshot({ config: config(0), movements }), TODAY)
    assert.equal(ctx.quality.level, 'limited')
    assert.equal(ctx.quality.hasPreviousPeriod, false)
    const analysis = analysisOf(analyzeLocally({ context: ctx }, NOW))
    assert.equal(analysis.uncertainty.confidence, 'baja')
    assert.ok(analysis.uncertainty.items.some((u) => /Sin mes anterior/.test(u.title)))
    assert.ok(analysis.uncertainty.items.some((u) => /Sin objetivos/.test(u.title)))
  })

  it('caso 9 · datos demo → los identifica y no los presenta como reales', () => {
    const ctx = buildFinancialContext(snapshot({ config: config(120_000, true), movements: healthyMovements() }), TODAY)
    assert.equal(ctx.quality.isDemo, true)
    const analysis = analysisOf(analyzeLocally({ context: ctx }, NOW))
    assert.equal(analysis.basedOnDemoData, true)
    assert.equal(analysis.uncertainty.confidence, 'baja')
    assert.match(analysis.uncertainty.items[0].title, /demostración/)
  })

  it('caso 10 · múltiples señales → prioriza la crítica y limita el ruido', () => {
    const movements = [
      ingreso('2026-08-01', 200_000),
      gasto('2026-08-10', 50_000, 'Comida'),
      ingreso('2026-09-01', 150_000),
      gasto('2026-09-05', 120_000, 'Comida'),
      gasto('2026-09-08', 60_000, 'Salidas'),
    ]
    const goal = objective({ name: 'Viaje', targetCents: 100_000, currentCents: 95_000 })
    const ctx = buildFinancialContext(snapshot({ config: config(50_000), movements, objectives: [goal] }), TODAY)
    const signals = detectSignals(ctx)
    assert.equal(signals[0].id, 'expenses.over-income')
    assert.equal(signals[0].priority, 'critical')
    const order = signals.map((s) => s.priority)
    const rank = { critical: 0, high: 1, medium: 2, low: 3 }
    for (let i = 1; i < order.length; i++) assert.ok(rank[order[i - 1]] <= rank[order[i]], 'orden por prioridad')
    assert.ok(signals.some((s) => s.id.startsWith('objectives.near')))
    assert.ok(signals.some((s) => s.id === 'income.drop'))

    const analysis = analysisOf(analyzeLocally({ context: ctx }, NOW))
    assert.match(analysis.headline, /superan a los ingresos/)
    assert.ok(analysis.recommendation)
    assert.match(analysis.recommendation.what, /Comida/)
    assert.ok(analysis.interpretation.signals.length <= 4)
    assert.ok(analysis.data.facts.length <= 5)
    assert.ok(analysis.alternatives.length <= 2)
    assert.ok(analysis.uncertainty.items.length <= 3)
    assert.match(analysis.conclusion.summary, /balance mensual positivo/)
  })

  it('objetivo con fecha → calcula el esfuerzo mensual y avisa si el ahorro no llega', () => {
    const goal = objective({ name: 'Coche', targetCents: 1_000_000, currentCents: 100_000, targetDate: '2027-03-15' })
    const ctx = buildFinancialContext(snapshot({ config: config(0), movements: healthyMovements(), objectives: [goal] }), TODAY)
    const o = ctx.objectives[0]
    assert.ok(o.monthsLeft !== undefined && o.monthsLeft > 5.5 && o.monthsLeft < 6.5)
    assert.ok(o.requiredMonthlyCents !== undefined && o.requiredMonthlyCents > 140_000 && o.requiredMonthlyCents < 165_000)
    const signals = detectSignals(ctx)
    const pace = signals.find((s) => s.id.startsWith('objectives.pace'))
    assert.ok(pace)
    assert.equal(pace.priority, 'high', 'el ahorro del mes (1.300 €) no cubre el ritmo necesario')
    assert.match(pace.recommendation?.what ?? '', /aplazar la fecha/)
  })

  it('nunca ejecuta operaciones: el resultado solo contiene texto y destinos de navegación', () => {
    const analysis = analysisOf(run({ config: config(100_000), movements: healthyMovements() }))
    const json = JSON.stringify(analysis)
    assert.doesNotMatch(json, /"action"|"execute"|"amountCents"/)
    for (const step of [analysis.recommendation?.nextStep, analysis.conclusion.nextStep]) {
      if (step?.to) assert.ok(['inicio', 'dinero', 'movimientos', 'estadisticas', 'objetivos', 'inversiones'].includes(step.to))
    }
  })
})

describe('parseAxisAnalysis (frontera de validación)', () => {
  const valid = (): AxisAnalysis => analysisOf(run({ config: config(100_000), movements: healthyMovements() }))

  it('acepta un análisis válido y lo devuelve normalizado', () => {
    const a = valid()
    assert.deepEqual(parseAxisAnalysis(JSON.parse(JSON.stringify(a))), a)
  })

  it('rechaza estructuras arbitrarias', () => {
    assert.throws(() => parseAxisAnalysis(null), AxisValidationError)
    assert.throws(() => parseAxisAnalysis({ headline: 'x' }), AxisValidationError)
    assert.throws(() => parseAxisAnalysis({ ...valid(), uncertainty: { items: [], confidence: 'total' } }), AxisValidationError)
  })

  it('sanea textos y descarta destinos desconocidos', () => {
    const tampered = {
      ...valid(),
      headline: '  Hola    mundo \n ',
      conclusion: { summary: 'ok', nextStep: { label: 'Ir', to: 'https://evil.example' } },
    }
    const parsed = parseAxisAnalysis(tampered)
    assert.equal(parsed.headline, 'Hola mundo')
    assert.equal(parsed.conclusion.nextStep?.to, undefined)
  })

  it('acota longitudes y listas', () => {
    const parsed = parseAxisAnalysis({ ...valid(), headline: 'a'.repeat(5000), data: { facts: Array(50).fill('f') } })
    assert.equal(parsed.headline.length, 600)
    assert.equal(parsed.data.facts.length, 8)
  })
})
