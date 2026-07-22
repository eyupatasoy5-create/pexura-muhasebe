(function () {
  'use strict';

  function showConnectionState() {
    document.body.classList.toggle('is-offline', !navigator.onLine);
    const badge = document.getElementById('connectionBadge');
    if (badge) {
      badge.textContent = navigator.onLine ? 'Çevrimiçi' : 'Çevrimdışı';
      badge.setAttribute('aria-label', navigator.onLine ? 'İnternet bağlantısı var' : 'İnternet bağlantısı yok');
    }
  }

  window.addEventListener('online', showConnectionState);
  window.addEventListener('offline', showConnectionState);
  document.addEventListener('DOMContentLoaded', showConnectionState);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('./sw.js');
        registration.update().catch(() => {});
      } catch (error) {
        console.warn('Çevrimdışı çalışma başlatılamadı:', error);
      }
    });
  }
})();
