/**
 * Memoria de AXIS (Dexie, tabla `axisMemory`, registro único "memory").
 *
 * Guarda las últimas conclusiones que AXIS ha mostrado, para que el siguiente
 * análisis pueda tenerlas en cuenta («la lectura anterior decía…»). Es
 * contexto adicional: NUNCA es fuente de verdad financiera, no contiene
 * importes del usuario ni entra en el backup. Se borra con «Borrar todos los datos».
 */
import type { AxisAnalysis, AxisMemory } from '../axis/types'
import { db } from './db'

export const AXIS_MEMORY_KEY = 'memory' as const
export const MAX_REMEMBERED_CONCLUSIONS = 5

export interface AxisMemoryEntry {
  key: typeof AXIS_MEMORY_KEY
  memory: AxisMemory
  updatedAt: number
}

export async function getAxisMemory(): Promise<AxisMemory | null> {
  const entry = await db.axisMemory.get(AXIS_MEMORY_KEY)
  return entry?.memory ?? null
}

/** Recuerda la conclusión de un análisis (deduplicada por fecha de generación). */
export async function rememberConclusion(analysis: AxisAnalysis): Promise<void> {
  const current = (await getAxisMemory()) ?? {}
  const previous = current.previousConclusions ?? []
  if (previous.some((c) => c.generatedAt === analysis.generatedAt)) return
  const summary = `${analysis.headline} ${analysis.conclusion.summary}`.slice(0, 300)
  const previousConclusions = [{ generatedAt: analysis.generatedAt, summary }, ...previous].slice(0, MAX_REMEMBERED_CONCLUSIONS)
  await db.axisMemory.put({ key: AXIS_MEMORY_KEY, memory: { ...current, previousConclusions }, updatedAt: Date.now() })
}
