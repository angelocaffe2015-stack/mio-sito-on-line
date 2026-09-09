const CACHE_NAME = 'gestionale-offline-v1';

// Aggiungi qui TUTTI i file che l'app deve scaricare e tenere in memoria
const urlsToCache = [
  './',
  './index.html',
  './512.png',
  './logo.jpg',
  './centro_pt.jpg',
  './centro_p1.jpg',
  './centro_p-1.jpg',
  './centro_p-2.jpg',
  './centro_p-3.jpg',
  './centro_p-4.jpg',
  './email.min.js',
  './xlsx.full.min.js'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Se il file è nella cache, restituiscilo (funziona offline)
        // Altrimenti prova a scaricarlo da internet
        return response || fetch(event.request);
      })
  );
});