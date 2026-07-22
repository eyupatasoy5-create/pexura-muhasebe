/* PEXURA ortak, bağımsız yardımcılar */
(function (global) {
  'use strict';

  const htmlMap = Object.freeze({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  });

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => htmlMap[char]);
  }

  function debounce(fn, wait = 180) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function readLocalJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
      console.warn(`Yerel veri okunamadı: ${key}`, error);
      return fallback;
    }
  }

  function writeLocalJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Yerel veri kaydedilemedi: ${key}`, error);
      return false;
    }
  }

  function idle(callback, timeout = 700) {
    if ('requestIdleCallback' in global) return global.requestIdleCallback(callback, { timeout });
    return setTimeout(callback, 0);
  }

  function safeImageUrl(value) {
    try {
      const url = new URL(String(value || ''), location.href);
      return ['https:', 'http:', 'data:'].includes(url.protocol) ? url.href : '';
    } catch (_) {
      return '';
    }
  }

  global.PexuraCore = Object.freeze({ escapeHtml, debounce, readLocalJson, writeLocalJson, idle, safeImageUrl });
  global.escapeHtml = escapeHtml;
})(window);
