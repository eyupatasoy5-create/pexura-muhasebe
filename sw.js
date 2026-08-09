const CACHE_NAME = 'pexura-v23-audit-hardening';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=23',
  './core.js',
  './app.js?v=23',
  './pwa.js?v=23',
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
const CACHE_NAME = 'pexura-v22-audit-hardening';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=22',
  './core.js',
  './app.js?v=22',
  './pwa.js?v=22',
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
