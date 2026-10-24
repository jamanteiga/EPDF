// ePDF — service worker: funcionamiento sin conexión
// SPDX-License-Identifier: AGPL-3.0-or-later
const VERSION = "epdf-1.0.1";
const CORE = [
  "./", "index.html", "manifest.webmanifest", "css/app.css", "css/pdfjs-layers.css", "icons/icon.svg", "icons/icon-192.png",
  "js/app.js", "js/core/engine.js", "js/core/doc.js", "js/core/viewer.js", "js/core/tools.js", "js/core/geom.js",
  "js/ui/ribbon.js", "js/ui/sidebar.js", "js/ui/dialogs.js", "js/ui/icons.js",
  "js/cmd/annot.js", "js/cmd/organize.js", "js/cmd/forms.js", "js/cmd/protect.js", "js/cmd/draw.js", "js/cmd/convert.js", "js/cmd/review.js",
  "js/sign/pades.js", "js/sign/autofirma.js",
  "vendor/pdfjs/pdf.min.mjs", "vendor/pdfjs/pdf.worker.min.mjs", "vendor/pdf-lib.esm.min.js", "vendor/forge.min.js",
  "vendor/mupdf/mupdf.js", "vendor/mupdf/mupdf-wasm.js", "vendor/mupdf/mupdf-wasm.wasm",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// caché primero; lo demás (OCR, cmaps, fuentes…) se guarda al usarlo por primera vez
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (res.ok && res.type === "basic") { const cl = res.clone(); caches.open(VERSION).then(c => c.put(req, cl)); }
    return res;
  }).catch(() => hit)));
});
