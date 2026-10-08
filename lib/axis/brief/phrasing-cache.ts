/**
 * Redacción del Weekly Brief con fallback y caché (sin React, sin red propia).
 *
 * - `withWeeklyBriefPhrasing`: nunca lanza. Si la redacción falla por lo que
 *   sea (proveedor, plazo, forma, validación), devuelve el MISMO Brief
 *   determinista con `phrasing: null`. El motivo solo va a los logs, como
 *   etiqueta técnica: ni textos del modelo ni cifras.
 * - Sin datos personales suficientes no se pide redacción: el Brief determinista basta.
 * - `createWeeklyBriefPhrasingCache`: una redacción por firma del Brief
 *   (`weeklyBriefSignature`, hash del contenido que recibe el modelo). Mismo
 *   contenido → misma promesa, también si falló (no se reintenta en cada
 *   render); contenido distinto → nueva redacción. Pocas entradas: es semanal.
 */
import { weeklyBriefSignature, type WeeklyBriefPhrasing } from './phrasing'
import type { WeeklyBrief } from './weekly'

/** Redacta un Brief o lanza (p. ej. `phraseWeeklyBrief` del servidor detrás de un transporte). */
export type PhraseFn = (brief: WeeklyBrief) => Promise<WeeklyBriefPhrasing>

export interface PhrasedWeeklyBrief {
  /** El Brief determinista: fuente de verdad, siempre presente. */
  brief: WeeklyBrief
  /** La redacción validada, o `null`: entonces se muestra el Brief determinista tal cual. */
  phrasing: WeeklyBriefPhrasing | null
}

/** Etiqueta del fallo, apta para logs (nombre del error, sin su mensaje). */
const failureLabel = (error: unknown) => (error instanceof Error ? error.name : typeof error)

export async function withWeeklyBriefPhrasing(brief: WeeklyBrief, phrase: PhraseFn): Promise<PhrasedWeeklyBrief> {
  if (brief.personal.kind === 'insufficient-data') return { brief, phrasing: null }
  try {
    return { brief, phrasing: await phrase(brief) }
  } catch (error) {
    console.info('[axis] weekly-brief: se usa el Brief determinista:', failureLabel(error))
    return { brief, phrasing: null }
  }
}

export const PHRASING_CACHE_ENTRIES = 8

export interface WeeklyBriefPhrasingCache {
  resultFor(brief: WeeklyBrief): Promise<PhrasedWeeklyBrief>
}

export function createWeeklyBriefPhrasingCache(phrase: PhraseFn, maxEntries = PHRASING_CACHE_ENTRIES): WeeklyBriefPhrasingCache {
  const entries = new Map<string, Promise<WeeklyBriefPhrasing | null>>()
  return {
    async resultFor(brief) {
      const key = weeklyBriefSignature(brief)
      let pending = entries.get(key)
      if (!pending) {
        pending = withWeeklyBriefPhrasing(brief, phrase).then((r) => r.phrasing)
        entries.set(key, pending)
        // La más antigua sale primero (Map conserva el orden de inserción).
        while (entries.size > maxEntries) entries.delete(entries.keys().next().value as string)
      }
      // El Brief que se devuelve es siempre el actual; la redacción es la de su firma.
      return { brief, phrasing: await pending }
    },
  }
}
