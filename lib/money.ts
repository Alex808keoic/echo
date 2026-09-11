/**
 * Dinero: conversión entre céntimos enteros (almacenamiento) y texto.
 * El formato visible es siempre es-ES: 3.486,70 €  (ver `lib/format.ts`).
 */
import { formatCurrency } from './format'

/** Formatea céntimos como importe en euros. Admite valores negativos. */
export function formatCents(cents: number, withSign = false): string {
  return formatCurrency(cents / 100, withSign)
}

function parseDecimalToCents(raw: string): number | null {
  const normalized = raw.trim().replace(/\s|€/g, '').replace(/\./g, '').replace(',', '.')
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null
  const negative = normalized.startsWith('-')
  const [whole, fraction = ''] = normalized.replace('-', '').split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null
  return negative ? -cents : cents
}

/**
 * Convierte lo que escribe el usuario en céntimos ("12,5" → 1250).
 * Devuelve null si no es un importe válido y mayor que cero.
 */
export function parseAmountToCents(raw: string): number | null {
  const cents = parseDecimalToCents(raw)
  return cents !== null && cents > 0 ? cents : null
}

/** Igual que `parseAmountToCents`, pero admite cero y negativos (saldo inicial). */
export function parseBalanceToCents(raw: string): number | null {
  return parseDecimalToCents(raw)
}

/** Representación editable de un importe, para rellenar un formulario. */
export function centsToInputValue(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const whole = Math.trunc(abs / 100)
  const fraction = String(abs % 100).padStart(2, '0')
  return `${sign}${whole},${fraction}`
}
