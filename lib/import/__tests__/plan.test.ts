import { test } from 'node:test'
import assert from 'node:assert/strict'
import { draftsFrom, planImport } from '../plan'
import type { StatementRow } from '../bank-statement'
import type { Movement } from '../../types'

const rows: StatementRow[] = [
  { date: '2026-10-03', concept: 'MERCADONA', amountCents: 4530, kind: 'gasto', category: 'Supermercado' },
  { date: '2026-10-04', concept: 'RENFE VIAJEROS', amountCents: 2000, kind: 'gasto', category: 'Transporte' },
  { date: '2026-10-05', concept: 'CAJERO 1234', amountCents: 5000, kind: 'retirada-efectivo', category: 'Otros' },
  { date: '2026-10-06', concept: 'ALGO RARO SL', amountCents: 999, kind: 'gasto', category: 'Otros' },
]
const existing: Movement = { id: 'a', type: 'gasto', amountCents: 4530, date: '2026-10-03', category: 'Supermercado', createdAt: 1, updatedAt: 1 }

test('lo que ya tienes empieza sin marcar; un menor no recibe categorías de adulto', () => {
  const drafts = draftsFrom(rows, [existing], [], true)
  assert.equal(drafts[0].duplicate, true)
  assert.equal(drafts[0].selected, false)
  assert.equal(drafts[1].category, 'Otros')
  assert.equal(drafts[2].selected, true)
})

test('el plan separa movimientos y traspasos y pone el concepto como motivo en «Otros»', () => {
  const plan = planImport(draftsFrom(rows, [existing], [], false))
  assert.equal(plan.movements.length, 2)
  assert.equal(plan.transfers.length, 1)
  assert.deepEqual(plan.transfers[0], { direction: 'a-efectivo', amountCents: 5000, date: '2026-10-05', nota: 'CAJERO 1234' })
  assert.equal(plan.movements[1].motivo, 'ALGO RARO SL')
  assert.equal(plan.movements[0].motivo, undefined)
  assert.equal(plan.movements[0].nota, 'Extracto: RENFE VIAJEROS')
})
