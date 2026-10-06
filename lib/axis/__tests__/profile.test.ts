/**
 * Perfil estructurado (fase 2 · bloque 2): derivación pura desde memorias
 * aceptadas y reconciliación determinista con el contexto. Nada de esto está
 * conectado todavía a `decide()`: se valida el modelo de datos aislado.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyProposal, isSavableProposal, replacementFor } from '../chat/memory'
import type { MemoryProposal, UserMemory } from '../chat/types'
import { buildFinancialContext } from '../context'
import { deriveProfile, EMPTY_RECONCILED_PROFILE, reconcileProfile } from '../profile/derive'
import { EMPTY_PROFILE, isEmptyProfile, isValidMemoryFact, PROFILE_LIMITS, type MemoryFact, type UserProfile } from '../profile/types'
import { config, healthyMovements, objective, snapshot, TODAY } from './fixtures'

const T0 = Date.parse('2026-09-01T10:00:00Z')

function memory(id: string, overrides: Partial<UserMemory> = {}): UserMemory {
  return { id, content: `Memoria ${id} con texto suficiente.`, category: 'context', importance: 'medium', confidence: 0.8, source: 'conversation', createdAt: T0, updatedAt: T0, ...overrides }
}
const withFact = (id: string, fact: MemoryFact, updatedAt = T0): UserMemory => memory(id, { fact, updatedAt })

/** Baraja determinista (para probar independencia del orden sin aleatoriedad en el test). */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]))
}

const context = (opts: { objectives?: ReturnType<typeof objective>[] } = {}) =>
  buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements(), objectives: opts.objectives ?? [objective({ id: 'obj-viaje', name: 'Viaje', targetCents: 500_000 })] }), TODAY)

describe('AXIS · perfil · hechos estructurados', () => {
  it('acepta solo hechos con clase conocida, campos exactos, enums y rangos válidos', () => {
    const valid: MemoryFact[] = [
      { kind: 'horizon', value: 'short' },
      { kind: 'riskAttitude', value: 'conservative' },
      { kind: 'minLiquidity', cents: 20_000 },
      { kind: 'irregularIncome', value: true },
      { kind: 'priorities', objectiveIds: ['a', 'b'] },
    ]
    for (const f of valid) assert.equal(isValidMemoryFact(f), true, JSON.stringify(f))
    const invalid: unknown[] = [
      null,
      'horizon',
      { kind: 'horizon' },
      { kind: 'horizon', value: 'eternal' },
      { kind: 'horizon', value: 'short', extra: 1 },
      { kind: 'riskAttitude', value: 'yolo' },
      { kind: 'minLiquidity', cents: 0 },
      { kind: 'minLiquidity', cents: 12.5 },
      { kind: 'minLiquidity', cents: PROFILE_LIMITS.MIN_LIQUIDITY_MAX_CENTS + 1 },
      { kind: 'minLiquidity', cents: '20000' },
      { kind: 'irregularIncome', value: 'sí' },
      { kind: 'priorities', objectiveIds: [] },
      { kind: 'priorities', objectiveIds: ['a', 'a'] },
      { kind: 'priorities', objectiveIds: ['a', 'b', 'c', 'd', 'e', 'f'] },
      { kind: 'priorities', objectiveIds: [''] },
      { kind: 'wealth', cents: 1 },
    ]
    for (const f of invalid) assert.equal(isValidMemoryFact(f), false, JSON.stringify(f))
  })
})

