import type { MetadataRoute } from 'next'

/** Manifest de la PWA: instalable, en modo standalone, con la identidad de Finax. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Finax — Tu dinero, con sentido',
    short_name: 'Finax',
    description: 'Tu sistema financiero personal: patrimonio, movimientos, objetivos, inversiones y AXIS.',
    lang: 'es',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f6f4',
    theme_color: '#f4f6f4',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Android recorta el icono a círculo: esta versión deja la marca dentro de la zona segura.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  }
}
