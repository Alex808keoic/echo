/**
 * Todas las memorias cuentan en «Tu plan»: los datos (los 7 tipos) con reglas,
 * y las notas de texto libre solo después de que el usuario las convierta en un
 * dato (o las marque como que no cuentan). El texto libre nunca decide nada.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { buildAllocationPlan, CUSHION_OBJECTIVE_NAME, type AllocationPlan, type PlanOptions, type PlanStep } from '../plan/allocation'
import { describeStep } from '../plan/describe'
import { chatPlanOf, planForPrompt } from '../plan/chat'
import { applyProposal, pendingPlanNotes, validateImportedMemories } from '../chat/memory'
import { conversionProposal, suggestConversion } from '../chat/note-conversion'
import type { UserMemory } from '../chat/types'
import type { MemoryFact } from '../profile/types'
import type { AxisMemory } from '../types'
import type { Movement, Objective } from '../../types'
import { db } from '../../db/db'
import { listUserMemories, setNotePlanIgnored } from '../../db/axis-memories'
import { config, gasto, ingreso, objective, snapshot, TODAY } from './fixtures'

const PROFILE: MemoryFact[] = [
  { kind: 'horizon', value: 'long' },
  { kind: 'riskAttitude', value: 'balanced' },
]
const PAGA = (cents: number): MemoryFact => ({ kind: 'recurringIncome', cents, frequency: 'monthly', category: 'Paga' })

/** Julio y agosto cerrados: 2.000 € de ingresos y 1.000 € de gastos; septiembre en curso. */
const twoMonths = (): Movement[] => [...['07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 200_000), gasto(`2026-${m}-10`, 100_000)]), ingreso('2026-09-01', 200_000)]
/** Solo agosto cerrado: 300 € de gasto; septiembre en curso. */
const oneMonth = (): Movement[] => [ingreso('2026-08-01', 50_000), gasto('2026-08-10', 30_000), ingreso('2026-09-01', 50_000)]

function planFor(s: { movements?: Movement[]; facts?: MemoryFact[]; objectives?: Objective[]; liquidCents?: number } & PlanOptions = {}): { plan: AllocationPlan; objectives: ReturnType<typeof decide>['context']['objectives'] } {
  const movements = s.movements ?? twoMonths()
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  const ctx = buildFinancialContext(snapshot({ config: config((s.liquidCents ?? 800_000) - net), movements, objectives: s.objectives ?? [] }), TODAY)
  const memory: AxisMemory | undefined = s.facts ? { profileFacts: s.facts.map((fact, i) => ({ id: `mem-${i}`, updatedAt: i + 1, fact })) } : undefined
  const decision = decide({ context: ctx, ...(memory ? { memory } : {}) })
  return { plan: buildAllocationPlan(decision, { pendingNotes: s.pendingNotes }), objectives: decision.context.objectives }
}
const step = <K extends PlanStep['kind']>(p: AllocationPlan, kind: K) => p.steps.find((s): s is Extract<PlanStep, { kind: K }> => s.kind === kind)

describe('ingreso fijo previsto (recurringIncome)', () => {
  it('con un solo mes cerrado y sin ingreso previsto, el plan sigue pidiendo datos', () => {
    const { plan } = planFor({ movements: oneMonth() })
    assert.equal(plan.blocker, 'insufficient-data')
  })

  it('con un solo mes cerrado y un ingreso previsto, hay plan provisional y lo dice', () => {
    const { plan, objectives } = planFor({ movements: oneMonth(), facts: [...PROFILE, PAGA(100_000)] })
    assert.equal(plan.status, 'ready')
    assert.deepEqual(plan.monthly, { savingsCents: 70_000, spendingCents: 30_000, months: 1, forecast: true, recurringIncomeCents: 100_000 })
    const basis = step(plan, 'forecast-basis')
    assert.deepEqual(basis, { kind: 'forecast-basis', recurringIncomeCents: 100_000, spendingCents: 30_000, monthsNeeded: 1 })
    const view = describeStep(basis!, plan, objectives)
    assert.match(view.detail!, /Es una previsión: no se suma a tu dinero/)
    assert.match(view.detail!, /1\.000,00 € al mes/)
  })

  it('el chat sabe que el ahorro del plan provisional es una previsión', () => {
    const ctx = buildFinancialContext(snapshot({ config: config(500_000), movements: oneMonth() }), TODAY)
    const decision = decide({ context: ctx, memory: { profileFacts: [PAGA(100_000)].map((fact, i) => ({ id: `m${i}`, updatedAt: 1, fact })) } })
    assert.equal(planForPrompt(chatPlanOf(decision)).ahorro_es_prevision, true)
  })

  it('si el previsto no cubre el gasto, no hay nada que repartir', () => {
    const { plan } = planFor({ movements: oneMonth(), facts: [PAGA(20_000)] })
    assert.equal(plan.blocker, 'no-surplus')
    assert.ok(step(plan, 'forecast-basis'))
  })

  it('con meses suficientes mandan los datos; el previsto solo se anota', () => {
    const { plan } = planFor({ facts: [...PROFILE, PAGA(999_900)] })
    assert.equal(plan.monthly?.savingsCents, 100_000)
    assert.equal(plan.monthly?.forecast, undefined)
    assert.equal(plan.monthly?.recurringIncomeCents, 999_900)
    assert.equal(step(plan, 'forecast-basis'), undefined)
  })
})

describe('prioridad declarada (priorities)', () => {
  const objs = () => [
    objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 100_000, priority: 1 }),
    objective({ name: 'Moto', targetCents: 4_000_000, priority: 2 }),
    objective({ name: 'Viaje', targetCents: 2_000_000, priority: 3 }),
  ]

  it('si tu prioridad no va la primera del reparto (después del colchón), el plan lo dice sin reordenar', () => {
    const objectives = objs()
    const viaje = objectives[2]
    const { plan, objectives: ctxObjectives } = planFor({ objectives, facts: [...PROFILE, { kind: 'priorities', objectiveIds: [viaje.id] }] })
    const s = step(plan, 'follow-priority')
    assert.deepEqual(s, { kind: 'follow-priority', objectiveId: viaje.id, rank: 3, aheadIds: [objectives[1].id] })
    const view = describeStep(s!, plan, ctxObjectives)
    assert.equal(view.title, 'Dijiste que «Viaje» es tu prioridad')
    assert.match(view.detail!, /3\.º lugar: antes recibe dinero «Moto»/)
    assert.equal(view.action?.kind, 'review-objectives')
  })

  it('si ya va la primera, no hay paso', () => {
    const objectives = objs()
    const { plan } = planFor({ objectives, facts: [...PROFILE, { kind: 'priorities', objectiveIds: [objectives[1].id] }] })
    assert.equal(step(plan, 'follow-priority'), undefined)
  })
})

