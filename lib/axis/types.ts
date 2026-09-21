/**
 * Contrato de AXIS: la capa de inteligencia financiera personal de Finax.
 *
 *   INPUT      FinancialContext (+ AxisMemory + MarketContext + UserProfile)
 *      ↓
 *   ANÁLISIS   AxisEngine  →  señales priorizadas  →  composición
 *      ↓
 *   OUTPUT     AxisResult: AxisAnalysis validado, o «sin análisis» explicado
 *
 * Orden oficial de un análisis (D-26):
 *   DATOS → INTERPRETACIÓN → RECOMENDACIÓN → ALTERNATIVAS → INCERTIDUMBRE
 *   → CONCLUSIÓN / SIGUIENTE PASO
 *
 * AXIS analiza y recomienda; NUNCA ejecuta operaciones. Este módulo no
 * depende de React ni de Dexie: puede ejecutarse y probarse en Node.
 */

/* ================================ INPUT ================================= */

/** Totales de un periodo (mes natural). Importes en céntimos. */
export interface PeriodStats {
  /** `YYYY-MM` */
  key: string
  incomeCents: number
  expenseCents: number
  /** Ingresos − gastos. Puede ser negativo. */
  savingsCents: number
  /** Ahorro / ingresos × 100. `null` cuando no hay ingresos (no es calculable). */
  savingsRatePct: number | null
  movementCount: number
  /** Distribución por categoría, de mayor a menor; los `pct` suman 100. */
  expensesByCategory: CategoryShare[]
  incomeByCategory: CategoryShare[]
}

export interface CategoryShare {
  label: string
  cents: number
  pct: number
}

export interface WealthPoint {
  /** `YYYY-MM-DD` */
  date: string
  /** Patrimonio líquido al cierre de ese día. */
  cents: number
}

export interface ObjectiveContext {
  id: string
  name: string
  targetCents: number
  currentCents: number
  remainingCents: number
  /** 0–100, nunca por encima de la meta. */
  progressPct: number
  completed: boolean
  /** `YYYY-MM-DD`, cuando existe. */
  targetDate?: string
  /** Meses (aprox., puede ser fraccionario) hasta la fecha objetivo; negativo si ya pasó. */
  monthsLeft?: number
  /** Aportación mensual necesaria para llegar a tiempo, cuando hay fecha futura. */
  requiredMonthlyCents?: number
  /** Días desde su creación. */
  ageDays: number
}

export interface PositionContext {
  id: string
  name: string
  investedCents: number
  valueCents: number
  /** Peso sobre el valor total invertido, 0–100 (los pesos suman 100). */
  weightPct: number
}

export type ContextLevel = 'none' | 'limited' | 'sufficient'

/** Qué sabe AXIS sobre la fiabilidad del contexto. Hechos, no inferencias. */
export interface ContextQuality {
  level: ContextLevel
  hasInitialBalance: boolean
  movementCount: number
  /** Días distintos con movimientos (puntos reales de evolución). */
  historyDays: number
  /** Meses distintos con movimientos. */
  monthsWithData: number
  hasPreviousPeriod: boolean
  hasObjectives: boolean
  hasInvestments: boolean
  /** Los datos proceden de la carga de demostración. */
  isDemo: boolean
}

/** Contexto financiero preparado para AXIS. Sale íntegro de los datos locales. */
export interface FinancialContext {
  /** Fecha de referencia `YYYY-MM-DD`. */
  asOf: string
  wealth: {
    totalCents: number
    liquidCents: number
    investedCents: number
    /** Parte del líquido que el usuario tiene reservada en objetivos. */
    reservedForObjectivesCents: number
    initialBalanceCents: number
  }
  flows: {
    current: PeriodStats
    previous: PeriodStats
    /** Variación % vs. periodo anterior; `null` sin base válida. */
    incomeChangePct: number | null
    expenseChangePct: number | null
    /** Evolución real del patrimonio líquido (un punto por día con movimientos). */
    history: WealthPoint[]
  }
  objectives: ObjectiveContext[]
  investments: {
    positions: PositionContext[]
    totalInvestedCents: number
    totalValueCents: number
    /** Peso de las inversiones sobre el patrimonio total, 0–100. */
    shareOfWealthPct: number
  }
  quality: ContextQuality
}

