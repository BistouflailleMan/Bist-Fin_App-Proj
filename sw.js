const VERSION = "1.2.0";
// ═══════════ Appli Finance — service worker (hors ligne) ═══════════
"use strict";

// ─── Cache lié à la version (la ligne VERSION ci-dessus est réécrite par le script de version) ───
const CACHE = "appli-finance-" + VERSION;

const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/base.css",
  "css/shell.css",
  "css/entry.css",
  "css/views.css",
  "css/income.css",
  "css/sync.css",
  "js/config.js",
  "js/version.js",
  "js/util.js",
  "js/store.js",
  "js/charts.js",
  "js/views.js",
  "js/entry.js",
  "js/income.js",
  "js/sync.js",
  "js/account.js",
  "js/update.js",
  "js/app.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png"
];

// ─── Installation : mise en cache (un fichier manquant n'empêche pas le reste) ───
// Pas de skipWaiting automatique : la page propose la mise à jour à l'utilisateur.
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(FILES.map(f => cache.add(new Request(f, { cache: "reload" })).catch(() => null))))
  );
});

// ─── Activation : suppression des anciens caches ───
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("appli-finance-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ─── Messages de la page ───
self.addEventListener("message", event => {
  const d = event.data;
  if (!d) return;
  if (d.type === "SKIP_WAITING") self.skipWaiting();
  else if (d.type === "GET_VERSION" && event.ports && event.ports[0]) event.ports[0].postMessage(VERSION);
});

// ─── Requêtes : cache d'abord + revalidation en arrière-plan (même origine uniquement) ───
// Les autres origines (Supabase, GitHub…) ne sont ni interceptées ni mises en cache.
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const network = fetch(req).then(res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    }
    return res;
  });

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) { event.waitUntil(network.catch(() => null)); return hit; }
      return network.catch(() => {
        if (req.mode === "navigate") return caches.match("index.html");
        return new Response("", { status: 504, statusText: "Hors ligne" });
      });
    })
  );
});