describe('notas pendientes', () => {
  it('el plan pide revisarlas, al final, también cuando faltan datos', () => {
    const ready = planFor({ facts: PROFILE, pendingNotes: 2 }).plan
    assert.deepEqual(ready.steps.at(-1), { kind: 'review-notes', count: 2 })
    const blocked = planFor({ movements: oneMonth(), pendingNotes: 1 }).plan
    assert.deepEqual(blocked.steps, [{ kind: 'register-data', monthsNeeded: 1 }, { kind: 'review-notes', count: 1 }])
  })

  it('sin notas pendientes no hay paso', () => {
    assert.equal(step(planFor({ facts: PROFILE }).plan, 'review-notes'), undefined)
  })

  it('pendientes = notas sin dato y sin marcar como que no cuentan', () => {
    const note = (id: string, extra: Partial<UserMemory> = {}): UserMemory => ({ id, content: `Nota ${id} de prueba.`, category: 'context', importance: 'high', confidence: 1, source: 'manual', createdAt: 1, updatedAt: 1, ...extra })
    const list = [note('a'), note('b', { planIgnored: true }), note('c', { fact: PAGA(1_000) })]
    assert.deepEqual(pendingPlanNotes(list).map((m) => m.id), ['a'])
  })
})

describe('convertir una nota en un dato', () => {
  const note = (content: string, extra: Partial<UserMemory> = {}): UserMemory => ({
    id: 'nota-1',
    content,
    category: 'context',
    importance: 'medium',
    confidence: 0.8,
    source: 'conversation',
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  })

  it('AXIS sugiere el tipo con reglas fijas y rellena el importe si hay uno', () => {
    assert.deepEqual(suggestConversion(note('Cobra 1.200 € al mes de su trabajo.')), { kind: 'recurringIncome', amount: '1200,00' })
    assert.deepEqual(suggestConversion(note('Quiere tener siempre al menos 500 € disponibles.')), { kind: 'minLiquidity', amount: '500,00' })
    assert.equal(suggestConversion(note('No quiere arriesgar su dinero en bolsa.')).kind, 'riskAttitude')
    assert.equal(suggestConversion(note('Necesitará el dinero dentro de un par de años.')).kind, 'horizon')
    assert.equal(suggestConversion(note('Sus ingresos son variables, depende del mes.')).kind, 'irregularIncome')
    assert.equal(suggestConversion(note('Quiere comprarse una moto el verano que viene.')).kind, 'objective')
    assert.equal(suggestConversion(note('Le gusta revisar las cuentas los domingos.')).kind, null)
    assert.equal(suggestConversion(note('Le gusta revisar las cuentas los domingos.', { category: 'goal' })).kind, 'objective')
  })

  it('sin importe, «cobra al mes» no se sugiere como ingreso', () => {
    assert.notEqual(suggestConversion(note('Cobra algo cada mes, pero no sabe cuánto.')).kind, 'recurringIncome')
  })

  it('el dato sustituye a la nota (misma memoria) y deja de estar pendiente', () => {
    const n = note('Cobra 1.200 € al mes de su trabajo.', { planIgnored: true })
    const r = conversionProposal(n, { kind: 'recurringIncome', amount: '1200', category: 'Otros' }, () => undefined)
    assert.ok(r.ok)
    const out = applyProposal([n], r.proposal, 10, () => 'nueva')
    assert.equal(out.action, 'updated')
    const [m] = out.memories
    assert.equal(m.id, 'nota-1')
    assert.deepEqual(m.fact, { kind: 'recurringIncome', cents: 120_000, frequency: 'monthly', category: 'Otros' })
    assert.equal(m.planIgnored, undefined)
    assert.deepEqual(pendingPlanNotes(out.memories), [])
  })

  it('un dato del mismo tipo que ya existía se sustituye (no quedan dos)', () => {
    const old: UserMemory = { ...note('Espera necesitar el dinero en menos de 2 años.'), id: 'viejo', fact: { kind: 'horizon', value: 'short' } }
    const n = note('Necesitará el dinero dentro de muchos años.')
    const r = conversionProposal(n, { kind: 'horizon', option: 2 }, () => undefined)
    assert.ok(r.ok)
    const out = applyProposal([old, n], r.proposal, 10, () => 'nueva')
    assert.deepEqual(out.memories.map((m) => [m.id, m.fact]), [['nota-1', { kind: 'horizon', value: 'long' }]])
  })

  it('prioridad: necesita un objetivo existente', () => {
    const n = note('Lo primero para él es el viaje.')
    assert.equal(conversionProposal(n, { kind: 'priorities', objectiveId: null }, () => undefined).ok, false)
    const r = conversionProposal(n, { kind: 'priorities', objectiveId: 'o1' }, (id) => (id === 'o1' ? 'Viaje' : undefined))
    assert.ok(r.ok)
    assert.deepEqual(r.proposal.fact, { kind: 'priorities', objectiveIds: ['o1'] })
    assert.equal(r.proposal.content, 'Su prioridad es el objetivo «Viaje».')
  })

  it('sin respuesta elegida no se guarda nada; una memoria que ya es dato no se convierte', () => {
    assert.equal(conversionProposal(note('Prefiere no arriesgar nada.'), { kind: 'riskAttitude', option: null }, () => undefined).ok, false)
    assert.equal(conversionProposal(note('Ya es un dato.', { fact: PAGA(1_000) }), { kind: 'adult', option: 0 }, () => undefined).ok, false)
  })
})

