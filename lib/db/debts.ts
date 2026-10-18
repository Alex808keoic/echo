/**
 * Acceso a datos de deudas (manuales).
 */
import { db, newId } from './db'
import type { Debt, DebtInput } from '../types'

function normalize(input: DebtInput): DebtInput {
  return { ...input, name: input.name.trim() }
}

/** Deudas de la más cara a la más barata (el orden en que conviene devolverlas). */
export async function listDebts(): Promise<Debt[]> {
  const debts = await db.debts.toArray()
  return debts.sort((a, b) => (a.aprBp !== b.aprBp ? b.aprBp - a.aprBp : a.createdAt - b.createdAt))
}

export async function addDebt(input: DebtInput): Promise<Debt> {
  const now = Date.now()
  const debt: Debt = { ...normalize(input), id: newId(), createdAt: now, updatedAt: now }
  await db.debts.add(debt)
  return debt
}

export async function updateDebt(id: string, input: DebtInput): Promise<void> {
  const n = normalize(input)
  await db.debts.update(id, { name: n.name, balanceCents: n.balanceCents, aprBp: n.aprBp, monthlyPaymentCents: n.monthlyPaymentCents, updatedAt: Date.now() })
}

export async function deleteDebt(id: string): Promise<void> {
  await db.debts.delete(id)
}
