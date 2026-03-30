// Service Worker for Election Monitor — Agent PWA
const CACHE_VERSION = 2;
const STATIC_CACHE = `em-static-v${CACHE_VERSION}`;
const DYNAMIC_CACHE = `em-dynamic-v${CACHE_VERSION}`;
const QUEUE_KEY = 'offline-queue';

// Pages to pre-cache for offline agent use
const PRECACHE_URLS = [
  '/agent',
  '/agent/turnout',
  '/agent/results',
  '/agent/tally-photos',
  '/agent/incidents',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install ─────────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch(() => {
        // Don't fail install if some pages aren't available yet
      })
    )
  );
  self.skipWaiting();
});

// ── Activate — clean up old caches ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE && k !== QUEUE_KEY)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ───────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // Skip SSE connections and auth endpoints — never cache these
  if (url.pathname === '/api/events' || url.pathname.startsWith('/api/auth/')) return;

  // ── API mutations (POST/PUT/PATCH) — queue when offline ──
  if (['POST', 'PUT', 'PATCH'].includes(request.method) && url.pathname.startsWith('/api/')) {
    event.respondWith(handleMutation(request));
    return;
  }

  // ── API GETs — network-first with 3s timeout, fall back to cache ──
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithTimeout(request, DYNAMIC_CACHE, 3000));
    return;
  }

  // ── Static assets (JS/CSS/images) — cache-first ──
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/uploads/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ── Navigation — network-first, fallback to cache then offline page ──
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
});

// ── Strategies ──────────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function networkFirstWithTimeout(request, cacheName, timeoutMs) {
  try {
    const response = await withTimeout(fetch(request), timeoutMs);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline', offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleNavigation(request) {
  try {
    const response = await withTimeout(fetch(request), 4000);
    // Cache successful navigations for offline use
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match('/offline.html');
  }
}

async function handleMutation(request) {
  try {
    return await fetch(request.clone());
  } catch {
    // Offline: queue the request for later replay
    const body = await request.clone().text().catch(() => '');
    const contentType = request.headers.get('Content-Type') || '';

    // Don't queue FormData requests (photo uploads) — too large for cache storage
    if (contentType.includes('multipart/form-data')) {
      return new Response(
        JSON.stringify({ error: 'Photo uploads require an internet connection', offline: true }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const queued = await getQueue();
    queued.push({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(
        [...request.headers.entries()].filter(([k]) => k !== 'cookie')
      ),
      body,
      timestamp: Date.now(),
    });
    await saveQueue(queued);

    return new Response(JSON.stringify({ queued: true, offline: true }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// ── Offline queue ───────────────────────────────────────────────────────────────

async function getQueue() {
  const cache = await caches.open(QUEUE_KEY);
  const resp = await cache.match('/queue-data');
  if (!resp) return [];
  try { return await resp.json(); } catch { return []; }
}

async function saveQueue(queue) {
  const cache = await caches.open(QUEUE_KEY);
  await cache.put(
    '/queue-data',
    new Response(JSON.stringify(queue), { headers: { 'Content-Type': 'application/json' } })
  );
}

async function replayQueue() {
  const queue = await getQueue();
  if (!queue.length) return;

  const remaining = [];
  for (const item of queue) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body || undefined,
      });
      // Keep items that got a server error (retry later)
      if (res.status >= 500) remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  await saveQueue(remaining);

  // Notify all clients of sync result
  const clients = await self.clients.matchAll();
  clients.forEach((client) =>
    client.postMessage({ type: 'sync-complete', remaining: remaining.length, replayed: queue.length - remaining.length })
  );
}

// ── Message handler ─────────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'replay-queue') {
    event.waitUntil(replayQueue());
  }
  if (event.data === 'skip-waiting') {
    self.skipWaiting();
  }
});

// ── Background Sync ─────────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'replay-queue') {
    event.waitUntil(replayQueue());
  }
});