describe('«No cuenta para el plan»', () => {
  beforeEach(async () => {
    await db.axisMemories.clear()
  })

  it('se marca y desmarca en una nota; nunca en un dato', async () => {
    await db.axisMemories.bulkAdd([
      { id: 'n', content: 'Nota de prueba larga.', category: 'context', importance: 'high', confidence: 1, source: 'manual', createdAt: 1, updatedAt: 1 },
      { id: 'd', content: 'Recibe 10,00 € de paga cada mes.', category: 'financial_plan', importance: 'high', confidence: 1, source: 'manual', createdAt: 1, updatedAt: 1, fact: PAGA(1_000) },
    ])
    await setNotePlanIgnored('n', true)
    await setNotePlanIgnored('d', true)
    const byId = async (id: string) => (await listUserMemories()).find((m) => m.id === id)!
    assert.equal((await byId('n')).planIgnored, true)
    assert.equal('planIgnored' in (await byId('d')), false)
    await setNotePlanIgnored('n', false)
    assert.equal('planIgnored' in (await byId('n')), false)
  })

  it('la copia de seguridad la conserva en notas y rechaza valores raros', () => {
    const m = (extra: Record<string, unknown>) => ({ id: 'n', content: 'Nota de prueba larga.', category: 'context', importance: 'high', confidence: 1, source: 'manual', createdAt: 1, updatedAt: 1, ...extra })
    const ok = validateImportedMemories([m({ planIgnored: true })])
    assert.ok(ok.ok && ok.memories[0].planIgnored === true)
    assert.equal(validateImportedMemories([m({ planIgnored: 'sí' })]).ok, false)
  })
})
