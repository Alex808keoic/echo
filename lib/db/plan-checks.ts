/**
 * «Tu decisión del mes»: los pasos que has marcado como hechos (Dexie, tabla
 * `planChecks`, un registro por mes `YYYY-MM`). Es solo una ayuda para llevar
 * la cuenta: no cambia el plan ni ningún dinero. No entra en el backup y se
 * borra con «Borrar todos los datos».
 */
import { db } from './db'

/** Foto de lo que proponía el plan ese mes, para la revisión al acabar el mes. */
export interface PlannedMonth {
  /** Ahorro que el plan contaba como habitual. */
  savingsCents: number
  /** Lo que proponía invertir a largo plazo, y en qué tipos. */
  investCents: number
  mix: Array<{ key: string; cents: number }>
  /** Pasos de «Tu decisión del mes». */
  items: number
}

export interface PlanChecksEntry {
  /** Mes `YYYY-MM`. */
  key: string
  /** Ids de `monthChecklist` marcados como hechos. */
  done: string[]
  /** La última foto del plan vista ese mes (sin ella, la revisión usa el plan actual y lo dice). */
  planned?: PlannedMonth
  /** Cuándo respondiste «¿Ha cambiado algo este mes?» (ms). */
  checkIn?: number
  updatedAt: number
}

export async function getPlanChecks(month: string): Promise<string[]> {
  return (await db.planChecks.get(month))?.done ?? []
}

export async function getPlanMonth(month: string): Promise<PlanChecksEntry | undefined> {
  return db.planChecks.get(month)
}

/** Guarda la foto del plan del mes si ha cambiado (lo marcado se conserva). */
export async function savePlannedMonth(month: string, planned: PlannedMonth): Promise<void> {
  await db.transaction('rw', db.planChecks, async () => {
    const current = await db.planChecks.get(month)
    if (current?.planned && JSON.stringify(current.planned) === JSON.stringify(planned)) return
    await db.planChecks.put({ ...current, key: month, done: current?.done ?? [], planned, updatedAt: Date.now() })
  })
}

/** Marca o desmarca un paso del mes. */
export async function setPlanCheck(month: string, id: string, done: boolean): Promise<void> {
  await db.transaction('rw', db.planChecks, async () => {
    const entry = await db.planChecks.get(month)
    const current = entry?.done ?? []
    const next = done ? [...new Set([...current, id])] : current.filter((x) => x !== id)
    await db.planChecks.put({ ...entry, key: month, done: next, updatedAt: Date.now() })
  })
}

/** Guarda que este mes ya has respondido «¿Ha cambiado algo?». */
export async function setMonthCheckIn(month: string, at: number = Date.now()): Promise<void> {
  await db.transaction('rw', db.planChecks, async () => {
    const entry = await db.planChecks.get(month)
    await db.planChecks.put({ ...entry, key: month, done: entry?.done ?? [], checkIn: at, updatedAt: Date.now() })
  })
}
