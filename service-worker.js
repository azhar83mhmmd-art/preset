const VERSION = 'presetflow-v8';
const CORE = ['/', '/index.html', '/style.css', '/script.js', '/fx.js', '/qr.js', '/activity.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Never touch API/search requests or cross-origin traffic.
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname === '/config.js' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) return;

  if (req.mode === 'navigate') {
    // HTML: network first, cached shell when offline.
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put('/index.html', copy)); return res;
    }).catch(() => caches.match('/index.html')));
    return;
  }
  // CSS/JS/icons: stale-while-revalidate.
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
