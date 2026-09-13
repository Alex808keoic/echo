/*
 * Service worker de Finax (offline-first).
 * - Shell de la app (/ y /_next/static/*): caché con actualización en segundo plano.
 * - Datos de mercado (latest.json/history.json): red primero, caché como respaldo.
 * - Nunca cachea /api/* ni peticiones que no sean GET.
 * Los datos del usuario viven en IndexedDB, no pasan por aquí.
 */
const VERSION = 'finax-sw-v1'
const SHELL = `${VERSION}-shell`
const DATA = `${VERSION}-data`

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.add('/')).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('finax-sw-') && k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const isMarketData = (url) => /\/market-data(-local)?\/.+\.json$/.test(url.pathname) || /raw\.githubusercontent\.com\/.+\/market-data\//.test(url.href)

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) return

  if (isMarketData(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(DATA).then((cache) => cache.put(request, response.clone()))
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached ?? Response.error())),
    )
    return
  }

  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          caches.open(SHELL).then((cache) => cache.put('/', response.clone()))
          return response
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  if (url.pathname.startsWith('/_next/static/') || /\.(svg|png|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) caches.open(SHELL).then((cache) => cache.put(request, response.clone()))
            return response
          }),
      ),
    )
  }
})
