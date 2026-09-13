/**
 * Route handler de AXIS (servidor).
 *
 *   GET  /api/axis  → { available: boolean }   ¿hay proveedor de IA configurado?
 *   POST /api/axis  → { analysis }             análisis validado, o error sin detalles técnicos
 *
 * Es el único punto donde se usa la clave del proveedor. Nunca devuelve
 * secretos ni trazas; el cliente hace fallback al motor local ante cualquier
 * respuesta que no sea 200. Antes de cada llamada se consume un cupo de la
 * instancia (`consumeInstanceSlot`); agotado el cupo, no se llama al proveedor.
 */
import { NextResponse } from 'next/server'
import { analyzeWithProvider, isFinancialContext, providerFromConfig, readAIServerConfig } from '@/lib/axis/ai/server/analyze'
import { AXIS_AI_LIMITS, consumeInstanceSlot } from '@/lib/axis/ai/server/limits'
import { AIProviderError } from '@/lib/axis/ai/provider'
import type { AxisMemory, MarketContext } from '@/lib/axis/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'no-store' }

export async function GET() {
  const provider = providerFromConfig(readAIServerConfig())
  return NextResponse.json({ available: provider !== null }, { headers: NO_STORE })
}

export async function POST(request: Request) {
  const provider = providerFromConfig(readAIServerConfig())
  if (!provider) return NextResponse.json({ error: 'ai-unavailable' }, { status: 503, headers: NO_STORE })

  let text: string
  try {
    text = await request.text()
  } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400, headers: NO_STORE })
  }
  if (text.length > AXIS_AI_LIMITS.MAX_CONTEXT_CHARS) return NextResponse.json({ error: 'too-large' }, { status: 413, headers: NO_STORE })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400, headers: NO_STORE })
  }
  const rec = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  if (!isFinancialContext(rec.context)) return NextResponse.json({ error: 'bad-request' }, { status: 400, headers: NO_STORE })
  const memory = typeof rec.memory === 'object' && rec.memory !== null ? (rec.memory as AxisMemory) : undefined
  const market = typeof rec.market === 'object' && rec.market !== null ? (rec.market as MarketContext) : null

  // Límite de la instancia: se consume ANTES de llamar; si no hay cupo, no hay llamada.
  const slot = consumeInstanceSlot()
  if (!slot.allowed) return NextResponse.json({ error: 'rate-limited' }, { status: 429, headers: NO_STORE })

  try {
    const analysis = await analyzeWithProvider(provider, rec.context, memory, request.signal, market)
    return NextResponse.json({ analysis }, { headers: NO_STORE })
  } catch (error) {
    // Clasificación sin detalles: el cliente solo necesita saber que debe usar el motor local.
    const status = error instanceof AIProviderError && error.kind === 'rate-limit' ? 429 : 502
    console.warn('[axis] fallback al motor local:', error instanceof Error ? error.message : 'error desconocido')
    return NextResponse.json({ error: 'ai-failed' }, { status, headers: NO_STORE })
  }
}
