// SmackTown service worker: precache the whole app so it launches instantly
// and works offline (solo mode fully offline; multiplayer needs a network).
const CACHE = 'smacktown-v86';

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/main.js',
  'js/hat.js',
  'js/ice.js',
  'js/ui.js',
  'js/net.js',
  'js/presence.js',
  'js/game.js',
  'js/input.js',
  'js/render.js',
  'js/profile.js',
  'js/sfx.js',
  'js/voice.js',
  'vendor/peerjs.min.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  // 'no-cache' forces revalidation with the server: without it addAll can
  // fill the NEW cache version with STALE files straight from the browser's
  // HTTP cache, and installed PWAs (no refresh button) never recover.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'no-cache' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for same-origin GETs, refreshing the cache in the background.
// The refresh revalidates with the server (no-cache) — otherwise the HTTP
// cache can feed the same stale bytes back into the SW cache forever.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      const refetch = fetch(e.request.url, { cache: 'no-cache' }).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || refetch;
    })
  );
});
