import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guessCategory, leadingDate, parseStatement } from '../bank-statement'

const TODAY = '2026-10-31'

test('fechas: numéricas, con año corto, sin año y con mes en letras', () => {
  assert.equal(leadingDate('15/10/2026 COMPRA', 2026)?.iso, '2026-10-15')
  assert.equal(leadingDate('03-09-26 X', 2026)?.iso, '2026-09-03')
  assert.equal(leadingDate('07.10 X', 2025)?.iso, '2025-10-07')
  assert.equal(leadingDate('12 oct 2026 X', 2026)?.iso, '2026-10-12')
  assert.equal(leadingDate('2026-10-01 X', 2026)?.iso, '2026-10-01')
  assert.equal(leadingDate('31/02/2026', 2026), null)
  assert.equal(leadingDate('COMPRA 15/10/2026', 2026), null)
})

test('extracto con fecha valor, signo explícito y saldo', () => {
  const text = [
    'BANCO EJEMPLO · Extracto de cuenta · Octubre 2026',
    'Fecha Valor Concepto Importe Saldo',
    'SALDO ANTERIOR 1.000,00',
    '01/10/2026 01/10/2026 NOMINA EMPRESA SL +1.500,00 2.500,00',
    '03/10/2026 03/10/2026 COMPRA TARJ. MERCADONA VALENCIA -45,30 2.454,70',
    '05/10/2026 05/10/2026 RETIRADA CAJERO 1234 -50,00 2.404,70',
    '06/10/2026 06/10/2026 RECIBO NETFLIX.COM -12,99 2.391,71',
    'Página 1 de 1',
  ].join('\n')
  const rows = parseStatement(text, TODAY)
  assert.equal(rows.length, 4)
  assert.deepEqual(rows[0], { date: '2026-10-01', concept: 'NOMINA EMPRESA SL', amountCents: 150_000, kind: 'ingreso', category: 'Paga', balanceCents: 250_000 })
  assert.equal(rows[1].kind, 'gasto')
  assert.equal(rows[1].category, 'Supermercado')
  assert.equal(rows[1].amountCents, 4530)
  assert.equal(rows[2].kind, 'retirada-efectivo')
  assert.equal(rows[3].category, 'Suscripciones')
})

test('sin signo: lo decide el saldo, también en orden descendente', () => {
  const text = [
    '20/10/2026 TRANSFERENCIA DE JUAN 100,00 1.150,00',
    '18/10/2026 BAR MANOLO 25,00 1.050,00',
    '15/10/2026 PAGO LIDL 30,00 1.075,00',
  ].join('\n')
  const rows = parseStatement(text, TODAY)
  assert.deepEqual(rows.map((r) => r.kind), ['ingreso', 'gasto', 'gasto'])
  assert.equal(rows[1].category, 'Restaurantes')
  assert.equal(rows[2].category, 'Supermercado')
})

test('sin signo ni saldo: palabras del concepto, y si no, gasto', () => {
  const rows = parseStatement('02/10/2026 ABONO DEVOLUCION AMAZON 19,99\n04/10/2026 ZARA ONLINE 39,95', TODAY)
  assert.equal(rows[0].kind, 'ingreso')
  assert.equal(rows[1].kind, 'gasto')
  assert.equal(rows[1].category, 'Ropa')
})

test('concepto en dos renglones y líneas que no son movimientos', () => {
  const text = ['10/10/2026 TRANSFERENCIA A', 'X', '10/10/2026 PAGO BIZUM A ANA -15,00 900,00', 'CONCEPTO CENA', 'Total movimientos 15,00', '01/12/2026 FUTURO -1,00'].join('\n')
  const rows = parseStatement(text, TODAY)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].concept, 'PAGO BIZUM A ANA CONCEPTO CENA')
})

test('no confunde referencias ni números de tarjeta con importes', () => {
  const rows = parseStatement('11/10/2026 COMPRA TARJETA 4567 REF 99812 CEPSA -60,00 800,00', TODAY)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].amountCents, 6000)
  assert.equal(rows[0].category, 'Transporte')
})

test('categorías: lo que no encaja va a «Otros»', () => {
  assert.equal(guessCategory('IBERDROLA CLIENTES', 'gasto'), 'Facturas')
  assert.equal(guessCategory('ALGO RARO SL', 'gasto'), 'Otros')
  assert.equal(guessCategory('WALLAPOP', 'ingreso'), 'Ventas')
})
