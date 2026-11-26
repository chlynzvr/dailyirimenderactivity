const CACHE_NAME = 'aquastudy-cache-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './assets/icon.png',
    './assets/avatar.png'
];

// Install Service Worker & Cache App Shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE).catch(() => {
                // Tetap lanjut jika file gambar opsional belum diunggah
                return cache.addAll(['./', './index.html', './style.css', './script.js', './manifest.json']);
            });
        })
    );
    self.skipWaiting();
});

// Activate & Hapus Cache Lama
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch Strategy: Network First untuk API Sholat, Cache First untuk Aset Statis
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // Jangan cache request API jadwal sholat agar data selalu akurat
    if (requestUrl.hostname.includes('api.aladhan.com')) {
        event.respondWith(
            fetch(event.request).catch(() => new Response(JSON.stringify({ error: 'Offline' }), {
                headers: { 'Content-Type': 'application/json' }
            }))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).then((networkResponse) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    if (event.request.method === 'GET' && requestUrl.origin === location.origin) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                });
            });
        }).catch(() => {
            if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
        })
    );
});