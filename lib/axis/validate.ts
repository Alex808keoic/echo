/**
 * Frontera de validación de AXIS.
 *
 *   salida del motor (local o IA)  →  parse  →  validate  →  sanitize  →  AxisAnalysis  →  UI
 *
 * Ningún motor, y menos un modelo externo, puede entregar a la interfaz una
 * estructura arbitraria: aquí se comprueba la forma, se recortan longitudes,
 * se limpian los textos y se descartan destinos de navegación desconocidos.
 * Sin dependencias: guardas de TypeScript a mano.
 */
import type {
  AxisAlternative,
  AxisAnalysis,
  AxisDestination,
  AxisEngineInfo,
  AxisNextStep,
  AxisRecommendation,
  AxisUncertainty,
  Confidence,
  Priority,
} from './types'

export class AxisValidationError extends Error {
  constructor(message: string) {
    super(`AXIS: ${message}`)
    this.name = 'AxisValidationError'
  }
}

const MAX_TEXT = 600
const MAX_LIST = 8
// Caracteres de control ASCII (0x00–0x1F, 0x7F).
const CONTROL_CHARS = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`, 'g')
const DESTINATIONS: readonly AxisDestination[] = ['inicio', 'dinero', 'movimientos', 'estadisticas', 'objetivos', 'inversiones']
const CONFIDENCES: readonly Confidence[] = ['alta', 'media', 'baja']
const PRIORITIES: readonly Priority[] = ['critical', 'high', 'medium', 'low']

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Texto limpio: sin caracteres de control, sin espacios sobrantes, con longitud acotada. */
function text(v: unknown, field: string, { optional = false } = {}): string {
  if (v === undefined || v === null) {
    if (optional) return ''
    throw new AxisValidationError(`falta el texto «${field}»`)
  }
  if (typeof v !== 'string') throw new AxisValidationError(`«${field}» debe ser texto`)
  const clean = v.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim()
  if (!optional && clean.length === 0) throw new AxisValidationError(`«${field}» está vacío`)
  return clean.slice(0, MAX_TEXT)
}

function list<T>(v: unknown, field: string, item: (x: unknown, i: number) => T): T[] {
  if (v === undefined) return []
  if (!Array.isArray(v)) throw new AxisValidationError(`«${field}» debe ser una lista`)
  return v.slice(0, MAX_LIST).map(item)
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    throw new AxisValidationError(`«${field}» no admite el valor ${JSON.stringify(v)}`)
  }
  return v as T
}

function nextStep(v: unknown, field: string): AxisNextStep | undefined {
  if (v === undefined || v === null) return undefined
  if (!isRecord(v)) throw new AxisValidationError(`«${field}» no es válido`)
  const step: AxisNextStep = { label: text(v.label, `${field}.label`) }
  // Un destino desconocido se descarta en lugar de romper el análisis.
  if (typeof v.to === 'string' && DESTINATIONS.includes(v.to as AxisDestination)) step.to = v.to as AxisDestination
  return step
}

function recommendation(v: unknown): AxisRecommendation | null {
  if (v === undefined || v === null) return null
  if (!isRecord(v)) throw new AxisValidationError('«recommendation» no es válida')
  return { what: text(v.what, 'recommendation.what'), why: text(v.why, 'recommendation.why'), nextStep: nextStep(v.nextStep, 'recommendation.nextStep') }
}

function alternative(v: unknown, i: number): AxisAlternative {
  if (!isRecord(v)) throw new AxisValidationError(`alternativa ${i} no válida`)
  return { name: text(v.name, `alternatives[${i}].name`), summary: text(v.summary, `alternatives[${i}].summary`) }
}

function uncertainty(v: unknown, i: number): AxisUncertainty {
  if (!isRecord(v)) throw new AxisValidationError(`incertidumbre ${i} no válida`)
  return { title: text(v.title, `uncertainty[${i}].title`), detail: text(v.detail, `uncertainty[${i}].detail`) }
}

function engineInfo(v: unknown): AxisEngineInfo {
  if (!isRecord(v)) throw new AxisValidationError('falta «engine»')
  return {
    id: oneOf(v.id, ['local-rules', 'external-ai'] as const, 'engine.id'),
    label: text(v.label, 'engine.label'),
    isAI: v.isAI === true,
  }
}

/**
 * Convierte una salida desconocida en un `AxisAnalysis` seguro o lanza
 * `AxisValidationError`. Es la única puerta de entrada a la UI.
 */
export function parseAxisAnalysis(input: unknown): AxisAnalysis {
  if (!isRecord(input)) throw new AxisValidationError('la salida no es un objeto')
  const data = isRecord(input.data) ? input.data : {}
  const interpretation = isRecord(input.interpretation) ? input.interpretation : {}
  const uncertaintyBlock = isRecord(input.uncertainty) ? input.uncertainty : {}
  const conclusion = isRecord(input.conclusion) ? input.conclusion : {}

  const generatedAt = text(input.generatedAt, 'generatedAt')
  if (Number.isNaN(Date.parse(generatedAt))) throw new AxisValidationError('«generatedAt» no es una fecha')

  return {
    headline: text(input.headline, 'headline'),
    data: { facts: list(data.facts, 'data.facts', (f, i) => text(f, `data.facts[${i}]`)) },
    interpretation: {
      summary: text(interpretation.summary, 'interpretation.summary'),
      signals: list(interpretation.signals, 'interpretation.signals', (s, i) => {
        if (!isRecord(s)) throw new AxisValidationError(`señal ${i} no válida`)
        return {
          id: text(s.id, `signals[${i}].id`),
          priority: oneOf(s.priority, PRIORITIES, `signals[${i}].priority`),
          text: text(s.text, `signals[${i}].text`),
        }
      }),
    },
    recommendation: recommendation(input.recommendation),
    alternatives: list(input.alternatives, 'alternatives', alternative),
    uncertainty: {
      items: list(uncertaintyBlock.items, 'uncertainty.items', uncertainty),
      confidence: oneOf(uncertaintyBlock.confidence, CONFIDENCES, 'uncertainty.confidence'),
    },
    conclusion: {
      summary: text(conclusion.summary, 'conclusion.summary'),
      nextStep: nextStep(conclusion.nextStep, 'conclusion.nextStep'),
    },
    basedOnDemoData: input.basedOnDemoData === true,
    generatedAt,
    engine: engineInfo(input.engine),
  }
}
