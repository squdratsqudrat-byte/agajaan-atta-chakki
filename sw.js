/* Offline support for the shop app. Bump VERSION whenever index.html changes. */
const VERSION = 'v7';
const CACHE = 'shop-app-' + VERSION;

const LOCAL = ['./', './index.html', './manifest.json'];
const CDN = [
  'https://cdn.jsdelivr.net/npm/quagga@0.12.1/dist/quagga.min.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'www.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // add each file separately so one failure doesn't break the whole install
    const jobs = LOCAL.map(function (u) { return c.add(u).catch(function () {}); })
      .concat(CDN.map(function (u) {
        return fetch(new Request(u, { mode: 'no-cors' }))
          .then(function (r) { return c.put(u, r); }).catch(function () {});
      }));
    return Promise.all(jobs);
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('shop-app-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function networkFirst(req, fallbackUrl) {
  return new Promise(function (resolve) {
    let done = false;
    const fromCache = function () {
      return caches.match(req, { ignoreSearch: true })
        .then(function (r) { return r || caches.match(fallbackUrl); });
    };
    const timer = setTimeout(function () {
      fromCache().then(function (r) { if (r && !done) { done = true; resolve(r); } });
    }, 4000);
    fetch(req).then(function (res) {
      clearTimeout(timer);
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      if (!done) { done = true; resolve(res); }
    }).catch(function () {
      clearTimeout(timer);
      if (done) return;
      fromCache().then(function (r) { done = true; resolve(r || Response.error()); });
    });
  });
}

function cacheFirst(req) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      const copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    });
  });
}

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Firestore / Google APIs: never intercept (Firestore handles its own offline state)
  if (url.hostname.indexOf('googleapis.com') !== -1 || url.hostname.indexOf('firebase') !== -1) return;

  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, './index.html'));
    return;
  }
  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(req, req.url));
    return;
  }
  if (CDN_HOSTS.indexOf(url.hostname) !== -1) {
    e.respondWith(cacheFirst(req));
  }
});
