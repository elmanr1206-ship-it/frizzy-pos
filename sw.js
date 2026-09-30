const CACHE_NAME = 'frizzy-pos-v2';
const ASSETS = ['/', '/index.html', '/css/styles.css', '/js/app.js', '/js/ui.js', '/js/dbSync.js', '/js/api.js', '/manifest.json'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))));

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        caches.match(e.request).then(cached => {
            const fetchPromise = fetch(e.request).then(res => {
                caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
                return res;
            }).catch(() => cached); // Si falla la red, devuelve caché
            return cached || fetchPromise;
        })
    );
});