const CACHE = 'jeffa-v67';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && k !== 'jeffa-news').map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  // v63: network first, but after 2.5 s fall back to the cache so a slow mobile network never blocks the chat start
  const net = fetch(e.request).then((res) => { if (res.ok) { const clone = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, clone)); } return res; });
  e.respondWith(new Promise((resolve) => {
    let done = false; const fin = (r) => { if (!done && r) { done = true; resolve(r); } };
    const t = setTimeout(() => caches.match(e.request).then(fin), 2500);
    net.then((r) => { clearTimeout(t); fin(r); }).catch(() => caches.match(e.request).then((r) => { fin(r); if (!done) { done = true; resolve(Response.error()); } }));
  }));
});

// Web Push: payload is only a generic title/body ("Neue Antwort von <Bot>"), never content.
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch {}
  const tab = d.tab || 'bot';
  // v66: rote Neuigkeiten-Punkte — offene Fenster direkt informieren, sonst Merker im Cache für den nächsten Start
  const news = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => { cs.forEach((c) => c.postMessage({ type: 'news', tab })); return caches.open('jeffa-news').then((c) => c.put('/__news/' + tab, new Response(String(Date.now())))); }).catch(() => {});
  e.waitUntil(news);
  e.waitUntil(self.registration.showNotification(d.title || 'Jeffa', { body: d.body || 'Neue Antwort', tag: d.tag || 'jeffa', data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ('focus' in c) { c.postMessage({ type: 'open-bot' }); return c.focus(); } }
    return self.clients.openWindow((e.notification.data && e.notification.data.url) || '/');
  }));
});
