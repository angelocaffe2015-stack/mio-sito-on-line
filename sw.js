const CACHE_NAME = 'easybox-micentro-pwa-v1';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './192.jpg',
  './512.png',
  './logo.jpg',
  './spazzare-e-passare-la-scopa-immagine-animata-0004.gif',
  './centro_pt.jpg',
  './centro_p1.jpg',
  './centro_p-1.jpg',
  './centro_p-2.jpg',
  './centro_p-3.jpg',
  './centro_p-4.jpg',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js'
];

// 1. Installazione: salva i file nella cache del dispositivo (senza bloccarsi se manca un'immagine opzionale)
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          fetch(url).then((res) => {
            if (res.ok) return cache.put(url, res);
          })
        )
      );
    })
  );
});

// 2. Attivazione: rimuove eventuali vecchie cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

// 3. Intercettazione richieste: risponde dalla cache se offline e aggiorna in background se online
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Lascia gestire direttamente a Firebase il traffico dati e autenticazione
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebasedatabase.app') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('securetoken.googleapis.com') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    })
  );
});