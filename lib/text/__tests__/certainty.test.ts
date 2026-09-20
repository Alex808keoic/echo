/**
 * Detector compartido de certeza injustificada (`lib/text/certainty.ts`).
 *
 * Lo que debe caer (promesas y predicciones), lo que debe pasar (prudencia,
 * negaciones, condicionales, usos no financieros) y el corpus de regresión:
 * todo lo que AXIS escribe por sí mismo (reglas, redacción local, respuestas
 * locales del chat, investigación de mercado de ejemplo) tiene que ser
 * aceptado, o el detector estaría castigando la propia prosa prudente de AXIS.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { research } from '../../market/__tests__/fixtures'
import { analyzeCertainty, findCertainty, normalizeForMatching, splitClauses } from '../certainty'

const SHOULD_FAIL: Array<[string, string]> = [
  ['Mantener los gastos bajo control garantiza que el excedente siga creciendo.', 'garantiza'],
  ['Esta inversión garantiza una rentabilidad.', 'garantiza'],
  ['Esto garantizará un colchón.', 'garantizará'],
  ['Te garantiza tranquilidad.', 'Te garantiza'],
  ['No solo garantiza rentabilidad, además es líquido.', 'garantiza'],
  ['Rentabilidad garantizada.', 'garantizada'],
  ['El precio va a subir sin duda.', 'va a subir'],
  ['El oro va a bajar.', 'va a bajar'],
  ['No va a subir.', 'va a subir'],
  ['Nada está garantizado, pero el oro va a subir.', 'va a subir'],
  ['Los tipos bajarán en octubre.', 'bajarán'],
  ['Con certeza es lo mejor.', 'Con certeza'],
  ['Seguro que sube.', 'Seguro que'],
  ['Es seguro que no.', 'Es seguro'],
  ['Definitivamente deberías invertir.', 'Definitivamente'],
  ['Te aseguro que esto funcionará.', 'Te aseguro'],
  ['Obviamente el oro subirá.', 'Obviamente'],
  ['No hay duda de que es buena idea.', 'No hay duda'],
  ['No hay incertidumbre: es seguro.', 'No hay incertidumbre'],
  ['Sin duda el próximo mes irá mejor.', 'Sin duda'],
  ['It will rise for sure.', 'will rise'],
  ['Returns are guaranteed.', 'guaranteed'],
]

const SHOULD_PASS = [
  'No podemos garantizar una rentabilidad futura.',
  'Los datos no garantizan que el precio vaya a subir.',
  'No hay certeza sobre lo que ocurrirá.',
  'No podemos saberlo con certeza.',
  'No tenemos certeza sobre el resultado.',
  'Nada está garantizado.',
  'No está garantizado que sigas ahorrando así.',
  'No es seguro que llegues a tiempo.',
  'Nadie puede asegurar que el mercado se recupere.',
  'No se sabe a ciencia cierta.',
  'Sin garantizar nada, una opción sería mantener liquidez.',
  'Si bajara el tipo, el Euríbor caería.',
  'Aunque suba el oro, las mineras pueden ir peor.',
  'No creo que vaya a subir; podría bajar.',
  'El índice ha subido un 3 % durante el periodo analizado.',
  'Los mercados podrían seguir volátiles según los datos disponibles.',
  'Tienes un seguro de vida contratado.',
  'Asegúrate de revisar el objetivo.',
  'Este mes ahorras 1.300,00 €: un 65% de tus ingresos.',
  'Ojo con esto: aquí hay una diferencia importante.',
  'Con lo que sabemos ahora, no tenemos suficiente información para estar seguros.',
  'Yo vigilaría ese gasto durante los próximos meses.',
  'We cannot guarantee future returns.',
]

describe('lib/text · certeza injustificada', () => {
  it('detecta promesas, certezas y predicciones (y cita el fragmento original)', () => {
    for (const [text, expected] of SHOULD_FAIL) {
      const hit = findCertainty(text)
      assert.ok(hit, `debería detectar: ${text}`)
      assert.equal(hit.match, expected, text)
    }
  })

  it('acepta negaciones, condicionales, atenuadores y usos no financieros', () => {
    for (const text of SHOULD_PASS) {
      const hit = findCertainty(text)
      assert.equal(hit, null, `falso positivo «${hit?.match}» (${hit?.kind}) en: ${text}`)
    }
  })

  it('una negación no licencia una predicción, pero un condicional o un atenuador sí', () => {
    assert.equal(findCertainty('No va a subir.')?.kind, 'prediction')
    assert.equal(findCertainty('Si el BCE bajara tipos, el Euríbor bajaría.'), null)
    assert.equal(analyzeCertainty('Probablemente subirá, aunque no es seguro.').ok, true)
    const verdict = analyzeCertainty('No podemos garantizar nada, pero el oro va a subir.')
    assert.equal(verdict.ok, false)
    assert.deepEqual(verdict.hits.map((h) => [h.kind, h.licensed]), [['guarantee', true], ['prediction', false]])
    assert.equal(verdict.hits[0].licensedBy, 'no')
  })

  it('juzga cada cláusula por separado', () => {
    const clauses = splitClauses(normalizeForMatching('Nada está garantizado; si baja, el oro caerá.'))
    assert.deepEqual(clauses.map((c) => [c.text.trim(), c.conditional]), [['nada esta garantizado', false], ['si baja', true], ['el oro caera', false]])
    assert.equal(findCertainty('Nada está garantizado; si baja, el oro caerá.')?.match, 'caerá')
  })

  it('normaliza sin cambiar la longitud, para poder citar el original', () => {
    const text = 'Garantizará ÉXITO, sin duda.'
    assert.equal(normalizeForMatching(text), 'garantizara exito, sin duda.')
    assert.equal(normalizeForMatching(text).length, text.length)
    assert.equal(findCertainty(text)?.match, 'Garantizará')
  })
})

/* ------------------------ corpus de regresión de AXIS -------------------- */

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) for (const x of v) strings(x, out)
  else if (typeof v === 'object' && v !== null) for (const x of Object.values(v)) strings(x, out)
  return out
}

describe('lib/text · corpus: lo que AXIS escribe por sí mismo es prudente', () => {
  const dir = join(process.cwd(), 'lib', 'axis', '__tests__', '__snapshots__')
  const goldens = readdirSync(dir).filter((f) => f.endsWith('.json'))

  it('redacción local del análisis y respuestas locales del chat (13 escenarios dorados)', () => {
    assert.ok(goldens.length >= 13)
    let checked = 0
    for (const f of goldens) {
      const g = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { local: unknown; chatLocal: unknown }
      for (const text of [...strings(g.local), ...strings(g.chatLocal)]) {
        checked++
        const hit = findCertainty(text)
        assert.equal(hit, null, `${f}: «${hit?.match}» (${hit?.kind}) en: ${text}`)
      }
    }
    assert.ok(checked > 100, `corpus demasiado pequeño: ${checked}`)
  })

  it('la investigación de mercado de ejemplo (fixture) sigue siendo válida', () => {
    const { sources: _sources, ...texts } = research()
    void _sources
    for (const text of strings(texts)) {
      const hit = findCertainty(text)
      assert.equal(hit, null, `research(): «${hit?.match}» en: ${text}`)
    }
  })
})
