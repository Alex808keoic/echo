/**
 * De las filas de un extracto a lo que se guarda: movimientos (pagados con
 * tarjeta/banco) y traspasos con el efectivo (cajero). Puro y testeable; la
 * pantalla de revisión solo cambia selección, tipo y categoría.
 */
import { ADULT_EXPENSE_CATEGORIES, requiresMotivo, type CashTransfer, type CashTransferInput, type Category, type ExpenseCategory, type Movement, type MovementInput, type MovementType } from '../types'
import type { StatementRow } from './bank-statement'

export type ImportKind = StatementRow['kind']

export interface ImportDraft {
  key: string
  date: string
  concept: string
  amountCents: number
  kind: ImportKind
  category: Category
  selected: boolean
  /** Ya hay un movimiento (o traspaso) igual: fecha, importe y tipo. Empieza sin marcar. */
  duplicate: boolean
}

export function kindToType(kind: ImportKind): MovementType | null {
  return kind === 'gasto' || kind === 'ingreso' ? kind : null
}

function isDuplicate(row: Pick<StatementRow, 'date' | 'amountCents' | 'kind'>, movements: Movement[], transfers: CashTransfer[]): boolean {
  const type = kindToType(row.kind)
  if (type) return movements.some((m) => m.date === row.date && m.amountCents === row.amountCents && m.type === type)
  const direction = row.kind === 'retirada-efectivo' ? 'a-efectivo' : 'a-banco'
  return transfers.some((t) => t.date === row.date && t.amountCents === row.amountCents && t.direction === direction)
}

/** Borradores para revisar. Un menor no recibe categorías de adulto: van a «Otros». */
export function draftsFrom(rows: StatementRow[], movements: Movement[], transfers: CashTransfer[], minor: boolean): ImportDraft[] {
  return rows.map((row, i) => {
    const duplicate = isDuplicate(row, movements, transfers)
    const adultOnly = minor && ADULT_EXPENSE_CATEGORIES.includes(row.category as ExpenseCategory)
    return {
      key: `${i}-${row.date}-${row.amountCents}`,
      date: row.date,
      concept: row.concept,
      amountCents: row.amountCents,
      kind: row.kind,
      category: adultOnly ? 'Otros' : row.category,
      selected: !duplicate,
      duplicate,
    }
  })
}

export interface ImportPlan {
  movements: MovementInput[]
  transfers: CashTransferInput[]
}

/** Lo que se guardará con los borradores marcados. El concepto del banco queda como nota (o como motivo en «Otros»). */
export function planImport(drafts: ImportDraft[]): ImportPlan {
  const movements: MovementInput[] = []
  const transfers: CashTransferInput[] = []
  for (const d of drafts) {
    if (!d.selected) continue
    const type = kindToType(d.kind)
    if (!type) {
      transfers.push({ direction: d.kind === 'retirada-efectivo' ? 'a-efectivo' : 'a-banco', amountCents: d.amountCents, date: d.date, nota: d.concept.slice(0, 200) })
      continue
    }
    const otros = requiresMotivo(d.category)
    movements.push({
      type,
      amountCents: d.amountCents,
      date: d.date,
      category: d.category,
      ...(otros ? { motivo: d.concept.slice(0, 60) } : {}),
      nota: `Extracto: ${d.concept}`.slice(0, 200),
    })
  }
  return { movements, transfers }
}
