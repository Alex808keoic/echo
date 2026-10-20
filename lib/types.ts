/**
 * Modelo de datos de Finax (V1).
 * ------------------------------------------------------------------
 * Importes siempre en céntimos enteros (D-16). Fechas en `YYYY-MM-DD`
 * en hora local y sin componente horario (D-18).
 */

/* ------------------------------ Movimientos ------------------------------ */

export type MovementType = 'ingreso' | 'gasto'

/**
 * Categorías de gasto (D-04, ampliadas el 2026-10-20 por decisión del usuario).
 * El orden es el de los selectores y el de los colores del donut. No renombrar
 * ni quitar sin añadir la equivalencia a `LEGACY_CATEGORIES`.
 */
export const EXPENSE_CATEGORIES = [
  'Supermercado',
  'Restaurantes',
  'Vivienda',
  'Facturas',
  'Transporte',
  'Suscripciones',
  'Caprichos',
  'Ropa',
  'Salud',
  'Deporte',
  'Educación',
  'Viajes',
  'Regalos',
  'Seguros y banco',
  'Otros',
] as const

/**
 * Las que solo se ofrecen a mayores de edad (o a quien no ha dicho su edad).
 * Un menor ve Supermercado, Restaurantes, Caprichos, Ropa, Regalos y Otros.
 */
export const ADULT_EXPENSE_CATEGORIES: readonly ExpenseCategory[] = Object.freeze([
  'Vivienda',
  'Facturas',
  'Transporte',
  'Suscripciones',
  'Salud',
  'Deporte',
  'Educación',
  'Viajes',
  'Seguros y banco',
])

/** Categorías de ingreso (D-13). Lista independiente de la de gastos; las mismas para todas las edades. */
export const INCOME_CATEGORIES = ['Paga', 'Trabajos extra', 'Ventas', 'Regalos', 'Deuda', 'Otros'] as const

/**
 * Ingreso por una deuda: te devuelven lo que te debían. Es dinero real, pero
 * nunca un ingreso «de cada mes»: cuenta como puntual (`isOneOff`).
 */
export const CATEGORY_DEUDA = 'Deuda'

/**
 * Categorías que existieron y ya no: al leer datos antiguos (base local o
 * copia de seguridad) se traducen a la actual. Nunca se ofrecen al usuario.
 * «Comida» se renombró a «Supermercado» y «Salidas» se juntó con
 * «Restaurantes» el 2026-10-20 (decisión del usuario).
 */
export const LEGACY_CATEGORIES: Readonly<Record<string, Category>> = Object.freeze({
  Trabajo: 'Paga',
  Comida: 'Supermercado',
  Salidas: 'Restaurantes',
})

/** Categoría vigente equivalente a una guardada antes, o la misma si ya lo es. */
export function currentCategory(category: string): string {
  return LEGACY_CATEGORIES[category] ?? category
}

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]
export type Category = ExpenseCategory | IncomeCategory

/** Categoría que obliga a introducir un motivo, en ingresos y en gastos. */
export const CATEGORY_OTROS = 'Otros'

/**
 * Categorías que se ofrecen. `minor` (dijo en «Tu perfil» que es menor de
 * edad) quita las de adulto; sin respuesta se ofrecen todas. `keep` sigue
 * ofreciendo la que ya tenía un movimiento al editarlo, aunque ya no toque.
 */
export function categoriesFor(type: MovementType, options: { minor?: boolean; keep?: string | null } = {}): readonly Category[] {
  if (type === 'ingreso') return INCOME_CATEGORIES
  if (!options.minor) return EXPENSE_CATEGORIES
  return EXPENSE_CATEGORIES.filter((c) => !ADULT_EXPENSE_CATEGORIES.includes(c) || c === options.keep)
}

/**
 * Para qué sirve cada gasto (solo se usa con mayores de edad o sin edad
 * dicha): lo necesario para vivir o lo que se puede recortar. «Otros» no se
 * clasifica: su motivo puede ser cualquier cosa.
 */
export type ExpenseNeed = 'necesario' | 'prescindible'
export const EXPENSE_NEED: Readonly<Record<Exclude<ExpenseCategory, 'Otros'>, ExpenseNeed>> = Object.freeze({
  Supermercado: 'necesario',
  Vivienda: 'necesario',
  Facturas: 'necesario',
  Transporte: 'necesario',
  Salud: 'necesario',
  Educación: 'necesario',
  'Seguros y banco': 'necesario',
  Restaurantes: 'prescindible',
  Suscripciones: 'prescindible',
  Caprichos: 'prescindible',
  Ropa: 'prescindible',
  Deporte: 'prescindible',
  Viajes: 'prescindible',
  Regalos: 'prescindible',
})

