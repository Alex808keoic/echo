/**
 * Modelo de datos de Finax (V1).
 * ------------------------------------------------------------------
 * Importes siempre en céntimos enteros (D-16). Fechas en `YYYY-MM-DD`
 * en hora local y sin componente horario (D-18).
 */

/* ------------------------------ Movimientos ------------------------------ */

export type MovementType = 'ingreso' | 'gasto'

/** Categorías de gasto (D-04). No añadir, renombrar ni reordenar. */
export const EXPENSE_CATEGORIES = [
  'Comida',
  'Restaurantes',
  'Salidas',
  'Caprichos',
  'Ropa',
  'Otros',
] as const

/** Categorías de ingreso (D-13). Lista independiente de la de gastos. */
export const INCOME_CATEGORIES = ['Trabajo', 'Regalos', 'Otros'] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]
export type Category = ExpenseCategory | IncomeCategory

/** Categoría que obliga a introducir un motivo, en ingresos y en gastos. */
export const CATEGORY_OTROS = 'Otros'

export function categoriesFor(type: MovementType): readonly Category[] {
  return type === 'gasto' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES
}

export function requiresMotivo(category: string): boolean {
  return category === CATEGORY_OTROS
}

export interface Movement {
  id: string
  type: MovementType
  /** Magnitud en céntimos, siempre positiva. El signo lo determina `type`. */
  amountCents: number
  /** Fecha local `YYYY-MM-DD`. */
  date: string
  category: Category
  /** Obligatorio cuando la categoría es «Otros». Sustituye a «Otros» en el historial. */
  motivo?: string
  /** Opcional en todas las categorías (D-05). Solo se muestra en el detalle. */
  nota?: string
  createdAt: number
  updatedAt: number
}

/** Datos que el usuario introduce; el resto los genera la capa de datos. */
export type MovementInput = Omit<Movement, 'id' | 'createdAt' | 'updatedAt'>

/** Etiqueta del movimiento en el historial: el motivo sustituye a «Otros». */
export function movementLabel(movement: Movement): string {
  if (requiresMotivo(movement.category) && movement.motivo) return movement.motivo
  return movement.category
}

/** Aportación del movimiento al patrimonio, con signo, en céntimos. */
export function signedAmountCents(movement: Movement): number {
  return movement.type === 'ingreso' ? movement.amountCents : -movement.amountCents
}

/* -------------------------------- Objetivos ------------------------------- */

export interface Objective {
  id: string
  name: string
  /** Importe alcanzado en céntimos. */
  currentCents: number
  /** Meta en céntimos. */
  targetCents: number
  /** Fecha objetivo `YYYY-MM-DD`, cuando exista. */
  targetDate?: string
  createdAt: number
  updatedAt: number
}

export type ObjectiveInput = Omit<Objective, 'id' | 'createdAt' | 'updatedAt'>

/* ------------------------------- Inversiones ------------------------------ */

/**
 * Posición de inversión introducida manualmente (D-22: activo, importe y
 * fecha). No hay fuente de cotizaciones conectada: el valor actual lo
 * actualiza el usuario a mano y la interfaz lo indica.
 */
export interface Position {
  id: string
  /** Nombre del activo. */
  name: string
  /** Importe aportado en céntimos. */
  investedCents: number
  /** Valor actual en céntimos, actualizado manualmente. */
  valueCents: number
  /** Fecha de la aportación `YYYY-MM-DD`. */
  date: string
  createdAt: number
  updatedAt: number
}

export type PositionInput = Omit<Position, 'id' | 'createdAt' | 'updatedAt'>

/* ------------------------------ Configuración ----------------------------- */

/**
 * Configuración de la instalación. Registro único con clave "config".
 * El saldo inicial es el punto de partida del patrimonio y NO es un
 * movimiento del historial (D-14).
 */
export interface AppConfig {
  key: 'config'
  initialBalanceCents: number
  /** Marca que los datos actuales proceden de la carga de demostración. */
  demo?: boolean
  configuredAt: number
  updatedAt: number
}
