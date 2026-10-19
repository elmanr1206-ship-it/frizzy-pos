const CACHE_NAME = 'frizzy-pos-v30';
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

// Librerías propias (/vendor): se guardan sin bloquear la instalación si alguna falla
const VENDOR_ASSETS = [
    '/vendor/supabase.js',
    '/vendor/html2canvas.min.js',
    '/vendor/xlsx.full.min.js',
    '/vendor/chart.umd.min.js'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((c) =>
            c.addAll(ASSETS).then(() => Promise.allSettled(VENDOR_ASSETS.map((u) => c.add(u))))
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

// Lo propio de la app: red primero (con 4 s de espera) y caché si no hay internet.
// Así tras cada despliegue se carga la versión nueva sin abrir la app dos veces.
async function redPrimero(req) {
    try {
        const res = await Promise.race([
            fetch(req),
            new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('timeout')), 4000))
        ]);
        if (res && res.status === 200) {
            const copia = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copia));
        }
        return res;
    } catch (err) {
        const guardado = await caches.match(req);
        if (guardado) return guardado;
        if (req.mode === 'navigate') {
            const inicio = await caches.match('/index.html');
            if (inicio) return inicio;
        }
        throw err;
    }
}

// Librerías externas (versiones fijas): caché primero, se actualiza en segundo plano
async function cachePrimero(req) {
    const guardado = await caches.match(req);
    const red = fetch(req)
        .then((res) => {
            if (res && res.status === 200) {
                const copia = res.clone();
                caches.open(CACHE_NAME).then((c) => c.put(req, copia));
            }
            return res;
        })
        .catch(() => guardado);
    return guardado || red;
}

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    const url = new URL(e.request.url);

    // Nunca cachear llamadas a la API en tiempo real de Supabase
    if (url.hostname.endsWith('supabase.co')) return;

    e.respondWith(url.origin === self.location.origin ? redPrimero(e.request) : cachePrimero(e.request));
});