export function expenseNeed(category: string): ExpenseNeed | null {
  return (EXPENSE_NEED as Record<string, ExpenseNeed>)[category] ?? null
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
  /**
   * Ingreso o gasto puntual (no suele pasar). Es dinero real (saldo, patrimonio,
   * objetivos), pero no entra en lo «habitual» de cada mes ni en los avisos de
   * cambio entre meses. Solo se guarda cuando es `true`.
   */
  puntual?: true
  /** Movimiento fijo del que salió al confirmarlo (`RecurringMovement.id`). */
  recurringId?: string
  /** Vez del movimiento fijo que cubre (`YYYY-MM-DD` previsto; `date` es cuándo pasó de verdad). */
  occurrence?: string
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

/**
 * No describe lo «de cada mes»: marcado como puntual, o un ingreso por una
 * deuda que te devuelven. Sigue siendo dinero real.
 */
export function isOneOff(movement: Pick<Movement, 'type' | 'category' | 'puntual'>): boolean {
  return movement.puntual === true || (movement.type === 'ingreso' && movement.category === CATEGORY_DEUDA)
}

/** Aportación del movimiento al patrimonio, con signo, en céntimos. */
export function signedAmountCents(movement: Movement): number {
  return movement.type === 'ingreso' ? movement.amountCents : -movement.amountCents
}

/* -------------------------------- Objetivos ------------------------------- */

/**
 * Objetivo de ahorro. Su progreso NO se guarda: lo calcula `allocateObjectives`
 * repartiendo el líquido real entre los objetivos activos por prioridad.
 */
export interface Objective {
  id: string
  name: string
  /**
   * Solo compatibilidad (datos y copias anteriores): antes era lo apartado a
   * mano. Ya no es fuente de verdad ni se escribe al cambiar movimientos; al
   * exportar una copia lleva el valor calculado en ese momento.
   */
  currentCents: number
  /** Meta en céntimos. */
  targetCents: number
  /** Fecha objetivo `YYYY-MM-DD`, cuando exista. */
  targetDate?: string
  /**
   * Orden en el reparto (1 = el primero en recibir dinero). Ausente en
   * objetivos que nunca se han reordenado: van detrás, por `createdAt` e `id`.
   */
  priority?: number
  /** Marcado a mano como «Conseguido»: sale del reparto. Nunca se pone solo. */
  achievedAt?: number
  createdAt: number
  updatedAt: number
}

/** Lo que el usuario introduce en el formulario: sin cantidad actual. */
export interface ObjectiveInput {
  name: string
  targetCents: number
  targetDate?: string
}

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
  /**
   * `true` si el importe invertido salió del dinero líquido registrado en
   * Finax: se descuenta del líquido desde `date` y el patrimonio total no
   * cambia al invertir. Ausente o `false` (posiciones anteriores a este campo,
   * o dinero de fuera de Finax): no toca el líquido.
   */
  fromLiquid?: boolean
  /**
   * Tipo de inversión, para comparar tu mezcla real con la del plan. Ausente
   * (posiciones anteriores a este campo): se deduce del nombre.
   */
  assetType?: PositionAssetType
  /** Comisión anual (TER o gastos corrientes) en centésimas de punto: 20 = 0,20 %. Opcional. */
  feeBp?: number
  /**
   * Valores que ha tenido, de antiguo a reciente y uno por día: se apunta cada
   * vez que cambias el valor (desde el 2026-10-20; lo anterior no se conoce).
   * El último es siempre `valueCents`. La gráfica del patrimonio los usa para
   * enseñar cómo han ido tus inversiones con el tiempo.
   */
  valueHistory?: PositionValue[]
  createdAt: number
  updatedAt: number
}

export interface PositionValue {
  /** `YYYY-MM-DD` */
  date: string
  valueCents: number
}

/** Tipos de inversión del plan (plan/mix.ts) más ahorro seguro y «otro». */
export const POSITION_ASSET_TYPES = ['global-equity', 'bonds', 'risky', 'safe', 'other'] as const
export type PositionAssetType = (typeof POSITION_ASSET_TYPES)[number]

/** Importe que una posición descuenta del líquido (0 si no salió de él). */
export function liquidOutflowCents(p: Pick<Position, 'investedCents' | 'fromLiquid'>): number {
  return p.fromLiquid === true ? p.investedCents : 0
}

export type PositionInput = Omit<Position, 'id' | 'createdAt' | 'updatedAt' | 'valueHistory'>

/* --------------------------------- Deudas --------------------------------- */

/**
 * Deuda introducida a mano (préstamo, tarjeta, financiación, hipoteca). Lo que
 * queda por devolver lo actualiza el usuario, como el valor de una inversión.
 * La cuota se registra como gasto al pagarla: aquí solo se guarda para saber
 * cuánto pesa y cuándo terminas.
 */
export interface Debt {
  id: string
  name: string
  /** Lo que queda por devolver, en céntimos. */
  balanceCents: number
  /** Interés anual (TAE) en centésimas de punto: 850 = 8,5 %. */
  aprBp: number
  /** Cuota mensual en céntimos. */
  monthlyPaymentCents: number
  createdAt: number
  updatedAt: number
}

export type DebtInput = Omit<Debt, 'id' | 'createdAt' | 'updatedAt'>

/* ---------------------------- Movimientos fijos ---------------------------- */

export const RECURRING_FREQUENCIES = ['monthly', 'yearly'] as const
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number]

/**
 * Movimiento fijo (nómina, alquiler, una suscripción): una plantilla, no
 * dinero. Cada vez que toca, Finax la PROPONE y el usuario la confirma (se
 * crea un `Movement` normal) o la omite. Hasta entonces no cuenta en nada:
 * ni líquido, ni patrimonio, ni AXIS.
 */
export interface RecurringMovement {
  id: string
  /** Cómo lo llamas: «Nómina», «Alquiler», «Spotify». */
  name: string
  type: MovementType
  /** Importe habitual en céntimos; al confirmar cada vez se puede cambiar. */
  amountCents: number
  category: Category
  frequency: RecurringFrequency
  /** Primera vez `YYYY-MM-DD`: de aquí salen el día (y el mes, si es anual) de las siguientes. */
  startDate: string
  /** Todas las veces hasta esta fecha (incluida) ya están confirmadas u omitidas. */
  doneThrough?: string
  /** Veces posteriores a `doneThrough` ya confirmadas u omitidas (fuera de orden). */
  handled?: string[]
  createdAt: number
  updatedAt: number
}

export type RecurringMovementInput = Pick<RecurringMovement, 'name' | 'type' | 'amountCents' | 'category' | 'frequency' | 'startDate'>

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
