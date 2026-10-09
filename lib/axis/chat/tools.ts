/**
 * Consultas de AXIS a los datos (parte 4c, ReAct acotado).
 *
 *   1.ª llamada  el modelo responde o pide UNA consulta («consulta»)
 *   dispositivo  Finax la valida y la ejecuta sobre los movimientos LOCALES
 *   2.ª llamada  el modelo responde con el resultado («resultados_de_consultas»);
 *                ya no puede pedir otra
 *
 * Solo tres consultas, cerradas y de solo lectura. Lo que pide el modelo se
 * valida estrictamente (`parseToolRequest`); lo que devuelve Finax va acotado
 * (como mucho 5 movimientos y 8 categorías, conceptos de 60 caracteres, sin
 * notas y sin nada que parezca un secreto) y con las cifras ya formateadas,
 * para que el modelo las copie y la validación las reconozca (`toolResultFigures`).
 */
import { formatCents } from '../../money'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, movementLabel, type Movement } from '../../types'
import { extractFigures, type AllowedFigure } from '../core/figures'
import { looksLikeSecret } from './secrets'

const CATEGORIES: readonly string[] = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]

export const CHAT_TOOLS = ['resumen_mes', 'gasto_por_categoria', 'buscar_movimientos', 'buscar_mercado'] as const
/** Consultas que ejecuta el servidor (necesitan internet), nunca el dispositivo: el cliente no puede aportar su resultado. */
export const SERVER_TOOLS: ReadonlySet<ChatToolName> = new Set(['buscar_mercado'])
export type ChatToolName = (typeof CHAT_TOOLS)[number]

export const TOOL_LIMITS = Object.freeze({
  /** Consultas por pregunta (2 llamadas al modelo como mucho). */
  MAX_ROUNDS: 1,
  MAX_MOVEMENTS: 5,
  MAX_CATEGORIES: 8,
  MAX_LABEL_CHARS: 60,
  MAX_SEARCH_CHARS: 40,
})

export interface ChatToolRequest {
  herramienta: ChatToolName
  /** `YYYY-MM`. Obligatorio en resumen_mes y gasto_por_categoria. */
  mes?: string
  categoria?: string
  /** Texto a buscar en el concepto (buscar_movimientos). */
  texto?: string
  tipo?: 'ingreso' | 'gasto'
}

export interface ChatToolResult {
  consulta: ChatToolRequest
  /** Resultado ya resumido, con importes formateados («1.300,00 €»). */
  resultado: Record<string, unknown>
}

/** Descripción de las consultas para el modelo (solo en la primera llamada). */
export const TOOLS_FOR_PROMPT = {
  instrucciones:
    'Si para responder bien necesitas un dato exacto de sus movimientos que NO está en «datos_actuales» (por ejemplo, cuánto gastó en una categoría un mes concreto o qué movimientos tiene con un concepto), pide UNA consulta en «consulta» y pon en «reply» solo una frase breve. Finax la ejecutará en su dispositivo y te devolverá el resultado. Si ya tienes los datos, «consulta» debe ser null. Nunca pidas una consulta para algo que no sea una cifra o un movimiento suyo.',
  consultas: {
    resumen_mes: 'Ingresos, gastos y ahorro de un mes. Requiere «mes» (AAAA-MM).',
    gasto_por_categoria: 'Gasto por categoría de un mes, o el de una sola categoría. Requiere «mes» (AAAA-MM); «categoria» opcional.',
    buscar_movimientos: `Hasta ${TOOL_LIMITS.MAX_MOVEMENTS} movimientos, los más recientes, filtrados por «mes», «categoria», «tipo» (ingreso | gasto) y/o «texto» del concepto.`,
    buscar_mercado:
      'Si pregunta por un activo o un tema de mercado (oro, depósitos, tipos, hipotecas, bolsa…): titulares recientes de fuentes oficiales (BCE, Fed, Banco de España) y la nota de la investigación de Finax sobre ese tema. Requiere «texto» con el tema (pocas palabras). Es contexto fechado, nunca una recomendación.',
  },
  categorias: CATEGORIES,
} as const

