/**
 * Errores del almacenamiento local (IndexedDB vía Dexie) y cómo contarlos.
 *
 * Solo es «de almacenamiento» lo que viene de Dexie o de IndexedDB: base que no
 * abre, navegador sin IndexedDB, cuota llena, transacción abortada… Los demás
 * errores (una validación, «Objetivo no encontrado», un fallo de programación)
 * no se disfrazan de fallo del almacenamiento.
 */
import Dexie from 'dexie'

/** Nombres de error de IndexedDB que el navegador puede lanzar sin pasar por Dexie. */
const IDB_DOM_ERRORS = new Set(['QuotaExceededError', 'InvalidStateError', 'UnknownError', 'AbortError', 'VersionError', 'DataError', 'NotFoundError', 'TransactionInactiveError'])

export function isStorageError(error: unknown): boolean {
  if (error instanceof Dexie.DexieError) return true
  return typeof DOMException !== 'undefined' && error instanceof DOMException && IDB_DOM_ERRORS.has(error.name)
}

/** Mensaje para una escritura que no se ha completado (nunca un éxito). */
export function writeErrorMessage(error: unknown): string {
  if (isStorageError(error)) {
    return 'No se ha podido guardar el cambio: el almacenamiento de este navegador ha fallado. Vuelve a intentarlo.'
  }
  return 'No se ha podido completar la operación. Vuelve a intentarlo.'
}

/** Estado de error de una pantalla que no ha podido leer los datos. */
export function readErrorView(error: unknown): { title: string; message: string } {
  if (isStorageError(error)) {
    return {
      title: 'No se han podido leer tus datos',
      message: 'El almacenamiento de este navegador no responde. Tus datos siguen guardados en este dispositivo; vuelve a intentarlo.',
    }
  }
  return {
    title: 'Algo ha fallado al mostrar esta pantalla',
    message: 'No es un problema de tus datos. Vuelve a intentarlo.',
  }
}

export type WriteResult = { ok: true } | { ok: false; error: unknown; message: string }

/**
 * Ejecuta una escritura y devuelve si se completó. Nunca la da por buena si
 * falla, y no oculta el error: queda en consola para poder diagnosticarlo.
 */
export async function attemptWrite(write: () => Promise<unknown>): Promise<WriteResult> {
  try {
    await write()
    return { ok: true }
  } catch (error) {
    console.error('Finax: la operación no se ha completado', error)
    return { ok: false, error, message: writeErrorMessage(error) }
  }
}

/** Exportar solo lee: si falla, los datos no han cambiado. */
export function exportErrorMessage(error: unknown): string {
  return isStorageError(error)
    ? 'No se ha podido exportar: el almacenamiento de este navegador no responde. Tus datos no han cambiado; vuelve a intentarlo.'
    : 'No se ha podido exportar la copia. Tus datos no han cambiado; vuelve a intentarlo.'
}

/** Tras este tiempo, «Cargando tus datos…» ofrece reintentar (p. ej. otra pestaña bloquea la base). */
export const SLOW_LOADING_MS = 8_000

export const SLOW_LOADING_VIEW = {
  title: 'Está tardando más de lo normal',
  message: 'Si tienes Finax abierto en otra pestaña, ciérrala: puede estar bloqueando tus datos. Después, vuelve a intentarlo.',
  retryLabel: 'Reintentar',
} as const
