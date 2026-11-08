const CACHE = "type-checker-v4";
const FILES = ["./", "./index.html", "./builder.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const put = res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(req.mode === "navigate" ? "./index.html" : req, c)); } return res; };
  // Sprites never change: cache first
  if (url.pathname.includes("/sprites/")) { e.respondWith(caches.match(req).then(r => r || fetch(req).then(put))); return; }
  // Page, scripts, data: network first so updates show right away; cache when offline
  e.respondWith(fetch(req).then(put).catch(() => caches.match(req.mode === "navigate" ? "./index.html" : req)));
});
