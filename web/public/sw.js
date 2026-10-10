// Garde une copie de toute l'interface pour pouvoir s'entraîner hors ligne. Le réseau
// passe toujours en premier : la copie ne sert que lorsqu'il ne répond pas. L'API n'est
// jamais mise en cache.
const CACHE = 'slots-__BUILD__';

self.addEventListener('install', (e) => {
  e.waitUntil(
    fetch('/precache.json', { cache: 'no-store' })
      .then((res) => res.json())
      .then(({ files }) => caches.open(CACHE).then((c) => c.addAll(files)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request).catch(async () => {
      const cache = await caches.open(CACHE);
      const hit = (await cache.match(e.request, { ignoreSearch: true })) || (await cache.match(url.pathname.endsWith('/') ? url.pathname : url.pathname + '/'));
      if (hit) return hit;
      // Une page inconnue hors ligne retombe sur l'accueil ; le reste échoue normalement.
      return e.request.mode === 'navigate' ? cache.match('/') : Response.error();
    })
  );
});
