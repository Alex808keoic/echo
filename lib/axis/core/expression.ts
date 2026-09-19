/**
 * EXPRESIÓN de una decisión (Decision First).
 *
 *   AxisDecision ─► buildExpressionRequest ─► modelo ─► parseExpression
 *                ─► validateExpression (semantic.ts) ─► mergeExpression ─► AxisAnalysis
 *
 * El modelo recibe la decisión, las cifras permitidas y la memoria en
 * cualitativo; devuelve solo texto. La fusión toma de la decisión TODO lo
 * decisorio (hechos, prioridades, `recommendation.what`, siguiente paso,
 * confianza, demo) e ignora cualquier intento del modelo de devolverlos.
 */
import type { AIRequest } from '../ai/provider'
import { AXIS_EXPRESSION_SCHEMA } from '../ai/schema-expression'
import { AXIS_EXPRESSION_PROMPT } from '../prompts/expression'
import type { AxisAnalysis, AxisDecision, AxisEngineInfo, AxisMemory } from '../types'
import { AxisValidationError } from '../validate'
import { figuresOf } from './figures'

/** Lo que el modelo escribe: solo redacción. */
export interface Expression {
  headline: string
  interpretation: { summary: string; signals: Array<{ id: string; text: string }> }
  recommendationWhy: string | null
  alternatives: Array<{ name: string; summary: string }>
  uncertainties: Array<{ title: string; detail: string }>
  conclusion: string
}

const MAX_USER_NOTES = 5
const MAX_CONCLUSION_CHARS = 300

export function buildExpressionRequest(decision: AxisDecision, memory?: AxisMemory): AIRequest {
  const signal = (s: AxisDecision['relevant'][number]) => ({ id: s.id, prioridad: s.priority, hecho: s.fact, interpretacion: s.interpretation })
  const payload = {
    decision_de_axis: {
      nivel_de_datos: decision.level,
      senal_principal: decision.lead ? signal(decision.lead) : null,
      senales: decision.relevant.map(signal),
      hechos: decision.facts,
      recomendacion: decision.recommendation
        ? { que: decision.recommendation.what, por_que_de_axis: decision.recommendation.why, siguiente_paso: decision.recommendation.nextStep ?? null }
        : null,
      alternativas: decision.alternatives.map((a) => ({ nombre: a.name, resumen_de_axis: a.summary })),
      incertidumbres: decision.uncertainties.map((u) => ({ titulo: u.title, detalle_de_axis: u.detail })),
      confianza: decision.confidence,
      datos_demo: decision.basedOnDemoData,
    },
    cifras_permitidas: figuresOf(decision).map((f) => ({ etiqueta: f.label, valor: f.value })),
    memoria_relevante: {
      notas_del_usuario: (memory?.userMemories ?? []).slice(0, MAX_USER_NOTES).map((m) => m.content),
      conclusion_anterior: memory?.previousConclusions?.[0]?.summary.slice(0, MAX_CONCLUSION_CHARS) ?? null,
    },
  }
  return {
    system: AXIS_EXPRESSION_PROMPT,
    user: `Expresa esta decisión de AXIS y devuelve el JSON.\n\n${JSON.stringify(payload)}`,
    schema: AXIS_EXPRESSION_SCHEMA as unknown as Record<string, unknown>,
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const str = (v: unknown, field: string): string => {
  if (typeof v !== 'string' || v.trim().length === 0) throw new AxisValidationError(`«${field}» debe ser un texto no vacío`)
  return v.trim()
}
const list = <T>(v: unknown, field: string, item: (x: unknown, i: number) => T): T[] => {
  if (!Array.isArray(v)) throw new AxisValidationError(`«${field}» debe ser una lista`)
  return v.map(item)
}

/** Comprobación de forma de la salida del modelo. No decide nada: eso lo hace `mergeExpression`. */
export function parseExpression(raw: unknown): Expression {
  if (!isRecord(raw)) throw new AxisValidationError('la expresión no es un objeto')
  const interpretation = isRecord(raw.interpretation) ? raw.interpretation : {}
  return {
    headline: str(raw.headline, 'headline'),
    interpretation: {
      summary: str(interpretation.summary, 'interpretation.summary'),
      signals: list(interpretation.signals, 'interpretation.signals', (s, i) => {
        if (!isRecord(s)) throw new AxisValidationError(`señal ${i} no válida`)
        return { id: str(s.id, `signals[${i}].id`), text: str(s.text, `signals[${i}].text`) }
      }),
    },
    recommendationWhy: raw.recommendation_why === null || raw.recommendation_why === undefined ? null : str(raw.recommendation_why, 'recommendation_why'),
    alternatives: list(raw.alternatives ?? [], 'alternatives', (a, i) => {
      if (!isRecord(a)) throw new AxisValidationError(`alternativa ${i} no válida`)
      return { name: str(a.name, `alternatives[${i}].name`), summary: str(a.summary, `alternatives[${i}].summary`) }
    }),
    uncertainties: list(raw.uncertainties ?? [], 'uncertainties', (u, i) => {
      if (!isRecord(u)) throw new AxisValidationError(`incertidumbre ${i} no válida`)
      return { title: str(u.title, `uncertainties[${i}].title`), detail: str(u.detail, `uncertainties[${i}].detail`) }
    }),
    conclusion: str(raw.conclusion, 'conclusion'),
  }
}

/**
 * Fusión: la decisión manda. Requiere una expresión ya validada
 * (`validateExpression`), que garantiza la cobertura exacta de ids, nombres y títulos.
 */
export function mergeExpression(decision: AxisDecision, expression: Expression, engine: AxisEngineInfo, now: Date = new Date()): AxisAnalysis {
  const textFor = (id: string) => expression.interpretation.signals.find((s) => s.id === id)?.text
  const summaryFor = (name: string) => expression.alternatives.find((a) => a.name === name)?.summary
  const detailFor = (title: string) => expression.uncertainties.find((u) => u.title === title)?.detail
  return {
    headline: expression.headline,
    data: { facts: decision.facts },
    interpretation: {
      summary: expression.interpretation.summary,
      signals: decision.relevant.map((s) => ({ id: s.id, priority: s.priority, text: textFor(s.id) ?? s.interpretation })),
    },
    recommendation: decision.recommendation
      ? { what: decision.recommendation.what, why: expression.recommendationWhy ?? decision.recommendation.why, nextStep: decision.recommendation.nextStep }
      : null,
    alternatives: decision.alternatives.map((a) => ({ name: a.name, summary: summaryFor(a.name) ?? a.summary })),
    uncertainty: {
      items:
        decision.uncertainties.length > 0
          ? decision.uncertainties.map((u) => ({ title: u.title, detail: detailFor(u.title) ?? u.detail }))
          : [{ title: 'Sin incertidumbre relevante', detail: 'Los datos disponibles bastan para esta lectura.' }],
      confidence: decision.confidence,
    },
    conclusion: { summary: expression.conclusion, nextStep: decision.nextStep },
    basedOnDemoData: decision.basedOnDemoData,
    generatedAt: now.toISOString(),
    engine,
  }
}
