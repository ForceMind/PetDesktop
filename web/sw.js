const CACHE_NAME = "coco-web-pet-v22";
const FRAME_CACHE_NAME = "coco-web-pet-frames-v1";
const ACTIVE_CACHES = new Set([CACHE_NAME, FRAME_CACHE_NAME]);
const APP_SHELL = ["./", "./index.html", "./styles.css", "./ai-slot.css", "./app.js", "./ai-slot.js", "./settings", "./admin.css", "./admin.js", "./data.json", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => !ACTIVE_CACHES.has(key)).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "PRELOAD_FRAMES" || !Array.isArray(event.data.urls)) return;
  const urls = [...new Set(event.data.urls)]
    .filter((value) => typeof value === "string")
    .map((value) => new URL(value, self.location.href))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => url.href);
  event.waitUntil(preloadFrames(urls));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (new URL(request.url).pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html"))));
    return;
  }

  if (request.destination === "image") {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    })));
    return;
  }

  event.respondWith(fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request)));
});

async function preloadFrames(urls) {
  const cache = await caches.open(FRAME_CACHE_NAME);
  const queue = [];
  for (const url of urls) {
    if (!(await cache.match(url))) queue.push(url);
  }
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const url = queue.shift();
      try {
        const response = await fetch(url, { cache: "no-cache" });
        if (response.ok) await cache.put(url, response);
      } catch {
        // Keep the rest of the background download running.
      }
    }
  });
  await Promise.all(workers);
}
