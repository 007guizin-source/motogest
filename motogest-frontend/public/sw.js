// ============================================================
// MotoGest — Service Worker (PWA + Offline)
// Arquivo: public/sw.js  (raiz do frontend Next.js)
// ============================================================

const CACHE_VERSION = 'v1';
const STATIC_CACHE  = `motogest-static-${CACHE_VERSION}`;
const API_CACHE     = `motogest-api-${CACHE_VERSION}`;
const OFFLINE_URL   = '/offline.html';

// Recursos estáticos que sempre ficam em cache
const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Rotas da API que podem ser servidas do cache quando offline
const CACHEABLE_API = [
  '/api/products',
  '/api/customers',
  '/api/financial/summary',
  '/api/sales/summary',
];

// ── Install ────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Pré-cacheando assets estáticos...');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── Activate ───────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== API_CACHE)
          .map(k => {
            console.log('[SW] Removendo cache antigo:', k);
            return caches.delete(k);
          })
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ──────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições não-GET (POST, PUT, DELETE — mutations)
  if (request.method !== 'GET') {
    event.respondWith(fetchWithOfflineQueue(request));
    return;
  }

  // Assets estáticos: cache-first
  if (url.pathname.startsWith('/_next/') || STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // API: network-first com fallback para cache
  if (url.pathname.startsWith('/api/')) {
    const isCacheable = CACHEABLE_API.some(p => url.pathname.startsWith(p));
    if (isCacheable) {
      event.respondWith(networkFirstWithCache(request, API_CACHE));
    } else {
      event.respondWith(networkOnly(request));
    }
    return;
  }

  // Páginas: network-first com fallback offline
  event.respondWith(networkFirstWithOfflineFallback(request));
});

// ── Estratégias de cache ───────────────────────────────────────

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
    return caches.match(OFFLINE_URL);
  }
}

async function networkFirstWithCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      // Indica ao cliente que os dados são do cache (offline)
      const body = await cached.json().catch(() => null);
      return new Response(
        JSON.stringify({ ...body, _offline: true, _cachedAt: cached.headers.get('date') }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ error: 'Offline. Sem cache disponível.' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function networkFirstWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match(OFFLINE_URL);
  }
}

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(JSON.stringify({ error: 'Sem conexão com o servidor.' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── Fila offline para mutations (POST/PUT/DELETE) ──────────────
// Armazena no IndexedDB e sincroniza quando voltar online

const SYNC_TAG = 'motogest-sync';

async function fetchWithOfflineQueue(request) {
  try {
    return await fetch(request);
  } catch {
    // Salvar na fila para sincronização posterior
    await saveToSyncQueue(request);

    // Registrar background sync se suportado
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await self.registration;
      await reg.sync.register(SYNC_TAG).catch(() => {});
    }

    return new Response(
      JSON.stringify({
        queued: true,
        message: 'Sem conexão. Ação salva e será enviada quando voltar online.',
      }),
      { status: 202, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function saveToSyncQueue(request) {
  try {
    const body = await request.text().catch(() => '');
    const entry = {
      id: Date.now(),
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      timestamp: new Date().toISOString(),
    };

    // Usar Cache API para persistir a fila (IndexedDB seria mais robusto em produção)
    const cache = await caches.open('motogest-sync-queue');
    await cache.put(
      new Request(`/sync-queue/${entry.id}`),
      new Response(JSON.stringify(entry))
    );
  } catch (err) {
    console.warn('[SW] Falha ao salvar na fila offline:', err);
  }
}

// ── Background Sync ────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(processSyncQueue());
  }
});

async function processSyncQueue() {
  const cache = await caches.open('motogest-sync-queue');
  const keys  = await cache.keys();

  for (const key of keys) {
    try {
      const resp  = await cache.match(key);
      const entry = await resp.json();

      await fetch(entry.url, {
        method:  entry.method,
        headers: entry.headers,
        body:    entry.body || undefined,
      });

      await cache.delete(key);
      console.log('[SW] Sincronizado:', entry.url);
    } catch (err) {
      console.warn('[SW] Falha ao sincronizar item:', err);
    }
  }
}

// ── Push Notifications (alertas de estoque baixo) ─────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json().catch(() => ({ title: 'MotoGest', body: event.data.text() }));

  event.waitUntil(
    self.registration.showNotification(data.title || 'MotoGest', {
      body:  data.body,
      icon:  '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      tag:   data.tag || 'motogest-notification',
      data:  data.url ? { url: data.url } : {},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      const existing = clientList.find(c => c.url === url && 'focus' in c);
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