describe('AXIS · perfil · deriveProfile', () => {
  it('perfil vacío: sin memorias, o solo memorias de texto libre, o hechos inválidos', () => {
    assert.deepEqual(deriveProfile([]), { sources: {}, conflicts: [] })
    assert.equal(isEmptyProfile(deriveProfile([])), true)
    const free = [memory('a', { content: 'Quiere mantener 200 € de liquidez mínima.' }), memory('b', { content: 'Su horizonte es a corto plazo.' })]
    assert.deepEqual(deriveProfile(free), { sources: {}, conflicts: [] }, 'el texto libre no genera hechos, aunque hable de cifras o de horizonte')
    const broken = [memory('c', { fact: { kind: 'minLiquidity', cents: 0 } as MemoryFact }), memory('d', { fact: { kind: 'horizon', value: 'eternal' } as unknown as MemoryFact })]
    assert.deepEqual(deriveProfile(broken), { sources: {}, conflicts: [] }, 'un hecho inválido se ignora, no se corrige ni se infiere')
    assert.equal(isEmptyProfile(EMPTY_PROFILE), true)
  })

  it('una memoria estructurada → perfil correcto y trazable', () => {
    const p = deriveProfile([withFact('m1', { kind: 'minLiquidity', cents: 20_000 })])
    assert.deepEqual(p, { minLiquidityCents: 20_000, sources: { minLiquidityCents: 'm1' }, conflicts: [] })
  })

  it('dos memorias compatibles (clases distintas) → ambos campos, sin conflictos', () => {
    const p = deriveProfile([withFact('m1', { kind: 'horizon', value: 'long' }), withFact('m2', { kind: 'riskAttitude', value: 'balanced' }), memory('m3')])
    assert.deepEqual(p, { horizon: 'long', riskAttitude: 'balanced', sources: { horizon: 'm1', riskAttitude: 'm2' }, conflicts: [] })
  })

  it('dos memorias conflictivas → gana la actualizada más recientemente y queda registrado el conflicto', () => {
    const older = withFact('m1', { kind: 'minLiquidity', cents: 20_000 }, T0)
    const newer = withFact('m2', { kind: 'minLiquidity', cents: 50_000 }, T0 + 1)
    const p = deriveProfile([older, newer])
    assert.equal(p.minLiquidityCents, 50_000)
    assert.deepEqual(p.sources, { minLiquidityCents: 'm2' })
    assert.deepEqual(p.conflicts, [{ kind: 'minLiquidity', winnerId: 'm2', loserIds: ['m1'] }])
  })

  it('empate de updatedAt → gana el id menor', () => {
    const a = withFact('a', { kind: 'horizon', value: 'short' }, T0)
    const b = withFact('b', { kind: 'horizon', value: 'long' }, T0)
    const p = deriveProfile([b, a])
    assert.equal(p.horizon, 'short')
    assert.deepEqual(p.conflicts, [{ kind: 'horizon', winnerId: 'a', loserIds: ['b'] }])
  })

  it('el orden de entrada no importa (todas las permutaciones dan el mismo perfil)', () => {
    const memories = [
      withFact('m1', { kind: 'minLiquidity', cents: 20_000 }, T0),
      withFact('m2', { kind: 'minLiquidity', cents: 50_000 }, T0 + 1),
      withFact('m3', { kind: 'horizon', value: 'short' }, T0),
      withFact('m4', { kind: 'horizon', value: 'long' }, T0),
      withFact('m5', { kind: 'priorities', objectiveIds: ['obj-viaje'] }, T0),
    ]
    const expected = JSON.stringify(deriveProfile(memories))
    let count = 0
    for (const order of permutations(memories)) {
      assert.equal(JSON.stringify(deriveProfile(order)), expected)
      count++
    }
    assert.equal(count, 120)
    const p = deriveProfile(memories)
    assert.deepEqual(p.conflicts, [
      { kind: 'horizon', winnerId: 'm3', loserIds: ['m4'] },
      { kind: 'minLiquidity', winnerId: 'm2', loserIds: ['m1'] },
    ])
  })

  it('no muta las memorias ni comparte referencias (priorities copiadas)', () => {
    const m = withFact('m1', { kind: 'priorities', objectiveIds: ['x', 'y'] })
    const p = deriveProfile([m])
    p.priorities?.push('z')
    assert.deepEqual((m.fact as { objectiveIds: string[] }).objectiveIds, ['x', 'y'])
  })
})

