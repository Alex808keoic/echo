/**
 * La pila del botón «atrás» del móvil, sobre el historial del navegador.
 *
 * Cada cosa de la que se puede volver (una pantalla, una hoja, un paso) es una entrada.
 * «Atrás» quita la de arriba y avisa a su dueño; sin entradas, el navegador cierra la app.
 *
 * Reglas que no se ven a simple vista:
 * - `history.go` es asíncrono: lo que se apile mientras está en marcha espera a que termine,
 *   o «atrás» se llevaría la entrada nueva en lugar de la vieja.
 * - Cada entrada guarda su profundidad, así que da igual cuántas se salten de golpe y una
 *   recarga (que borra esta pila, no el historial) se puede poner al día.
 * - El estado anterior se conserva siempre: Next.js recarga la página si al volver falta el
 *   suyo (`__NA`).
 */

export interface BackHistory {
  readonly state: unknown
  pushState(data: unknown, unused: string): void
  go(delta: number): void
}

export interface BackEntry {
  onBack: () => void
  /** Ya cerrada desde la app: si queda debajo de otra, se salta al llegar a ella. */
  dead: boolean
}

export interface BackStack {
  /** Añade una entrada. `onBack` se llama cuando el usuario vuelve desde ella. */
  push(onBack: () => void): BackEntry
  /** La app ha cerrado estas entradas por su cuenta: salen del historial sin llamar a `onBack`. */
  remove(...entries: BackEntry[]): void
  /** Lo mismo que pulsar «atrás». */
  back(): void
  /** Conectar al evento `popstate`. */
  onPopState(state: unknown): void
}

const DEPTH_KEY = 'backDepth'

function depthOf(state: unknown): number {
  const depth = (state as Record<string, unknown> | null)?.[DEPTH_KEY]
  return typeof depth === 'number' ? depth : 0
}

export function createBackStack(history: BackHistory): BackStack {
  const entries: BackEntry[] = []
  const waiting: (() => void)[] = []
  let traversing = false

  const go = (delta: number) => {
    traversing = true
    history.go(delta)
  }

  const whenIdle = (action: () => void) => {
    waiting.push(action)
    drain()
  }

  function drain() {
    while (!traversing && waiting.length > 0) waiting.shift()!()
  }

  /** Quita del historial las entradas cerradas que hayan quedado arriba del todo. */
  function trim() {
    let dead = 0
    while (entries.length > dead && entries[entries.length - 1 - dead].dead) dead++
    if (dead === 0) return
    entries.length -= dead
    go(-dead)
  }

  // Una recarga deja al usuario en una entrada a la que ya no le queda pantalla detrás: la app
  // vuelve a empezar en la raíz, así que el historial también.
  const startDepth = depthOf(history.state)
  if (startDepth > 0) go(-startDepth)

  return {
    push(onBack) {
      const entry: BackEntry = { onBack, dead: false }
      whenIdle(() => {
        if (entry.dead) return
        entries.push(entry)
        history.pushState({ ...(history.state as object | null), [DEPTH_KEY]: entries.length }, '')
      })
      return entry
    },

    remove(...removed) {
      for (const entry of removed) entry.dead = true
      whenIdle(trim)
    },

    back() {
      // Sin entradas no habría `popstate` que esperar y la pila se quedaría parada.
      whenIdle(() => {
        if (entries.length > 0) go(-1)
      })
    },

    onPopState(state) {
      traversing = false
      const depth = depthOf(state)
      if (depth > entries.length) {
        // «Adelante» a una entrada que ya no existe: se deshace.
        go(entries.length - depth)
        return
      }
      while (entries.length > depth) {
        const entry = entries.pop()!
        if (!entry.dead) entry.onBack()
      }
      trim()
      drain()
    },
  }
}
