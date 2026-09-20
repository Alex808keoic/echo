/**
 * Cifras permitidas (fase 2 · bloque 1): conjunto cerrado, tipado y trazable.
 * El modelo solo puede escribir representaciones cuya clave normalizada esté
 * autorizada por AXIS; ni redondeos libres, ni unidades transformadas, ni
 * números desnudos sin respaldo, ni cálculos fuera de la lista cerrada.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { allowedFigureKeys, buildAllowedFigures, checkFigures, contextFigures, decisionTextFigures, deriveFigures, extractFigures, figureKey, figuresOf, messageFigures } from '../core/figures'
import type { AxisDecision } from '../types'
import { config, healthyMovements, objective, snapshot, TODAY } from './fixtures'

const input = () => ({ context: buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements(), objectives: [objective({ name: 'Viaje', targetCents: 500_000, currentCents: 246_000 })] }), TODAY) })
const decision = (): AxisDecision => decide(input())

describe('AXIS · cifras permitidas · extracción y claves', () => {
  it('equivalencias de formato: 1.300 € ≡ 1.300,00 € ≡ 1300 € ≡ 1.300 euros; 65 % ≡ 65%', () => {
    for (const raw of ['1.300 €', '1.300,00 €', '1300 €', '1300,00€', '1.300 euros', '+1.300,00 €']) assert.equal(figureKey(raw), 'm:1300.00', raw)
    assert.equal(figureKey('-50,00 €'), 'm:-50.00')
    assert.equal(figureKey('65 %'), figureKey('65%'))
    assert.notEqual(figureKey('1.300,50 €'), figureKey('1.300,00 €'), 'los decimales cuentan')
    assert.notEqual(figureKey('65,4 %'), figureKey('65 %'))
  })

  it('extrae importes, porcentajes, recuentos con unidad y números desnudos; ignora fechas y años', () => {
    const got = extractFigures('Ahorras 1.300,00 € (65%) en 2 meses; te quedan 3450 y 12.500; desde 2026-09-15 y en 2027, 100 euros.')
    assert.deepEqual(
      got.map((f) => [f.kind, f.key]),
      [
        ['money', 'm:1300.00'],
        ['money', 'm:100.00'],
        ['percent', 'p:65'],
        ['count', 'c:2'],
        ['bare', 'b:3450'],
        ['bare', 'b:12500'],
      ],
    )
    assert.equal(extractFigures('el 65 es un número').some((f) => f.kind === 'bare'), false, 'números cortos sin separador no se consideran')
  })
})

describe('AXIS · cifras permitidas · conjunto cerrado', () => {
  it('cada cifra permitida está tipada, con texto canónico y clave coherente', () => {
    const set = buildAllowedFigures(decision(), { message: 'Quiero meter 100 € al viaje' })
    assert.ok(set.figures.length > 40)
    for (const f of set.figures) {
      assert.ok(['money', 'percent', 'count'].includes(f.kind))
      assert.ok(['context', 'decision-text', 'message', 'derived'].includes(f.source))
      assert.equal(f.key, f.kind === 'count' ? `c:${f.value}` : figureKey(f.text), `${f.label}: ${f.text}`)
      if (f.kind === 'money') assert.equal(typeof f.cents, 'number')
      else assert.equal(typeof f.value, 'number')
      if (f.source === 'derived') assert.ok(f.derivedFrom && f.derivedFrom.inputs.every((k) => set.keys.has(k)), `entradas trazables: ${f.label}`)
      assert.ok(set.keys.has(f.key))
    }
  })

  it('derivadas solo con importe explícito del mensaje, con operaciones cerradas y entradas trazables', () => {
    const ctx = input().context
    assert.deepEqual(deriveFigures(ctx, '¿Cómo van mis gastos este mes?'), [])
    assert.deepEqual(deriveFigures(ctx, 'te quedan 3450'), [], 'un número desnudo no es un importe explícito')
    assert.deepEqual(deriveFigures(ctx, 'un 10% de lo que gano'), [], 'un porcentaje no es un importe')
    const derived = deriveFigures(ctx, '¿Puedo meter 100 € al viaje?')
    assert.deepEqual(derived.map((f) => f.derivedFrom?.op), ['liquid-minus', 'free-liquid-minus', 'savings-minus', 'amount-over-income'])
    const liquidMinus = derived[0]
    assert.equal(liquidMinus.cents, ctx.wealth.liquidCents - 10_000)
    assert.equal(liquidMinus.text, '3.450,00 €')
    assert.deepEqual(liquidMinus.derivedFrom, { op: 'liquid-minus', inputs: ['m:3550.00', 'm:100.00'] })
    assert.equal(ctx.wealth.reservedForObjectivesCents, 246_000)
    assert.deepEqual(derived[1].derivedFrom, { op: 'free-liquid-minus', inputs: ['m:3550.00', 'm:2460.00', 'm:100.00'] }, 'liquid − reservado − importe: las tres entradas declaradas')
    assert.equal(derived[1].cents, 355_000 - 246_000 - 10_000)
    assert.equal(derived[3].kind, 'percent')
    assert.equal(derived[3].value, 5, '100 € sobre 2.000,00 € de ingresos')
    // Ninguna otra aritmética: la suma, por ejemplo, no existe.
    assert.equal(derived.some((f) => f.cents === ctx.wealth.liquidCents + 10_000), false)
  })

  it('cada derivada es reproducible EXCLUSIVAMENTE a partir de las claves que declara', () => {
    // Con reserva en objetivos, para que liquid − reservado − importe difiera de liquid − importe.
    const ctx = buildFinancialContext(
      snapshot({ config: config(100_000), movements: healthyMovements(), objectives: [objective({ name: 'Viaje', targetCents: 500_000, currentCents: 120_000 })] }),
      TODAY,
    )
    assert.ok(ctx.wealth.reservedForObjectivesCents > 0)
    const d = decide({ context: ctx })
    const set = buildAllowedFigures(d, { message: '¿Puedo meter 100 € al viaje?' })
    const byKey = new Map(set.figures.filter((f) => f.source !== 'derived').map((f) => [f.key, f]))
    const centsOf = (key: string) => {
      const f = byKey.get(key)
      assert.ok(f && f.kind === 'money' && typeof f.cents === 'number', `entrada no declarada o no monetaria: ${key}`)
      return f.cents
    }
    const recompute: Record<string, (inputs: string[]) => number> = {
      'liquid-minus': ([liquid, a]) => centsOf(liquid) - centsOf(a),
      'free-liquid-minus': ([liquid, reserved, a]) => centsOf(liquid) - centsOf(reserved) - centsOf(a),
      'savings-minus': ([savings, a]) => centsOf(savings) - centsOf(a),
      'amount-over-income': ([a, income]) => Math.round((centsOf(a) / centsOf(income)) * 100),
    }
    const derived = set.figures.filter((f) => f.source === 'derived')
    assert.equal(derived.length, 4)
    for (const f of derived) {
      assert.ok(f.derivedFrom, f.label)
      const expected = recompute[f.derivedFrom.op](f.derivedFrom.inputs)
      assert.equal(f.kind === 'money' ? f.cents : f.value, expected, `${f.label} no se reproduce desde ${f.derivedFrom.inputs.join(' · ')}`)
      for (const k of f.derivedFrom.inputs) assert.ok(byKey.has(k), `entrada fuera del conjunto: ${k}`)
    }
    const free = derived.find((f) => f.derivedFrom?.op === 'free-liquid-minus')!
    assert.equal(free.cents, ctx.wealth.liquidCents - ctx.wealth.reservedForObjectivesCents - 10_000)
    assert.notEqual(free.cents, ctx.wealth.liquidCents - 10_000, 'con reserva, difiere de liquid-minus')
  })

  it('lo que el usuario escribe se puede citar; el texto libre de la memoria nunca entra', () => {
    const set = buildAllowedFigures(decision(), { message: 'Tengo 7.777,00 € en otro banco' })
    assert.ok(set.keys.has('m:7777.00'))
    assert.equal(set.figures.find((f) => f.key === 'm:7777.00')?.source, 'message')
    const withoutMessage = buildAllowedFigures(decision())
    assert.equal(withoutMessage.keys.has('m:7777.00'), false)
    assert.equal(messageFigures('').length, 0)
  })
})

describe('AXIS · cifras permitidas · validación', () => {
  it('acepta representaciones equivalentes y rechaza decimales inventados, unidades transformadas y cálculos', () => {
    const set = buildAllowedFigures(decision())
    assert.deepEqual(checkFigures('Tienes 3.550 € líquidos, es decir 3.550,00 €, y ahorras el 65 %.', set), [])
    assert.deepEqual(checkFigures('Tienes 3.550,50 € líquidos.', set).map((v) => v.reason), ['not-allowed'])
    assert.deepEqual(checkFigures('Tienes 3,55 mil euros.', set).map((v) => [v.raw, v.reason]), [['3,55 mil euros', 'not-allowed']], 'unidad transformada')
    assert.deepEqual(checkFigures('Tienes 355000 céntimos.', set).map((v) => v.reason), ['bare-number'])
    assert.deepEqual(checkFigures('Te quedarían 3.449,00 € si metes 101 €.', set).map((v) => v.key), ['m:3449.00', 'm:101.00'], 'sin mensaje no hay derivadas ni importe del usuario')
  })

  it('números desnudos: licenciados solo si coinciden con una cifra permitida; los años y fechas no cuentan', () => {
    const set = buildAllowedFigures(decision())
    assert.deepEqual(checkFigures('Tu líquido es 3550 y tu meta 5.000', set), [], 'coinciden con 3.550,00 € y 5.000,00 €')
    assert.deepEqual(checkFigures('Tu líquido es 3.551', set).map((v) => [v.raw, v.reason]), [['3.551', 'bare-number']])
    assert.deepEqual(checkFigures('En 2027 y desde 2026-09-15 todo cambia', set), [])
    assert.deepEqual(checkFigures('Suma 12345 y verás', set).map((v) => v.reason), ['bare-number'])
  })

  it('con el mensaje del usuario, sus cifras y las derivadas quedan permitidas', () => {
    const set = buildAllowedFigures(decision(), { message: '¿Puedo meter 100 € al viaje?' })
    assert.deepEqual(checkFigures('Si metes 100,00 € te quedarían 3.450,00 € líquidos, un 5% de tus ingresos.', set), [])
    assert.deepEqual(checkFigures('Te quedarían 3.400,00 €.', set).map((v) => v.reason), ['not-allowed'], 'una resta que no está en la lista')
  })
})

describe('AXIS · cifras permitidas · compatibilidad', () => {
  it('allowedFigureKeys ≡ contexto ∪ textos de la decisión (sin mensaje, sin derivadas, sin números desnudos)', () => {
    const d = decision()
    const keys = allowedFigureKeys(d)
    const expected = new Set([...contextFigures(d.context).map((f) => f.key), ...decisionTextFigures(d).map((f) => f.key)])
    assert.deepEqual([...keys].sort(), [...expected].sort())
    assert.deepEqual([...keys].sort(), [...buildAllowedFigures(d).keys].sort())
    assert.equal([...keys].some((k) => k.startsWith('b:')), false)
  })

  it('figuresOf conserva la forma {label, value} y el orden (goldens de expressionRequest intactos)', () => {
    const d = decision()
    const figs = figuresOf(d)
    assert.ok(figs.length > 40)
    assert.deepEqual(Object.keys(figs[0]), ['label', 'value'])
    assert.equal(figs[0].label, 'Patrimonio total')
    assert.equal(figs[1].value, '3.550,00 €')
    const labels = figs.map((f) => `${f.label}|${f.value}`)
    assert.equal(new Set(labels).size, labels.length, 'sin duplicados de etiqueta+valor')
  })
})
