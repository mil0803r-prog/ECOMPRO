// Recibe lo que inject.js copia, saca los pedidos y los pasa al servicio de fondo.
(function () {
  var visto = {};       // n -> huella del último envío (no se repite lo que no cambió)
  var cola = {};
  var timer = null;
  var mejorN = 0;
  var stats = { capturados: 0, pedidos: 0, urls: {} };
  function huella(p) { return [p.s, p.g, p.tr, p.nv, p.v, p.a, p.cl, p.p, p.tl].join("|"); }
  function enviar() {
    timer = null;
    var lista = Object.keys(cola).map(function (k) { return cola[k]; });
    cola = {};
    if (!lista.length) return;
    try {
      chrome.runtime.sendMessage({ tipo: "pedidos", orders: lista, stats: stats }, function () { void chrome.runtime.lastError; });
    } catch (e) {}
  }
  var dbg = { pagina: location.host + location.pathname.replace(/\d+/g, "#"), json: 0, vistos: {} };
  var dtimer = null;
  function claves(o) { return o && typeof o === "object" ? Object.keys(o).slice(0, 25) : typeof o; }
  function huellaJson(j) {
    var r = { top: claves(j) };
    var q = [j], n = 0;
    while (q.length && n++ < 40) {
      var x = q.shift();
      if (Array.isArray(x)) { if (x.length && x[0] && typeof x[0] === "object" && !Array.isArray(x[0])) { r.fila = claves(x[0]); r.filas = x.length; break; } }
      else if (x && typeof x === "object") Object.keys(x).forEach(function (k) { if (x[k] && typeof x[k] === "object") q.push(x[k]); });
    }
    return r;
  }
  function guardarDbg() {
    dtimer = null;
    try { chrome.runtime.sendMessage({ tipo: "dbg", dbg: dbg }, function () { void chrome.runtime.lastError; }); } catch (e) {}
  }
  guardarDbg();
  window.addEventListener("message", function (ev) {
    if (ev.source !== window || !ev.data || ev.data.src !== "ecompro-dropi") return;
    if (ev.data.prog) {
      try { chrome.runtime.sendMessage({ tipo: "prog", prog: ev.data.prog }, function () { void chrome.runtime.lastError; }); } catch (e) {}
      if (ev.data.prog.estado === "fin" && !timer && Object.keys(cola).length) timer = setTimeout(enviar, 300);
      return;
    }
    if (ev.data.meta) {
      var mu = String(ev.data.url || "").replace(/[?#].*$/, "").replace(/\d+/g, "#").slice(0, 90);
      dbg.red = dbg.red || {};
      if (dbg.red[mu] || Object.keys(dbg.red).length < 40) { var o = dbg.red[mu] || (dbg.red[mu] = { n: 0 }); o.n++; o.ct = ev.data.ct; o.st = ev.data.st; if (ev.data.m) o.m = ev.data.m; if (ev.data.rt) o.rt = ev.data.rt; if (ev.data.skip) { o.skip = ev.data.skip; o.len = ev.data.len; o.ini = ev.data.ini; } }
      if (!dtimer) dtimer = setTimeout(guardarDbg, 2000);
      return;
    }
    var json;
    try { json = JSON.parse(ev.data.texto); } catch (e) { dbg.noparse = (dbg.noparse || 0) + 1; return; }
    dbg.json++;
    var yaPedidos = false;
    var up = String(ev.data.url || "").replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "").replace(/\d+/g, "#").slice(0, 70);
    if (!dbg.vistos[up] && Object.keys(dbg.vistos).length < 25) dbg.vistos[up] = huellaJson(json);
    if (!dtimer) dtimer = setTimeout(guardarDbg, 2000);
    var ped = self.ECDropiNorm.extraer(json);
    if (ped.length && ped.length >= mejorN) { mejorN = ped.length; window.postMessage({ src: "ecompro-cmd", tipo: "marcar", url: ev.data.url }, "*"); }
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
  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, resp) {
      if (msg && msg.tipo === "importar") {
        if (!mejorN) { resp({ ok: false, error: "Todavía no vi la lista de pedidos de Dropi. Abre Mis pedidos, espera a que cargue la lista y vuelve a pulsar." }); return; }
        window.postMessage({ src: "ecompro-cmd", tipo: "importar", desde: msg.desde, hasta: msg.hasta }, "*");
        resp({ ok: true });
      }
    });
  } catch (e) {}
})();
