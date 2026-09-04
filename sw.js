const CACHE_NAME = 'pexura-v42-note-recovery';
const ASSETS = [
  './',
  './index.html',
  './calculator.html?v=41',
  './style.css?v=41',
  './core.js',
  './stock-math.js?v=34',
  './app.js?v=41',
  './pwa.js?v=25',
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
