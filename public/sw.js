// public/sw.js
const CACHE_NAME = 'election-monitor-v1';
const QUEUE_KEY = 'offline-queue';

// Install: cache the app shell pages agents need
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(['/agent', '/agent/turnout', '/agent/results', '/offline.html'])
        .catch(() => {}) // don't fail install if pages aren't cached
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Intercept fetch: cache-first for GET, queue POST/PUT/PATCH when offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // For API mutation requests (POST/PUT/PATCH) — queue when offline
  if (['POST', 'PUT', 'PATCH'].includes(request.method) && url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request.clone()).catch(async () => {
        // Offline: queue the request
        const body = await request.clone().text().catch(() => '');
        const queued = await getQueue();
        queued.push({
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body,
          timestamp: Date.now(),
        });
        await saveQueue(queued);
        return new Response(JSON.stringify({ queued: true, offline: true }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }

  // For GET navigation requests: network-first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then(r => r || caches.match('/offline.html')))
    );
    return;
  }
});

// Message handler: replay queued requests when back online
self.addEventListener('message', async (event) => {
  if (event.data === 'replay-queue') {
    await replayQueue();
  }
});

// Background sync
self.addEventListener('sync', async (event) => {
  if (event.tag === 'replay-queue') {
    event.waitUntil(replayQueue());
  }
});

async function getQueue() {
  const cache = await caches.open(QUEUE_KEY);
  const resp = await cache.match('/queue-data');
  if (!resp) return [];
  try { return await resp.json(); } catch { return []; }
}

async function saveQueue(queue) {
  const cache = await caches.open(QUEUE_KEY);
  await cache.put('/queue-data', new Response(JSON.stringify(queue), {
    headers: { 'Content-Type': 'application/json' }
  }));
}

async function replayQueue() {
  const queue = await getQueue();
  if (!queue.length) return;

  const remaining = [];
  for (const item of queue) {
    try {
      await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body || undefined,
      });
    } catch {
      remaining.push(item); // keep failed items
    }
  }
  await saveQueue(remaining);

  // Notify clients of sync completion
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'sync-complete', remaining: remaining.length }));
}
