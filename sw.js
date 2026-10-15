const CACHE_NAME = 'frizzy-pos-v8';
const ASSETS = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/manifest.json',
    '/css/styles.css',
    '/js/app.js',
    '/js/api.js',
    '/js/dbSync.js',
    '/js/ui.js',
    '/js/dashboard.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    // Las consultas a la API REST/Auth de Supabase van directo a red
    if (req.url.includes('supabase.co')) return;

    event.respondWith(
        caches.match(req).then((cached) => {
            const networkFetch = fetch(req)
                .then((res) => {
                    // Solo cachear respuestas completas 200 OK (evita 206 Partial Content y errores) (#1)
                    if (res && res.ok && res.status === 200) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
                    }
                    return res;
                })
                .catch(() => cached);

            return cached || networkFetch;
        })
    );
});