describe('AXIS · perfil · reconcileProfile', () => {
  it('perfil vacío + contexto → perfil vacío reconciliado; no aparecen hechos inventados', () => {
    const r = reconcileProfile(EMPTY_PROFILE, context())
    assert.deepEqual(r, { sources: {}, conflicts: [], droppedPriorities: [] })
    assert.deepEqual(r, { ...EMPTY_RECONCILED_PROFILE })
    assert.equal(isEmptyProfile(r), true)
    // El contexto tiene liquidez, objetivos, ingresos… y nada de eso se convierte en perfil.
    assert.equal('minLiquidityCents' in r, false)
    assert.equal('priorities' in r, false)
  })

  it('prioridad sobre un objetivo inexistente → eliminada y explicada', () => {
    const p = deriveProfile([withFact('m1', { kind: 'priorities', objectiveIds: ['obj-fantasma'] })])
    const r = reconcileProfile(p, context())
    assert.equal(r.priorities, undefined)
    assert.deepEqual(r.sources, {}, 'sin prioridades vivas, desaparece también su origen')
    assert.deepEqual(r.droppedPriorities, [{ objectiveId: 'obj-fantasma', reason: 'missing' }])
  })

  it('prioridad sobre un objetivo completado → eliminada', () => {
    const ctx = context({ objectives: [objective({ id: 'obj-done', name: 'Hecho', targetCents: 100_000, achievedAt: Date.parse('2026-09-01') })] })
    assert.equal(ctx.objectives[0].completed, true)
    const r = reconcileProfile(deriveProfile([withFact('m1', { kind: 'priorities', objectiveIds: ['obj-done'] })]), ctx)
    assert.equal(r.priorities, undefined)
    assert.deepEqual(r.droppedPriorities, [{ objectiveId: 'obj-done', reason: 'completed' }])
  })

  it('objetivo existente y no completado → prioridad conservada, en su orden, junto a las descartadas', () => {
    const ctx = context({
      objectives: [
        objective({ id: 'obj-viaje', name: 'Viaje', targetCents: 500_000 }),
        objective({ id: 'obj-coche', name: 'Coche', targetCents: 800_000 }),
        objective({ id: 'obj-done', name: 'Hecho', targetCents: 100_000, achievedAt: Date.parse('2026-09-01') }),
      ],
    })
    const p = deriveProfile([withFact('m1', { kind: 'priorities', objectiveIds: ['obj-coche', 'obj-done', 'obj-viaje', 'obj-nada'] }), withFact('m2', { kind: 'minLiquidity', cents: 20_000 })])
    const r = reconcileProfile(p, ctx)
    assert.deepEqual(r.priorities, ['obj-coche', 'obj-viaje'])
    assert.deepEqual(r.droppedPriorities, [
      { objectiveId: 'obj-done', reason: 'completed' },
      { objectiveId: 'obj-nada', reason: 'missing' },
    ])
    assert.deepEqual(r.sources, { priorities: 'm1', minLiquidityCents: 'm2' })
    assert.equal(r.minLiquidityCents, 20_000, 'los demás campos pasan intactos')
  })

  it('los datos actuales mandan: la reconciliación nunca añade ni cambia hechos, solo quita', () => {
    const p: UserProfile = { horizon: 'short', riskAttitude: 'dynamic', minLiquidityCents: 999_999, irregularIncome: true, sources: { horizon: 'a', riskAttitude: 'b', minLiquidityCents: 'c', irregularIncome: 'd' }, conflicts: [] }
    const r = reconcileProfile(p, context())
    const { droppedPriorities, ...fields } = r
    assert.deepEqual(fields, p, 'ningún campo cambia por lo que diga el contexto (la liquidez real es otra)')
    assert.deepEqual(droppedPriorities, [])
  })

  it('es idempotente: reconciliar lo ya reconciliado devuelve exactamente lo mismo', () => {
    const ctx = context()
    const p = deriveProfile([withFact('m1', { kind: 'priorities', objectiveIds: ['obj-viaje', 'obj-nada'] }), withFact('m2', { kind: 'horizon', value: 'medium' })])
    const once = reconcileProfile(p, ctx)
    const twice = reconcileProfile(once, ctx)
    assert.deepEqual(twice, once)
    assert.deepEqual(reconcileProfile(twice, ctx), once)
    assert.deepEqual(once.droppedPriorities, [{ objectiveId: 'obj-nada', reason: 'missing' }])
  })

  it('no muta el perfil de entrada', () => {
    const p = deriveProfile([withFact('m1', { kind: 'priorities', objectiveIds: ['obj-viaje', 'obj-nada'] })])
    const snapshotBefore = JSON.stringify(p)
    reconcileProfile(p, context())
    assert.equal(JSON.stringify(p), snapshotBefore)
  })
})

