// Corre dentro de la página de Dropi: copia (sin alterar) las respuestas JSON de la página y las pasa a la extensión.
// También puede repetir la petición de pedidos de Dropi con otras fechas (importación por rango), usando tu propia sesión.
(function () {
  if (window.__ecDropiHook) return;
  window.__ecDropiHook = true;
  var REQ = {};       // url absoluta -> { m, h, b } de las peticiones que hizo la página
  var MARCA = "";     // url de la petición que devolvió pedidos
  function abs(u) { try { return new URL(String(u), location.href).href; } catch (e) { return String(u); } }
  function hdrs(h) {
    var o = {};
    try {
      if (!h) return o;
      if (typeof h.forEach === "function" && !Array.isArray(h)) h.forEach(function (v, k) { o[k] = v; });
      else if (Array.isArray(h)) h.forEach(function (p) { o[p[0]] = p[1]; });
      else Object.keys(h).forEach(function (k) { o[k] = h[k]; });
    } catch (e) {}
    return o;
  }
  function guardarReq(u, m, h, b) {
    var k = abs(u);
    REQ[k] = { m: String(m || "GET").toUpperCase(), h: h || {}, b: typeof b === "string" ? b.slice(0, 20000) : "" };
    var ks = Object.keys(REQ);
    if (ks.length > 60) delete REQ[ks[0]];
  }
  // Nunca se leen ni se anotan las direcciones de credenciales, contraseñas, tokens o sesión.
  var SENSIBLE = /credential|password|passwd|token|secret|login|logout|auth|session|apikey|api-key|oauth|confio|payment|pago|bank|banco|card|tarjeta/i;
  function meta(url, ct, len, st, extra) {
    if (SENSIBLE.test(String(url))) return;
    try { window.postMessage(Object.assign({ src: "ecompro-dropi", meta: true, url: String(url).slice(0, 200), ct: String(ct || "").slice(0, 40), len: len, st: st }, extra || {}), "*"); } catch (e) {}
  }
  // ---------------- Huella digital del comprador ----------------
  // La página de Dropi pide la huella de un comprador por su teléfono. Aquí se aprende cómo es esa petición (con el teléfono
  // reemplazado por {TEL}) para repetirla con los teléfonos de tus pedidos, con tu propia sesión. No se guarda ningún token.
  var HK = /huella|finger|footprint|riesg|risk|delivery_?rate|effectiv|efectiv|recibe|clasific|classif|buyer_?type|tipo_?comprador|calific/i;
  var HPII = /phone|tel|name|surname|dir|address|email|mail|document|dni|nit|lat|lng|coord|note|nota|comment/i;
  var TPL_KEY = "ec_huella_tpl";
  function tieneHK(o, d) {
    if (!o || typeof o !== "object" || d > 4) return false;
    for (var k in o) { if (HK.test(k) && !HPII.test(k)) return true; if (o[k] && typeof o[k] === "object" && tieneHK(o[k], d + 1)) return true; }
    return false;
  }
  function camposHuella(o, path, out, d) {
    if (!o || typeof o !== "object" || d > 4) return out;
    Object.keys(o).forEach(function (k) {
      var p = path ? path + "." + k : k, v = o[k];
      if (HK.test(k) && !HPII.test(k)) { var t = JSON.stringify(v); if (t !== undefined && t.length < 600) { out.push({ campo: p, valor: v }); return; } }
      if (v && typeof v === "object") camposHuella(v, p, out, d + 1);
    });
    return out;
  }
  var TEL = /\d{8,13}/;
  function tel8(t) { var d = String(t || "").replace(/\D/g, ""); return d.length >= 8 ? d.slice(-8) : ""; }
  function aprender(url, metodo, body, texto) {
    try {
      if (!texto || texto.charAt(0) !== "{") return;
      var u = abs(url), b = typeof body === "string" ? body : "";
      var mu = (u.replace(/^https?:\/\/[^/]+/, "").match(TEL) || [])[0], mb = (b.match(TEL) || [])[0];
      var fono = mu || mb;
      if (!fono) return;
      var j = JSON.parse(texto);
      if (!tieneHK(j, 0)) return;
      var tpl = { m: String(metodo || "GET").toUpperCase(), url: u.split(fono).join("{TEL}"), body: b ? b.split(fono).join("{TEL}") : "" };
      try { localStorage.setItem(TPL_KEY, JSON.stringify(tpl)); } catch (e) {}
      window.postMessage({ src: "ecompro-dropi", huellaTpl: { m: tpl.m, ruta: tpl.url.replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "").slice(0, 120), tieneBody: !!tpl.body }, huella: { tel: tel8(fono), campos: camposHuella(j, "", [], 0).slice(0, 30) } }, "*");
    } catch (e) {}
  }
  function cabecera(origen) {
    var ks = Object.keys(REQ);
    for (var i = ks.length - 1; i >= 0; i--) {
      if (ks[i].indexOf(origen) !== 0) continue;
      var h = REQ[ks[i]].h || {};
      if (Object.keys(h).some(function (k) { return /^authorization$/i.test(k); })) return h;
    }
    return null;
  }
  async function huellas(tels) {
    var tpl = null;
    try { tpl = JSON.parse(localStorage.getItem(TPL_KEY) || "null"); } catch (e) {}
    function est(o) { try { window.postMessage({ src: "ecompro-dropi", huellaEstado: o }, "*"); } catch (e) {} }
    if (!tpl || !tpl.url) { est({ estado: "sin-plantilla" }); return; }
    var origen = (tpl.url.match(/^https?:\/\/[^/]+/) || [""])[0];
    var h = cabecera(origen);
    if (!h) { est({ estado: "sin-sesion" }); return; }
    var lista = Array.from(new Set((tels || []).map(tel8).filter(Boolean))).slice(0, 40), ok = 0, fallo = 0;
    est({ estado: "corriendo", total: lista.length, ok: 0 });
    for (var i = 0; i < lista.length; i++) {
      try {
        var init = { method: tpl.m, headers: h, credentials: "omit" };
        if (tpl.m !== "GET" && tpl.body) init.body = tpl.body.split("{TEL}").join(lista[i]);
        var r = await of.call(window, tpl.url.split("{TEL}").join(lista[i]), init);
        var t = await r.text(), j = null;
        try { j = JSON.parse(t); } catch (e) {}
        if (r.ok && j) { window.postMessage({ src: "ecompro-dropi", huella: { tel: lista[i], campos: camposHuella(j, "", [], 0).slice(0, 30) } }, "*"); ok++; }
        else fallo++;
      } catch (e) { fallo++; }
      est({ estado: "corriendo", total: lista.length, ok: ok, fallo: fallo });
      await new Promise(function (res) { setTimeout(res, 700); });
    }
    est({ estado: "fin", total: lista.length, ok: ok, fallo: fallo });
  }
  function enviar(url, texto) {
    if (SENSIBLE.test(String(url))) return;
    try {
      var motivo = "";
      if (!texto) motivo = "vacio";
      else if (texto.length > 6e7) motivo = "muy-grande";
      else if (texto.charAt(0) !== "{" && texto.charAt(0) !== "[") motivo = "no-json";
      if (motivo) { meta(url, "", texto ? texto.length : 0, 0, { skip: motivo, ini: String(texto || "").slice(0, 40).replace(/\d/g, "#") }); return; }
      window.postMessage({ src: "ecompro-dropi", url: abs(url).slice(0, 600), texto: texto }, "*");
    } catch (e) { meta(url, "", 0, 0, { skip: "error: " + String(e && e.message || e).slice(0, 60) }); }
  }
  var of = window.fetch;
  if (of) {
    window.fetch = function () {
      var args = arguments;
      try {
        var a0 = args[0], ini = args[1] || {};
        if (a0 && typeof a0 === "object" && a0.url) guardarReq(a0.url, a0.method, hdrs(a0.headers), "");
        else guardarReq(a0, ini.method, hdrs(ini.headers), ini.body);
      } catch (e) {}
      return of.apply(this, args).then(function (r) {
        try {
          var u = (args[0] && args[0].url) || args[0];
          var ct = (r.headers && r.headers.get && r.headers.get("content-type")) || "";
          meta(u, ct, +(r.headers.get("content-length") || 0), r.status, { m: String((args[1] && args[1].method) || (args[0] && args[0].method) || "GET") });
          if (/json/i.test(ct)) r.clone().text().then(function (t) { enviar(u, t); aprender(u, (args[1] && args[1].method) || (args[0] && args[0].method), args[1] && args[1].body, t); }).catch(function () {});
        } catch (e) {}
        return r;
      });
    };
  }
  var oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send, oh = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) { this.__ecu = u; this.__ecm = m; this.__ech = {}; return oo.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { try { this.__ech[k] = v; } catch (e) {} return oh.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    var x = this;
    x.__ecb = body;
    try { guardarReq(x.__ecu, x.__ecm, x.__ech, body); } catch (e) {}
    x.addEventListener("load", function () {
      try {
        meta(x.__ecu, x.getResponseHeader("content-type"), 0, x.status, { m: String(x.__ecm || "GET"), rt: x.responseType || "text" });
        if (x.responseType === "" || x.responseType === "text") { enviar(x.__ecu, x.responseText); aprender(x.__ecu, x.__ecm, x.__ecb, x.responseText); }
        else if (x.responseType === "json" && x.response) enviar(x.__ecu, JSON.stringify(x.response));
      } catch (e) {}
    });
    return os.apply(this, arguments);
  };

  // ---------------- Importar por rango de fechas ----------------
  var INI = /^(from|date_?from|start_?date|start_?at|fecha_?(inicio|desde|inicial|ini)|desde|created_?from|init_?date|date_?init|inicio|fecha_?de_?inicio)$/i;
  var FIN = /^(until|untill|to|date_?to|end_?date|end_?at|fecha_?(fin|hasta|final)|hasta|created_?to|final_?date|date_?end|fin|fecha_?de_?fin)$/i;
  var OFF = /^(start|offset|skip)$/i, PAG = /^(page|pagina|current_?page|page_?number)$/i;
  var TAM = /^(result_?number|limit|per_?page|page_?size|length|size|rows)$/i;
  function fmt(orig, iso) {
    var v = String(orig == null ? "" : orig);
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return iso + v.slice(10);
    var m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return iso.slice(8) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) + v.slice(10);
    return iso;
  }
  function prog(o) { try { window.postMessage({ src: "ecompro-dropi", prog: o }, "*"); } catch (e) {} }
  function filas(j) {
    var mejor = [], q = [j], n = 0;
    while (q.length && n++ < 60) {
      var x = q.shift();
      if (Array.isArray(x)) { if (x.length > mejor.length && x[0] && typeof x[0] === "object" && !Array.isArray(x[0])) mejor = x; else x.slice(0, 3).forEach(function (y) { if (y && typeof y === "object") q.push(y); }); }
      else if (x && typeof x === "object") Object.keys(x).forEach(function (k) { if (x[k] && typeof x[k] === "object") q.push(x[k]); });
    }
    return mejor;
  }
  // Cambia fechas y paginación en un objeto plano (query o cuerpo JSON). Devuelve cuántas fechas cambió y las llaves de paginación.
  function ajustar(get, set, keys, d, h) {
    var info = { fechas: 0, off: null, pag: null, tam: null };
    keys.forEach(function (k) {
      if (INI.test(k)) { set(k, fmt(get(k), d)); info.fechas++; }
      else if (FIN.test(k)) { set(k, fmt(get(k), h)); info.fechas++; }
      else if (OFF.test(k)) info.off = k;
      else if (PAG.test(k)) info.pag = k;
      else if (TAM.test(k)) info.tam = k;
    });
    return info;
  }
  var dormir = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  async function importar(desde, hasta) {
    var T = REQ[MARCA];
    if (!T || !of) { prog({ estado: "sin-plantilla" }); return; }
    var u0 = new URL(MARCA), cuerpo = null, esJson = false;
    if (T.b) { try { cuerpo = JSON.parse(T.b); esJson = cuerpo && typeof cuerpo === "object"; } catch (e) {} }
    var P = u0.searchParams;
    var info = ajustar(function (k) { return P.get(k); }, function (k, v) { P.set(k, v); }, Array.from(P.keys()), desde, hasta);
    if (esJson) {
      var i2 = ajustar(function (k) { return cuerpo[k]; }, function (k, v) { cuerpo[k] = v; }, Object.keys(cuerpo), desde, hasta);
      info.fechas += i2.fechas; info.off = info.off || i2.off; info.pag = info.pag || i2.pag; info.tam = info.tam || i2.tam;
      info.enCuerpo = i2;
    }
    if (!info.fechas) { prog({ estado: "error", error: "No encontré los filtros de fecha en la petición de pedidos de Dropi. Pon las fechas en el filtro de Dropi y toca Buscar: los pedidos que Dropi muestre se mandan solos." }); return; }
    var vistos = {}, total = 0, paginas = 0, off = 0, pag = 1;
    var offKey = info.off, pagKey = info.pag, tamKey = info.tam;
    var tam = 0;
    prog({ estado: "corriendo", paginas: 0, filas: 0 });
    for (; paginas < 80; paginas++) {
      var P2 = new URL(u0.href), c2 = esJson ? JSON.parse(JSON.stringify(cuerpo)) : null;
      P2.search = P.toString();
      var usaCuerpo = esJson && !(offKey && P.has(offKey)) && !(pagKey && P.has(pagKey));
      if (offKey) { if (usaCuerpo && c2 && offKey in c2) c2[offKey] = off; else P2.searchParams.set(offKey, off); }
      if (pagKey) { if (usaCuerpo && c2 && pagKey in c2) c2[pagKey] = pag; else P2.searchParams.set(pagKey, pag); }
      var init = { method: T.m, headers: T.h };
      if (T.m !== "GET" && T.m !== "HEAD") init.body = c2 ? JSON.stringify(c2) : T.b;
      var r, t;
      try { r = await of.call(window, P2.href, init); t = await r.text(); } catch (e) { prog({ estado: "error", error: "No pude pedir los pedidos a Dropi (" + String(e && e.message || e).slice(0, 80) + ")." }); return; }
      if (!r.ok) { prog({ estado: "error", error: "Dropi respondió " + r.status + " al pedir los pedidos. Abre Mis pedidos y vuelve a intentar." }); return; }
      var j; try { j = JSON.parse(t); } catch (e) { prog({ estado: "error", error: "Dropi no devolvió datos legibles." }); return; }
      var F = filas(j), nuevos = 0;
      F.forEach(function (x) { var id = x && (x.id != null ? x.id : JSON.stringify(x).slice(0, 80)); if (!vistos[id]) { vistos[id] = 1; nuevos++; } });
      enviar(P2.href, t);
      total += nuevos;
      prog({ estado: "corriendo", paginas: paginas + 1, filas: total });
      if (!F.length || !nuevos) break;
      if (!offKey && !pagKey) break;
      if (!tam) tam = F.length;
      if (F.length < tam) break;
      off += F.length; pag++;
      await dormir(350);
    }
    prog({ estado: "fin", paginas: paginas + 1, filas: total, desde: desde, hasta: hasta, avisoPag: !offKey && !pagKey && total >= 50 ? "La petición no tiene paginación detectable: puede que falten pedidos." : "" });
  }
  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (ev.source !== window || !d || d.src !== "ecompro-cmd") return;
    if (d.tipo === "marcar" && d.url) MARCA = d.url;
    if (d.tipo === "huellas" && Array.isArray(d.tels)) huellas(d.tels);
    if (d.tipo === "importar" && /^\d{4}-\d{2}-\d{2}$/.test(d.desde) && /^\d{4}-\d{2}-\d{2}$/.test(d.hasta)) importar(d.desde, d.hasta);
  });
})();
