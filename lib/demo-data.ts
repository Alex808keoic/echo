/**
 * DEMO DATA — Finax
 * ------------------------------------------------------------------
 * Solo datos de demostración (mock). No contiene lógica de negocio.
 * En una fase posterior estos datos se sustituirán por datos reales
 * (IndexedDB / API). Mantener la UI desacoplada de esta capa.
 */

export type TransactionType = 'income' | 'expense'

export type TransactionIconKey =
  | 'groceries'
  | 'salary'
  | 'streaming'
  | 'transfer'
  | 'fuel'
  | 'energy'
  | 'restaurant'

export interface Transaction {
  id: string
  name: string
  category: string
  amount: number
  type: TransactionType
  time: string
  icon: TransactionIconKey
}

export interface TransactionGroup {
  label: string
  transactions: Transaction[]
}

/* ------------------------------- Patrimonio ------------------------------- */

export const patrimonio = {
  total: 4892.3,
  changePct: 12.4,
  changeSinceLabel: 'desde el inicio',
}

/** Puntos para el gráfico de evolución del patrimonio (Inicio) */
export const patrimonioSeries: number[] = [
  3120, 3180, 3090, 3260, 3350, 3300, 3480, 3560, 3510, 3680, 3820, 3760, 3980,
  4120, 4080, 4260, 4380, 4320, 4520, 4610, 4560, 4720, 4830, 4892,
]

export const timeRanges = ['1M', '3M', '6M', '1A', 'Todo'] as const

/* ------------------------------ Ingresos/Gastos --------------------------- */

export const monthlySummary = {
  ingresos: { amount: 2450.0, changePct: 18, direction: 'up' as const },
  gastos: { amount: 1820.3, changePct: 6, direction: 'down' as const },
}

export const todaySummary = {
  ingresos: 320.5,
  gastos: 180.2,
}

/* ---------------------------- Desglose patrimonio ------------------------- */

export const patrimonioBreakdown = [
  { key: 'efectivo', label: 'Efectivo', amount: 1842.3, pct: 37.7, color: 'var(--finax)' },
  { key: 'ahorros', label: 'Ahorros', amount: 1250.0, pct: 25.5, color: '#34d399' },
  { key: 'inversiones', label: 'Inversiones', amount: 1800.0, pct: 36.8, color: '#0b8560' },
]

/* --------------------------------- Cuentas -------------------------------- */

export const accounts = [
  {
    id: 'acc-1',
    name: 'Cuenta principal',
    provider: 'Ibercaja ·· 4582',
    balance: 2340.5,
  },
]

/* -------------------------------- Objetivos ------------------------------- */

export interface Goal {
  id: string
  title: string
  current: number
  target: number
  image: string
}

export const goals: Goal[] = [
  {
    id: 'goal-1',
    title: 'Viaje a Japón',
    current: 2460,
    target: 5000,
    image: '/goal-japan.png',
  },
]

/* ------------------------------- Movimientos ------------------------------ */

export const transactionGroups: TransactionGroup[] = [
  {
    label: 'Hoy, 15 abr 2025',
    transactions: [
      {
        id: 't1',
        name: 'Mercadona',
        category: 'Supermercado',
        amount: -86.4,
        type: 'expense',
        time: '13:24',
        icon: 'groceries',
      },
      {
        id: 't2',
        name: 'Nómina',
        category: 'Ingreso',
        amount: 1450.0,
        type: 'income',
        time: '09:00',
        icon: 'salary',
      },
    ],
  },
  {
    label: 'Ayer, 14 abr 2025',
    transactions: [
      {
        id: 't3',
        name: 'Netflix',
        category: 'Ocio',
        amount: -12.99,
        type: 'expense',
        time: '21:45',
        icon: 'streaming',
      },
      {
        id: 't4',
        name: 'Transferencia a ahorros',
        category: 'Ahorro',
        amount: -150.0,
        type: 'expense',
        time: '18:30',
        icon: 'transfer',
      },
      {
        id: 't5',
        name: 'Gasolina',
        category: 'Transporte',
        amount: -52.3,
        type: 'expense',
        time: '09:16',
        icon: 'fuel',
      },
    ],
  },
  {
    label: '12 abr 2025',
    transactions: [
      {
        id: 't6',
        name: 'Luz',
        category: 'Hogar',
        amount: -64.2,
        type: 'expense',
        time: '19:46',
        icon: 'energy',
      },
      {
        id: 't7',
        name: 'Restaurante',
        category: 'Ocio',
        amount: -38.5,
        type: 'expense',
        time: '14:27',
        icon: 'restaurant',
      },
    ],
  },
]

export const movementFilters = ['Todos', 'Ingresos', 'Gastos'] as const

/* ------------------------------ Estadísticas ------------------------------ */

export const statsFilters = ['Gastos', 'Ingresos', 'Patrimonio'] as const

export const spendingTotal = 1820.3

export const spendingByCategory = [
  { key: 'vivienda', label: 'Vivienda', pct: 36, color: 'var(--finax)' },
  { key: 'alimentacion', label: 'Alimentación', pct: 22, color: '#34d399' },
  { key: 'transporte', label: 'Transporte', pct: 12, color: '#0b8560' },
  { key: 'ocio', label: 'Ocio', pct: 10, color: '#6ee7b7' },
  { key: 'salud', label: 'Salud', pct: 8, color: '#059669' },
  { key: 'otros', label: 'Otros', pct: 12, color: '#a7f3d0' },
]

export const spendingEvolution = [
  { month: 'Nov', value: 1520 },
  { month: 'Dic', value: 1740 },
  { month: 'Ene', value: 1610 },
  { month: 'Feb', value: 1580 },
  { month: 'Mar', value: 1900 },
  { month: 'Abr', value: 1820 },
]

export const evolutionRanges = ['6M', '1A', 'Todo'] as const

export const topCategories = [
  { key: 'vivienda', label: 'Vivienda', amount: 650.0, pct: 36 },
]

/* ----------------------------------- AXIS --------------------------------- */

export const axisUser = {
  name: 'Sofía',
}

export const axisSituation = [
  { key: 'patrimonio', label: 'Patrimonio', value: '4.892,30 €' },
  { key: 'ingresos', label: 'Ingresos (mes)', value: '2.450,00 €' },
  { key: 'gastos', label: 'Gastos (mes)', value: '1.820,30 €' },
  { key: 'objetivos', label: 'Objetivos', value: '2 activos' },
]

export const axisRecommendation =
  'Estás en una buena posición para seguir con tu plan. Te sugiero aumentar tu aportación al ahorro para acelerar tu objetivo de viaje.'

export const axisHomeInsight =
  'Tu situación financiera muestra una buena tendencia. Te sugerimos revisar tus objetivos a medio plazo.'

export const axisMoneyInsight =
  'AXIS detecta que puedes ahorrar más en ocio. Te proponemos un plan para alcanzar tus objetivos.'

export const axisStatsInsight =
  'Tus gastos en ocio han aumentado un 24% respecto al mes anterior. Podrías reducirlos para alcanzar tu objetivo de viaje.'
