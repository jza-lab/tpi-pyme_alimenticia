const CACHE_NAME = 'control-acceso-cache-v6';
const urlsToCache = [
  'index.html',
  'menu.html',
  'styles.css',
  'menu.css',
  'js/app.js',
  'js/menu.js',
  'js/api.js',
  'js/config.js',
  'js/face.js',
  'js/state.js',
  'js/i18n.js',
  'js/i18n-logic.js',
  'js/statistics.js',
  'icono.png',
  'manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      }).then(() => self.skipWaiting())
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  const supabaseUrl = 'https://xtruedkvobfabctfmyys.supabase.co';

  // Network-only for Supabase API
  if (requestUrl.origin === supabaseUrl) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Stale-while-revalidate for other assets
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
        // Return cached response if available, otherwise wait for network
        return response || fetchPromise;
      });
    })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});
