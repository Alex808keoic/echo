/**
 * DATOS DE DEMOSTRACIÓN — Finax
 * ------------------------------------------------------------------
 * Solo sirven para probar la interfaz. Se cargan de forma explícita desde
 * Ajustes, marcan la instalación como «demo» (`config.demo = true`) y se
 * eliminan con «Borrar todos los datos». Nunca se mezclan con datos reales:
 * la carga exige que la base de datos esté vacía.
 */
import { db } from './db'
import { addMovement } from './movements'
import { addObjective } from './objectives'
import { addPosition } from './positions'
import { setInitialBalance } from './config'
import { shiftedISO, todayISO } from '../dates'
import type { MovementInput } from '../types'

/** Movimientos relativos a hoy (días atrás) para que la evolución tenga sentido. */
const DEMO_MOVEMENTS: Array<{ daysAgo: number } & Omit<MovementInput, 'date'>> = [
  { daysAgo: 0, type: 'gasto', amountCents: 8640, category: 'Comida' },
  { daysAgo: 0, type: 'ingreso', amountCents: 145000, category: 'Trabajo' },
  { daysAgo: 1, type: 'gasto', amountCents: 1299, category: 'Otros', motivo: 'Netflix' },
  { daysAgo: 1, type: 'gasto', amountCents: 5230, category: 'Otros', motivo: 'Gasolina' },
  { daysAgo: 3, type: 'gasto', amountCents: 6420, category: 'Otros', motivo: 'Luz' },
  { daysAgo: 3, type: 'gasto', amountCents: 3850, category: 'Restaurantes' },
  { daysAgo: 6, type: 'gasto', amountCents: 4200, category: 'Ropa' },
  { daysAgo: 9, type: 'gasto', amountCents: 2900, category: 'Salidas' },
  { daysAgo: 12, type: 'gasto', amountCents: 7150, category: 'Comida' },
  { daysAgo: 15, type: 'ingreso', amountCents: 5000, category: 'Regalos' },
  { daysAgo: 20, type: 'gasto', amountCents: 1990, category: 'Caprichos' },
  { daysAgo: 31, type: 'ingreso', amountCents: 145000, category: 'Trabajo' },
  { daysAgo: 33, type: 'gasto', amountCents: 9800, category: 'Comida' },
  { daysAgo: 40, type: 'gasto', amountCents: 4600, category: 'Restaurantes' },
  { daysAgo: 48, type: 'gasto', amountCents: 3300, category: 'Salidas' },
  { daysAgo: 55, type: 'gasto', amountCents: 6100, category: 'Ropa' },
  { daysAgo: 62, type: 'ingreso', amountCents: 145000, category: 'Trabajo' },
  { daysAgo: 70, type: 'gasto', amountCents: 8200, category: 'Comida' },
  { daysAgo: 85, type: 'gasto', amountCents: 5400, category: 'Otros', motivo: 'Luz' },
  { daysAgo: 93, type: 'ingreso', amountCents: 145000, category: 'Trabajo' },
]

export async function isDatabaseEmpty(): Promise<boolean> {
  const [m, o, p, c] = await Promise.all([
    db.movements.count(),
    db.objectives.count(),
    db.positions.count(),
    db.config.count(),
  ])
  return m + o + p + c === 0
}

/** Carga los datos de ejemplo. Falla si ya existen datos. */
export async function loadDemoData(): Promise<void> {
  if (!(await isDatabaseEmpty())) {
    throw new Error('Solo se pueden cargar datos de demostración en una instalación vacía.')
  }
  const today = todayISO()
  await setInitialBalance(120000, true)
  for (const { daysAgo, ...rest } of DEMO_MOVEMENTS) {
    await addMovement({ ...rest, date: shiftedISO(today, -daysAgo) })
  }
  await addObjective({
    name: 'Viaje a Japón',
    currentCents: 246000,
    targetCents: 500000,
    targetDate: shiftedISO(today, 240),
  })
  await addObjective({ name: 'Fondo de emergencia', currentCents: 90000, targetCents: 300000 })
  await addPosition({
    name: 'Fondo indexado global',
    investedCents: 150000,
    valueCents: 158000,
    date: shiftedISO(today, -120),
  })
  await addPosition({
    name: 'Cuenta remunerada',
    investedCents: 100000,
    valueCents: 101200,
    date: shiftedISO(today, -60),
  })
}
