/* ===============================
   Bitunnel Service Worker (PRO)
   - Cache versioning
   - Old cache cleanup
   - Network-first for links.json & app.js
   =============================== */

const CACHE_VERSION = "v5"; // 🔴 HER GÜNCELLEMEDE ARTIR
const CACHE_NAME = `bitunnel-app-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

/* ---------- INSTALL ---------- */
self.addEventListener("install", (event) => {
  self.skipWaiting(); // yeni SW hemen aktif olsun
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

/* ---------- ACTIVATE ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim(); // açık sayfalara hemen kontrolü al
});

/* ---------- FETCH ---------- */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 🔴 links.json HER ZAMAN network-first (güncel kalsın)
  if (url.pathname === "/links.json") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 🔴 app.js ve styles.css network-first (güncelleme sorunu bitirir)
  if (url.pathname === "/app.js" || url.pathname === "/styles.css") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 🟢 Diğerleri cache-first
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});
