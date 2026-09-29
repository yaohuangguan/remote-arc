const CACHE_NAME = "remote-arc-shell-v1";
const SHELL = ["/remote-arc.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

const isSensitiveRequest = (url) =>
  url.pathname.startsWith("/api/") ||
  url.pathname.startsWith("/auth/") ||
  url.pathname === "/mcp" ||
  url.pathname.startsWith("/oauth/");

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isSensitiveRequest(url)) return;

  // Dashboard HTML is always network-only so authenticated pages and sign-in redirects are never cached.
  if (request.mode === "navigate") return;

  if (url.pathname.startsWith("/assets/") || url.pathname === "/remote-arc.svg" || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached || Response.error());
        return cached || network;
      }),
    );
  }
});
