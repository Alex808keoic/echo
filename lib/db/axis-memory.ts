/**
 * Memoria de AXIS (Dexie, tabla `axisMemory`, registro único "memory").
 *
 * Guarda las últimas conclusiones que AXIS ha mostrado, para que el siguiente
 * análisis pueda tenerlas en cuenta («la lectura anterior decía…»). Es
 * contexto adicional: NUNCA es fuente de verdad financiera, no contiene
 * importes del usuario ni entra en el backup. Se borra con «Borrar todos los datos».
 *
 * `getAxisMemory()` devuelve la memoria completa que reciben el análisis y la
 * conversación: conclusiones anteriores + memorias aceptadas por el usuario
 * (tabla `axisMemories`, ver lib/db/axis-memories.ts).
 */
import type { AxisAnalysis, AxisMemory } from '../axis/types'
import { memoriesForModel } from '../axis/chat/memory'
import { db } from './db'

export const AXIS_MEMORY_KEY = 'memory' as const
export const MAX_REMEMBERED_CONCLUSIONS = 5

export interface AxisMemoryEntry {
  key: typeof AXIS_MEMORY_KEY
  memory: AxisMemory
  updatedAt: number
}

export async function getAxisMemory(): Promise<AxisMemory | null> {
  const [entry, userMemories] = await Promise.all([db.axisMemory.get(AXIS_MEMORY_KEY), db.axisMemories.toArray()])
  if (!entry && userMemories.length === 0) return null
  return { ...(entry?.memory ?? {}), ...(userMemories.length > 0 ? { userMemories: memoriesForModel(userMemories) } : {}) }
}

/** Recuerda la conclusión de un análisis (deduplicada por fecha de generación). */
export async function rememberConclusion(analysis: AxisAnalysis): Promise<void> {
  const entry = await db.axisMemory.get(AXIS_MEMORY_KEY)
  const current = entry?.memory ?? {}
  const previous = current.previousConclusions ?? []
  if (previous.some((c) => c.generatedAt === analysis.generatedAt)) return
  const summary = `${analysis.headline} ${analysis.conclusion.summary}`.slice(0, 300)
  const previousConclusions = [{ generatedAt: analysis.generatedAt, summary }, ...previous].slice(0, MAX_REMEMBERED_CONCLUSIONS)
  await db.axisMemory.put({ key: AXIS_MEMORY_KEY, memory: { ...current, previousConclusions }, updatedAt: Date.now() })
}
