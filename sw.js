const CACHE_NAME = 'frizzy-pos-v18';
const ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/js/ui.js',
    '/js/dbSync.js',
    '/js/api.js',
    '/manifest.json'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;

    // Nunca cachear llamadas a la API en tiempo real de Supabase
    if (e.request.url.includes('supabase.co')) {
        return;
    }

    e.respondWith(
        caches.match(e.request).then((cached) => {
            const fetchPromise = fetch(e.request)
                .then((res) => {
                    if (res && res.status === 200) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
                    }
                    return res;
                })
                .catch(() => cached);
            return cached || fetchPromise;
        })
    );
});