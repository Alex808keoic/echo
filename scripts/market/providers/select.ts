/**
 * Proveedores de la investigación profunda, según las claves disponibles:
 *
 *   Cloudflare (CF_ACCOUNT_ID + CF_API_TOKEN) → Groq (GROQ_API_KEY)
 *
 * La misma cadena que AXIS en producción. Sin las claves de Cloudflare, Groq
 * pasa a ser el principal (sin fallback); sin ninguna, no hay proveedor y la
 * investigación se omite. Gemini ya no se usa aquí: fallaba en todos los
 * intentos (HTTP 403) y solo gastaba un intento del presupuesto cada semana.
 */
import { createCloudflareProvider } from '../../../lib/ai/providers/cloudflare'
import { createGroqProvider } from '../../../lib/ai/providers/groq'
import type { MarketAIProvider } from '../../../lib/ai/providers/types'

/**
 * Plazo de Cloudflare en el cron: la síntesis escribe bastante más que una
 * respuesta de AXIS (hasta 6.000 tokens) y aquí no hay un usuario esperando.
 */
export const MARKET_CLOUDFLARE_TIMEOUT_MS = 90_000

export function marketProviders(
  env: Record<string, string | undefined>,
  fetchImpl?: typeof fetch,
): { primary: MarketAIProvider | null; fallback: MarketAIProvider | null } {
  const cloudflare =
    env.CF_ACCOUNT_ID && env.CF_API_TOKEN
      ? createCloudflareProvider({
          accountId: env.CF_ACCOUNT_ID,
          apiToken: env.CF_API_TOKEN,
          model: env.MARKET_CLOUDFLARE_MODEL || undefined,
          timeoutMs: MARKET_CLOUDFLARE_TIMEOUT_MS,
          ...(fetchImpl ? { fetchImpl } : {}),
        })
      : null
  const groq = env.GROQ_API_KEY
    ? createGroqProvider({ apiKey: env.GROQ_API_KEY, model: env.MARKET_GROQ_MODEL || undefined, ...(fetchImpl ? { fetchImpl } : {}) })
    : null
  return cloudflare ? { primary: cloudflare, fallback: groq } : { primary: groq, fallback: null }
}
