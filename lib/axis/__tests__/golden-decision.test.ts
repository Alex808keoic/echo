/**
 * Baseline de `decide()` (fase 2 · bloque 4).
 *
 * Congela la `AxisDecision` COMPLETA de cada escenario dorado. Se capturó en
 * el paso 0, antes de que el perfil del usuario entrara en la decisión, y en
 * el paso 1 (plomería) solo ganó la clave estructural `profile` (perfil
 * vacío reconciliado, influencia vacía). Demuestra que
 *
 *     decide(input)  ≡  decide({ ...input, profile: EMPTY_PROFILE })  ≡  esta baseline
 *
 * y detecta cualquier cambio accidental en la decisión existente.
 *
 * Qué congela cada snapshot (`__snapshots__/decision/<escenario>.json`): la
 * decisión entera tras un viaje de ida y vuelta por JSON — `context`
 * (incluida la serie diaria), `level`, `signals` completas (todas, no solo
 * las relevantes: id, dominio, prioridad, hecho, interpretación,
 * recomendación con acción, alternativa, incertidumbre), `lead`, `relevant`,
 * `facts`, `recommendation`, `alternatives`, `uncertainties`, `confidence`,
 * `missing`, `nextStep`, `basedOnDemoData` y `profile` (`fields` reconciliados
 * e `influence`). Las claves con `undefined` explícito desaparecen en JSON,
 * como en los goldens existentes.
 *
 * Regenerar solo a propósito: `UPDATE_GOLDEN=1 pnpm test`. Un cambio aquí es
 * un cambio de decisión y debe justificarse.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decide } from '../core/decision'
import { EMPTY_RECONCILED_PROFILE } from '../profile/derive'
import { EMPTY_PROFILE } from '../profile/types'
import type { AxisDecision, AxisInput } from '../types'
import { GOLDEN_SCENARIOS } from './golden-scenarios'

const SNAPSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '__snapshots__', 'decision')
const UPDATE = process.env.UPDATE_GOLDEN === '1'
const EXPECTED_SCENARIOS = 13

const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/**
 * Forma canónica para comparar con el viaje por JSON: quita solo las claves
 * cuyo valor es `undefined` (JSON no las representa; no son información).
 * Cualquier otra diferencia con `roundTrip` sería pérdida real.
 */
function withoutUndefined(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(withoutUndefined)
  if (typeof v === 'object' && v !== null) {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, value]) => value !== undefined)
        .map(([k, value]) => [k, withoutUndefined(value)]),
    )
  }
  return v
}

/** Valores que JSON perdería o transformaría en silencio. Ninguno debe existir en una decisión. */
function unsafeForJson(v: unknown, path = '$'): string[] {
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [`${path}: ${String(v)}`]
  if (typeof v === 'bigint' || typeof v === 'function' || typeof v === 'symbol') return [`${path}: ${typeof v}`]
  if (v instanceof Date || v instanceof Map || v instanceof Set) return [`${path}: ${v.constructor.name}`]
  if (Array.isArray(v)) return v.flatMap((x, i) => unsafeForJson(x, `${path}[${i}]`))
  if (typeof v === 'object' && v !== null) {
    if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) return [`${path}: ${(v as object).constructor?.name ?? 'prototipo no plano'}`]
    return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => unsafeForJson(x, `${path}.${k}`))
  }
  return []
}

function baseline(input: AxisInput): AxisDecision {
  return roundTrip(decide(input))
}

describe('AXIS · baseline de decide() (decisión congelada)', () => {
  it(`cubre exactamente los ${EXPECTED_SCENARIOS} escenarios dorados`, () => {
    assert.equal(GOLDEN_SCENARIOS.length, EXPECTED_SCENARIOS)
    assert.equal(new Set(GOLDEN_SCENARIOS.map((s) => s.name)).size, EXPECTED_SCENARIOS, 'nombres únicos')
  })

  for (const scenario of GOLDEN_SCENARIOS) {
    it(`escenario «${scenario.name}»: decide() produce exactamente la decisión congelada`, () => {
      const actual = baseline(scenario.input)
      const file = join(SNAPSHOT_DIR, `${scenario.name}.json`)
      if (UPDATE || !existsSync(file)) {
        mkdirSync(SNAPSHOT_DIR, { recursive: true })
        writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`)
      }
      const expected = JSON.parse(readFileSync(file, 'utf8')) as unknown
      assert.deepEqual(actual, expected, `el snapshot decision/${scenario.name}.json no coincide (si el cambio es deliberado: UPDATE_GOLDEN=1 pnpm test)`)
    })
  }

  it('es determinista: dos llamadas con la misma entrada dan la misma decisión', () => {
    for (const { name, input } of GOLDEN_SCENARIOS) {
      assert.deepEqual(decide(input), decide(input), name)
    }
  })

  it('serializar y deserializar la decisión no pierde información', () => {
    for (const { name, input } of GOLDEN_SCENARIOS) {
      const decision = decide(input)
      assert.deepEqual(unsafeForJson(decision), [], `${name}: valores que JSON perdería`)
      assert.deepEqual(roundTrip(decision), withoutUndefined(decision), `${name}: el viaje por JSON cambia algo más que las claves undefined`)
      // Y el viaje es estable: volver a serializar lo deserializado no cambia nada.
      assert.deepEqual(roundTrip(roundTrip(decision)), roundTrip(decision), `${name}: segundo viaje`)
    }
  })

  it('la entrada no cambia al decidir (decide() no muta el contexto ni el mercado)', () => {
    for (const { name, input } of GOLDEN_SCENARIOS) {
      const before = roundTrip(input)
      decide(input)
      assert.deepEqual(roundTrip(input), before, name)
    }
  })

  it('decide(input) ≡ decide({ ...input, profile: EMPTY_PROFILE }): un perfil vacío produce exactamente la baseline', () => {
    for (const { name, input } of GOLDEN_SCENARIOS) {
      assert.deepEqual(decide({ ...input, profile: EMPTY_PROFILE }), decide(input), name)
      assert.deepEqual(baseline({ ...input, profile: { sources: {}, conflicts: [] } }), baseline(input), `${name} (perfil vacío no congelado)`)
    }
  })

  it('sin perfil, decision.profile es el perfil vacío reconciliado con influencia vacía, y se serializa sin pérdida', () => {
    for (const { name, input } of GOLDEN_SCENARIOS) {
      const { profile } = decide(input)
      assert.deepEqual(profile, { fields: EMPTY_RECONCILED_PROFILE, influence: [] }, name)
      assert.deepEqual(roundTrip(profile), profile, `${name}: el perfil reconciliado no tiene claves undefined ni valores no JSON`)
    }
  })

  it('ninguna señal lleva profileInfluence mientras no haya comportamiento de perfil', () => {
    for (const { name, input } of GOLDEN_SCENARIOS) {
      for (const s of decide(input).signals) assert.equal('profileInfluence' in s, false, `${name}: ${s.id}`)
    }
  })
})
