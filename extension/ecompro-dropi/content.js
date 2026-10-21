// Recibe lo que inject.js copia, saca los pedidos y los pasa al servicio de fondo.
(function () {
  var visto = {};       // n -> huella del último envío (no se repite lo que no cambió)
  var cola = {};
  var timer = null;
  var stats = { capturados: 0, pedidos: 0, urls: {} };
  function huella(p) { return [p.s, p.g, p.tr, p.nv, p.v, p.a, p.cl, p.p].join("|"); }
  function enviar() {
    timer = null;
    var lista = Object.keys(cola).map(function (k) { return cola[k]; });
    cola = {};
    if (!lista.length) return;
    try {
      chrome.runtime.sendMessage({ tipo: "pedidos", orders: lista, stats: stats }, function () { void chrome.runtime.lastError; });
    } catch (e) {}
  }
  window.addEventListener("message", function (ev) {
    if (ev.source !== window || !ev.data || ev.data.src !== "ecompro-dropi") return;
    var json;
    try { json = JSON.parse(ev.data.texto); } catch (e) { return; }
    var ped = self.ECDropiNorm.extraer(json);
    stats.capturados++;
    if (ped.length) {
      var u = String(ev.data.url || "").replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "").slice(0, 80);
      stats.urls[u] = (stats.urls[u] || 0) + ped.length;
      if (!stats.forma) stats.forma = self.ECDropiNorm.forma(json);
    }
    ped.forEach(function (p) {
      var h = huella(p);
      if (visto[p.n] === h) return;
      visto[p.n] = h; cola[p.n] = p; stats.pedidos++;
    });
    if (Object.keys(cola).length && !timer) timer = setTimeout(enviar, 1500);
  });
})();
