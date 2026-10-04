/**
 * Caché de análisis (fase 0 de la memoria de AXIS).
 *
 * Fallo que cubre: tras aceptar u olvidar un dato del perfil, el análisis
 * seguía siendo el de antes hasta recargar, porque la caché no conocía el
 * perfil. Guardar una conclusión, en cambio, NO debe reanalizar (bucle).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createAnalysisCache, type AnalyzeFn } from '../analysis-cache'
import { analyzeSnapshot } from '../engine'
import { profileSignature } from '../profile/derive'
import type { AxisMemory, AxisResult, ProfileFactEntry } from '../types'
import type { FinancialSnapshot } from '../context'
import { config, healthyMovements, snapshot } from './fixtures'

const LIQUIDITY: ProfileFactEntry = { id: 'mem-liq', updatedAt: 1, fact: { kind: 'minLiquidity', cents: 900_000 } }
const HORIZON: ProfileFactEntry = { id: 'mem-hor', updatedAt: 2, fact: { kind: 'horizon', value: 'long' } }

/** Motor local real, contando llamadas. */
function counting() {
  const calls: Array<{ prefer: string; memory: AxisMemory | null }> = []
  const analyze: AnalyzeFn = (snap, prefer = 'local', market = null, memory = null) => {
    calls.push({ prefer, memory })
    return analyzeSnapshot(snap, 'local', market, memory)
  }
  return { calls, cache: createAnalysisCache(analyze) }
}

const snap = (): FinancialSnapshot => snapshot({ config: config(100_000), movements: healthyMovements() })
const headline = (r: AxisResult) => (r.status === 'analysis' ? r.analysis.recommendation?.what ?? r.analysis.headline : r.message)

