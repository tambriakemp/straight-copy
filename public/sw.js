// Service worker for agent push notifications.
//
// Pushes are deliberately payload-less (see _shared/agents/push.ts), so this
// shows a fixed message and sends you to the agents screen, where the actual
// brief loads over an authenticated session. Nothing about the business ever
// passes through a third-party push service.

self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("Something needs your approval", {
      body: "An agent finished a run and proposed actions. Tap to review.",
      icon: "/apple-touch-icon.svg",
      badge: "/favicon.svg",
      // One notification at a time — replace rather than stack.
      tag: "agent-run",
      renotify: true,
      data: { url: "/admin/agents" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/admin/agents";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Reuse an already-open tab rather than piling up new ones.
      for (const client of windows) {
        if (client.url.includes("/admin") && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

// Take over immediately on install so the first subscribe works without a reload.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
