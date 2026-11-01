/**
 * Texto de un PDF, renglón a renglón, leído en el propio navegador con pdf.js.
 * El archivo no sale del dispositivo. Solo se carga al importar un extracto.
 */

export class PdfReadError extends Error {
  constructor(
    message: string,
    readonly reason: 'password' | 'invalid' | 'no-text',
  ) {
    super(message)
  }
}

interface TextItem {
  str: string
  transform: number[]
  width: number
}

/** Une los trozos de texto que comparten altura (± media línea) en renglones, de izquierda a derecha. */
export function linesOf(items: TextItem[]): string[] {
  const rows: Array<{ y: number; parts: Array<{ x: number; end: number; str: string }> }> = []
  for (const item of items) {
    if (!item.str.trim()) continue
    const x = item.transform[4]
    const y = item.transform[5]
    const height = Math.abs(item.transform[3]) || 8
    let row = rows.find((r) => Math.abs(r.y - y) <= height * 0.5)
    if (!row) {
      row = { y, parts: [] }
      rows.push(row)
    }
    row.parts.push({ x, end: x + item.width, str: item.str })
  }
  rows.sort((a, b) => b.y - a.y)
  return rows.map((row) => {
    row.parts.sort((a, b) => a.x - b.x)
    let line = ''
    let lastEnd = -Infinity
    for (const p of row.parts) {
      // Un hueco visible entre trozos es un espacio (columnas de la tabla).
      line += line && p.x - lastEnd > 1 ? ` ${p.str}` : p.str
      lastEnd = p.end
    }
    return line.replace(/\s+/g, ' ').trim()
  })
}

export async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const data = new Uint8Array(await file.arrayBuffer())
  let doc
  try {
    doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new PdfReadError('El PDF tiene contraseña. Descárgalo sin contraseña desde tu banco y vuelve a probar.', 'password')
    }
    throw new PdfReadError('No se ha podido abrir el archivo. ¿Es un PDF?', 'invalid')
  }
  const lines: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    const items: TextItem[] = []
    for (const i of content.items) if ('str' in i) items.push(i)
    lines.push(...linesOf(items))
  }
  await doc.destroy()
  const text = lines.filter(Boolean).join('\n')
  if (!text.trim()) {
    throw new PdfReadError('Este PDF no tiene texto (parece una foto o un escaneo). Descarga el extracto desde la web o la app de tu banco.', 'no-text')
  }
  return text
}
