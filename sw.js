const CACHE_NAME = 'frizzy-pos-v11';
const ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/api.js',
  '/js/ui.js',
  '/js/dbSync.js',
  '/js/dashboard.js',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // NUNCA cachear llamadas a Supabase ni métodos distintos de GET
  if (e.request.method !== 'GET' || url.includes('supabase.co') || url.includes('telegram.org')) {
    return;
  }

  // Estrategia Network-First con respaldo en Caché para tener siempre la última versión si hay internet
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});