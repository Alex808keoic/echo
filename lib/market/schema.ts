/**
 * JSON Schema de la síntesis que produce la IA en la investigación profunda.
 *
 * La IA NO produce indicadores numéricos (vienen de las fuentes) ni metadatos
 * (id, fechas, presupuesto, fuentes: los fija el script). Solo sintetiza:
 * situación general, eventos, tendencias, notas por clase de activo,
 * incertidumbres y advertencias. Todo pasa después por `parseMarketResearch`.
 */

const text = { type: 'string' } as const

export const MARKET_SYNTHESIS_SCHEMA = {
  type: 'object',
  properties: {
    overview: text,
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: text,
          title: text,
          summary: text,
          impact: { type: 'string', enum: ['high', 'medium', 'low'] },
          source: text,
          affects: { type: 'array', items: text },
        },
        required: ['date', 'title', 'summary', 'impact', 'source', 'affects'],
        additionalProperties: false,
      },
    },
    trends: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: text,
          summary: text,
          horizon: { type: 'string', enum: ['weeks', 'months', 'years'] },
          confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: ['title', 'summary', 'horizon', 'confidence'],
        additionalProperties: false,
      },
    },
    assetClasses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            enum: ['equity-global', 'equity-europe', 'equity-us', 'bonds-gov', 'bonds-corp', 'cash', 'gold', 'crypto', 'real-estate'],
          },
          label: text,
          aliases: { type: 'array', items: text },
          note: text,
          stance: { type: 'string', enum: ['neutral', 'caution', 'watch'] },
        },
        required: ['key', 'label', 'aliases', 'note', 'stance'],
        additionalProperties: false,
      },
    },
    uncertainties: { type: 'array', items: text },
    warnings: { type: 'array', items: text },
  },
  required: ['overview', 'events', 'trends', 'assetClasses', 'uncertainties', 'warnings'],
  additionalProperties: false,
} as const

/** Claves de clase de activo admitidas y sus alias por defecto (en el dispositivo se cruzan con las posiciones). */
export const DEFAULT_ASSET_ALIASES: Record<string, string[]> = {
  'equity-global': ['global', 'world', 'msci', 'indexado', 'index', 'acwi', 'all world'],
  'equity-europe': ['europa', 'europe', 'euro stoxx', 'ibex', 'stoxx', 'eurozona'],
  'equity-us': ['s&p', 'sp500', 's&p 500', 'nasdaq', 'usa', 'estados unidos', 'us equity'],
  'bonds-gov': ['bono', 'bonos', 'deuda', 'letras', 'treasury', 'gobierno', 'renta fija'],
  'bonds-corp': ['corporativ', 'crédito', 'credit', 'high yield'],
  cash: ['cuenta', 'remunerada', 'depósito', 'deposito', 'monetario', 'liquidez', 'cash'],
  gold: ['oro', 'gold', 'metales'],
  crypto: ['bitcoin', 'btc', 'ether', 'eth', 'cripto', 'crypto'],
  'real-estate': ['inmobiliari', 'reit', 'vivienda', 'real estate', 'socimi'],
}
