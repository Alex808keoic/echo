/**
 * Traspasos entre el banco y el efectivo (sacar del cajero, ingresar en la
 * cuenta). No son movimientos: no cambian el líquido ni el patrimonio.
 */
import { db, newId } from './db'
import type { CashTransfer, CashTransferInput, MovementInput } from '../types'
import { addMovements } from './movements'

function normalize(input: CashTransferInput): CashTransferInput {
  const nota = input.nota?.trim()
  return { direction: input.direction, amountCents: input.amountCents, date: input.date, ...(nota ? { nota } : {}) }
}

/** Del más reciente al más antiguo. */
export async function listCashTransfers(): Promise<CashTransfer[]> {
  const transfers = await db.cashTransfers.toArray()
  return transfers.sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : b.createdAt - a.createdAt))
}

export async function addCashTransfer(input: CashTransferInput): Promise<CashTransfer> {
  const now = Date.now()
  const transfer: CashTransfer = { ...normalize(input), id: newId(), createdAt: now, updatedAt: now }
  await db.cashTransfers.add(transfer)
  return transfer
}

export async function deleteCashTransfer(id: string): Promise<void> {
  await db.cashTransfers.delete(id)
}

/**
 * Guarda de una vez lo importado de un extracto: movimientos y traspasos.
 * Todo o nada: si algo falla, no se guarda ninguno.
 */
export async function saveImport(movements: MovementInput[], transfers: CashTransferInput[]): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', [db.movements, db.cashTransfers], async () => {
    if (movements.length > 0) await addMovements(movements)
    if (transfers.length > 0) {
      await db.cashTransfers.bulkAdd(transfers.map((t) => ({ ...normalize(t), id: newId(), createdAt: now, updatedAt: now })))
    }
  })
}
