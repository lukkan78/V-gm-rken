const CACHE_NAME = 'vagmarkesforhor-v3';
const APP_SHELL = [
  '.',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'data/signs.json',
  'assets/icon.svg',
  // JS Modules
  'js/app.js',
  'js/state.js',
  'js/quiz/quiz-engine.js',
  'js/quiz/question-types.js',
  'js/learning/sm2.js',
  'js/learning/progress.js',
  'js/learning/recommendations.js',
  'js/ml/tfjs-loader.js',
  'js/ml/prediction.js',
  'js/ui/dashboard.js',
  'js/ui/components.js',
  'js/utils/storage.js'
];

// Install event - cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Cache images from Transportstyrelsen
  if (url.hostname === 'www.transportstyrelsen.se' && url.pathname.includes('/link/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Cache TensorFlow.js library
  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('tensorflow')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Cache Google Fonts
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation requests - network first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  // App shell files - stale while revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// Cache first strategy - for external resources
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Return a fallback for images if offline
    if (request.url.includes('/link/')) {
      return new Response('', { status: 503, statusText: 'Offline' });
    }
    throw error;
  }
}

// Stale while revalidate - serve cache immediately, update in background
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

// Handle messages from main thread
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