/** Esquema del campo «consulta» (solo en la primera llamada). */
export const TOOL_REQUEST_SCHEMA = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      properties: {
        herramienta: { type: 'string', enum: [...CHAT_TOOLS] },
        mes: { anyOf: [{ type: 'null' }, { type: 'string' }] },
        categoria: { anyOf: [{ type: 'null' }, { type: 'string' }] },
        texto: { anyOf: [{ type: 'null' }, { type: 'string' }] },
        tipo: { anyOf: [{ type: 'null' }, { type: 'string', enum: ['ingreso', 'gasto'] }] },
      },
      required: ['herramienta', 'mes', 'categoria', 'texto', 'tipo'],
      additionalProperties: false,
    },
  ],
} as const

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const CATEGORY_SET: ReadonlySet<string> = new Set(CATEGORIES)

/** Consulta pedida por el modelo, validada; `null` si no hay o no es válida. */
export function parseToolRequest(raw: unknown): ChatToolRequest | null {
  if (!isRecord(raw)) return null
  const allowed = new Set(['herramienta', 'mes', 'categoria', 'texto', 'tipo'])
  if (Object.keys(raw).some((k) => !allowed.has(k))) return null
  const tool = raw.herramienta
  if (typeof tool !== 'string' || !(CHAT_TOOLS as readonly string[]).includes(tool)) return null
  const opt = (k: string) => (raw[k] === null || raw[k] === undefined ? undefined : raw[k])
  const mes = opt('mes')
  const categoria = opt('categoria')
  const texto = opt('texto')
  const tipo = opt('tipo')
  if (mes !== undefined && (typeof mes !== 'string' || !MONTH.test(mes))) return null
  if (categoria !== undefined && (typeof categoria !== 'string' || !CATEGORY_SET.has(categoria))) return null
  if (texto !== undefined && (typeof texto !== 'string' || texto.trim() === '' || texto.length > TOOL_LIMITS.MAX_SEARCH_CHARS || looksLikeSecret(texto))) return null
  if (tipo !== undefined && tipo !== 'ingreso' && tipo !== 'gasto') return null
  if ((tool === 'resumen_mes' || tool === 'gasto_por_categoria') && mes === undefined) return null
  if (tool === 'buscar_mercado' && texto === undefined) return null
  return {
    herramienta: tool as ChatToolName,
    ...(mes !== undefined ? { mes: mes as string } : {}),
    ...(categoria !== undefined ? { categoria: categoria as string } : {}),
    ...(texto !== undefined ? { texto: (texto as string).trim() } : {}),
    ...(tipo !== undefined ? { tipo: tipo as 'ingreso' | 'gasto' } : {}),
  }
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const signed = (m: Movement) => (m.type === 'ingreso' ? m.amountCents : -m.amountCents)
/** Concepto que puede salir del dispositivo: el que se ve en Movimientos, recortado y nunca algo que parezca un secreto. */
const safeLabel = (m: Movement) => {
  const label = movementLabel(m).slice(0, TOOL_LIMITS.MAX_LABEL_CHARS)
  return looksLikeSecret(label) ? m.category : label
}

/** Ejecuta una consulta ya validada sobre los movimientos locales. Pura y determinista. */
export function runChatTool(request: ChatToolRequest, movements: readonly Movement[]): ChatToolResult {
  if (SERVER_TOOLS.has(request.herramienta)) throw new Error('consulta que solo ejecuta el servidor')
  const inMonth = (m: Movement) => !request.mes || m.date.startsWith(request.mes)
  switch (request.herramienta) {
    case 'resumen_mes': {
      const ms = movements.filter(inMonth)
      const income = ms.filter((m) => m.type === 'ingreso').reduce((t, m) => t + m.amountCents, 0)
      const expense = ms.filter((m) => m.type === 'gasto').reduce((t, m) => t + m.amountCents, 0)
      return {
        consulta: request,
        resultado: { mes: request.mes, movimientos: ms.length, ingresos: formatCents(income), gastos: formatCents(expense), ahorro: formatCents(income - expense) },
      }
    }
    case 'gasto_por_categoria': {
      const byCategory = new Map<string, number>()
      for (const m of movements) if (m.type === 'gasto' && inMonth(m)) byCategory.set(m.category, (byCategory.get(m.category) ?? 0) + m.amountCents)
      if (request.categoria) {
        return { consulta: request, resultado: { mes: request.mes, categoria: request.categoria, gasto: formatCents(byCategory.get(request.categoria) ?? 0) } }
      }
      const list = [...byCategory.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).slice(0, TOOL_LIMITS.MAX_CATEGORIES)
      return { consulta: request, resultado: { mes: request.mes, por_categoria: list.map(([categoria, cents]) => ({ categoria, gasto: formatCents(cents) })) } }
    }
    case 'buscar_movimientos': {
      const needle = request.texto ? fold(request.texto) : null
      const found = movements
        .filter((m) => inMonth(m) && (!request.categoria || m.category === request.categoria) && (!request.tipo || m.type === request.tipo) && (!needle || fold(movementLabel(m)).includes(needle)))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.amountCents - a.amountCents))
      return {
        consulta: request,
        resultado: {
          encontrados: found.length,
          movimientos: found.slice(0, TOOL_LIMITS.MAX_MOVEMENTS).map((m) => ({ fecha: m.date, tipo: m.type, importe: formatCents(signed(m)), categoria: m.category, concepto: safeLabel(m) })),
        },
      }
    }
    case 'buscar_mercado':
      // Nunca llega aquí (lo comprueba SERVER_TOOLS arriba): la ejecuta el servidor.
      throw new Error('consulta que solo ejecuta el servidor')
  }
}

