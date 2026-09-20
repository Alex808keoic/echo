/**
 * Validación semántica de una expresión (Decision First): garantías
 * mecánicas sobre lo que el modelo ha escrito, antes de mostrarlo.
 *
 *   figures    toda cifra escrita ∈ cifras permitidas (importes, %, recuentos con unidad)
 *   execution  ninguna afirmación de haber ejecutado (o ir a ejecutar) una operación
 *   certainty  ninguna certeza indebida ni incertidumbre negada (lib/text/certainty.ts,
 *              compartido con el chat y el Market Research: por cláusulas y con negación)
 *   coverage   ids de señal, nombres de alternativa y títulos de incertidumbre
 *              exactamente los de la decisión; `recommendation_why` null ⇔ sin recomendación
 *
 * No intenta juzgar el significado de la prosa. Prioridad, siguiente paso,
 * `recommendation.what`, confianza y hechos no se validan porque no existen
 * en la salida del modelo: los pone AXIS en `mergeExpression`.
 *
 * Si algo falla, la expresión NO se muestra: el llamador responde con
 * `render(decide(input))`, la misma decisión en redacción local.
 */
import { findCertainty } from '../../text/certainty'
import type { AxisDecision } from '../types'
import type { Expression } from './expression'
import { allowedFigureKeys, extractFigures } from './figures'

export type Invariant = 'figures' | 'execution' | 'certainty' | 'coverage'

export interface Violation {
  invariant: Invariant
  field: string
  detail: string
}

export type SemanticVerdict = { ok: true } | { ok: false; violations: Violation[] }

/** Afirmaciones en primera persona de haber ejecutado, o ir a ejecutar, una operación. */
export const EXECUTION_PATTERNS: RegExp[] = [
  /\b(he|hemos)\s+(creado|movido|transferido|actualizado|guardado|invertido|retirado|aportado|borrado|eliminado|modificado|registrado|programado)\b/i,
  /\bacabo de\s+(crear|mover|transferir|actualizar|guardar|invertir|retirar|aportar|borrar|eliminar|modificar|registrar)\b/i,
  /\b(voy|vamos) a\s+(crear|mover|transferir|actualizar|guardar|invertir|retirar|aportar|borrar|eliminar|modificar|registrar)\b/i,
  /\bya (he|está)\s+(hecho|creado|movido|transferido|actualizado|guardado|invertido)\b/i,
]

function* writtenFields(e: Expression): Generator<[string, string]> {
  yield ['headline', e.headline]
  yield ['interpretation.summary', e.interpretation.summary]
  for (const s of e.interpretation.signals) yield [`signals[${s.id}]`, s.text]
  if (e.recommendationWhy) yield ['recommendation_why', e.recommendationWhy]
  for (const a of e.alternatives) yield [`alternatives[${a.name}]`, a.summary]
  for (const u of e.uncertainties) yield [`uncertainties[${u.title}]`, u.detail]
  yield ['conclusion', e.conclusion]
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x))

export function validateExpression(decision: AxisDecision, expression: Expression): SemanticVerdict {
  const violations: Violation[] = []

  // coverage
  const ids = decision.relevant.map((s) => s.id)
  const gotIds = expression.interpretation.signals.map((s) => s.id)
  if (!sameSet(gotIds, ids)) violations.push({ invariant: 'coverage', field: 'interpretation.signals', detail: `esperadas [${ids.join(', ')}], recibidas [${gotIds.join(', ')}]` })
  const names = decision.alternatives.map((a) => a.name)
  const gotNames = expression.alternatives.map((a) => a.name)
  if (!sameSet(gotNames, names)) violations.push({ invariant: 'coverage', field: 'alternatives', detail: `esperadas [${names.join(', ')}], recibidas [${gotNames.join(', ')}]` })
  const titles = decision.uncertainties.map((u) => u.title)
  const gotTitles = expression.uncertainties.map((u) => u.title)
  if (!sameSet(gotTitles, titles)) violations.push({ invariant: 'coverage', field: 'uncertainties', detail: `esperadas [${titles.join(', ')}], recibidas [${gotTitles.join(', ')}]` })
  if ((expression.recommendationWhy === null) !== (decision.recommendation === null)) {
    violations.push({ invariant: 'coverage', field: 'recommendation_why', detail: decision.recommendation ? 'AXIS recomienda y el modelo no lo explica' : 'AXIS no recomienda actuar y el modelo aporta una recomendación' })
  }

  // figures · execution · certainty, campo a campo
  const allowed = allowedFigureKeys(decision)
  for (const [field, text] of writtenFields(expression)) {
    for (const f of extractFigures(text)) {
      if (!allowed.has(f.key)) violations.push({ invariant: 'figures', field, detail: `cifra no permitida «${f.raw}»` })
    }
    const execution = EXECUTION_PATTERNS.find((re) => re.test(text))
    if (execution) violations.push({ invariant: 'execution', field, detail: `«${text.match(execution)?.[0]}»` })
    // Certeza (incluida la incertidumbre negada, en cualquier campo): una sola violación por campo.
    const certainty = findCertainty(text)
    if (certainty) violations.push({ invariant: 'certainty', field, detail: `${certainty.kind === 'denied-uncertainty' ? 'incertidumbre negada: ' : ''}«${certainty.match}»` })
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations }
}
