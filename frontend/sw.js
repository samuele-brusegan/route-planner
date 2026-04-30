const CACHE_NAME = 'route-planner-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/offline-maps.html',
    '/css/style.css',
    '/js/app.js',
    '/js/map.js',
    '/js/routing.js',
    '/js/markers.js',
    '/js/stats.js',
    '/js/chart.js',
    '/js/directions.js',
    '/js/export.js',
    '/js/offline-maps.js',
    '/js/offline-maps-page.js',
    '/js/ui.js',
    '/manifest.json',
    'https://cdn.jsdelivr.net/npm/ol@v8.2.0/ol.css',
    'https://cdn.jsdelivr.net/npm/ol@v8.2.0/dist/ol.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(urlsToCache);
            })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
                }

                // Clone the request
                const fetchRequest = event.request.clone();

                return fetch(fetchRequest).then((response) => {
                    // Check if valid response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // Clone the response
                    const responseToCache = response.clone();

                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache);
                        });

                    return response;
                });
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
