import type { MarketHistoryEntry, MarketResearch } from '../types'

export const NOW = new Date('2026-09-15T10:00:00Z')

export function research(overrides: Partial<MarketResearch> = {}): MarketResearch {
  return {
    id: '2026-W37',
    kind: 'deep',
    generatedAt: '2026-09-12T06:00:00.000Z',
    coversFrom: '2026-09-05',
    coversTo: '2026-09-12',
    region: 'eurozone',
    overview: 'Semana tranquila: los índices europeos han subido ligeramente y el BCE ha mantenido los tipos.',
    indicators: [
      { key: 'ecb-dfr', label: 'BCE · facilidad de depósito', group: 'rate', value: 2, unit: '%', asOf: '2026-09-11', changePct: 0, source: 'BCE' },
      { key: 'ibex', label: 'IBEX 35', group: 'index', value: 12000, unit: 'pts', asOf: '2026-09-11', changePct: 1.2, source: 'Stooq' },
      { key: 'spx', label: 'S&P 500', group: 'index', value: 6000, unit: 'pts', asOf: '2026-09-11', changePct: -0.5, source: 'Stooq' },
      { key: 'ine-ipc', label: 'IPC España', group: 'inflation', value: 2.1, unit: '%', asOf: '2026-08', changePct: null, source: 'INE' },
      { key: 'ea-hicp', label: 'HICP eurozona', group: 'inflation', value: 2.0, unit: '%', asOf: '2026-08', changePct: null, source: 'Eurostat' },
      { key: 'euribor-12m', label: 'Euríbor 12 meses', group: 'rate', value: 2.15, unit: '%', asOf: '2026-08', changePct: null, source: 'Banco de España' },
      { key: 'dax', label: 'DAX', group: 'index', value: 18000, unit: 'pts', asOf: '2026-09-11', changePct: 0.8, source: 'Stooq' },
      { key: 'ndq', label: 'Nasdaq 100', group: 'index', value: 20000, unit: 'pts', asOf: '2026-09-11', changePct: -1.1, source: 'Stooq' },
    ],
    events: [
      { date: '2026-09-11', title: 'El BCE mantiene los tipos', summary: 'Decisión de política monetaria sin cambios.', impact: 'high', source: 'BCE · prensa', affects: ['bonds-gov', 'cash'] },
      { date: '2026-09-09', title: 'Dato de IPC de agosto', summary: 'La inflación se moderó en agosto.', impact: 'medium', source: 'INE', affects: ['cash'] },
      { date: '2026-09-08', title: 'Nota de la Fed', summary: 'Comunicado rutinario.', impact: 'low', source: 'Fed · prensa', affects: ['equity-us'] },
      { date: '2026-09-07', title: 'Otro titular', summary: 'Sin impacto.', impact: 'low', source: 'Fed · prensa', affects: [] },
    ],
    trends: [{ title: 'Tipos estables', summary: 'El BCE ha mantenido los tipos durante el periodo.', horizon: 'months', confidence: 'media' }],
    assetClasses: [
      { key: 'equity-global', label: 'Renta variable global', aliases: ['indexado', 'msci world', 'global'], note: 'Ha subido durante el periodo con volatilidad moderada.', stance: 'caution' },
      { key: 'cash', label: 'Liquidez', aliases: ['cuenta remunerada', 'depósito'], note: 'Remuneración estable con los tipos actuales.', stance: 'neutral' },
      { key: 'crypto', label: 'Criptoactivos', aliases: ['bitcoin', 'btc'], note: 'Alta volatilidad en el periodo.', stance: 'watch' },
    ],
    uncertainties: ['Los datos de inflación tienen un mes de retraso.'],
    warnings: ['Esta síntesis no es asesoramiento financiero', 'Datos de mercado con posible retraso'],
    sources: [
      { name: 'BCE · Data Portal', url: 'https://data-api.ecb.europa.eu/', retrievedAt: '2026-09-12T06:00:00.000Z', type: 'official' },
      { name: 'Stooq · índices', url: 'https://stooq.com/', retrievedAt: '2026-09-12T06:00:00.000Z', type: 'data' },
    ],
    failedSources: [],
    provider: { id: 'gemini:gemini-2.5-flash-lite', model: 'gemini-2.5-flash-lite' },
    budget: { monthCalls: 1, monthLimit: 8 },
    ...overrides,
  }
}

export const history: MarketHistoryEntry[] = [
  { id: '2026-W37', generatedAt: '2026-09-12T06:00:00.000Z', overview: 'actual' },
  { id: '2026-W36', generatedAt: '2026-09-05T06:00:00.000Z', overview: 'semana 36' },
  { id: '2026-W35', generatedAt: '2026-08-29T06:00:00.000Z', overview: 'semana 35' },
  { id: '2026-W34', generatedAt: '2026-08-22T06:00:00.000Z', overview: 'semana 34' },
  { id: '2026-W33', generatedAt: '2026-08-15T06:00:00.000Z', overview: 'semana 33' },
  { id: '2026-W32', generatedAt: '2026-08-08T06:00:00.000Z', overview: 'semana 32' },
]
