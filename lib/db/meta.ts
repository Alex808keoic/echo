/**
 * Datos de funcionamiento de la app (tabla `meta`): de momento, cuándo
 * exportaste la última copia de seguridad, para recordártelo. No entra en el
 * backup y se borra con «Borrar todos los datos».
 */
import { db } from './db'

export async function getLastBackupAt(): Promise<number | null> {
  return (await db.meta.get('backup'))?.at ?? null
}

export async function setLastBackupAt(at: number = Date.now()): Promise<void> {
  await db.meta.put({ key: 'backup', at })
}