/**
 * Memoria de AXIS. Contexto adicional aportado por el usuario o por
 * análisis anteriores. NUNCA es fuente de verdad financiera: los importes
 * salen siempre de `FinancialContext`.
 */
export interface AxisMemory {
  preferences?: {
    /** Horizonte o actitud declarada por el usuario, en sus palabras. */
    riskAttitude?: string
    notes?: string[]
  }
  previousConclusions?: Array<{ generatedAt: string; summary: string }>
  /**
   * Memorias que el usuario ha aceptado guardar en conversaciones con AXIS
   * (preferencias, decisiones, planes). Vista reducida de `UserMemory`
   * (lib/axis/chat/types.ts); la `id` permite actualizarlas sin duplicar.
   */
  userMemories?: Array<{ id: string; content: string; category: string; importance: string; fecha: string }>
}

/**
 * Contexto de mercado: vista reducida de la investigación pública, personalizada
 * en el dispositivo (ver lib/market). Opcional: AXIS funciona igual sin él.
 */
import type { MarketContext } from '../market/types'
import type { DecisionProfile, ProfileInfluence, UserProfile } from './profile/types'

export type { MarketContext }

export interface AxisInput {
  context: FinancialContext
  memory?: AxisMemory
  market?: MarketContext | null
  /**
   * Perfil estructurado del usuario (lib/axis/profile), derivado de las
   * memorias aceptadas con hecho. Opcional: sin él, AXIS decide exactamente
   * igual que con un perfil vacío. Se reconcilia con el contexto dentro de
   * `decide()`; nunca aporta cifras del FinancialContext.
   */
  profile?: UserProfile
}

/* =============================== ANÁLISIS =============================== */

export type Priority = 'critical' | 'high' | 'medium' | 'low'

export type SignalDomain = 'income' | 'expenses' | 'savings' | 'objectives' | 'investments' | 'market'

/** Pantalla de Finax donde continuar. AXIS solo propone; nunca ejecuta. */
export type AxisDestination = 'inicio' | 'dinero' | 'movimientos' | 'estadisticas' | 'objetivos' | 'inversiones'

export interface AxisNextStep {
  label: string
  to?: AxisDestination
}

/**
 * Una señal detectada por una regla. Cada señal conecta un dato objetivo con
 * su lectura y, si procede, con una recomendación concreta.
 */
export interface Signal {
  id: string
  domain: SignalDomain
  priority: Priority
  /** DATO: observación objetiva, con cifras reales. */
  fact: string
  /** INTERPRETACIÓN: qué significa ese dato. */
  interpretation: string
  recommendation?: DecidedRecommendation
  alternative?: AxisAlternative
  uncertainty?: AxisUncertainty
  /**
   * Cómo ha influido el perfil del usuario en esta señal, si lo ha hecho.
   * Solo existe cuando hay influencia real (nunca vacío ni `undefined`
   * explícito): sin perfil, la señal es idéntica a la de siempre.
   */
  profileInfluence?: ProfileInfluence[]
}

/* ================================ OUTPUT ================================ */

export type Confidence = 'alta' | 'media' | 'baja'

/* =============================== DECISIÓN =============================== */

/**
 * Decisión de AXIS: qué ha concluido sobre la situación ANTES de que nadie
 * la redacte. La produce `decide()` (lib/axis/core/decision.ts) solo con
 * reglas deterministas; nunca un modelo de lenguaje. Es serializable y es la
 * única fuente de «qué recomendar»: la redacción local (`render`) y, en fases
 * posteriores, el modelo de lenguaje se limitan a expresarla.
 *
 * Con `level === 'none'` no hay situación que interpretar: `facts` son los
 * datos que sí se conocen y `missing` lo que hace falta para razonar.
 */
