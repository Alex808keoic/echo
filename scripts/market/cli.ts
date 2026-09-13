/**
 * CLI del Market Research Engine (GitHub Actions y ejecución local).
 *
 *   tsx scripts/market/cli.ts light --data-dir <dir>
 *   tsx scripts/market/cli.ts deep  --data-dir <dir> [--reason scheduled|event|manual] [--provider mock]
 *
 * Es el único lugar que lee `process.env` y construye proveedores reales.
 * Las claves nunca se imprimen ni se escriben en disco.
 */
import { appendFileSync } from 'node:fs'
import { runDeepResearch } from './deep'
import { runLightCheck } from './light'
import { createGeminiProvider } from './providers/gemini'
import { createGroqProvider } from './providers/groq'
import { createMockProvider } from './providers/mock'
import { collectSources } from './sources'
import { fileStore } from './store'

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

/** Salida para el workflow (`$GITHUB_OUTPUT`) o por consola en local. */
function output(key: string, value: string) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
  else console.log(`[output] ${key}=${value}`)
}

async function main() {
  const command = process.argv[2]
  const dataDir = arg('data-dir', 'public/market-data-local') as string
  const store = fileStore(dataDir)
  const log = (line: string) => console.log(`[market] ${line}`)

  if (command === 'light') {
    const outcome = await runLightCheck({ store, collect: () => collectSources(), log })
    output('trigger_deep', String(outcome.triggerDeep))
    output('events', String(outcome.events.length))
    return
  }

  if (command === 'deep') {
    const reason = (arg('reason', 'scheduled') as 'scheduled' | 'event' | 'manual') ?? 'scheduled'
    const useMock = arg('provider') === 'mock'
    // El mock solo existe para pruebas locales: nunca debe publicarse desde el cron.
    if (useMock && process.env.GITHUB_ACTIONS) throw new Error('el proveedor mock no puede usarse en GitHub Actions')
    const env: Record<string, string | undefined> = useMock
      ? { ...process.env, MARKET_AI_ENABLED: 'true' }
      : process.env
    const providers = useMock
      ? { primary: createMockProvider(), fallback: null }
      : {
          primary: process.env.GEMINI_API_KEY ? createGeminiProvider({ apiKey: process.env.GEMINI_API_KEY, model: process.env.MARKET_GEMINI_MODEL || undefined }) : null,
          fallback: process.env.GROQ_API_KEY ? createGroqProvider({ apiKey: process.env.GROQ_API_KEY, model: process.env.MARKET_GROQ_MODEL || undefined }) : null,
        }
    if (useMock) log('proveedor de prueba (mock): sin IA, solo para ejecución local')
    const outcome = await runDeepResearch({ store, collect: () => collectSources(), providers, env, reason, log })
    log(`resultado: ${outcome.status}${'reason' in outcome ? ` — ${outcome.reason}` : ''}`)
    output('status', outcome.status)
    // Un bloqueo o un fallo no son errores del job: se conserva la última investigación.
    return
  }

  console.error('uso: cli.ts <light|deep> [--data-dir DIR] [--reason scheduled|event|manual] [--provider mock]')
  process.exit(2)
}

main().catch((error) => {
  console.error('[market] error inesperado:', error instanceof Error ? error.message : error)
  process.exit(1)
})
