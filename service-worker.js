/* ============================================================
   AeroSense – service-worker.js
   Offline-first caching — configured for GitHub Pages
   Deployed at: https://bharatharakali.github.io/aerosense/
   ============================================================ */

const CACHE_NAME    = 'aerosense-v3.6.3';
const DYNAMIC_CACHE = 'aerosense-dynamic-v2';

// Base path on GitHub Pages (empty string = served from root / local dev)
const BASE = '/aerosense';

// App shell — all paths relative to the SW scope (./  = /aerosense/)
const APP_SHELL = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/pages/radar.html',
  BASE + '/pages/insights.html',
  BASE + '/pages/alerts.html',
  BASE + '/pages/compare.html',
  BASE + '/pages/settings.html',
  BASE + '/css/main.css',
  BASE + '/css/dark.css',
  BASE + '/css/light.css',
  BASE + '/css/animations.css',
  BASE + '/js/app.js',
  BASE + '/js/weather.js',
  BASE + '/js/aqi.js',
  BASE + '/js/radar.js',
  BASE + '/js/insights.js',
  BASE + '/js/alerts.js',
  BASE + '/js/compare.js',
  BASE + '/js/settings.js',
  BASE + '/js/storage.js',
  BASE + '/js/notify.js',
  BASE + '/js/countries.js',
  BASE + '/js/utils.js',
  BASE + '/js/nav.js',
  BASE + '/manifest.json',
  BASE + '/assets/icon-192.png',
  BASE + '/assets/icon-512.png',
  BASE + '/assets/apple-touch-icon.png',
  // CDN resources
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
];

// API domains — network-first (fall back to cache when offline)
const API_DOMAINS = [
  'api.open-meteo.com',
  'air-quality-api.open-meteo.com',
  'geocoding-api.open-meteo.com',
  'nominatim.openstreetmap.org',
];

// Tile / CDN domains — cache-first (long-lived static assets)
const TILE_DOMAINS = [
  'tile.openstreetmap.org',
  'basemaps.cartocdn.com',
  'tilecache.rainviewer.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// ---- Install ----
self.addEventListener('install', event => {
  console.log('[SW] Installing AeroSense ' + CACHE_NAME + '...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        APP_SHELL.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Failed to cache:', url, err.message)
          )
        )
      )
    ).then(() => {
      console.log('[SW] App shell cached.');
      return self.skipWaiting();
    })
  );
});

// ---- Activate ----
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== DYNAMIC_CACHE)
          .map(k => { console.log('[SW] Deleting old cache:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
    .then(() => {
      // Tell every open tab that the SW just updated so they can reload
      // and pick up the fresh cached files immediately.
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clients => clients.forEach(c =>
          c.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME })
        ));
    })
  );
});

// ---- Fetch ----
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  // API calls → network-first
  if (API_DOMAINS.some(d => url.hostname.includes(d))) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  // Tiles / CDN → cache-first
  if (TILE_DOMAINS.some(d => url.hostname.includes(d))) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  // App shell → cache-first, fallback network
  event.respondWith(cacheFirst(request, CACHE_NAME));
});

// ---- Strategies ----
async function networkFirst(request, cacheName) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback(request);
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    return offlineFallback(request);
  }
}

function offlineFallback(request) {
  if (request.headers.get('accept')?.includes('text/html')) {
    return caches.match(BASE + '/index.html');
  }
  return new Response(JSON.stringify({ error: 'offline' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---- Push Notifications ----
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'AeroSense Alert', {
      body: data.body || 'New weather alert',
      icon: BASE + '/assets/icon-192.png',
      badge: BASE + '/assets/icon-192.png',
      tag: data.tag || 'aerosense',
      data: { url: data.url || BASE + '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || BASE + '/pages/alerts.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url === url && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
