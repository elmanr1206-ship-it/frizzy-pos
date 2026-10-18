const CACHE_NAME = 'frizzy-pos-v26';
const ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/js/ui.js',
    '/js/dbSync.js',
    '/js/api.js',
    '/manifest.json',
    '/dashboard.html',
    '/js/dashboard.js',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/apple-touch-icon.png'
];

// Librerías externas: se guardan sin bloquear la instalación si alguna falla
const CDN_ASSETS = [
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((c) =>
            c.addAll(ASSETS).then(() => Promise.allSettled(CDN_ASSETS.map((u) => c.add(u))))
        )
    );
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