describe('AXIS · perfil · memorias con hecho (applyProposal)', () => {
  const proposal = (overrides: Partial<MemoryProposal> = {}): MemoryProposal => ({ content: 'Quiere mantener 200 € de colchón.', category: 'constraint', importance: 'high', confidence: 0.9, replacesId: null, ...overrides })

  it('una propuesta sin hecho sigue funcionando igual (sin campo fact)', () => {
    const out = applyProposal([], proposal(), T0, () => 'id-1')
    assert.equal(out.action, 'created')
    assert.equal('fact' in out.memories[0], false)
    assert.equal(isSavableProposal(proposal({ fact: null })), true)
  })

  it('una propuesta con hecho válido lo guarda; con hecho inválido se rechaza entera', () => {
    const out = applyProposal([], proposal({ fact: { kind: 'minLiquidity', cents: 20_000 } }), T0, () => 'id-1')
    assert.equal(out.action, 'created')
    assert.deepEqual(out.memories[0].fact, { kind: 'minLiquidity', cents: 20_000 })
    assert.deepEqual(deriveProfile(out.memories).minLiquidityCents, 20_000)
    const bad = applyProposal([], proposal({ fact: { kind: 'minLiquidity', cents: -1 } }), T0, () => 'id-2')
    assert.equal(bad.action, 'rejected')
  })

  it('al actualizar con replacesId, el hecho anterior no sobrevive salvo que la propuesta traiga uno', () => {
    const created = applyProposal([], proposal({ fact: { kind: 'minLiquidity', cents: 20_000 } }), T0, () => 'id-1')
    const textOnly = applyProposal(created.memories, proposal({ content: 'Ya no necesita colchón fijo.', replacesId: 'id-1' }), T0 + 1, () => 'x')
    assert.equal(textOnly.action, 'updated')
    assert.equal('fact' in textOnly.memories[0], false)
    assert.equal(isEmptyProfile(deriveProfile(textOnly.memories)), true)
    const replaced = applyProposal(created.memories, proposal({ content: 'Quiere mantener 500 € de colchón.', replacesId: 'id-1', fact: { kind: 'minLiquidity', cents: 50_000 } }), T0 + 2, () => 'x')
    assert.equal(replaced.action, 'updated')
    assert.equal(deriveProfile(replaced.memories).minLiquidityCents, 50_000)
    assert.equal(replaced.memories.length, 1, 'sin duplicados')
  })

  it('una propuesta duplicada (mismo texto) conserva la memoria y su hecho', () => {
    const created = applyProposal([], proposal({ fact: { kind: 'horizon', value: 'long' } }), T0, () => 'id-1')
    const dup = applyProposal(created.memories, proposal(), T0 + 5, () => 'id-2')
    assert.equal(dup.action, 'unchanged')
    assert.deepEqual(dup.memories[0].fact, { kind: 'horizon', value: 'long' })
  })
})

describe('AXIS · memoria · fase 0 · texto repetido con hecho (fallo 2)', () => {
  const proposal = (overrides: Partial<MemoryProposal> = {}): MemoryProposal => ({ content: 'Quiere tener siempre 300 € disponibles.', category: 'constraint', importance: 'high', confidence: 0.9, replacesId: null, ...overrides })

  it('mismo texto, ahora con hecho → se guarda el hecho en la misma memoria', () => {
    const textOnly = applyProposal([], proposal(), T0, () => 'id-1')
    const out = applyProposal(textOnly.memories, proposal({ fact: { kind: 'minLiquidity', cents: 30_000 } }), T0 + 1, () => 'id-2')
    assert.equal(out.action, 'updated')
    assert.equal(out.memories.length, 1)
    assert.equal(out.memories[0].id, 'id-1')
    assert.deepEqual(out.memories[0].fact, { kind: 'minLiquidity', cents: 30_000 })
    assert.equal(deriveProfile(out.memories).minLiquidityCents, 30_000)
  })

  it('mismo texto y mismo hecho → sin cambios (solo se refresca la fecha)', () => {
    const created = applyProposal([], proposal({ fact: { kind: 'minLiquidity', cents: 30_000 } }), T0, () => 'id-1')
    const out = applyProposal(created.memories, proposal({ fact: { kind: 'minLiquidity', cents: 30_000 } }), T0 + 1, () => 'id-2')
    assert.equal(out.action, 'unchanged')
    assert.equal(out.memories[0].updatedAt, T0 + 1)
  })

  it('mismo texto con otro valor → se sustituye el valor', () => {
    const created = applyProposal([], proposal({ fact: { kind: 'minLiquidity', cents: 30_000 } }), T0, () => 'id-1')
    const out = applyProposal(created.memories, proposal({ fact: { kind: 'minLiquidity', cents: 40_000 } }), T0 + 1, () => 'id-2')
    assert.equal(out.action, 'updated')
    assert.equal(out.memories.length, 1)
    assert.equal(deriveProfile(out.memories).minLiquidityCents, 40_000)
  })
})

