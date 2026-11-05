import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBackStack, type BackHistory, type BackStack } from './back-stack'

/** Historial de mentira: como el real, `go` no hace nada hasta que llega el `popstate`. */
function fakeBrowser(startState: unknown = { __NA: true }) {
  const list: unknown[] = [startState]
  let index = 0
  let pending: number | null = null
  let stack: BackStack | null = null
  const history: BackHistory = {
    get state() {
      return list[index]
    },
    pushState(data) {
      list.length = ++index
      list.push(data)
    },
    go(delta) {
      pending = (pending ?? 0) + delta
    },
  }
  return {
    history,
    connect: (s: BackStack) => (stack = s),
    /** Entrega el `go` pendiente, como hace el navegador en la siguiente tarea. */
    settle() {
      while (pending !== null) {
        const delta = pending
        pending = null
        index = Math.max(0, Math.min(list.length - 1, index + delta))
        stack!.onPopState(list[index])
      }
    },
    /** El gesto «atrás» del móvil. */
    pressBack() {
      if (index === 0) return 'sale de la app'
      index--
      stack!.onPopState(list[index])
      this.settle()
      return 'dentro'
    },
    get depth() {
      return index
    },
    get current() {
      return list[index] as Record<string, unknown>
    },
  }
}

function setup(startState?: unknown) {
  const browser = fakeBrowser(startState)
  const stack = createBackStack(browser.history)
  browser.connect(stack)
  browser.settle()
  return { browser, stack }
}

test('atrás cierra de arriba abajo y, sin entradas, sale de la app', () => {
  const { browser, stack } = setup()
  const calls: string[] = []
  stack.push(() => calls.push('a'))
  stack.push(() => calls.push('b'))
  assert.equal(browser.depth, 2)
  assert.equal(browser.pressBack(), 'dentro')
  assert.equal(browser.pressBack(), 'dentro')
  assert.deepEqual(calls, ['b', 'a'])
  assert.equal(browser.pressBack(), 'sale de la app')
})

test('conserva el estado de Next.js en cada entrada', () => {
  const { browser, stack } = setup()
  stack.push(() => {})
  assert.equal(browser.current.__NA, true)
})

test('cerrar desde la app quita la entrada sin llamar a onBack', () => {
  const { browser, stack } = setup()
  let called = false
  const entry = stack.push(() => (called = true))
  stack.remove(entry)
  browser.settle()
  assert.equal(browser.depth, 0)
  assert.equal(called, false)
  assert.equal(browser.pressBack(), 'sale de la app')
})

test('apilar justo después de cerrar no pierde la entrada nueva', () => {
  const { browser, stack } = setup()
  const calls: string[] = []
  const old = stack.push(() => calls.push('vieja'))
  stack.remove(old)
  stack.push(() => calls.push('nueva'))
  browser.settle()
  assert.equal(browser.depth, 1)
  assert.equal(browser.pressBack(), 'dentro')
  assert.deepEqual(calls, ['nueva'])
  assert.equal(browser.pressBack(), 'sale de la app')
})

test('una entrada cerrada debajo de otra se salta al volver: ningún «atrás» se queda sin efecto', () => {
  const { browser, stack } = setup()
  const calls: string[] = []
  const sheet = stack.push(() => calls.push('hoja'))
  stack.push(() => calls.push('pantalla'))
  stack.remove(sheet) // La hoja se cierra después de navegar (efecto de React).
  browser.settle()
  assert.equal(browser.depth, 2)
  browser.pressBack()
  assert.deepEqual(calls, ['pantalla'])
  assert.equal(browser.depth, 0)
  assert.equal(browser.pressBack(), 'sale de la app')
})

test('quitar una entrada ya usada no toca el historial', () => {
  const { browser, stack } = setup()
  const below = stack.push(() => {})
  const top = stack.push(() => {})
  browser.pressBack()
  stack.remove(top)
  browser.settle()
  assert.equal(browser.depth, 1)
  stack.remove(below)
  browser.settle()
  assert.equal(browser.depth, 0)
})

test('quitar varias a la vez deja solo lo de debajo', () => {
  const { browser, stack } = setup()
  const calls: string[] = []
  stack.push(() => calls.push('base'))
  const a = stack.push(() => calls.push('a'))
  const b = stack.push(() => calls.push('b'))
  stack.remove(a, b)
  browser.settle()
  assert.equal(browser.depth, 1)
  browser.pressBack()
  assert.deepEqual(calls, ['base'])
})

test('una entrada cerrada antes de llegar a apilarse no entra', () => {
  const { browser, stack } = setup()
  const first = stack.push(() => {})
  stack.remove(first)
  const never = stack.push(() => {}) // Espera a que termine el `go` en marcha…
  stack.remove(never) // …y se cierra antes.
  browser.settle()
  assert.equal(browser.depth, 0)
})

test('back() funciona como el gesto', () => {
  const { browser, stack } = setup()
  let called = false
  stack.push(() => (called = true))
  stack.back()
  browser.settle()
  assert.equal(called, true)
  assert.equal(browser.depth, 0)
})

test('back() sin entradas no bloquea lo que venga después', () => {
  const { browser, stack } = setup()
  stack.back()
  stack.push(() => {})
  browser.settle()
  assert.equal(browser.depth, 1)
})

test('tras recargar a media pila vuelve a la raíz antes de apilar', () => {
  // El historial real sobrevive a la recarga; la pila en memoria no.
  const browser = fakeBrowser({ __NA: true })
  browser.history.pushState({ __NA: true, backDepth: 1 }, '')
  browser.history.pushState({ __NA: true, backDepth: 2 }, '')
  const stack = createBackStack(browser.history)
  browser.connect(stack)
  const calls: string[] = []
  stack.push(() => calls.push('nueva'))
  browser.settle()
  assert.equal(browser.depth, 1)
  assert.equal(browser.pressBack(), 'dentro')
  assert.deepEqual(calls, ['nueva'])
  assert.equal(browser.pressBack(), 'sale de la app')
})

test('«adelante» hacia una entrada que ya no existe se deshace sola', () => {
  const { browser, stack } = setup()
  let backs = 0
  stack.push(() => backs++)
  browser.pressBack()
  assert.equal(backs, 1)
  // El navegador aún conserva la entrada hacia delante.
  stack.onPopState({ __NA: true, backDepth: 1 })
  browser.settle()
  assert.equal(browser.depth, 0)
  assert.equal(backs, 1)
})
