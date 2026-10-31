const CACHE = "jeffa-bild-v2";
const PRECACHE = ['/', '/index.html', '/bild.js', '/bild.css', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  
  if (e.request.method !== 'GET' || url.origin !== location.origin) {
    return;
  }
  
  // Niemals /api/* cachen, network-first
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(() => new Response('Offline', { status: 503 })));
    return;
  }
  
  // App-Shell: cache-first
  e.respondWith(
    caches.match(e.request)
      .then((res) => res || fetch(e.request))
      .catch(() => caches.match('/index.html'))
  );
});
