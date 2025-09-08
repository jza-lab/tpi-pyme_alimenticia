// service-worker.js mejorado para evitar problemas de caché

const CACHE_NAME = 'control-acceso-cache-v9'; // Incrementar versión
const urlsToCache = [
  '/',
  'index.html',
  'menu.html',
  'index.css',
  'menu.css',
  'js/main.js',
  'js/ui.js',
  'js/auth.js',
  'js/menu.js',
  'js/api.js',
  'js/config.js',
  'js/face.js',
  'js/state.js',
  'js/i18n.js',
  'js/i18n-logic.js',
  'js/statistics.js',
  'icono.png',
  'manifest.json',
  'https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css'
];

self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Cache populated, skipping waiting...');
        return self.skipWaiting();
      })
  );
});

self.addEventListener('fetch', event => {
  // Ignorar solicitudes de extensiones de Chrome para evitar errores en la consola
  if (event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const supabaseUrl = 'https://xtruedkvobfabctfmyys.supabase.co';

  // Network-only para Supabase API y datos críticos
  if (requestUrl.origin === supabaseUrl ||
    requestUrl.pathname.includes('/functions/') ||
    requestUrl.searchParams.has('no-cache')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Para archivos JS críticos, usar network-only para asegurar que siempre se obtiene la última versión.
  // Esto es crucial para evitar bugs por lógica de negocio desactualizada.
  const criticalJSFiles = [
    'js/main.js', 'js/ui.js', 'js/auth.js', 'js/api.js', 'js/state.js',
    'js/menu.js', 'js/statistics.js', 'js/manual-entry.js',
    'js/face.js', 'js/i18n-logic.js'
  ];

  if (criticalJSFiles.some(file => requestUrl.pathname.includes(file))) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // En caso de que la red falle, intentar devolver desde la caché como fallback
        return caches.match(event.request);
      })
    );
    return;
  }

  // Cache-first para otros recursos estáticos
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          // Actualizar en background sin bloquear
          fetch(event.request)
            .then(networkResponse => {
              if (networkResponse.ok) {
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, networkResponse);
                });
              }
            })
            .catch(() => { }); // Ignorar errores de red en background
          return response;
        }

        // Si no está en caché, ir a la red
        return fetch(event.request)
          .then(networkResponse => {
            if (networkResponse.ok) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseClone);
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
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker activated, claiming clients...');
      return self.clients.claim();
    })
  );
});

// Manejar mensajes para forzar actualización de caché
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('Cache cleared by request');
    });
  }
});