const CACHE_NAME = 'recaptchgame-pwa-v1';
const APP_SHELL = [
    '/',
    '/index.html',
    '/manifest.json',
    '/images/favicon.png',
    '/images/recaptch_logo.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
                return Promise.resolve(false);
            }),
        )),
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    const requestURL = new URL(event.request.url);
    if (requestURL.origin !== self.location.origin) {
        return;
    }

    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match('/index.html')),
        );
        return;
    }

    event.respondWith((async () => {
        const cached = await caches.match(event.request);
        if (cached) {
            return cached;
        }

        try {
            const response = await fetch(event.request);
            if (response && response.ok) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(event.request, response.clone());
            }
            return response;
        } catch (error) {
            return caches.match(event.request);
        }
    })());
});
