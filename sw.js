// sw.js — VRDB service worker.
// Network-first for HTML/JS/CSS (so deploys take effect fast),
// cache-first for TMDB posters.

const CACHE_VERSION = 'vrdb-v1';
const POSTER_HOST   = 'image.tmdb.org';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Cache-first for TMDB poster images.
  if (url.hostname === POSTER_HOST) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return hit || Response.error();
      }
    })());
    return;
  }

  // Same-origin: network-first with cache fallback.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        const cache = await caches.open(CACHE_VERSION);
        const hit = await cache.match(req);
        if (hit) return hit;
        throw e;
      }
    })());
  }
  // Else: let the network handle it (Supabase, TMDB API JSON).
});
