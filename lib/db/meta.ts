/**
 * Datos de funcionamiento de la app (tabla `meta`): cuándo
 * exportaste la última copia de seguridad (para recordártelo) y si cerraste la
 * tarjeta de Inicio que propone añadir tus fijos. No entra en el
 * backup y se borra con «Borrar todos los datos».
 */
import { db } from './db'

export async function getLastBackupAt(): Promise<number | null> {
  return (await db.meta.get('backup'))?.at ?? null
}

export async function setLastBackupAt(at: number = Date.now()): Promise<void> {
  await db.meta.put({ key: 'backup', at })
}

/** Cuándo cerraste la tarjeta de Inicio que propone añadir tus fijos, o `null` si sigue visible. */
export async function getRecurringHintDismissedAt(): Promise<number | null> {
  return (await db.meta.get('recurring-hint'))?.at ?? null
}

export async function dismissRecurringHint(at: number = Date.now()): Promise<void> {
  await db.meta.put({ key: 'recurring-hint', at })
}
