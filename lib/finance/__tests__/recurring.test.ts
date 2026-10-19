/**
 * Movimientos fijos: calendario (fin de mes, años bisiestos), lo pendiente y
 * cómo se marca lo confirmado u omitido.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  describeSchedule,
  markHandled,
  monthlyEquivalentCents,
  movementFromOccurrence,
  nextOccurrence,
  occurrencesThrough,
  pendingOccurrences,
  pendingRecurring,
  RECURRING_LIMITS,
} from '../recurring'
import type { RecurringMovement } from '../../types'

const fixed = (overrides: Partial<RecurringMovement> = {}): RecurringMovement => ({
  id: 'r1',
  name: 'Nómina',
  type: 'ingreso',
  amountCents: 150_000,
  category: 'Paga',
  frequency: 'monthly',
  startDate: '2026-01-28',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
})

describe('calendario', () => {
  it('cada mes, el mismo día', () => {
    assert.deepEqual(occurrencesThrough(fixed(), '2026-04-27'), ['2026-01-28', '2026-02-28', '2026-03-28'])
    assert.deepEqual(occurrencesThrough(fixed(), '2026-04-28'), ['2026-01-28', '2026-02-28', '2026-03-28', '2026-04-28'])
  })

  it('el día 31 cae en el último día de los meses cortos y vuelve al 31 después', () => {
    assert.deepEqual(occurrencesThrough(fixed({ startDate: '2026-01-31' }), '2026-05-31'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
  })

  it('cruza el año', () => {
    assert.deepEqual(occurrencesThrough(fixed({ startDate: '2026-11-15' }), '2027-02-15'), ['2026-11-15', '2026-12-15', '2027-01-15', '2027-02-15'])
  })

  it('cada año; el 29 de febrero cae el 28 en los años que no son bisiestos', () => {
    assert.deepEqual(occurrencesThrough(fixed({ frequency: 'yearly', startDate: '2028-02-29' }), '2032-03-01'), ['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29'])
  })

  it('antes de la primera vez no hay nada', () => {
    assert.deepEqual(occurrencesThrough(fixed({ startDate: '2026-10-28' }), '2026-10-19'), [])
  })
})

describe('pendientes', () => {
  it('lo que ya tocaba y no está confirmado ni omitido', () => {
    const r = fixed({ doneThrough: '2026-02-28', handled: ['2026-04-28'] })
    assert.deepEqual(pendingOccurrences(r, '2026-05-30'), ['2026-03-28', '2026-05-28'])
  })

  it('como mucho las más recientes', () => {
    const r = fixed({ startDate: '2020-01-01' })
    const pending = pendingOccurrences(r, '2026-10-19')
    assert.equal(pending.length, RECURRING_LIMITS.MAX_PENDING)
    assert.equal(pending.at(-1), '2026-10-01')
  })

  it('de varios fijos, de lo más antiguo a lo más reciente', () => {
    const list = pendingRecurring(
      [fixed({ id: 'a', name: 'Spotify', type: 'gasto', category: 'Caprichos', startDate: '2026-10-05' }), fixed({ id: 'b', startDate: '2026-09-28' })],
      '2026-10-19',
    )
    assert.deepEqual(list.map((p) => `${p.recurring.id} ${p.occurrence}`), ['b 2026-09-28', 'a 2026-10-05'])
  })

  it('la próxima vez es la primera sin hacer, aunque ya haya pasado', () => {
    assert.equal(nextOccurrence(fixed({ doneThrough: '2026-02-28' })), '2026-03-28')
    assert.equal(nextOccurrence(fixed({ doneThrough: '2026-02-28', handled: ['2026-03-28'] })), '2026-04-28')
  })
})

describe('marcar como hecha', () => {
  it('en orden: avanza doneThrough y no guarda sueltas', () => {
    assert.deepEqual(markHandled(fixed(), '2026-01-28'), { doneThrough: '2026-01-28', handled: undefined })
  })

  it('fuera de orden: queda suelta hasta que se completa el hueco', () => {
    const step1 = markHandled(fixed(), '2026-02-28')
    assert.deepEqual(step1, { doneThrough: undefined, handled: ['2026-02-28'] })
    const step2 = markHandled(fixed(step1), '2026-01-28')
    assert.deepEqual(step2, { doneThrough: '2026-02-28', handled: undefined })
  })

  it('es idempotente', () => {
    const once = markHandled(fixed(), '2026-01-28')
    assert.deepEqual(markHandled(fixed(once), '2026-01-28'), once)
  })
})

describe('movimiento al confirmar', () => {
  it('lleva el importe, la fecha y la categoría previstos, y de qué fijo viene', () => {
    assert.deepEqual(movementFromOccurrence(fixed(), '2026-03-28'), {
      type: 'ingreso',
      amountCents: 150_000,
      date: '2026-03-28',
      category: 'Paga',
      recurringId: 'r1',
      occurrence: '2026-03-28',
    })
  })

  it('en «Otros», el nombre hace de motivo', () => {
    const m = movementFromOccurrence(fixed({ name: 'Alquiler', type: 'gasto', category: 'Otros' }), '2026-03-28')
    assert.equal(m.motivo, 'Alquiler')
  })
})

describe('textos e importes', () => {
  it('describe el calendario', () => {
    assert.equal(describeSchedule(fixed()), 'Cada mes, el día 28')
    assert.equal(describeSchedule(fixed({ startDate: '2026-01-31' })), 'Cada mes, el día 31 (o el último del mes)')
    assert.equal(describeSchedule(fixed({ frequency: 'yearly', startDate: '2026-03-05' })), 'Cada año, el 5 de marzo')
  })

  it('un fijo anual cuenta su doceava parte al mes', () => {
    assert.equal(monthlyEquivalentCents(fixed()), 150_000)
    assert.equal(monthlyEquivalentCents(fixed({ frequency: 'yearly', amountCents: 6_000 })), 500)
  })
})
