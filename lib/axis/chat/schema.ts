/**
 * JSON Schema de la respuesta conversacional de AXIS.
 *
 * Es la forma de `ChatReply` menos lo que fija el servidor (`engine`,
 * `generatedAt`). Como en el análisis, el esquema reduce errores y la
 * validación (`parseChatReply`) los garantiza. Mismos patrones que
 * `AXIS_OUTPUT_SCHEMA`, ya probados con el proveedor.
 */
import { MEMORY_CATEGORIES, MEMORY_IMPORTANCES } from './types'

const text = { type: 'string' } as const

export const AXIS_CHAT_SCHEMA = {
  type: 'object',
  properties: {
    reply: text,
    confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
    nextStep: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            label: text,
            to: { type: 'string', enum: ['inicio', 'dinero', 'movimientos', 'estadisticas', 'objetivos', 'inversiones'] },
          },
          required: ['label', 'to'],
          additionalProperties: false,
        },
      ],
    },
    memoryProposal: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            content: text,
            category: { type: 'string', enum: [...MEMORY_CATEGORIES] },
            importance: { type: 'string', enum: [...MEMORY_IMPORTANCES] },
            confidence: { type: 'number' },
            replacesId: { anyOf: [{ type: 'null' }, text] },
          },
          required: ['content', 'category', 'importance', 'confidence', 'replacesId'],
          additionalProperties: false,
        },
      ],
    },
  },
  required: ['reply', 'confidence', 'nextStep', 'memoryProposal'],
  additionalProperties: false,
} as const
