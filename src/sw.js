// CACHE_NAME is rewritten at deploy time by the GitHub Actions workflow
// (see .github/workflows/deploy.yml) so every deploy gets a fresh cache and
// PWA users don't serve stale HTML.
const CACHE_NAME = 'traxent-__BUILD_SHA__';

// Core pages and assets to cache on install
const PRECACHE = [
  '/',
  '/dashboard',
  '/learn',
  '/learn-module-1',
  '/learn-module-2',
  '/learn-module-3',
  '/learn-module-4',
  '/calculator',
  '/tracker',
  '/journal',
  '/challenge-lab',
  '/account',
  '/faq',
  '/waitlist',
  '/privacy',
  '/terms',
  '/logo.svg',
  '/favicon.ico',
  '/auth.js'
];

// Always fetch fresh from network (auth, dynamic data)
const NETWORK_ONLY = [
  '/checkout',
  '/cancel',
  '/webhooks',
  'auth0.com',
  'stripe.com',
  'tradingview.com',
  'formspree.io'
];

// Install — cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE).catch(err => {
        console.warn('Traxent SW: Some precache items failed', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate — clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first for most requests, cache fallback
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Always go to network for these
  if (NETWORK_ONLY.some(pattern => url.includes(pattern))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // For navigation requests (page loads) — network first, cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the fresh page
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline — serve from cache
          return caches.match(event.request).then(cached => {
            if (cached) return cached;
            // Fallback to dashboard if cached
            return caches.match('/dashboard') || caches.match('/');
          });
        })
    );
    return;
  }

  // For static assets — cache first, network fallback
  if (
    url.includes('.css') ||
    url.includes('.js') ||
    url.includes('.svg') ||
    url.includes('.ico') ||
    url.includes('.png') ||
    url.includes('.jpg') ||
    url.includes('.woff') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Default — network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
