const STATIC_CACHE_NAME = "tsotras-static-v3";
const IMAGE_CACHE_NAME = "tsotras-images-v3";
const IMAGE_CACHE_MAX_ENTRIES = 180;
const CLOUDINARY_HOSTS = new Set(["res.cloudinary.com"]);

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key !== STATIC_CACHE_NAME && key !== IMAGE_CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isSameOriginStaticAsset(url, request) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (request.destination === "document") return false;
  return /\.(?:css|js|mjs|woff2?|ttf|otf|svg|ico)$/i.test(url.pathname);
}

function isImageRequest(url, request) {
  if (request.destination === "image") return true;
  if (CLOUDINARY_HOSTS.has(url.hostname)) return true;
  return /\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(url.pathname);
}

async function pruneCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;

  const toΔιαγραφή = keys.length - maxEntries;
  await Promise.all(keys.slice(0, toΔιαγραφή).map(key => cache.delete(key)));
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(response => {
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => cached);

  // On hard-refresh or when no cache exists, wait for network
  if (!cached || (request.cache === 'no-cache' || request.cache === 'reload')) {
    return networkPromise;
  }

  return cached || networkPromise;
}

async function cacheFirstForImages(request) {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const url = new URL(request.url);
  const isCrossOrigin = url.origin !== self.location.origin;
  const fetchRequest = isCrossOrigin
    ? new Request(request.url, { mode: "cors", credentials: "omit" })
    : request;

  const response = await fetch(fetchRequest);
  if (response && response.ok) {
    cache.put(request, response.clone()).catch(() => {});
    pruneCache(IMAGE_CACHE_NAME, IMAGE_CACHE_MAX_ENTRIES).catch(() => {});
  }

  return response;
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (!request || request.method !== "GET") return;

  const url = new URL(request.url);

  if (isImageRequest(url, request)) {
    event.respondWith(cacheFirstForImages(request).catch(() => fetch(request)));
    return;
  }

  if (isSameOriginStaticAsset(url, request)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE_NAME).catch(() => fetch(request)));
  }
});
