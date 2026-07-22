/* Service worker TorneiGen — app-shell offline con runtime caching.
 * Strategia:
 *  - navigazioni (HTML): network-first, fallback all'index in cache → l'app si
 *    apre anche offline (i dati sono già locali in IndexedDB/Dexie);
 *  - asset statici same-origin (JS/CSS/font/immagini): stale-while-revalidate;
 *  - tutto il resto (API cross-origin, POST/PUT, ecc.): rete diretta, mai in cache.
 * Nessun precache di file con hash: si popola a runtime, così non dipende dai
 * nomi generati dal build. */
const VERSION = 'v1'
const CACHE = `torneigen-${VERSION}`
const APP_SHELL = '/index.html'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(APP_SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // API cross-origin: rete diretta
  if (url.pathname.startsWith('/api/')) return

  // Navigazioni → network-first con fallback all'app-shell in cache.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(APP_SHELL, copy))
          return res
        })
        .catch(() => caches.match(APP_SHELL)),
    )
    return
  }

  // Asset statici → stale-while-revalidate.
  e.respondWith(
    caches.match(req).then((cached) => {
      const rete = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || rete
    }),
  )
})
