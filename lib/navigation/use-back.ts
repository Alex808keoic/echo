import { useCallback, useEffect, useRef, useState } from 'react'
import { createBackStack, type BackEntry, type BackStack } from './back-stack'

let instance: BackStack | null = null

/** La pila de la app. Solo en el navegador: se usa desde efectos y manejadores. */
function backStack(): BackStack {
  if (!instance) {
    const stack = createBackStack(window.history)
    window.addEventListener('popstate', (event) => stack.onPopState(event.state))
    instance = stack
  }
  return instance
}

/**
 * Mientras `active`, «atrás» llama a `onBack` en vez de salir de lo que hay debajo: una hoja,
 * un paso, un detalle. Si tras `onBack` sigue activa (el paso anterior de un flujo, una
 * pregunta de confirmación), vuelve a escuchar. Quien tenga pasos propios lleva su propia capa,
 * sin otra por encima al montarse a la vez: los efectos de los hijos corren antes.
 */
export function useBackLayer(active: boolean, onBack: () => void) {
  const latest = useRef(onBack)
  useEffect(() => {
    latest.current = onBack
  })
  const [turn, setTurn] = useState(0)
  useEffect(() => {
    if (!active) return
    const stack = backStack()
    const entry = stack.push(() => {
      latest.current()
      setTurn((n) => n + 1)
    })
    return () => stack.remove(entry)
  }, [active, turn])
}

export interface ScreenChange<T> {
  from: T
  to: T
  /** `pop`: se vuelve a una pantalla que ya estaba en la pila. */
  kind: 'push' | 'pop' | 'replace'
}

export interface ScreenStack<T> {
  /** Todas, de la raíz a la actual. */
  screens: readonly T[]
  current: T
  /**
   * Va a una pantalla. Si ya está en la pila se vuelve a ella en lugar de apilarla otra vez: así
   * no hay duplicados, ir a la raíz vacía la pila y la flecha de la app nunca deja detrás la
   * pantalla de la que se acaba de salir. `replace`: la actual no queda para volver a ella.
   */
  navigate: (next: T, options?: { replace?: boolean }) => void
  /** Lo mismo que pulsar «atrás». */
  back: () => void
}

/**
 * Las pantallas de la app. La primera es la raíz: desde ella, «atrás» sale de la app.
 * `commit` envuelve cada cambio (para animarlo).
 */
export function useScreenStack<T>(
  root: T,
  same: (a: T, b: T) => boolean = Object.is,
  commit?: (update: () => void, change: ScreenChange<T>) => void,
): ScreenStack<T> {
  const [screens, setScreens] = useState<readonly T[]>([root])
  const live = useRef({ screens: [root] as readonly T[], entries: [] as BackEntry[], same, commit })
  useEffect(() => {
    live.current.same = same
    live.current.commit = commit
  })

  const show = useCallback((next: readonly T[], kind: ScreenChange<T>['kind']) => {
    const { screens: previous, commit } = live.current
    live.current.screens = next
    const update = () => setScreens(next)
    if (commit) commit(update, { from: previous[previous.length - 1], to: next[next.length - 1], kind })
    else update()
  }, [])

  const navigate = useCallback<ScreenStack<T>['navigate']>(
    (next, options) => {
      const { screens: stack, entries, same } = live.current
      const found = stack.findIndex((screen) => same(screen, next))
      if (found === stack.length - 1) return
      if (found >= 0) {
        backStack().remove(...entries.splice(found))
        show(stack.slice(0, found + 1), 'pop')
        return
      }
      if (options?.replace) {
        show([...stack.slice(0, -1), next], 'replace')
        return
      }
      const entry = backStack().push(() => {
        const { screens: current, entries: all } = live.current
        all.splice(all.indexOf(entry), 1)
        show(current.slice(0, -1), 'pop')
      })
      entries.push(entry)
      show([...stack, next], 'push')
    },
    [show],
  )

  const back = useCallback(() => backStack().back(), [])

  // Si la app deja de mostrar estas pantallas (cerrar sesión), no quedan «atrás» sin efecto.
  useEffect(() => {
    const state = live.current
    return () => {
      if (state.entries.length > 0) backStack().remove(...state.entries.splice(0))
    }
  }, [])

  return { screens, current: screens[screens.length - 1], navigate, back }
}
