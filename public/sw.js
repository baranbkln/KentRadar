const serviceWorkerScope = globalThis;

serviceWorkerScope.addEventListener("install", () => {
  serviceWorkerScope.skipWaiting();
});

serviceWorkerScope.addEventListener("activate", (event) => {
  event.waitUntil(serviceWorkerScope.clients.claim());
});

serviceWorkerScope.addEventListener("fetch", (event) => {
  // Dynamic map and API requests remain network-owned in this first version.
  void event;
});
