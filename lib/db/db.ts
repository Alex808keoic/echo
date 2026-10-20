/**
 * Base de datos local (IndexedDB vía Dexie).
 * Todos los datos de Finax viven en el dispositivo: offline-first, sin login.
 * Índices declarados: solo los que se consultan. `id` es la clave primaria.
 */
import Dexie, { type EntityTable } from 'dexie'
import { currentCategory, type AppConfig, type Debt, type Movement, type Objective, type Position, type RecurringMovement } from '../types'
import type { MarketCacheEntry } from './market'
import type { AxisMemoryEntry } from './axis-memory'
import type { ConversationEntry } from './axis-conversation'
import type { UserMemory } from '../axis/chat/types'
import type { PlanChecksEntry } from './plan-checks'

export const CONFIG_KEY = 'config' as const

/**
 * Registro de `meta`: `backup` guarda cuándo exportaste la última copia (`at`, ms);
 * `recurring-hint`, cuándo cerraste la tarjeta de Inicio que propone añadir tus fijos.
 */
export interface MetaEntry {
  key: 'backup' | 'recurring-hint'
  at: number
}

export const db = new Dexie('finax') as Dexie & {
  movements: EntityTable<Movement, 'id'>
  objectives: EntityTable<Objective, 'id'>
  positions: EntityTable<Position, 'id'>
  config: EntityTable<AppConfig, 'key'>
  /** Caché de la investigación de mercado (no son datos del usuario; no entra en el backup). */
  market: EntityTable<MarketCacheEntry, 'key'>
  /** Memoria de AXIS: conclusiones anteriores (contexto, no fuente de verdad financiera). */
  axisMemory: EntityTable<AxisMemoryEntry, 'key'>
  /** Memorias aceptadas por el usuario en conversaciones con AXIS (no entran en el backup). */
  axisMemories: EntityTable<UserMemory, 'id'>
  /** Historial reciente + resumen de la conversación con AXIS (registro único). */
  axisConversation: EntityTable<ConversationEntry, 'key'>
  /** «Tu decisión del mes»: qué pasos has marcado como hechos, por mes (no entra en el backup). */
  planChecks: EntityTable<PlanChecksEntry, 'key'>
  /** Deudas introducidas a mano (entran en el backup desde la v3). */
  debts: EntityTable<Debt, 'id'>
  /** Datos de funcionamiento (p. ej. cuándo hiciste la última copia). No entra en el backup. */
  meta: EntityTable<MetaEntry, 'key'>
  /** Movimientos fijos (plantillas que se proponen cada vez que tocan; entran en el backup desde la v4). */
  recurring: EntityTable<RecurringMovement, 'id'>
}

db.version(1).stores({
  movements: 'id, date, type, category',
  objectives: 'id',
  positions: 'id, date',
  config: 'key',
})

db.version(2).stores({
  market: 'key',
})

db.version(3).stores({
  axisMemory: 'key',
})

db.version(4).stores({
  axisMemories: 'id, updatedAt',
  axisConversation: 'key',
})

/**
 * Renombrado de la categoría de ingreso «Trabajo» → «Paga». Solo cambia la
 * etiqueta: importes, fechas y el resto del movimiento quedan intactos. Sin
 * este paso, los ingresos anteriores mostrarían una categoría que ya no
 * existe en la lista y no se podrían editar sin reasignarla a mano.
 */
db.version(5)
  .stores({})
  .upgrade((tx) =>
    tx
      .table<Movement, string>('movements')
      .toCollection()
      .modify((m) => {
        const current = currentCategory(m.category)
        if (current !== m.category) m.category = current as Movement['category']
      }),
  )

db.version(6).stores({
  planChecks: 'key',
})

db.version(7).stores({
  debts: 'id',
  meta: 'key',
})

db.version(8).stores({
  recurring: 'id',
})

/**
 * Categorías del 2026-10-20: «Comida» pasa a «Supermercado» y «Salidas» se
 * junta con «Restaurantes» (`LEGACY_CATEGORIES`), en movimientos y en fijos.
 * Solo cambia la etiqueta, como en la v5.
 */
db.version(9)
  .stores({})
  .upgrade(async (tx) => {
    for (const table of ['movements', 'recurring'] as const) {
      await tx
        .table<Movement | RecurringMovement, string>(table)
        .toCollection()
        .modify((m) => {
          const current = currentCategory(m.category)
          if (current !== m.category) m.category = current as Movement['category']
        })
    }
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
