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
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  }
}
