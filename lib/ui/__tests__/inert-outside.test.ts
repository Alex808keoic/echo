/**
 * La hoja modal deja inerte todo lo que queda fuera y, al cerrarse, lo
 * devuelve exactamente como estaba. Árbol simulado (sin navegador).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { inertOutside, type InertNode } from '../inert-outside'

class Node implements InertNode {
  readonly children: Node[] = []
  parentElement: Node | null = null
  private attrs = new Set<string>()
  constructor(
    readonly name: string,
    readonly tagName = 'DIV',
  ) {}
  add(...kids: Node[]) {
    for (const k of kids) {
      k.parentElement = this
      this.children.push(k)
    }
    return this
  }
  hasAttribute(n: string) {
    return this.attrs.has(n)
  }
  setAttribute(n: string) {
    this.attrs.add(n)
  }
  removeAttribute(n: string) {
    this.attrs.delete(n)
  }
}

/** html > body > [marca, main > marco > [contenido, nav, capa-hoja > hoja], script] */
function tree() {
  const sheet = new Node('hoja')
  const layer = new Node('capa').add(sheet)
  const content = new Node('contenido')
  const nav = new Node('nav')
  const frame = new Node('marco').add(content, nav, layer)
  const main = new Node('main').add(frame)
  const brand = new Node('marca')
  const script = new Node('script', 'SCRIPT')
  const body = new Node('body', 'BODY').add(brand, main, script)
  const head = new Node('head', 'HEAD')
  const html = new Node('html', 'HTML').add(head, body)
  return { html, head, body, brand, main, frame, content, nav, layer, sheet, script }
}

const inert = (nodes: Node[]) => nodes.filter((n) => n.hasAttribute('inert')).map((n) => n.name)

describe('inertOutside', () => {
  it('abierta: lo de detrás (contenido, navegación, marca) queda inerte; la hoja y sus ancestros no', () => {
    const t = tree()
    inertOutside(t.layer)
    const all = Object.values(t)
    assert.deepEqual(inert(all).sort(), ['contenido', 'marca', 'nav', 'script'].sort())
    assert.equal(t.head.hasAttribute('inert'), false, 'no sube por encima de <body>')
  })

  it('al cerrar todo vuelve como estaba, y lo que ya era inerte sigue siéndolo', () => {
    const t = tree()
    t.nav.setAttribute('inert')
    const release = inertOutside(t.layer)
    release()
    assert.deepEqual(inert(Object.values(t)), ['nav'])
  })
})
