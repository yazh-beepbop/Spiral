/**
 * Progressive Web App Service Worker for Spiral (`public/sw.js`).
 *
 * Feature overview & use cases:
 * - Enables installability on mobile and desktop browsers as a standalone PWA.
 * - Pre-caches static shell assets (`/manifest.json`, `/icon.svg`) during installation.
 * - Explicitly bypasses caching for `/api/*` endpoints so server-enforced 10-hour session
 *   gaps, Firebase ID token verification, and safety checks always execute live on the server.
 */

const CACHE_NAME = "spiral-shell-v1";
const STATIC_ASSETS = ["/manifest.json", "/icon.svg"];

/**
 * Pre-caches core static PWA metadata assets when the service worker installs.
 */
function handleInstall(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
}

/**
 * Cleans up outdated shell caches when a new service worker activates.
 */
function handleActivate(event) {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((staleKey) => caches.delete(staleKey)),
        ),
      ),
  );
  self.clients.claim();
}

/**
 * Serves static shell icons/manifest with network-first fallback while leaving API calls untouched.
 */
function handleFetch(event) {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    return;
  }
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request)),
    );
  }
}

self.addEventListener("install", handleInstall);
self.addEventListener("activate", handleActivate);
self.addEventListener("fetch", handleFetch);
