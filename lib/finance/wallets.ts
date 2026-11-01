/**
 * Efectivo y tarjeta: en qué parte de tu líquido está el dinero.
 *
 * No cambia ninguna cifra existente: el líquido sigue siendo el mismo
 * (`computeLiquidCents`). Aquí solo se parte en dos:
 *
 *   Efectivo = efectivo inicial + movimientos en efectivo
 *              + lo sacado del banco − lo ingresado en el banco.
 *   Banco    = líquido − efectivo (tarjeta, transferencias e inversiones
 *              que salieron del líquido).
 */
import { movementWallet, signedAmountCents, type CashTransfer, type Movement } from '../types'

export interface WalletBalances {
  bankCents: number
  cashCents: number
}

export function cashBalanceCents(initialCashCents: number, movements: Movement[], transfers: CashTransfer[]): number {
  let cash = initialCashCents
  for (const m of movements) if (movementWallet(m) === 'efectivo') cash += signedAmountCents(m)
  for (const t of transfers) cash += t.direction === 'a-efectivo' ? t.amountCents : -t.amountCents
  return cash
}

export function walletBalances(
  liquidCents: number,
  initialCashCents: number,
  movements: Movement[],
  transfers: CashTransfer[],
): WalletBalances {
  const cashCents = cashBalanceCents(initialCashCents, movements, transfers)
  return { cashCents, bankCents: liquidCents - cashCents }
}

/**
 * Traspaso que deja el efectivo en `targetCents` («ahora tengo 40 € en
 * efectivo»): la diferencia pasa del banco al efectivo o al revés. `null` si
 * ya cuadra.
 */
export function cashAdjustment(currentCashCents: number, targetCents: number): Pick<CashTransfer, 'direction' | 'amountCents'> | null {
  const diff = targetCents - currentCashCents
  if (diff === 0) return null
  return diff > 0 ? { direction: 'a-efectivo', amountCents: diff } : { direction: 'a-banco', amountCents: -diff }
}
