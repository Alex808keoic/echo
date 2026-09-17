/**
 * Route handler de AXIS (servidor).
 *
 *   GET  /api/axis                  → { available: boolean }   ¿hay proveedor de IA configurado?
 *   POST /api/axis                  → { analysis }             análisis validado, o error sin detalles técnicos
 *   POST /api/axis  { mode:'chat' } → { reply }                respuesta conversacional validada
 *
 * Es el único punto donde se usa la clave del proveedor. Nunca devuelve
 * secretos ni trazas; el cliente hace fallback al motor local ante cualquier
 * respuesta que no sea 200. Antes de cada llamada se consume un cupo de la
 * instancia (`consumeInstanceSlot`); agotado el cupo, no se llama al proveedor.
 * El contexto recibido se procesa en la petición y no se persiste.
 */
import { NextResponse } from 'next/server'
import { analyzeWithProvider, chatWithProvider, isFinancialContext } from '@/lib/axis/ai/server/analyze'
import { languageModelFromConfig } from '@/lib/axis/language/server'
import { AXIS_AI_LIMITS, consumeInstanceSlot } from '@/lib/axis/ai/server/limits'
import { AIProviderError } from '@/lib/axis/ai/provider'
import { isChatPayload } from '@/lib/axis/chat/validate'
import type { AxisMemory, MarketContext } from '@/lib/axis/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'no-store' }

export async function GET() {
  return NextResponse.json({ available: languageModelFromConfig().available }, { headers: NO_STORE })
}

export async function POST(request: Request) {
  const model = languageModelFromConfig()
  if (!model.available) return NextResponse.json({ error: 'ai-unavailable' }, { status: 503, headers: NO_STORE })

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
  const context = rec.context
  if (!isFinancialContext(context)) return NextResponse.json({ error: 'bad-request' }, { status: 400, headers: NO_STORE })
  const memory = typeof rec.memory === 'object' && rec.memory !== null ? (rec.memory as AxisMemory) : undefined
  const market = typeof rec.market === 'object' && rec.market !== null ? (rec.market as MarketContext) : null
  const chat = rec.mode === 'chat' ? (isChatPayload(rec) ? rec : null) : null
  if (rec.mode === 'chat' && !chat) return NextResponse.json({ error: 'bad-request' }, { status: 400, headers: NO_STORE })

  // Límite de la instancia: se consume ANTES de llamar; si no hay cupo, no hay llamada.
  const slot = consumeInstanceSlot()
  if (!slot.allowed) return NextResponse.json({ error: 'rate-limited' }, { status: 429, headers: NO_STORE })

  try {
    if (chat) {
      const reply = await chatWithProvider(model, { context, market, memory, conversation: chat.conversation, message: chat.message }, request.signal)
      return NextResponse.json({ reply }, { headers: NO_STORE })
    }
    const analysis = await analyzeWithProvider(model, context, memory, request.signal, market)
    return NextResponse.json({ analysis }, { headers: NO_STORE })
  } catch (error) {
    // Clasificación sin detalles: el cliente solo necesita saber que debe usar el motor local.
    const status = error instanceof AIProviderError && error.kind === 'rate-limit' ? 429 : 502
    console.warn('[axis] fallback al motor local:', error instanceof Error ? error.message : 'error desconocido')
    return NextResponse.json({ error: 'ai-failed' }, { status, headers: NO_STORE })
  }
}
