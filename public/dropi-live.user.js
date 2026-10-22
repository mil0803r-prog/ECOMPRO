// ==UserScript==
// @name         ECOMPRO · Dropi en vivo
// @namespace    ecompro
// @version      1.0.0
// @description  Lee los pedidos que Dropi muestra en tu pantalla y los manda a tu tablero ECOMPRO. Se actualiza solo.
// @match        https://*.dropi.gt/*
// @match        https://*.dropi.co/*
// @match        https://ecompro-iota.vercel.app/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_setClipboard
// @grant        GM_openInTab
// @connect      ecompro-iota.vercel.app
// @updateURL    https://ecompro-iota.vercel.app/dropi-live.user.js
// @downloadURL  https://ecompro-iota.vercel.app/dropi-live.user.js
// ==/UserScript==
(function () {
  "use strict";
  var VERSION = "1.0.0";
  var EN_DROPI = /(^|\.)dropi\.(gt|co)$/i.test(location.hostname);
  var EN_TABLERO = /\.vercel\.app$/i.test(location.hostname);

  function cfg(k, d) { try { var v = GM_getValue(k); return v === undefined ? d : v; } catch (e) { return d; } }
  function guardar(k, v) { try { GM_setValue(k, v); } catch (e) {} }
  function aviso(ok, texto) { try { GM_notification({ title: ok ? "ECOMPRO: pedidos subidos ✔" : "ECOMPRO: error ✖", text: texto, timeout: 7000 }); } catch (e) {} }

  // ---------------- Menú (icono de Tampermonkey) ----------------
  if (EN_DROPI) {
    GM_registerMenuCommand("1) Poner mi clave (DROPI_LIVE_KEY)", function () {
      var k = prompt("Pega tu clave (la misma de DROPI_LIVE_KEY en Vercel):", cfg("key", ""));
      if (k !== null) { guardar("key", k.trim()); aviso(true, "Clave guardada."); }
    });
    GM_registerMenuCommand("2) Dirección de tu tablero", function () {
      var b = prompt("Dirección de tu tablero:", cfg("base", "https://ecompro-iota.vercel.app"));
      if (b !== null) guardar("base", b.trim().replace(/\/+$/, ""));
    });
    GM_registerMenuCommand("3) Recargar Dropi cada X minutos (0 = nunca)", function () {
      var n = prompt("Cada cuántos minutos recargar esta pestaña de Dropi (0 = solo cuando yo pida):", cfg("auto", 0));
      if (n !== null) { guardar("auto", Math.max(0, parseInt(n, 10) || 0)); aviso(true, "Listo. Se aplica al recargar la página."); }
    });
    GM_registerMenuCommand("4) Actualizar ahora (recargar Dropi)", function () { location.reload(); });
    GM_registerMenuCommand("5) Copiar diagnóstico", function () {
      var t = JSON.stringify({ script: VERSION, total: cfg("total", 0), log: cfg("log", null), dropi: cfg("dbg", null) }, null, 1);
      try { GM_setClipboard(t); aviso(true, "Diagnóstico copiado. Pégalo en el chat."); } catch (e) { prompt("Copia esto:", t); }
    });
  }

  // ---------------- En tu tablero: puente con el botón naranja ----------------
  if (EN_TABLERO) {
    var decir = function (o) { window.postMessage(Object.assign({ src: "ecompro-ext" }, o), "*"); };
    window.addEventListener("message", function (ev) {
      if (!ev.data || ev.data.src !== "ecompro-page") return;
      if (ev.data.tipo === "hola") { decir({ tipo: "hola", version: "script-" + VERSION }); return; }
      if (ev.data.tipo === "actualizar") {
        var viva = Date.now() - (cfg("dropi_vivo", 0) || 0) < 15000;
        guardar("refrescar", Date.now());
        if (!viva) { try { GM_openInTab("https://app.dropi.gt/dashboard/orders", { active: false, insert: true }); } catch (e) {} }
        decir({ tipo: "resultado", ok: true, accion: viva ? "recargada" : "abierta" });
      }
    });
    decir({ tipo: "hola", version: "script-" + VERSION });
    return;
  }
  if (!EN_DROPI) return;

  // ---------------- En Dropi ----------------
  // 1) Copiar (sin alterar) las respuestas de la página: se inyecta en el contexto de la página.
  var INJECT_SRC = "// Corre dentro de la página de Dropi: copia (sin alterar) las respuestas JSON de la página y las pasa a la extensión.\n(function () {\n  if (window.__ecDropiHook) return;\n  window.__ecDropiHook = true;\n  function meta(url, ct, len, st) {\n    try { window.postMessage({ src: \"ecompro-dropi\", meta: true, url: String(url).slice(0, 200), ct: String(ct || \"\").slice(0, 40), len: len, st: st }, \"*\"); } catch (e) {}\n  }\n  function enviar(url, texto) {\n    try {\n      if (!texto || texto.length > 8e6 || texto.charAt(0) !== \"{\" && texto.charAt(0) !== \"[\") return;\n      window.postMessage({ src: \"ecompro-dropi\", url: String(url).slice(0, 300), texto: texto }, \"*\");\n    } catch (e) {}\n  }\n  var of = window.fetch;\n  if (of) {\n    window.fetch = function () {\n      var args = arguments;\n      return of.apply(this, args).then(function (r) {\n        try {\n          var u = (args[0] && args[0].url) || args[0];\n          var ct = (r.headers && r.headers.get && r.headers.get(\"content-type\")) || \"\";\n          meta(u, ct, +(r.headers.get(\"content-length\") || 0), r.status);\n          if (/json/i.test(ct)) r.clone().text().then(function (t) { enviar(u, t); }).catch(function () {});\n        } catch (e) {}\n        return r;\n      });\n    };\n  }\n  var oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;\n  XMLHttpRequest.prototype.open = function (m, u) { this.__ecu = u; return oo.apply(this, arguments); };\n  XMLHttpRequest.prototype.send = function () {\n    var x = this;\n    x.addEventListener(\"load\", function () {\n      try {\n        meta(x.__ecu, x.getResponseHeader(\"content-type\"), 0, x.status);\n        if (x.responseType === \"\" || x.responseType === \"text\") enviar(x.__ecu, x.responseText);\n        else if (x.responseType === \"json\" && x.response) enviar(x.__ecu, JSON.stringify(x.response));\n      } catch (e) {}\n    });\n    return os.apply(this, arguments);\n  };\n})();\n";
  function inyectar() {
    var raiz = document.head || document.documentElement;
    if (!raiz) return false;
    try { var s = document.createElement("script"); s.textContent = INJECT_SRC; raiz.appendChild(s); s.remove(); } catch (e) {}
    return true;
  }
  if (!inyectar()) {
    var mo = new MutationObserver(function () { if (inyectar()) mo.disconnect(); });
    mo.observe(document, { childList: true, subtree: true });
  }

  // 2) Normalizador de pedidos
  var ECN = (function () {
    var self = {};
// Convierte lo que Dropi carga en pantalla en pedidos simples. Incluye el teléfono del cliente; no manda correos.
(function (root) {
  function pick(o, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = keys[i].split(".").reduce(function (a, p) { return a == null ? a : a[p]; }, o);
      if (v != null && v !== "" && typeof v !== "object") return String(v);
    }
    return "";
  }
  // Dropi guarda la hora en UTC (termina en Z): se pasa a hora de Guatemala (UTC-6).
  function fechaGT(s) {
    s = String(s || "");
    if (!s) return { d: "", t: "" };
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/);
    if (!m) return { d: "", t: "" };
    if (!m[4]) return { d: m[1] + "-" + m[2] + "-" + m[3], t: "" };
    var utc = !!m[8];
    var dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    if (utc && /^Z$|^\+0?0:?00$/.test(m[8])) dt = new Date(dt.getTime() - 6 * 3600 * 1000);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return { d: dt.getUTCFullYear() + "-" + p(dt.getUTCMonth() + 1) + "-" + p(dt.getUTCDate()), t: p(dt.getUTCHours()) + ":" + p(dt.getUTCMinutes()) };
  }
  function esPedido(o) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return false;
    var tieneId = o.id != null && /^\d{3,12}$/.test(String(o.id));
    var tieneEstado = o.status != null || o.estado != null;
    var otros = (o.shipping_guide != null) + (o.total_order != null) + (o.created_at != null) + (o.orderdetails != null) + (o.order_details != null) + (o.distribution_company != null) + (o.shipping_amount != null);
    return tieneId && tieneEstado && otros >= 1;
  }
  function buscar(x, out, prof) {
    if (prof > 5 || x == null) return;
    if (Array.isArray(x)) {
      for (var i = 0; i < x.length && i < 1000; i++) {
        if (esPedido(x[i])) out.push(x[i]);
        else if (x[i] && typeof x[i] === "object") buscar(x[i], out, prof + 1);
      }
    } else if (typeof x === "object") {
      if (esPedido(x)) { out.push(x); return; }
      Object.keys(x).forEach(function (k) { buscar(x[k], out, prof + 1); });
    }
  }
  function normalizar(o) {
    var det = o.orderdetails || o.order_details || o.products || [];
    var prods = (Array.isArray(det) ? det : []).map(function (d) { return pick(d, ["product.name", "name", "product_name"]); }).filter(Boolean);
    var f = fechaGT(pick(o, ["created_at", "createdAt", "date", "fecha"]));
    var nombre = [pick(o, ["name", "client_name", "customer_name"]), pick(o, ["surname", "lastname"])].filter(Boolean).join(" ");
    var estado = pick(o, ["status", "estado", "order_status"]);
    var dep = pick(o, ["state", "department", "departamento"]);
    if (dep && estado && dep.toLowerCase() === estado.toLowerCase()) dep = "";
    return {
      n: pick(o, ["id", "order_id"]),
      d: f.d, t: f.t,
      s: estado,
      c: pick(o, ["city", "ciudad", "municipality"]),
      dep: dep,
      v: pick(o, ["total_order", "total", "amount", "price"]),
      g: pick(o, ["shipping_guide", "guide", "guia", "tracking_number", "shipping_guide_number"]),
      tr: pick(o, ["distribution_company.name", "shipping_company", "shipping_company_name", "transportadora", "carrier"]),
      p: prods.join(" + "),
      cl: nombre,
      tl: pick(o, ["phone", "telefono", "client_phone", "customer_phone", "cellphone", "celular"]).replace(/[^\d+]/g, ""),
      a: pick(o, ["dir", "address", "direccion"]),
      nv: pick(o, ["novelty", "novedad", "status_novelty", "novelty_name"])
    };
  }
  function extraer(json) {
    var raw = [];
    buscar(json, raw, 0);
    return raw.map(normalizar).filter(function (p) { return p.n; });
  }
  function forma(json) {
    var raw = []; buscar(json, raw, 0);
    var o = raw[0]; if (!o) return null;
    var f = {}; Object.keys(o).forEach(function (k) { f[k] = o[k] === null ? "null" : Array.isArray(o[k]) ? "array" : typeof o[k]; });
    return f;
  }
  var api = { extraer: extraer, normalizar: normalizar, fechaGT: fechaGT, forma: forma };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ECDropiNorm = api;
})(self);

    return self.ECDropiNorm;
  })();

  // 3) Cola y envío
  var visto = {}, cola = {}, timer = null;
  var dbg = { pagina: location.host + location.pathname.replace(/\d+/g, "#"), json: 0, vistos: {}, red: {} };
  var dtimer = null;
  function claves(o) { return o && typeof o === "object" ? Object.keys(o).slice(0, 25) : typeof o; }
  function huellaJson(j) {
    var r = { top: claves(j) }, q = [j], n = 0;
    while (q.length && n++ < 40) {
      var x = q.shift();
      if (Array.isArray(x)) { if (x.length && x[0] && typeof x[0] === "object" && !Array.isArray(x[0])) { r.fila = claves(x[0]); r.filas = x.length; break; } }
      else if (x && typeof x === "object") Object.keys(x).forEach(function (k) { if (x[k] && typeof x[k] === "object") q.push(x[k]); });
    }
    return r;
  }
  function guardarDbg() { dtimer = null; guardar("dbg", Object.assign({ ts: Date.now() }, dbg)); }
  function huella(p) { return [p.s, p.g, p.tr, p.nv, p.v, p.a, p.cl, p.p, p.tl].join("|"); }

  function enviar() {
    timer = null;
    var lista = Object.keys(cola).map(function (k) { return cola[k]; });
    cola = {};
    if (!lista.length) return;
    var key = cfg("key", ""), base = String(cfg("base", "https://ecompro-iota.vercel.app")).replace(/\/+$/, "");
    if (!key) { guardar("log", { ok: false, ts: Date.now(), msg: "Falta la clave." }); aviso(false, "Falta la clave. Icono de Tampermonkey > ECOMPRO > 1) Poner mi clave."); return; }
    var tot = { nuevos: 0, actualizados: 0, recibidos: 0 }, i = 0;
    function lote() {
      if (i >= lista.length) {
        guardar("total", (cfg("total", 0) || 0) + tot.recibidos);
        guardar("log", { ok: true, ts: Date.now(), msg: "Enviados " + tot.recibidos + ": " + tot.nuevos + " nuevos, " + tot.actualizados + " actualizados." });
        aviso(true, "Listo: " + lista.length + " pedidos leídos de Dropi y subidos al tablero (" + tot.nuevos + " nuevos, " + tot.actualizados + " actualizados).");
        return;
      }
      var parte = lista.slice(i, i + 200); i += 200;
      GM_xmlhttpRequest({
        method: "POST", url: base + "/api/dropi-live", timeout: 30000,
        headers: { "Content-Type": "application/json", "x-ec-key": key },
        data: JSON.stringify({ orders: parte }),
        onload: function (r) {
          var j = {}; try { j = JSON.parse(r.responseText); } catch (e) {}
          if (r.status < 200 || r.status >= 300) { var m = (j && j.error) || ("Error " + r.status); guardar("log", { ok: false, ts: Date.now(), msg: m }); aviso(false, "No se pudieron subir los pedidos: " + m); return; }
          tot.recibidos += j.recibidos || 0; tot.nuevos += j.nuevos || 0; tot.actualizados += j.actualizados || 0; lote();
        },
        onerror: function () { guardar("log", { ok: false, ts: Date.now(), msg: "Sin conexión con el tablero" }); aviso(false, "No pude conectar con tu tablero."); },
        ontimeout: function () { aviso(false, "El tablero tardó demasiado en responder."); }
      });
    }
    lote();
  }

  window.addEventListener("message", function (ev) {
    if (!ev.data || ev.data.src !== "ecompro-dropi") return;
    if (ev.data.meta) {
      var mu = String(ev.data.url || "").replace(/[?#].*$/, "").replace(/\d+/g, "#").slice(0, 90);
      if (dbg.red[mu] || Object.keys(dbg.red).length < 40) { var o = dbg.red[mu] || (dbg.red[mu] = { n: 0 }); o.n++; o.ct = ev.data.ct; o.st = ev.data.st; }
      if (!dtimer) dtimer = setTimeout(guardarDbg, 2000);
      return;
    }
    var json;
    try { json = JSON.parse(ev.data.texto); } catch (e) { return; }
    dbg.json++;
    var up = String(ev.data.url || "").replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "").replace(/\d+/g, "#").slice(0, 70);
    if (!dbg.vistos[up] && Object.keys(dbg.vistos).length < 25) dbg.vistos[up] = huellaJson(json);
    if (!dtimer) dtimer = setTimeout(guardarDbg, 2000);
    ECN.extraer(json).forEach(function (p) {
      var h = huella(p);
      if (visto[p.n] === h) return;
      visto[p.n] = h; cola[p.n] = p;
    });
    if (Object.keys(cola).length && !timer) timer = setTimeout(enviar, 1500);
  });

  // 4) Latido (para que el tablero sepa que hay una pestaña de Dropi abierta) y recargas
  guardar("dropi_vivo", Date.now());
  setInterval(function () { guardar("dropi_vivo", Date.now()); }, 5000);
  try { GM_addValueChangeListener("refrescar", function (n, a, b, remoto) { if (remoto) location.reload(); }); } catch (e) {}
  var auto = parseInt(cfg("auto", 0), 10) || 0;
  if (auto >= 1) setTimeout(function () { location.reload(); }, auto * 60000);
})();
