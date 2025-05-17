const CACHE_NAME = 'onetap-notes-cache-v3'; // Incremented version
const urlsToCache = [
  './', // Alias for index.html in the current directory
  './index.html',
  './style.css',
  './script.js',
  './icon-192x192.png',
  './icon-512x512.png',
  'https://fonts.googleapis.com/css2?family=Lora:wght@400;700&family=Inter:wght@400;500;700&display=swap'
];

// Install a service worker
self.addEventListener('install', event => {
  console.log('[SW] Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Opened cache, caching files:', urlsToCache);
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('[SW] Failed to cache files during install:', error);
      })
  );
  self.skipWaiting();
});
self.addEventListener('fetch', function(event) {
  event.respondWith(fetch(event.request));
});

// Cache and return requests
self.addEventListener('fetch', event => {
  console.log('[SW] Fetch event for', event.request.url);
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          console.log('[SW] Found in cache:', event.request.url);
          return response;
        }
        console.log('[SW] Not in cache, fetching from network:', event.request.url);
        return fetch(event.request).then(
          networkResponse => {
            // Optionally cache new successful GET requests
            if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET' && !event.request.url.startsWith('chrome-extension://')) {
              console.log('[SW] Caching new resource:', event.request.url);
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          }
        ).catch(error => {
            console.error('[SW] Fetch failed from network and not in cache:', event.request.url, error);
            // You could return a generic offline page here if you have one
        });
      })
  );
});

// Update a service worker
self.addEventListener('activate', event => {
  console.log('[SW] Activate event');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Claiming clients');
      return self.clients.claim();
    })
  );
});