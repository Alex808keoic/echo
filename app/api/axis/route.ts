/**
 * Route handler de AXIS (servidor).
 *
 *   GET  /api/axis  → { available: boolean }   ¿hay proveedor de IA configurado?
 *   POST /api/axis  → { analysis }             análisis validado, o error sin detalles técnicos
 *
 * Es el único punto donde se usa la clave del proveedor. Nunca devuelve
 * secretos ni trazas; el cliente hace fallback al motor local ante cualquier
 * respuesta que no sea 200.
 */
import { NextResponse } from 'next/server'
import { analyzeWithProvider, isFinancialContext, providerFromConfig, readAIServerConfig } from '@/lib/axis/ai/server/analyze'
import { AIProviderError } from '@/lib/axis/ai/provider'
import type { AxisMemory } from '@/lib/axis/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const provider = providerFromConfig(readAIServerConfig())
  return NextResponse.json({ available: provider !== null }, { headers: { 'cache-control': 'no-store' } })
}

export async function POST(request: Request) {
  const provider = providerFromConfig(readAIServerConfig())
  if (!provider) return NextResponse.json({ error: 'ai-unavailable' }, { status: 503 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 })
  }
  const context = typeof body === 'object' && body !== null ? (body as { context?: unknown }).context : undefined
  const memory = typeof body === 'object' && body !== null ? (body as { memory?: unknown }).memory : undefined
  if (!isFinancialContext(context)) return NextResponse.json({ error: 'bad-request' }, { status: 400 })

  try {
    const safeMemory = typeof memory === 'object' && memory !== null ? (memory as AxisMemory) : undefined
    const analysis = await analyzeWithProvider(provider, context, safeMemory, request.signal)
    return NextResponse.json({ analysis }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    // Clasificación sin detalles: el cliente solo necesita saber que debe usar el motor local.
    const status = error instanceof AIProviderError && error.kind === 'rate-limit' ? 429 : 502
    console.warn('[axis] fallback al motor local:', error instanceof Error ? error.message : 'error desconocido')
    return NextResponse.json({ error: 'ai-failed' }, { status })
  }
}
