/**
 * Modelo de lenguaje de AXIS.
 *
 * AXIS no es Gemini: Gemini (o Groq, o Cloudflare, o ninguno) es un motor
 * lingüístico intercambiable. Esta interfaz es lo único que el resto de AXIS
 * conoce de él: recibe una petición ya preparada (instrucciones, contexto,
 * esquema) y devuelve la salida cruda, que siempre se valida después. Nunca
 * decide: la decisión (`AxisDecision`) se toma antes y sin él.
 *
 * Implementaciones: `fromProvider` (envuelve los proveedores existentes sin
 * modificarlos), `fallbackChain` (varios proveedores en orden, con un plazo
 * total compartido) y `noModel` (sin modelo: AXIS responde en local).
 */
import type { MarketAIProvider } from '../../ai/providers/types'
import { AIProviderError, type AIProvider, type AIRequest, type ProviderDiagnostics } from '../ai/provider'

/** Resultado de un intento contra un proveedor concreto. Solo para logs: sin textos ni claves. */
export interface AttemptReport {
  /** `proveedor:modelo` del intento. */
  model: string
  /** 1 = proveedor principal; 2 o más = fallback. */
  attempt: number
  /** `skipped`: no se intentó porque no quedaba tiempo en el plazo de la cadena. */
  outcome: 'ok' | 'error' | 'skipped'
  maxOutputTokens: number
  errorKind?: string
  diagnostics: ProviderDiagnostics
}

export interface LanguageOptions {
  maxOutputTokens: number
  signal?: AbortSignal
  /** Recibe un informe por cada intento contra un proveedor (uso de tokens, motivo de fin, límites, error). Solo para logs. */
  onAttempt?: (report: AttemptReport) => void
}

export interface AxisLanguageModel {
  /** Identificador legible (`proveedor:modelo` o `none`), para diagnósticos; nunca secretos. */
  readonly id: string
  /** `false` en `noModel`: no se hace ninguna llamada. */
  readonly available: boolean
  /** Tope de salida propio del proveedor; si existe, sustituye al que pida el llamador. */
  readonly maxOutputTokens?: number
  /** Devuelve la salida cruda del modelo (JSON parseado) o lanza `AIProviderError`. */
  complete(request: AIRequest, options: LanguageOptions): Promise<unknown>
}

/** Tipo de error apto para logs: la clase del `AIProviderError` o el nombre del error. */
export function errorKindOf(error: unknown): string {
  return error instanceof AIProviderError ? error.kind : error instanceof Error ? error.name : 'unknown'
}

/** Envuelve un proveedor existente (Gemini, Groq, Cloudflare, mock) sin tocarlo. */
export function fromProvider(provider: AIProvider | MarketAIProvider, opts: { maxOutputTokens?: number } = {}): AxisLanguageModel {
  return {
    id: provider.id,
    available: true,
    maxOutputTokens: opts.maxOutputTokens,
    async complete(request, options) {
      const maxOutputTokens = opts.maxOutputTokens ?? options.maxOutputTokens
      const report = (r: Pick<AttemptReport, 'outcome' | 'errorKind' | 'diagnostics'>) => options.onAttempt?.({ model: provider.id, attempt: 1, maxOutputTokens, ...r })
      try {
        if ('completeWithUsage' in provider) {
          const c = await provider.completeWithUsage(request, { maxOutputTokens, signal: options.signal })
          report({ outcome: 'ok', diagnostics: c.diagnostics ?? {} })
          return c.output
        }
        const output = await provider.complete(request, options.signal)
        report({ outcome: 'ok', diagnostics: {} })
        return output
      } catch (error) {
        report({ outcome: 'error', errorKind: errorKindOf(error), diagnostics: error instanceof AIProviderError ? (error.diagnostics ?? {}) : {} })
        throw error
      }
    },
  }
}

/** Sin modelo de lenguaje: cualquier intento de usarlo falla como «no disponible». */
export const noModel: AxisLanguageModel = {
  id: 'none',
  available: false,
  complete: () => Promise.reject(new AIProviderError('unavailable', 'sin modelo de lenguaje configurado')),
}

