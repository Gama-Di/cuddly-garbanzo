/* Aether Arena service worker — caches static assets so the app
 * opens instantly / offline-shells. HTML & JS are network-first so
 * updates arrive immediately; API and WebSocket traffic is never cached. */
'use strict';
const CACHE = 'aether-v4';
const PRECACHE = [
  '/', '/index.html', '/manifest.webmanifest',
  '/js/util.js', '/js/heroes.js', '/js/game.js', '/js/net.js', '/js/lobby.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))   // nuke ALL old caches
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll())
      .then((cs) => { for (const c of cs) { try { if (c.navigate) c.navigate('/'); } catch (err) {} } })
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname === '/ws') return;
  // network-first for documents & code (fresh builds), cache-first for images/audio
  const cacheFirst = /\.(png|jpg|jpeg|svg|mp3|webp|ico|webmanifest)$/.test(url.pathname);
  e.respondWith((async () => {
    try {
      const fresh = await fetch(e.request, { cache: 'no-store' });
      if (fresh && fresh.ok && (cacheFirst || e.request.mode === 'navigate' || url.pathname.endsWith('.js') || url.pathname.endsWith('.html'))) {
        const clone = fresh.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone)).catch(() => {});
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(e.request, { ignoreSearch: true });
      if (cached) return cached;
      if (e.request.mode === 'navigate') {
        const shell = await caches.match('/index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
