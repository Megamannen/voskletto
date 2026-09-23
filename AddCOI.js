"use strict";
(() => {
  // src/AddCOI.ts
  if (typeof window === "undefined") {
    const sw = self;
    sw.addEventListener("install", () => sw.skipWaiting());
    sw.addEventListener("activate", (e) => e.waitUntil(sw.clients.claim()));
    async function handleFetch(request) {
      if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
      if (request.mode === "no-cors") {
        request = new Request(request.url, {
          cache: request.cache,
          credentials: "omit",
          headers: request.headers,
          integrity: request.integrity,
          keepalive: request.keepalive,
          method: request.method,
          mode: request.mode,
          redirect: request.redirect,
          referrer: request.referrer,
          referrerPolicy: request.referrerPolicy,
          signal: request.signal
        });
      }
      let r = await fetch(request).catch((e) => {
        console.error(e);
        throw e;
      });
      if (r.status === 0) {
        return r;
      }
      const headers = new Headers(r.headers);
      headers.set("Cross-Origin-Embedder-Policy", "require-corp");
      headers.set("Cross-Origin-Opener-Policy", "same-origin");
      return new Response(r.body, { status: r.status, statusText: r.statusText, headers });
    }
    sw.addEventListener("fetch", function(e) {
      e.respondWith(handleFetch(e.request));
    });
  } else {
    (async function() {
      if (window.crossOriginIsolated !== false) return;
      let registration = await navigator.serviceWorker.register(window.document.currentScript.src).catch((e) => console.error("COOP/COEP Service Worker failed to register:", e));
      if (registration) {
        registration.addEventListener("updatefound", () => {
          window.location.reload();
        });
        if (registration.active && !navigator.serviceWorker.controller) {
          window.location.reload();
        }
      }
    })();
  }
})();