/** Acepta un modelo ya envuelto o un proveedor crudo (compatibilidad con el código existente). */
export function asLanguageModel(model: AxisLanguageModel | AIProvider | MarketAIProvider): AxisLanguageModel {
  return 'available' in model ? model : fromProvider(model)
}

/* ---------------------------- cadena de fallback ---------------------------- */

/**
 * ¿Es un fallo DEL PROVEEDOR, que justifica probar el siguiente? Sí: límite
 * (429), timeout, error de red, 5xx, respuesta vacía, truncada o que no es
 * JSON (`malformed`) y credenciales rechazadas (401/403: el token de ESE
 * proveedor está mal o caducado; el siguiente tiene las suyas). No: otros
 * 4xx (petición o modelo erróneos: el siguiente no lo arreglaría) y negativas.
 * La validación semántica de AXIS ocurre DESPUÉS de la cadena, así que un
 * rechazo de Decision First nunca llega aquí: va directo al motor local.
 */
export function isProviderFailure(error: unknown): boolean {
  if (!(error instanceof AIProviderError)) return false
  switch (error.kind) {
    case 'rate-limit':
    case 'timeout':
    case 'malformed':
    case 'unavailable':
      return true
    case 'http': {
      const status = error.diagnostics?.status
      return status === undefined || status >= 500
    }
    default:
      return false
  }
}

/** Si todos los intentos fueron 429, un 429 (el cliente dice «sin cupo»); si no, el último fallo que no lo fue. */
function finalError(errors: unknown[]): unknown {
  const notRateLimit = [...errors].reverse().find((e) => !(e instanceof AIProviderError && e.kind === 'rate-limit'))
  return notRateLimit ?? errors[errors.length - 1]
}

export interface ChainTiming {
  /** Plazo total de la cadena, en ms. */
  deadlineMs: number
  /** Tiempo reservado para cada proveedor posterior al que se está probando. */
  reserveMs: number
  /** Tiempo mínimo restante para empezar otro intento. */
  minAttemptMs: number
}

/**
 * Varios modelos en orden (principal → fallback) con un plazo total
 * compartido. Cada intento recibe el tiempo restante menos la reserva de los
 * que vienen detrás; si el anterior falla por un fallo del proveedor
 * (`isProviderFailure`) y queda tiempo, se prueba el siguiente. Cualquier
 * otro error, o que el llamador cancele, termina la cadena. Si todos
 * fallan, el error llega a la ruta y el cliente responde con el motor local.
 */
export function fallbackChain(models: AxisLanguageModel[], timing: ChainTiming): AxisLanguageModel {
  const usable = models.filter((m) => m.available)
  if (usable.length === 0) return noModel
  if (usable.length === 1) return usable[0]
  return {
    id: usable.map((m) => m.id).join(' > '),
    available: true,
    async complete(request, options) {
      const deadline = Date.now() + timing.deadlineMs
      const errors: unknown[] = []
      for (let i = 0; i < usable.length; i++) {
        const model = usable[i]
        const attempt = i + 1
        const later = usable.length - attempt
        const remaining = deadline - Date.now()
        if (i > 0 && remaining < timing.minAttemptMs) {
          options.onAttempt?.({ model: model.id, attempt, outcome: 'skipped', maxOutputTokens: model.maxOutputTokens ?? options.maxOutputTokens, errorKind: 'deadline', diagnostics: {} })
          break
        }
        const budget = Math.min(remaining, Math.max(remaining - later * timing.reserveMs, timing.minAttemptMs))
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), budget)
        const onAbort = () => controller.abort()
        if (options.signal?.aborted) controller.abort()
        options.signal?.addEventListener('abort', onAbort)
        try {
          return await model.complete(request, { ...options, signal: controller.signal, onAttempt: (r) => options.onAttempt?.({ ...r, attempt }) })
        } catch (error) {
          if (options.signal?.aborted || !isProviderFailure(error)) throw error
          errors.push(error)
        } finally {
          clearTimeout(timer)
          options.signal?.removeEventListener('abort', onAbort)
        }
      }
      throw finalError(errors)
    },
  }
}
