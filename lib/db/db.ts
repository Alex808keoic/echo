/**
 * Base de datos local (IndexedDB vía Dexie).
 * Todos los datos de Finax viven en el dispositivo: offline-first, sin login.
 * Índices declarados: solo los que se consultan. `id` es la clave primaria.
 */
import Dexie, { type EntityTable } from 'dexie'
import type { AppConfig, Movement, Objective, Position } from '../types'

export const CONFIG_KEY = 'config' as const

export const db = new Dexie('finax') as Dexie & {
  movements: EntityTable<Movement, 'id'>
  objectives: EntityTable<Objective, 'id'>
  positions: EntityTable<Position, 'id'>
  config: EntityTable<AppConfig, 'key'>
}

db.version(1).stores({
  movements: 'id, date, type, category',
  objectives: 'id',
  positions: 'id, date',
  config: 'key',
})

/** UUID v4. `crypto.randomUUID` solo existe en contextos seguros (https/localhost); en http por IP local se usa el fallback. */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
}
