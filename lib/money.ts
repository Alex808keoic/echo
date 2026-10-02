/**
 * Dinero: conversión entre céntimos enteros (almacenamiento) y texto.
 * El formato visible es siempre es-ES: 3.486,70 €  (ver `lib/format.ts`).
 */
import { formatCurrency } from './format'

/** Formatea céntimos como importe en euros. Admite valores negativos. */
export function formatCents(cents: number, withSign = false): string {
  return formatCurrency(cents / 100, withSign)
}

/** Miles con punto: "1.234" o "1.234.567" (grupos exactos de 3 cifras). */
const DOT_THOUSANDS = /^\d{1,3}(\.\d{3})+$/

/**
 * Lleva el texto a la forma "1234.56". La coma es siempre el decimal (es-ES).
 * Sin coma, el punto es decimal si le siguen 1 o 2 cifras ("12.50" — teclados
 * móviles) y separador de miles si agrupa de 3 en 3 ("1.234"). Cualquier otra
 * mezcla es ambigua y se rechaza en vez de adivinar.
 */
function normalizeDecimal(raw: string): string | null {
  const compact = raw.trim().replace(/\s|€/g, '')
  const negative = compact.startsWith('-')
  const body = negative ? compact.slice(1) : compact
  let whole: string
  let fraction: string | undefined
  if (body.includes(',')) {
    const parts = body.split(',')
    if (parts.length !== 2) return null
    ;[whole, fraction] = parts
    if (whole.includes('.')) {
      if (!DOT_THOUSANDS.test(whole)) return null
      whole = whole.replace(/\./g, '')
    }
  } else if (DOT_THOUSANDS.test(body)) {
    whole = body.replace(/\./g, '')
  } else {
    const parts = body.split('.')
    if (parts.length > 2) return null
    ;[whole, fraction] = parts
  }
  return `${negative ? '-' : ''}${whole}${fraction === undefined ? '' : `.${fraction}`}`
}

function parseDecimalToCents(raw: string): number | null {
  const normalized = normalizeDecimal(raw)
  if (normalized === null || !/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null
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
