/**
 * Lecturas que fallan: sin IndexedDB (este archivo NO carga fake-indexeddb),
 * Dexie rechaza la consulta con su propio error. Finax lo reconoce como fallo
 * de almacenamiento y muestra un estado de error con reintento, nunca una
 * carga indefinida.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
import { isStorageError, readErrorView, SLOW_LOADING_MS, SLOW_LOADING_VIEW } from '../storage-errors'

describe('lecturas · fallos de almacenamiento', () => {
  it('una lectura sin IndexedDB falla con un error de Dexie que se reconoce como de almacenamiento', async () => {
    const probe = new Dexie('finax-sin-indexeddb')
    probe.version(1).stores({ movements: 'id' })
    // Como en la app: la lectura va dentro de una función async (Dexie puede lanzar antes de devolver la promesa).
    const read = async () => probe.table('movements').toArray()
    const error = await read().then(
      () => assert.fail('no debería poder leer'),
      (e: unknown) => e,
    )
    assert.ok(isStorageError(error), String(error))
    const view = readErrorView(error)
    assert.equal(view.title, 'No se han podido leer tus datos')
    assert.match(view.message, /Tus datos siguen guardados en este dispositivo/)
  })

  it('un error que no es de almacenamiento no dice que fallen tus datos', () => {
    const view = readErrorView(new TypeError('x is undefined'))
    assert.doesNotMatch(view.title + view.message, /leer tus datos|almacenamiento/)
  })

  it('la carga no es indefinida: tras un tiempo acotado ofrece reintentar', () => {
    assert.ok(Number.isFinite(SLOW_LOADING_MS) && SLOW_LOADING_MS > 0 && SLOW_LOADING_MS <= 15_000)
    assert.equal(SLOW_LOADING_VIEW.retryLabel, 'Reintentar')
    assert.match(SLOW_LOADING_VIEW.message, /otra pestaña/)
  })
})