/** Forma y límites de un resultado recibido por el servidor (defensa: el cliente podría mandar cualquier cosa). */
export function isChatToolResults(v: unknown): v is ChatToolResult[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > TOOL_LIMITS.MAX_ROUNDS) return false
  return v.every((r) => {
    const consulta = isRecord(r) ? parseToolRequest(r.consulta) : null
    // El resultado de una consulta del servidor nunca puede venir del cliente.
    if (!isRecord(r) || consulta === null || SERVER_TOOLS.has(consulta.herramienta) || !isRecord(r.resultado)) return false
    const text = JSON.stringify(r.resultado)
    return text.length <= 2_000 && !looksLikeSecret(text)
  })
}

/** Cifras de los resultados: el chat puede citarlas (fuente `history`, como el histórico compacto). */
export function toolResultFigures(results: readonly ChatToolResult[] | undefined): AllowedFigure[] {
  if (!results) return []
  const texts: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') texts.push(v)
    else if (typeof v === 'number') texts.push(`${v} movimientos`)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (isRecord(v)) Object.values(v).forEach(walk)
  }
  // Los resultados de buscar_mercado son texto de terceros (titulares, notas): sus cifras no se pueden citar.
  for (const r of results) if (!SERVER_TOOLS.has(r.consulta.herramienta)) walk(r.resultado)
  return texts.flatMap((t) =>
    extractFigures(t).flatMap((f): AllowedFigure[] => {
      const n = Number(f.key.slice(2))
      if (f.kind === 'money') {
        const cents = Math.round(n * 100)
        // El mismo importe sin signo («gastaste 40,00 €») dice lo mismo.
        return [cents, Math.abs(cents)].map((c) => ({ key: `m:${(c / 100).toFixed(2)}`, kind: 'money' as const, cents: c, text: f.raw.trim(), label: 'Consulta de AXIS', source: 'history' as const }))
      }
      if (f.kind === 'count') return [{ key: f.key, kind: 'count', value: n, text: f.raw.trim(), label: 'Consulta de AXIS', source: 'history' }]
      return []
    }),
  )
}