export interface AxisDecision {
  context: FinancialContext
  level: ContextLevel
  /** Todas las señales, ya priorizadas por las reglas. */
  signals: Signal[]
  /** Señal que lidera la lectura (la de mayor prioridad), si hay alguna. */
  lead: Signal | null
  /** Señales que llegan a la lectura, acotadas para limitar el ruido. */
  relevant: Signal[]
  /** Hechos con cifras reales, ya seleccionados y acotados. */
  facts: string[]
  /** Una única recomendación principal; `null` = no actuar también es una decisión. */
  recommendation: DecidedRecommendation | null
  alternatives: AxisAlternative[]
  /** Incertidumbres concretas (de las señales) y de calidad de los datos, acotadas. Puede estar vacía. */
  uncertainties: AxisUncertainty[]
  confidence: Confidence
  /** Qué necesita AXIS para poder razonar (solo sin análisis). */
  missing: Array<{ label: string; to?: AxisDestination }>
  /** Siguiente paso decidido, si lo hay. */
  nextStep?: AxisNextStep
  basedOnDemoData: boolean
  /**
   * Perfil del usuario tal y como se ha aplicado: campos reconciliados con el
   * contexto y toda su influencia (trazable por señal). Siempre presente:
   * «sin perfil» es un estado declarado (campos vacíos, influencia vacía).
   */
  profile: DecisionProfile
}

export interface AxisData {
  /** Observaciones objetivas con cifras reales, ya priorizadas. */
  facts: string[]
}

export interface AxisInterpretation {
  summary: string
  /** Señales que sustentan la lectura, en orden de relevancia. */
  signals: Array<{ id: string; priority: Priority; text: string }>
}

/**
 * ACCIÓN de una recomendación: qué está recomendando AXIS, en forma cerrada y
 * determinista. La producen las reglas (nunca el modelo de lenguaje) y es lo
 * que licencia los consejos que el modelo puede expresar (lib/text/advice.ts).
 * Hoy ninguna regla produce invertir/comprar/vender: no existen como verbos.
 */
export const ACTION_VERBS = ['allocate', 'reserve', 'define', 'review', 'register', 'adjust', 'hold', 'complete-cushion', 'decide'] as const
export type ActionVerb = (typeof ACTION_VERBS)[number]
export const ACTION_TARGETS = ['objective', 'position', 'category', 'cushion', 'data', 'none'] as const
export type ActionTarget = (typeof ACTION_TARGETS)[number]

export interface AxisAction {
  verb: ActionVerb
  target: ActionTarget
  /** Id del objetivo o posición, o etiqueta de la categoría / clave de clase de activo, cuando la acción apunta a una concreta. */
  targetId?: string
}

export interface AxisRecommendation {
  what: string
  why: string
  nextStep?: AxisNextStep
  /**
   * Presente siempre que la recomendación la ha producido AXIS (reglas, decisión,
   * fusión Decision First). Ausente solo en la salida del modo legacy, donde el
   * modelo redacta la recomendación y no puede fabricar una acción.
   */
  action?: AxisAction
}

/** Recomendación decidida por AXIS: la acción es obligatoria. */
export type DecidedRecommendation = AxisRecommendation & { action: AxisAction }

export interface AxisAlternative {
  name: string
  summary: string
}

export interface AxisUncertainty {
  title: string
  detail: string
}

export interface AxisConclusion {
  summary: string
  nextStep?: AxisNextStep
}

export interface AxisEngineInfo {
  id: 'local-rules' | 'external-ai'
  label: string
  /** `true` solo cuando el análisis lo ha producido un modelo de IA real. */
  isAI: boolean
}

export interface AxisAnalysis {
  /** Frase corta para las tarjetas de Inicio / Mi Dinero / Estadísticas. */
  headline: string
  data: AxisData
  interpretation: AxisInterpretation
  /** Ausente cuando la conclusión es no actuar: también es una respuesta válida. */
  recommendation: AxisRecommendation | null
  alternatives: AxisAlternative[]
  uncertainty: {
    items: AxisUncertainty[]
    confidence: Confidence
  }
  conclusion: AxisConclusion
  /** El análisis se ha hecho sobre datos de demostración. */
  basedOnDemoData: boolean
  generatedAt: string
  engine: AxisEngineInfo
}

/** Resultado del motor: un análisis validado, o una explicación de por qué no. */
export type AxisResult =
  | { status: 'analysis'; analysis: AxisAnalysis }
  | {
      status: 'no-analysis'
      message: string
      /** Datos que sí se conocen, para seguir siendo útil sin análisis. */
      facts: string[]
      /** Qué necesita AXIS para poder razonar. */
      needs: Array<{ label: string; to?: AxisDestination }>
      /** Acción más útil ahora mismo. */
      nextStep: AxisNextStep
      engine: AxisEngineInfo
    }

export interface AxisEngine {
  info: AxisEngineInfo
  analyze(input: AxisInput): Promise<AxisResult>
}
