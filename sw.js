const CACHE_NAME = 'pexura-v24-audit-hardening';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=24',
  './core.js',
  './app.js?v=24',
  './pwa.js?v=24',
  './pdf-font.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if(e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then((response) => {
      if(response && response.ok){
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy));
      }
      return response;
    }).catch(() => caches.match(e.request).then(response => response || caches.match('./index.html')))
  );
});
