/**
 * Genera los iconos de Finax a partir del logotipo original.
 *
 *   node scripts/generate-icons.mjs
 *
 * Fuente: `logo-finax.png` (el archivo de diseño, con la marca sobre una
 * tarjeta y mucho margen). El script recorta la marca por su caja real y la
 * centra sobre un lienzo propio, para que sea el sistema operativo quien
 * ponga el marco redondeado y no queden dos marcos superpuestos.
 *
 * Si cambia el logotipo, se sustituye el archivo fuente y se vuelve a
 * ejecutar: todos los tamaños se regeneran con las mismas proporciones.
 */
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const SOURCE = 'logo-finax.png'
const OUT = 'public'

/** Fondo de los iconos de aplicación. El degradado de la marca ya aporta el color. */
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }

/**
 * Proporción que ocupa la marca sobre el lienzo.
 * `app`: iconos normales, con aire suficiente para verse bien en la pantalla de inicio.
 * `maskable`: Android recorta a círculo, así que la marca vive dentro del 80 % central.
 */
const SCALE = { app: 0.62, maskable: 0.5, favicon: 0.86 }

/** Caja de la marca dentro del archivo fuente: lo que tiene color (ni blanco, ni sombra, ni transparencia). */
async function markBounds(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      if (data[i + 3] < 20) continue
      const max = Math.max(data[i], data[i + 1], data[i + 2])
      const min = Math.min(data[i], data[i + 1], data[i + 2])
      if (max - min <= 25) continue // sin saturación: blanco o gris de la sombra
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) throw new Error('No se ha encontrado ninguna marca de color en el archivo fuente.')
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * Marca aislada sobre fondo transparente. No basta con recortar por la caja:
 * dentro de ella siguen estando el blanco de la tarjeta y su sombra. Se
 * recorta por SATURACIÓN — lo que tiene color es la marca, lo que es blanco o
 * gris no lo es — con una rampa suave para no dentar los bordes.
 */
async function isolate(file, bounds) {
  const { data, info } = await sharp(file).extract(bounds).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const LO = 12 // por debajo: fondo
  const HI = 45 // por encima: marca sólida
  for (let i = 0; i < data.length; i += channels) {
    const max = Math.max(data[i], data[i + 1], data[i + 2])
    const min = Math.min(data[i], data[i + 1], data[i + 2])
    const ramp = Math.min(1, Math.max(0, (max - min - LO) / (HI - LO)))
    data[i + 3] = Math.round(data[i + 3] * ramp)
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer()
}

/** Marca aislada y escalada a `size * scale`, manteniendo su proporción. */
async function mark(isolated, size, scale) {
  return sharp(isolated)
    .resize({ width: Math.round(size * scale), height: Math.round(size * scale), fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

/** Un icono: marca centrada sobre un lienzo cuadrado. `background: null` deja transparencia. */
async function icon(isolated, { size, scale, background, file }) {
  const overlay = await mark(isolated, size, scale)
  await sharp({ create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: overlay, gravity: 'center' }])
    .png()
    .toFile(`${OUT}/${file}`)
  return file
}

const bounds = await markBounds(SOURCE)
console.log(`Marca encontrada en el original: ${bounds.width}x${bounds.height} px (desde ${bounds.left},${bounds.top})`)
const isolated = await isolate(SOURCE, bounds)

await mkdir(OUT, { recursive: true })

const targets = [
  { size: 512, scale: SCALE.app, background: WHITE, file: 'icon-512.png' },
  { size: 192, scale: SCALE.app, background: WHITE, file: 'icon-192.png' },
  { size: 512, scale: SCALE.maskable, background: WHITE, file: 'icon-maskable-512.png' },
  { size: 180, scale: SCALE.app, background: WHITE, file: 'apple-icon.png' },
  // Marca suelta, sin fondo, para la cabecera de la app (mismo degradado que el icono).
  { size: 256, scale: 1, background: null, file: 'logo-mark.png' },
  // Favicon sin fondo: la marca se lee igual sobre una pestaña clara y una oscura.
  { size: 32, scale: SCALE.favicon, background: null, file: 'favicon-32.png' },
  { size: 16, scale: SCALE.favicon, background: null, file: 'favicon-16.png' },
]

for (const target of targets) {
  await icon(isolated, target)
  console.log(`  ✓ ${OUT}/${target.file} (${target.size}x${target.size})`)
}
