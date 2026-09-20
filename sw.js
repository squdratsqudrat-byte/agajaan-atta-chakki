/* Agha Jan Cyclone Atta Chakki — offline support.
   Pages and app files: always try the network first (so updates show up at once), fall back to the saved copy when offline.
   Firebase / data traffic is never touched here. */
const CACHE = 'aghajan-v2-20260920';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {}));
});
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
});

function networkFirst(req) {
  return new Promise(resolve => {
    let done = false;
    const fallback = () => caches.match(req, { ignoreSearch: true }).then(r => { if (!done) { done = true; resolve(r || Response.error()); } });
    const timer = setTimeout(fallback, 4000);
    fetch(req.url, { cache: 'no-cache' }).then(res => {
      clearTimeout(timer);
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      if (!done) { done = true; resolve(res); }
    }).catch(() => { clearTimeout(timer); fallback(); });
  });
}
// Third-party scripts (Firebase SDK, PDF tools): use the saved copy instantly, refresh it in the background
function staleWhileRevalidate(req) {
  return caches.open(CACHE).then(cache => cache.match(req).then(hit => {
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) { e.respondWith(networkFirst(req)); return; }
  if (req.destination === 'script') { e.respondWith(staleWhileRevalidate(req)); }
});
