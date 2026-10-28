// Recibe los avisos de ECOMPRO en el celular aunque la página esté cerrada.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data.json(); } catch (x) { d = { titulo: "ECOMPRO", texto: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification((d.tipo === "alerta" ? "⚠ " : "") + (d.titulo || "ECOMPRO"), {
    body: d.texto || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "ec-" + (d.id || Date.now()),
    data: { url: "/" }
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (l) {
    for (var i = 0; i < l.length; i++) { if ("focus" in l[i]) return l[i].focus(); }
    return self.clients.openWindow("/");
  }));
});
