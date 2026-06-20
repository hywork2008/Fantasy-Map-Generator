/// <reference lib="WebWorker" />

import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

const DAY = 24 * 60 * 60; // seconds

registerRoute(
  ({ request }) => request.mode === "navigate",
  new NetworkFirst({
    networkTimeoutSeconds: 15,
    cacheName: "fmg-html",
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })]
  })
);

registerRoute(
  ({ request, url }) =>
    request.destination === "script" &&
    !url.pathname.endsWith("min.js") &&
    !url.pathname.includes("versioning.js") &&
    !url.pathname.includes("google"),
  new StaleWhileRevalidate({
    cacheName: "fmg-scripts",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * DAY })
    ]
  })
);

registerRoute(
  ({ request }) => request.destination === "style",
  new CacheFirst({
    cacheName: "fmg-stylesheets",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * DAY })
    ]
  })
);

registerRoute(
  ({ request, url }) => request.destination === "script" && url.pathname.endsWith("min.js"),
  new CacheFirst({
    cacheName: "fmg-libs",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * DAY })
    ]
  })
);

registerRoute(
  /.json$/,
  new CacheFirst({
    cacheName: "fmg-json",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * DAY })
    ]
  })
);

registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "fmg-images",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * DAY })
    ]
  })
);

registerRoute(
  /.svg$/,
  new CacheFirst({
    cacheName: "fmg-charges",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * DAY })
    ]
  })
);

registerRoute(
  ({ request }) => request.destination === "font",
  new CacheFirst({
    cacheName: "fmg-fonts",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * DAY })
    ]
  })
);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
