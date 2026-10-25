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
})(typeof self !== "undefined" ? self : this);
