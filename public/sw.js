const CACHE_NAME = "innovibe-office-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);

  // Do not intercept external requests such as Jitsi, Supabase, etc.
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request).catch(() => {
      // Always return a real Response.
      // caches.match() may return undefined, which is invalid for respondWith().
      return new Response("Offline", {
        status: 503,
        statusText: "Service Unavailable",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    })
  );
});