describe('AXIS · memoria · fase 0 · un hecho por hueco (fallo 3)', () => {
  const p = (content: string, overrides: Partial<MemoryProposal> = {}): MemoryProposal => ({ content, category: 'constraint', importance: 'high', confidence: 0.9, replacesId: null, ...overrides })
  const ids = () => {
    let n = 0
    return () => `id-${++n}`
  }

  it('dos hechos del mismo tipo con textos distintos → una sola memoria, con el valor nuevo y sin conflictos', () => {
    const newId = ids()
    const first = applyProposal([], p('Quiere tener siempre 300 € disponibles.', { fact: { kind: 'minLiquidity', cents: 30_000 } }), T0, newId)
    const out = applyProposal(first.memories, p('Prefiere un colchón de 500 € como mínimo.', { fact: { kind: 'minLiquidity', cents: 50_000 } }), T0 + 1, newId)
    assert.equal(out.action, 'updated')
    assert.equal(out.memories.length, 1)
    assert.equal(out.memories[0].id, 'id-1', 'se reescribe en su sitio')
    assert.match(out.memories[0].content, /500 €/)
    const profile = deriveProfile(out.memories)
    assert.equal(profile.minLiquidityCents, 50_000)
    assert.deepEqual(profile.conflicts, [])
  })

  it('tipos distintos conviven', () => {
    const newId = ids()
    const first = applyProposal([], p('Quiere tener siempre 300 € disponibles.', { fact: { kind: 'minLiquidity', cents: 30_000 } }), T0, newId)
    const out = applyProposal(first.memories, p('Piensa su dinero a largo plazo.', { fact: { kind: 'horizon', value: 'long' } }), T0 + 1, newId)
    assert.equal(out.action, 'created')
    assert.equal(out.memories.length, 2)
  })

  it('replacesId a una memoria mientras otra ocupa el hueco → se actualiza la indicada y se elimina solo la que sustituye', () => {
    const newId = ids()
    let mems = applyProposal([], p('Quiere tener siempre 300 € disponibles.', { fact: { kind: 'minLiquidity', cents: 30_000 } }), T0, newId).memories // id-1
    mems = applyProposal(mems, p('Piensa su dinero a largo plazo.', { fact: { kind: 'horizon', value: 'long' } }), T0 + 1, newId).memories // id-2
    mems = applyProposal(mems, p('Le preocupa quedarse sin margen.'), T0 + 2, newId).memories // id-3, solo texto
    const out = applyProposal(mems, p('Quiere un colchón de 600 €.', { replacesId: 'id-3', fact: { kind: 'minLiquidity', cents: 60_000 } }), T0 + 3, newId)
    assert.equal(out.action, 'updated')
    assert.deepEqual(out.action === 'updated' && out.removed.map((m) => m.id), ['id-1'])
    assert.deepEqual(out.memories.map((m) => m.id).sort(), ['id-2', 'id-3'])
    assert.equal(deriveProfile(out.memories).minLiquidityCents, 60_000)
    assert.equal(deriveProfile(out.memories).horizon, 'long', 'el hecho de otro tipo se conserva')
  })

  it('una memoria de texto idéntico con hecho de otro tipo nunca se elimina', () => {
    const newId = ids()
    let mems = applyProposal([], p('Quiere tener siempre 300 € disponibles.', { fact: { kind: 'minLiquidity', cents: 30_000 } }), T0, newId).memories // id-1
    mems = applyProposal(mems, p('Lo tiene claro.', { fact: { kind: 'horizon', value: 'long' } }), T0 + 1, newId).memories // id-2
    const out = applyProposal(mems, p('Lo tiene claro.', { fact: { kind: 'minLiquidity', cents: 70_000 } }), T0 + 2, newId)
    assert.equal(out.action, 'updated')
    assert.deepEqual(out.action === 'updated' && out.removed, [])
    assert.equal(out.memories.length, 2)
    assert.equal(deriveProfile(out.memories).horizon, 'long')
    assert.equal(deriveProfile(out.memories).minLiquidityCents, 70_000)
  })
})

