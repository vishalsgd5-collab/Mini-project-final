self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) {
          c.focus();
          c.postMessage({ type: "AURA_OPEN_RITUAL" });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow("./#/app/monitor");
      }
    })
  );
});