describe('AXIS · caché de análisis', () => {
  it('misma instantánea y mismo perfil → un solo análisis', async () => {
    const { calls, cache } = counting()
    const s = snap()
    const memory: AxisMemory = { profileFacts: [LIQUIDITY] }
    const a = await cache.resultFor(s, false, null, memory)
    const b = await cache.resultFor(s, false, null, { profileFacts: [LIQUIDITY] })
    assert.equal(calls.length, 1)
    assert.equal(a, b)
  })

  it('aceptar un dato del perfil → análisis nuevo y distinto, con la memoria nueva', async () => {
    const { calls, cache } = counting()
    const s = snap()
    const before = await cache.resultFor(s, false, null, null)
    const after = await cache.resultFor(s, false, null, { profileFacts: [LIQUIDITY] })
    assert.equal(calls.length, 2)
    assert.deepEqual(calls[1].memory?.profileFacts, [LIQUIDITY])
    assert.notEqual(headline(after), headline(before))
    assert.match(headline(after), /colchón/)
  })

  it('olvidar el dato → vuelve al análisis sin perfil (el de antes, ya en caché)', async () => {
    const { calls, cache } = counting()
    const s = snap()
    const none = await cache.resultFor(s, false, null, null)
    await cache.resultFor(s, false, null, { profileFacts: [LIQUIDITY] })
    const forgotten = await cache.resultFor(s, false, null, { previousConclusions: [] })
    assert.equal(forgotten, none)
    assert.equal(calls.length, 2)
  })

  it('guardar una conclusión no cambia la clave: no reanaliza (sin bucle)', async () => {
    const { calls, cache } = counting()
    const s = snap()
    const memory: AxisMemory = { profileFacts: [LIQUIDITY] }
    const first = await cache.resultFor(s, true, null, memory)
    const withConclusion: AxisMemory = { ...memory, previousConclusions: [{ generatedAt: '2026-10-03T10:00:00.000Z', summary: 'Lectura anterior' }] }
    const second = await cache.resultFor(s, true, null, withConclusion)
    assert.equal(second, first)
    assert.equal(calls.length, 1)
  })

  it('las tarjetas (local) reutilizan el análisis con IA del mismo perfil, pero no el de otro perfil', async () => {
    const { calls, cache } = counting()
    const s = snap()
    const ai = await cache.resultFor(s, true, null, { profileFacts: [LIQUIDITY] })
    assert.equal(await cache.resultFor(s, false, null, { profileFacts: [LIQUIDITY] }), ai)
    await cache.resultFor(s, false, null, null)
    assert.deepEqual(
      calls.map((c) => c.prefer),
      ['ai', 'local'],
    )
  })

  it('invalidate() descarta la instantánea y vuelve a analizar', async () => {
    const { calls, cache } = counting()
    const s = snap()
    await cache.resultFor(s, false, null, null)
    cache.invalidate(s)
    await cache.resultFor(s, false, null, null)
    assert.equal(calls.length, 2)
  })

  it('T4 · un ingreso recurrente cambia la firma: se vuelve a analizar, pero con los mismos datos la decisión es idéntica', async () => {
    const { calls, cache } = counting()
    const s = snap()
    const paga: ProfileFactEntry = { id: 'mem-paga', updatedAt: 3, fact: { kind: 'recurringIncome', cents: 3_500, frequency: 'monthly', category: 'Paga' } }
    assert.notEqual(profileSignature({ profileFacts: [paga] }), profileSignature(null))
    const before = await cache.resultFor(s, false, null, null)
    const after = await cache.resultFor(s, false, null, { profileFacts: [paga] })
    // Coste documentado: aceptar u olvidar un ingreso provoca un análisis más (en la pantalla AXIS, una llamada de IA).
    assert.equal(calls.length, 2)
    assert.notEqual(after, before, 'resultado nuevo, no el de la caché')
    const withoutDate = (r: AxisResult) => JSON.parse(JSON.stringify(r, (k, v) => (k === 'generatedAt' ? undefined : v))) as unknown
    assert.deepEqual(withoutDate(after), withoutDate(before), 'mismo contenido (salvo la hora): el ingreso recordado no cambia la decisión en esta fase')
    // Y queda en caché con su firma: repetir no vuelve a analizar.
    assert.equal(await cache.resultFor(s, false, null, { profileFacts: [paga] }), after)
    assert.equal(calls.length, 2)
  })

  it('otra instantánea (datos editados) → otro análisis', async () => {
    const { calls, cache } = counting()
    await cache.resultFor(snap(), false, null, null)
    await cache.resultFor(snap(), false, null, null)
    assert.equal(calls.length, 2)
  })
})

describe('AXIS · firma del perfil', () => {
  it('vacía sin hechos; ignora conclusiones y texto de las memorias', () => {
    assert.equal(profileSignature(null), '')
    assert.equal(profileSignature({ previousConclusions: [{ generatedAt: 'x', summary: 'y' }] }), '')
    assert.equal(
      profileSignature({ profileFacts: [LIQUIDITY], userMemories: [{ id: 'a', content: 'uno', category: 'other', importance: 'low', fecha: '2026-10-01' }] }),
      profileSignature({ profileFacts: [LIQUIDITY], userMemories: [{ id: 'a', content: 'otro texto', category: 'other', importance: 'low', fecha: '2026-10-02' }] }),
    )
  })

  it('estable ante el orden de entrada', () => {
    assert.equal(profileSignature({ profileFacts: [LIQUIDITY, HORIZON] }), profileSignature({ profileFacts: [HORIZON, LIQUIDITY] }))
  })

  it('cambia al añadir, editar u olvidar un hecho', () => {
    const base = profileSignature({ profileFacts: [LIQUIDITY] })
    assert.notEqual(profileSignature({ profileFacts: [LIQUIDITY, HORIZON] }), base)
    assert.notEqual(profileSignature({ profileFacts: [{ ...LIQUIDITY, updatedAt: 9, fact: { kind: 'minLiquidity', cents: 1 } }] }), base)
    assert.notEqual(profileSignature({ profileFacts: [] }), base)
  })
})
