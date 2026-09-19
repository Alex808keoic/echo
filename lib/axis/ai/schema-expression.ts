/**
 * JSON Schema de la EXPRESIÓN de una decisión (Decision First).
 *
 * Solo campos de redacción. No existen aquí prioridad, siguiente paso,
 * confianza, hechos ni `recommendation.what`: los fija AXIS en la fusión
 * (`mergeExpression`), y cualquier cosa parecida que el modelo devuelva se
 * descarta. Mismos patrones (anyOf/null, additionalProperties) que los
 * esquemas ya probados con el proveedor.
 */
const text = { type: 'string' } as const

export const AXIS_EXPRESSION_SCHEMA = {
  type: 'object',
  properties: {
    headline: text,
    interpretation: {
      type: 'object',
      properties: {
        summary: text,
        signals: {
          type: 'array',
          items: { type: 'object', properties: { id: text, text }, required: ['id', 'text'], additionalProperties: false },
        },
      },
      required: ['summary', 'signals'],
      additionalProperties: false,
    },
    /** Solo el porqué: el qué lo pone AXIS. `null` cuando AXIS no recomienda actuar. */
    recommendation_why: { anyOf: [{ type: 'null' }, text] },
    alternatives: {
      type: 'array',
      items: { type: 'object', properties: { name: text, summary: text }, required: ['name', 'summary'], additionalProperties: false },
    },
    uncertainties: {
      type: 'array',
      items: { type: 'object', properties: { title: text, detail: text }, required: ['title', 'detail'], additionalProperties: false },
    },
    conclusion: text,
  },
  required: ['headline', 'interpretation', 'recommendation_why', 'alternatives', 'uncertainties', 'conclusion'],
  additionalProperties: false,
} as const
