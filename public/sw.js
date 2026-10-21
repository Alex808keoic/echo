/*
 * Service worker de Finax (offline-first).
 * - Shell de la app (/ y /_next/static/*): caché con actualización en segundo plano.
 * - Datos de mercado (latest.json/history.json): red primero, caché como respaldo.
 * - Nunca cachea /api/* ni peticiones que no sean GET.
 * Los datos del usuario viven en IndexedDB, no pasan por aquí.
 */
const VERSION = 'finax-sw-v5'
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

/*
 * Recordatorios con la app cerrada (Periodic Background Sync: Chrome para
 * Android con Finax instalada; el sistema decide cuándo, como mucho una vez al
 * día). Lee IndexedDB «finax» solo para leer y enseña una notificación local:
 * nada sale del dispositivo. Repite las reglas de lib/reminders.ts: si cambias
 * una regla allí, cámbiala también aquí. Cada recordatorio se enseña como mucho
 * una vez por mes (inversiones: una vez por semana; fijos: una vez por cada vez nueva
 * que toca). El calendario de los fijos repite lib/finance/recurring.ts.
 */
const REMINDER_TAG = 'finax-reminders'
const REMINDER_STATE = 'finax-reminders'
const DAY_MS = 86400000

self.addEventListener('periodicsync', (event) => {
  if (event.tag === REMINDER_TAG) event.waitUntil(notifyDueReminders())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => (windows[0] ? windows[0].focus() : self.clients.openWindow('/'))),
  )
})

