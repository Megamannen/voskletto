// Add cross-origin isolation (COI) into the page when the user visits it for the first time via a service worker and refreshing to apply the headers.
// Taken, and modified from https://github.com/orgs/community/discussions/13309#discussioncomment-3844940

// Module scope keeps these declarations out of the other files
export {};

// Service worker globals, not part of the DOM lib
interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvent extends Event {
  readonly request: Request;
  respondWith(response: Promise<Response | undefined>): void;
}
interface ServiceWorkerScope {
  addEventListener(type: 'install', listener: () => void): void;
  addEventListener(type: 'activate', listener: (e: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', listener: (e: FetchEvent) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
}

if(typeof window === 'undefined') {
  const sw = self as unknown as ServiceWorkerScope;
  sw.addEventListener("install", () => sw.skipWaiting());
  sw.addEventListener("activate", e => e.waitUntil(sw.clients.claim()));
  async function handleFetch(request: Request): Promise<Response | undefined> {
    if(request.cache === "only-if-cached" && request.mode !== "same-origin") return;
    if(request.mode === "no-cors") {
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
        signal: request.signal,
      });
    }
    let r = await fetch(request).catch(e => {
      console.error(e);
      throw e;
    });
    if(r.status === 0) {
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
    if(window.crossOriginIsolated !== false) return;

    let registration = await navigator.serviceWorker.register((window.document.currentScript as HTMLScriptElement).src).catch(e => console.error("COOP/COEP Service Worker failed to register:", e));
    if(registration) {

      registration.addEventListener("updatefound", () => {
        window.location.reload();
      });

      if(registration.active && !navigator.serviceWorker.controller) {
        window.location.reload();
      }
    }
  })();
}
