/**
 * Copia de seguridad: exportar e importar todos los datos locales en JSON.
 * Formato versionado para que futuras versiones puedan migrarlo.
 */
import { CONFIG_KEY, db } from './db'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type AppConfig,
  type Movement,
  type Objective,
  type Position,
} from '../types'
import { isValidISODate } from '../dates'

export const BACKUP_FORMAT = 'finax-backup'
export const BACKUP_VERSION = 1

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  config: AppConfig | null
  movements: Movement[]
  objectives: Objective[]
  positions: Position[]
}

export async function exportBackup(): Promise<Backup> {
  const [config, movements, objectives, positions] = await Promise.all([
    db.config.get(CONFIG_KEY),
    db.movements.toArray(),
    db.objectives.toArray(),
    db.positions.toArray(),
  ])
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    config: config ?? null,
    movements,
    objectives,
    positions,
  }
}

/* ------------------------------- Validación ------------------------------- */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isInt = (v: unknown): v is number => Number.isSafeInteger(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isOptStr = (v: unknown): v is string | undefined => v === undefined || isStr(v)

function isMovement(v: unknown): v is Movement {
  if (!isRecord(v)) return false
  const cats: readonly string[] = v.type === 'gasto' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES
  return (
    isStr(v.id) &&
    (v.type === 'ingreso' || v.type === 'gasto') &&
    isInt(v.amountCents) &&
    v.amountCents > 0 &&
    isStr(v.date) &&
    isValidISODate(v.date) &&
    isStr(v.category) &&
    cats.includes(v.category) &&
    isOptStr(v.motivo) &&
    isOptStr(v.nota) &&
    isInt(v.createdAt) &&
    isInt(v.updatedAt)
  )
}

function isObjective(v: unknown): v is Objective {
  return (
    isRecord(v) &&
    isStr(v.id) &&
    isStr(v.name) &&
    isInt(v.currentCents) &&
    isInt(v.targetCents) &&
    (v.targetDate === undefined || (isStr(v.targetDate) && isValidISODate(v.targetDate))) &&
    isInt(v.createdAt) &&
    isInt(v.updatedAt)
  )
}

function isPosition(v: unknown): v is Position {
  return (
    isRecord(v) &&
    isStr(v.id) &&
    isStr(v.name) &&
    isInt(v.investedCents) &&
    isInt(v.valueCents) &&
    isStr(v.date) &&
    isValidISODate(v.date) &&
    isInt(v.createdAt) &&
    isInt(v.updatedAt)
  )
}

function isConfig(v: unknown): v is AppConfig {
  return (
    isRecord(v) &&
    v.key === CONFIG_KEY &&
    isInt(v.initialBalanceCents) &&
    isInt(v.configuredAt) &&
    isInt(v.updatedAt)
  )
}

/** Analiza el JSON de un backup. Lanza un error legible si no es válido. */
export function parseBackup(text: string): Backup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('El archivo no es un JSON válido.')
  }
  if (!isRecord(raw) || raw.format !== BACKUP_FORMAT) {
    throw new Error('El archivo no es una copia de seguridad de Finax.')
  }
  if (raw.version !== BACKUP_VERSION) {
    throw new Error(`Versión de copia no compatible (${String(raw.version)}).`)
  }
  const { movements, objectives, positions, config } = raw
  if (!Array.isArray(movements) || !movements.every(isMovement)) {
    throw new Error('La copia contiene movimientos no válidos.')
  }
  if (!Array.isArray(objectives) || !objectives.every(isObjective)) {
    throw new Error('La copia contiene objetivos no válidos.')
  }
  if (!Array.isArray(positions) || !positions.every(isPosition)) {
    throw new Error('La copia contiene inversiones no válidas.')
  }
  if (config !== null && !isConfig(config)) {
    throw new Error('La copia contiene una configuración no válida.')
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: isStr(raw.exportedAt) ? raw.exportedAt : '',
    config,
    movements,
    objectives,
    positions,
  }
}

/** Sustituye TODOS los datos locales por los de la copia (operación atómica). */
export async function restoreBackup(backup: Backup): Promise<void> {
  await db.transaction('rw', db.config, db.movements, db.objectives, db.positions, async () => {
    await Promise.all([
      db.config.clear(),
      db.movements.clear(),
      db.objectives.clear(),
      db.positions.clear(),
    ])
    if (backup.config) await db.config.put(backup.config)
    await db.movements.bulkAdd(backup.movements)
    await db.objectives.bulkAdd(backup.objectives)
    await db.positions.bulkAdd(backup.positions)
  })
}

/** Borra todos los datos locales. */
export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.config, db.movements, db.objectives, db.positions, async () => {
    await Promise.all([
      db.config.clear(),
      db.movements.clear(),
      db.objectives.clear(),
      db.positions.clear(),
    ])
  })
}