function readAll(db, store) {
  if (!db.objectStoreNames.contains(store)) return Promise.resolve([])
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

function openFinax() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('finax')
    // Si la base aún no existe, no se crea desde aquí.
    req.onupgradeneeded = () => req.transaction.abort()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Las veces de un fijo que ya tocaban (hasta `today`) sin confirmar ni omitir (lib/finance/recurring.ts). */
function pendingOccurrences(r, today) {
  if (typeof r.startDate !== 'string') return []
  const [y, m, d] = r.startDate.split('-').map(Number)
  const handled = Array.isArray(r.handled) ? r.handled : []
  const out = []
  for (let step = 0; step < 1200; step++) {
    const index = r.frequency === 'monthly' ? m - 1 + step : m - 1
    const year = r.frequency === 'monthly' ? y + Math.floor(index / 12) : y + step
    const month = (index % 12) + 1
    const day = Math.min(d, new Date(year, month, 0).getDate())
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (date > today) break
    if ((r.doneThrough && date <= r.doneThrough) || handled.includes(date)) continue
    out.push(date)
  }
  return out.slice(-24)
}

/**
 * Movimiento fuerte de la bolsa en un mes (repite strongEquityMove de
 * lib/market/moves.ts: cambiarlo en los dos sitios). Compara la investigación
 * guardada con la de hace unas 4 semanas (`baseline` en la caché de mercado).
 */
function strongEquityMove(research, baseline, now) {
  if (!research || !baseline || !Array.isArray(research.indicators) || !Array.isArray(baseline.indicators)) return null
  const MONTH = /^\d{4}-\d{2}$/
  const dayOf = (asOf) => Date.parse(MONTH.test(asOf) ? asOf + '-15' : asOf)
  const fresh = (i) => {
    if (MONTH.test(i.asOf)) {
      const [y, m] = i.asOf.split('-').map(Number)
      return now - new Date(y, m, 1).getTime() <= 45 * DAY_MS
    }
    // Aproximación de 5 días laborables: 7 días naturales.
    return now - Date.parse(i.asOf) <= 7 * DAY_MS
  }
  const moves = []
  for (const key of ['stoxx50', 'ibex', 'spx', 'ndq']) {
    const cur = research.indicators.find((i) => i.key === key)
    const old = baseline.indicators.find((i) => i.key === key)
    if (!cur || !old || cur.unit !== 'pts' || old.unit !== 'pts' || !(cur.value > 0) || !(old.value > 0) || typeof cur.asOf !== 'string' || typeof old.asOf !== 'string') continue
    if (!fresh(cur) || (cur.asOf.length === 7) !== (old.asOf.length === 7)) continue
    const days = Math.round((dayOf(cur.asOf) - dayOf(old.asOf)) / DAY_MS)
    if (!(days >= 20 && days <= 50)) continue
    const pct = Math.round(((cur.value - old.value) / old.value) * 1000) / 10
    if (pct <= -8) moves.push({ key, pct, direction: 'drop' })
    else if (pct >= 10) moves.push({ key, pct, direction: 'rise' })
  }
  return moves.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0] || null
}

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function notifyDueReminders() {
  if (self.Notification && self.Notification.permission !== 'granted') return
  let db
  try {
    db = await openFinax()
  } catch {
    return
  }
  const [checks, positions, memories, movements, meta, config, recurring, market] = await Promise.all([
    readAll(db, 'planChecks'),
    readAll(db, 'positions'),
    readAll(db, 'axisMemories'),
    readAll(db, 'movements'),
    readAll(db, 'meta'),
    readAll(db, 'config'),
    readAll(db, 'recurring'),
    readAll(db, 'market'),
  ])
  db.close()
  const today = localToday()
  const month = today.slice(0, 7)
  const day = Number(today.slice(8, 10))
  const entry = checks.find((c) => c.key === month)
  const items = entry && entry.planned ? entry.planned.items : 0
  const done = entry ? entry.done.length : 0
  const due = []
  if (items > 0 && done === 0 && day <= 3) due.push({ id: 'month-ready', period: month, text: `Tu decisión del mes está lista: ${items} pasos.` })
  const hasRecurring = memories.some((m) => m.fact && m.fact.kind === 'recurringIncome')
  const income = movements.some((m) => m.type === 'ingreso' && typeof m.date === 'string' && m.date.startsWith(month))
  if (hasRecurring && !income && day >= 10) due.push({ id: 'income-missing', period: month, text: 'Aún no has registrado ningún ingreso este mes. Si ya te ha llegado, apúntalo.' })
  const stale = positions.filter((p) => Date.now() - p.updatedAt > 30 * DAY_MS).length
  if (stale > 0) due.push({ id: 'update-investments', period: null, text: stale === 1 ? 'Una inversión lleva más de 30 días sin actualizar su valor.' : `${stale} inversiones llevan más de 30 días sin actualizar su valor.` })
  if (items > 0 && done < items && day >= 25) due.push({ id: 'month-ending', period: month, text: items - done === 1 ? 'Te queda 1 paso de tu decisión del mes.' : `Te quedan ${items - done} pasos de tu decisión del mes.` })
  const created = [...movements, ...positions, ...config].map((r) => r.createdAt || r.configuredAt).filter((t) => typeof t === 'number')
  if (created.length > 0 && !config.some((c) => c.demo)) {
    const backup = meta.find((m) => m.key === 'backup')
    const last = backup ? backup.at : null
    const first = Math.min(...created)
    if (last === null ? Date.now() - first > 7 * DAY_MS : Date.now() - last > 30 * DAY_MS)
      due.push({ id: 'backup', period: month, text: last === null ? 'Tus datos solo están en este móvil: haz tu primera copia de seguridad.' : 'Tu última copia de seguridad tiene más de un mes: haz una nueva.' })
  }
  const lastYear = String(Number(today.slice(0, 4)) - 1)
  if (today.slice(5, 7) === '01' && day <= 15 && movements.some((m) => typeof m.date === 'string' && m.date.startsWith(lastYear)))
    due.push({ id: 'year-review', period: month, text: `Tu resumen de ${lastYear} está listo.` })
  const pending = recurring.flatMap((r) => pendingOccurrences(r, today)).sort()
  if (pending.length > 0)
    due.push({
      id: 'recurring-pending',
      period: pending[pending.length - 1],
      text: pending.length === 1 ? 'Tienes 1 movimiento fijo por confirmar.' : `Tienes ${pending.length} movimientos fijos por confirmar.`,
    })
  // La bolsa se ha movido mucho: solo si inviertes (tienes inversiones o tu plan del mes invierte).
  const marketCache = market.find((m) => m.key === 'latest')
  const invests = positions.some((p) => p.valueCents > 0) || Boolean(entry && entry.planned && entry.planned.investCents > 0)
  const move = invests && marketCache ? strongEquityMove(marketCache.research, marketCache.baseline, Date.now()) : null
  if (move) {
    const amount = String(Math.abs(move.pct)).replace('.', ',')
    due.push({
      id: 'equity-move',
      period: marketCache.baseline.id + ':' + move.direction,
      text: move.direction === 'drop' ? 'La bolsa ha bajado un ' + amount + ' % en un mes. Tu plan no cambia: mira por qué en «Tu plan».' : 'La bolsa ha subido un ' + amount + ' % en un mes. Tu plan no cambia: mira por qué en «Tu plan».',
    })
  }
  if (due.length === 0) return

  const cache = await caches.open(REMINDER_STATE)
  const saved = await cache.match('/shown')
  const shown = saved ? await saved.json() : {}
  for (const r of due) {
    const last = shown[r.id]
    const fresh = r.period ? last !== r.period : !last || Date.now() - last >= 7 * DAY_MS
    if (!fresh) continue
    await self.registration.showNotification('Finax', { body: r.text, tag: r.id, icon: '/icon-192.png', badge: '/icon-192.png' })
    shown[r.id] = r.period || Date.now()
  }
  await cache.put('/shown', new Response(JSON.stringify(shown), { headers: { 'Content-Type': 'application/json' } }))
}
