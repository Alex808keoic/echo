import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cashAdjustment, cashBalanceCents, walletBalances } from '../wallets'
import type { CashTransfer, Movement } from '../../types'

const mv = (type: Movement['type'], amountCents: number, wallet?: 'efectivo'): Movement => ({
  id: `${type}-${amountCents}-${wallet ?? 'b'}`,
  type,
  amountCents,
  date: '2026-10-01',
  category: type === 'gasto' ? 'Supermercado' : 'Paga',
  ...(wallet ? { wallet } : {}),
  createdAt: 1,
  updatedAt: 1,
})
const tr = (direction: CashTransfer['direction'], amountCents: number): CashTransfer => ({ id: direction + amountCents, direction, amountCents, date: '2026-10-02', createdAt: 1, updatedAt: 1 })

test('sin efectivo, todo el líquido está en el banco', () => {
  assert.deepEqual(walletBalances(50_000, 0, [mv('gasto', 1000)], []), { cashCents: 0, bankCents: 50_000 })
})

test('gastos en efectivo y retiradas del cajero mueven solo el reparto', () => {
  const movements = [mv('gasto', 1500, 'efectivo'), mv('ingreso', 2000, 'efectivo'), mv('gasto', 3000)]
  const transfers = [tr('a-efectivo', 5000), tr('a-banco', 1000)]
  assert.equal(cashBalanceCents(500, movements, transfers), 500 - 1500 + 2000 + 5000 - 1000)
  const b = walletBalances(100_000, 500, movements, transfers)
  assert.equal(b.cashCents + b.bankCents, 100_000)
})

test('ajustar el efectivo crea el traspaso de la diferencia', () => {
  assert.deepEqual(cashAdjustment(1000, 4000), { direction: 'a-efectivo', amountCents: 3000 })
  assert.deepEqual(cashAdjustment(4000, 1000), { direction: 'a-banco', amountCents: 3000 })
  assert.equal(cashAdjustment(1000, 1000), null)
})
