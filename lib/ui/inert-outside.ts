/**
 * Mientras una hoja (diálogo modal) está abierta, todo lo que queda fuera de
 * ella se marca `inert`: no se puede tocar, enfocar con el tabulador ni leer
 * con un lector de pantalla. Se recorre desde la hoja hasta <body> y se
 * marcan los hermanos de cada nivel; al cerrar, se deja todo como estaba
 * (lo que ya era `inert` antes no se toca).
 */

/** Lo mínimo del DOM que hace falta (permite probarlo sin navegador). */
export interface InertNode {
  readonly tagName: string
  readonly parentElement: InertNode | null
  readonly children: ArrayLike<InertNode>
  hasAttribute(name: string): boolean
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

export function inertOutside(element: InertNode): () => void {
  const changed: InertNode[] = []
  for (let node: InertNode = element; node.parentElement; node = node.parentElement) {
    const parent: InertNode = node.parentElement
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || sibling.hasAttribute('inert')) continue
      sibling.setAttribute('inert', '')
      changed.push(sibling)
    }
    if (parent.tagName === 'BODY') break
  }
  return () => {
    for (const node of changed) node.removeAttribute('inert')
  }
}
