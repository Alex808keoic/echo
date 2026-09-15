/**
 * Filtro de información que NUNCA debe guardarse como memoria de AXIS ni
 * proponerse como tal: credenciales, claves, tokens, números de tarjeta o
 * cuenta. Es una barrera por patrones (no infalible), aplicada en el
 * servidor (al validar la propuesta) y en el cliente (antes de guardar).
 */

const PATTERNS: RegExp[] = [
  // Palabras que anuncian una credencial.
  /\b(contrase[ñn]a|password|passwd|clave (?:de acceso|secreta|del banco)|c[oó]digo (?:pin|de seguridad)|cvv|cvc|api[\s_-]?key|access[\s_-]?token|secret)\b/i,
  /\bpin\b\s*(?:es|:|=)\s*\d/i,
  // Claves con formato conocido (Google, OpenAI, Groq, GitHub, AWS…).
  /\b(AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{16,}|gsk_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/,
  // IBAN.
  /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/,
  // Números de tarjeta (13–19 dígitos, con o sin separadores).
  /\b(?:\d[ -]?){13,19}\b/,
]

export function looksLikeSecret(text: string): boolean {
  return PATTERNS.some((p) => p.test(text))
}
