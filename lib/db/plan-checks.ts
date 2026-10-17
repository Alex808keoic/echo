/**
 * «Tu decisión del mes»: los pasos que has marcado como hechos (Dexie, tabla
 * `planChecks`, un registro por mes `YYYY-MM`). Es solo una ayuda para llevar
 * la cuenta: no cambia el plan ni ningún dinero. No entra en el backup y se
 * borra con «Borrar todos los datos».
 */
import { db } from './db'

export interface PlanChecksEntry {
  /** Mes `YYYY-MM`. */
  key: string
  /** Ids de `monthChecklist` marcados como hechos. */
  done: string[]
  updatedAt: number
}

export async function getPlanChecks(month: string): Promise<string[]> {
  return (await db.planChecks.get(month))?.done ?? []
}

/** Marca o desmarca un paso del mes. */
export async function setPlanCheck(month: string, id: string, done: boolean): Promise<void> {
  await db.transaction('rw', db.planChecks, async () => {
    const current = (await db.planChecks.get(month))?.done ?? []
    const next = done ? [...new Set([...current, id])] : current.filter((x) => x !== id)
    await db.planChecks.put({ key: month, done: next, updatedAt: Date.now() })
  })
}
