// service-worker.js corregido y seguro

const CACHE_NAME = 'control-acceso-cache-v8'; // subí versión
const urlsToCache = [
  'index.html',
  'menu.html',
  'styles.css',
  'menu.css',
  'js/face.js',
  'js/config.js',
  'js/i18n.js',
  'js/i18n-logic.js',
  'js/statistics.js',
  'icono.png',
  'manifest.json'
];

self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache inicial cargado');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Ignorar esquemas no soportados (ej: chrome-extension://)
  if (!['http:', 'https:'].includes(requestUrl.protocol)) {
    return;
  }

  const supabaseUrl = 'https://xtruedkvobfabctfmyys.supabase.co';

  // --- Siempre red para Supabase
  if (requestUrl.origin === supabaseUrl || requestUrl.pathname.includes('/functions/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // --- Siempre red para JS críticos
  if (
    requestUrl.pathname.includes('js/app.js') ||
    requestUrl.pathname.includes('js/api.js') ||
    requestUrl.pathname.includes('js/state.js')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // --- Cache-first para otros recursos estáticos
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        // Actualizar en segundo plano
        fetch(event.request).then(networkResponse => {
          if (networkResponse.ok && ['http:', 'https:'].includes(requestUrl.protocol)) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {});
        return response;
      }

      // Si no está en caché, ir a la red
      return fetch(event.request).then(networkResponse => {
        if (networkResponse.ok && ['http:', 'https:'].includes(requestUrl.protocol)) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return networkResponse;
      });
    })
  );
});

self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('Cache limpiada manualmente');
    });
  }
});