describe('AXIS · memoria · fase 0 · la tarjeta y la persistencia coinciden (replacementFor)', () => {
  const p = (content: string, overrides: Partial<MemoryProposal> = {}): MemoryProposal => ({ content, category: 'constraint', importance: 'high', confidence: 0.9, replacesId: null, ...overrides })
  const mem = (id: string, content: string, fact?: MemoryFact): UserMemory => ({ id, content, category: 'constraint', importance: 'high', confidence: 0.9, source: 'conversation', createdAt: T0, updatedAt: T0, ...(fact ? { fact } : {}) })
  const LIQ = (cents: number): MemoryFact => ({ kind: 'minLiquidity', cents })

  const existing = [mem('a', 'Quiere tener siempre 300 € disponibles.', LIQ(30_000)), mem('b', 'Piensa a largo plazo.', { kind: 'horizon', value: 'long' }), mem('c', 'Le preocupa el margen.')]
  const CASES: Array<[string, MemoryProposal, { mode: string; target?: string; removed: string[]; replaced: MemoryFact[] }]> = [
    ['nueva sin hecho', p('Prefiere no complicarse.'), { mode: 'create', removed: [], replaced: [] }],
    ['nuevo hecho de otro tipo', p('Sus ingresos varían.', { fact: { kind: 'irregularIncome', value: true } }), { mode: 'create', removed: [], replaced: [] }],
    ['mismo tipo, texto distinto', p('Colchón de 500 €.', { fact: LIQ(50_000) }), { mode: 'update', target: 'a', removed: [], replaced: [LIQ(30_000)] }],
    ['texto repetido sin hecho', p('Le preocupa el margen.'), { mode: 'unchanged', target: 'c', removed: [], replaced: [] }],
    ['texto y hecho idénticos', p('Quiere tener siempre 300 € disponibles.', { fact: LIQ(30_000) }), { mode: 'unchanged', target: 'a', removed: [], replaced: [] }],
    ['texto repetido con hecho nuevo', p('Le preocupa el margen.', { fact: { kind: 'riskAttitude', value: 'conservative' } }), { mode: 'update', target: 'c', removed: [], replaced: [] }],
    ['replacesId solo texto (pierde su hecho)', p('Ya no necesita colchón.', { replacesId: 'a' }), { mode: 'update', target: 'a', removed: [], replaced: [LIQ(30_000)] }],
    ['replacesId a otra con hueco ocupado', p('Colchón de 600 €.', { replacesId: 'c', fact: LIQ(60_000) }), { mode: 'update', target: 'c', removed: ['a'], replaced: [LIQ(30_000)] }],
  ]

  for (const [name, proposal, expected] of CASES) {
    it(name, () => {
      const plan = replacementFor(proposal, existing)
      assert.equal(plan.mode, expected.mode)
      assert.equal(plan.target?.id, expected.target)
      assert.deepEqual(plan.removed.map((m) => m.id), expected.removed)
      assert.deepEqual(plan.replacedFacts, expected.replaced)

      // Lo que la tarjeta anuncia es lo que guarda applyProposal.
      const out = applyProposal(existing, proposal, T0 + 10, () => 'nuevo')
      const action = { create: 'created', update: 'updated', unchanged: 'unchanged' }[plan.mode]
      assert.equal(out.action, action)
      const remaining = new Set(out.memories.map((m) => m.id))
      for (const id of expected.removed) assert.ok(!remaining.has(id), `debía eliminarse ${id}`)
      for (const m of existing) if (!expected.removed.includes(m.id)) assert.ok(remaining.has(m.id), `no debía eliminarse ${m.id}`)
      if (expected.target) {
        const saved = out.memories.find((m) => m.id === expected.target)
        if (plan.mode === 'update') assert.deepEqual(saved?.fact, proposal.fact ?? undefined)
      }
    })
  }
})
