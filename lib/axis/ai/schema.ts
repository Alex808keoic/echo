/**
 * JSON Schema de la salida que AXIS exige al modelo.
 *
 * Es la forma de `AxisAnalysis` menos los campos que fija el servidor
 * (`engine`, `generatedAt`, `basedOnDemoData`): el modelo no decide quién ha
 * producido el análisis ni si los datos son demo. La salida sigue pasando por
 * `parseAxisAnalysis` después: el esquema reduce errores, la validación los
 * garantiza.
 */

const text = { type: 'string' } as const
const nextStep = {
  type: 'object',
  properties: {
    label: text,
    to: { type: 'string', enum: ['inicio', 'dinero', 'movimientos', 'estadisticas', 'objetivos', 'inversiones'] },
  },
  required: ['label', 'to'],
  additionalProperties: false,
} as const

export const AXIS_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    headline: text,
    data: {
      type: 'object',
      properties: { facts: { type: 'array', items: text } },
      required: ['facts'],
      additionalProperties: false,
    },
    interpretation: {
      type: 'object',
      properties: {
        summary: text,
        signals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: text,
              priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
              text,
            },
            required: ['id', 'priority', 'text'],
            additionalProperties: false,
          },
        },
      },
      required: ['summary', 'signals'],
      additionalProperties: false,
    },
    recommendation: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: { what: text, why: text, nextStep },
          required: ['what', 'why', 'nextStep'],
          additionalProperties: false,
        },
      ],
    },
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: text, summary: text },
        required: ['name', 'summary'],
        additionalProperties: false,
      },
    },
    uncertainty: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { title: text, detail: text },
            required: ['title', 'detail'],
            additionalProperties: false,
          },
        },
        confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
      },
      required: ['items', 'confidence'],
      additionalProperties: false,
    },
    conclusion: {
      type: 'object',
      properties: { summary: text, nextStep },
      required: ['summary', 'nextStep'],
      additionalProperties: false,
    },
  },
  required: ['headline', 'data', 'interpretation', 'recommendation', 'alternatives', 'uncertainty', 'conclusion'],
  additionalProperties: false,
} as const
