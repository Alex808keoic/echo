import { test } from 'node:test'
import assert from 'node:assert/strict'
import { snapshotsFingerprint } from './snapshot-fingerprint'

const snapshot = (value: number, generatedAt = '2026-11-05T10:00:00Z', complete = false) => ({
  weekStart: '2026-11-02',
  complete,
  generatedAt,
  metrics: { una_metrica: { value } },
})

test('la hora de generación sola no cuenta como cambio', () => {
  assert.equal(snapshotsFingerprint([snapshot(1)]), snapshotsFingerprint([snapshot(1, '2026-11-05T10:03:00Z')]))
})

test('un dato nuevo cambia la huella aunque hayan pasado segundos', () => {
  assert.notEqual(snapshotsFingerprint([snapshot(1)]), snapshotsFingerprint([snapshot(2)]))
})

test('cerrar la semana cambia la huella', () => {
  assert.notEqual(snapshotsFingerprint([snapshot(1)]), snapshotsFingerprint([snapshot(1, undefined, true)]))
})

test('una semana más cambia la huella', () => {
  assert.notEqual(snapshotsFingerprint([snapshot(1)]), snapshotsFingerprint([snapshot(1), snapshot(1)]))
})
