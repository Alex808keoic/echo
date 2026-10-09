/**
 * Redacción del Weekly Brief desde el navegador (parte 5a).
 *
 * - Solo viaja el Brief determinista (`mode: 'weekly-brief'`); el servidor lo
 *   redacta y lo valida, y aquí se vuelve a validar antes de usarlo.
 * - Una redacción por Brief: en memoria (`createWeeklyBriefPhrasingCache`) y en
 *   `localStorage` por su firma, para no pedirla cada vez que se abre la app.
 *   Lo guardado se valida otra vez al leerlo; si falla, se ignora.
 * - Sin IA, sin conexión o ante cualquier fallo: `phrasing: null` y la pantalla
 *   muestra el Brief determinista.
 */
import { AXIS_API_PATH, browserTransport } from '../ai/browser-transport'
import { createWeeklyBriefPhrasingCache } from './phrasing-cache'
import { parseWeeklyBriefPhrasing, weeklyBriefSignature, type WeeklyBriefPhrasing } from './phrasing'
import { validateWeeklyBriefPhrasing } from './phrasing-validate'
import type { WeeklyBrief } from './weekly'

const STORAGE_KEY = 'finax:weekly-brief-phrasing'

function stored(brief: WeeklyBrief): WeeklyBriefPhrasing | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { signature?: string; phrasing?: unknown } | null
    if (!raw || raw.signature !== weeklyBriefSignature(brief)) return null
    const phrasing = parseWeeklyBriefPhrasing(raw.phrasing)
    return validateWeeklyBriefPhrasing(brief, phrasing).ok ? phrasing : null
  } catch {
    return null
  }
}

function store(brief: WeeklyBrief, phrasing: WeeklyBriefPhrasing): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ signature: weeklyBriefSignature(brief), phrasing }))
  } catch {
    // Sin almacenamiento (modo privado): se pedirá otra vez la próxima sesión.
  }
}

export async function phraseWeeklyBriefRemote(brief: WeeklyBrief): Promise<WeeklyBriefPhrasing> {
  const cached = stored(brief)
  if (cached) return cached
  if (brief.personal.kind === 'insufficient-data') throw new Error('sin datos suficientes')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('sin conexión')
  if (!(await browserTransport.isAvailable())) throw new Error('sin IA')
  const res = await fetch(AXIS_API_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'weekly-brief', brief }) })
  if (!res.ok) throw new Error(`axis api ${res.status}`)
  const body: unknown = await res.json()
  const phrasing = parseWeeklyBriefPhrasing(typeof body === 'object' && body !== null ? (body as { phrasing?: unknown }).phrasing : undefined)
  // Defensa: aunque el servidor ya la validó, aquí se comprueba otra vez frente al mismo Brief.
  if (!validateWeeklyBriefPhrasing(brief, phrasing).ok) throw new Error('redacción no válida')
  store(brief, phrasing)
  return phrasing
}

/** Caché de la aplicación: una redacción por Brief y sesión (más la guardada). */
export const weeklyBriefPhrasingCache = createWeeklyBriefPhrasingCache(phraseWeeklyBriefRemote)
