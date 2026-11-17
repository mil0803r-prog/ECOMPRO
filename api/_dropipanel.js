// Lógica del panel "Dropi" (portada de panel_server.py). Solo la usa api/dropi.js (GET ?a=data | ?a=prov).
// El token vive en DROPI_TOKEN (variable de Vercel) y nunca sale al navegador.
// Los datos de clientes se piden a Dropi en cada consulta y NO se guardan; solo se guarda el directorio de proveedores.
const BASE = (process.env.DROPI_API_BASE || "https://api.dropi.gt").replace(/\/+$/, "");
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const DELIVERED = ["ENTREGADO"];
const RETURNED = ["DEVOLUCION", "DEVOLUCION RECIBIDA", "DEVOLUCION_RECIBIDA", "DEVUELTO"];
const CANCELLED = ["CANCELADO", "ANULADO"];
const CACHE_TTL = 90 * 1000;
const PAGE = 100, MAX_PAGES = 40; // hasta 4.000 pedidos
const WH_TTL = 6 * 3600 * 1000;
let RAW = { t: 0, orders: null };
const WH = new Map(); // warehouse_id -> {name, phone, city, t}

const num = (x) => { const n = parseFloat(x); return isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(n * 100) / 100;
const r1 = (n) => Math.round(n * 10) / 10;

// Huella del cliente: historial de TODOS los pedidos que vienen del mismo teléfono (últimos 100 de la cuenta de Dropi).
const phoneKey = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 8 ? d.slice(-8) : ""; };

function groupOf(status) {
  const s = String(status || "").toUpperCase();
  if (DELIVERED.includes(s)) return "entregado";
  if (RETURNED.includes(s)) return "devolucion";
  if (CANCELLED.includes(s)) return "cancelado";
  if (s.includes("INCIDENCIA") || s.includes("NOVEDAD")) return "novedad";
  return "proceso";
}

async function dropi(path, timeoutMs) {
  const token = process.env.DROPI_TOKEN;
  if (!token) { const e = new Error("Falta la variable DROPI_TOKEN en Vercel."); e.code = 503; throw e; }
  const heads = [{ Authorization: "Bearer " + token }, { "dropi-integration-key": token }];
  let last = 0;
  for (const h of heads) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs || 15000);
    try {
      const r = await fetch(BASE + path, { headers: Object.assign({ Accept: "application/json" }, h), signal: ctl.signal });
      last = r.status;
      if (r.status === 401 || r.status === 403) continue;
      if (!r.ok) { const e = new Error("Dropi respondió HTTP " + r.status); e.code = 502; throw e; }
      return await r.json();
    } finally { clearTimeout(t); }
  }
  const e = new Error("Dropi rechazó el token (HTTP " + last + ")."); e.code = 502; throw e;
}

// Igual que dropi() pero con POST y cuerpo JSON (catálogo de productos de la API de integraciones).
async function dropiPost(path, body, timeoutMs) {
  const token = process.env.DROPI_TOKEN;
  if (!token) { const e = new Error("Falta la variable DROPI_TOKEN en Vercel."); e.code = 503; throw e; }
  const heads = [{ "dropi-integration-key": token }, { Authorization: "Bearer " + token }];
  let last = 0;
  for (const h of heads) {
    const r = await fetch(BASE + path, { method: "POST", headers: Object.assign({ Accept: "application/json", "Content-Type": "application/json" }, h), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs || 15000) });
    last = r.status;
    if (r.status === 401 || r.status === 403) continue;
    if (!r.ok) { const e = new Error("Dropi respondió HTTP " + r.status + " al pedir los productos."); e.code = 502; throw e; }
    return await r.json();
  }
  const e = new Error("Dropi no deja leer los productos con este token (HTTP " + last + ")."); e.code = 502; throw e;
}

// Productos FAVORITOS de la cuenta: catálogo de Dropi filtrado con favorite=true. Si Dropi ignora el filtro (devuelve lo mismo
// que sin él) no se muestra nada, para no hacer pasar por favoritos productos que no lo son.
// Busca el teléfono del PROVEEDOR dentro de un producto: en su usuario, su bodega o su tienda (nunca datos de compradores).
const TEL_K = /^(phone|cellphone|cell_phone|mobile|whatsapp|whatsapp_number|telefono|celular|phone_number|contact_phone)$/i;
function telProv(r) {
  const limpio = (v) => { const d = String(v == null ? "" : v).replace(/[^\d+]/g, ""); return d.replace(/\D/g, "").length >= 8 ? d.slice(0, 20) : ""; };
  const mira = (o, d) => {
    if (!o || typeof o !== "object" || d > 3) return "";
    for (const k of Object.keys(o)) { if (TEL_K.test(k)) { const t = limpio(o[k]); if (t) return t; } }
    for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === "object") { const t = mira(Array.isArray(v) ? v[0] : v, d + 1); if (t) return t; } }
    return "";
  };
  for (const k of ["user", "supplier", "provider", "store", "warehouse", "warehouses", "warehouse_product", "user_warehouse"]) {
    const v = r && r[k]; if (!v) continue;
    const t = mira(Array.isArray(v) ? v[0] : v, 0); if (t) return t;
  }
  return "";
}
// Nombres del proveedor de un producto: primero el del usuario proveedor ("Provider" en Dropi) y después tienda o marca.
function nomProv(r, u) {
  const out = [];
  const add = (v) => { v = String(v == null ? "" : v).trim().slice(0, 80); if (v && v.length > 1 && !/^\d+$/.test(v) && out.map((x) => x.toLowerCase()).indexOf(v.toLowerCase()) < 0) out.push(v); };
  [u.name, u.store_name, u.business_name, u.company, u.company_name, u.username, r.supplier_name, r.provider_name, r.provider, r.store_name, r.brand && (r.brand.name || r.brand), r.private_label && (r.private_label.name || r.private_label)].forEach((v) => { if (typeof v === "string" || typeof v === "number") add(v); });
  return out.length ? out : [""];
}
const TELC = new Map(); // id de producto -> teléfono encontrado en su detalle ("" = no trae)
let FAVC = null;
async function favoritos() {
  if (FAVC && Date.now() - FAVC.t < 5 * 60 * 1000) return FAVC.v;
  const base = { pageSize: 50, startData: 0, no_count: true, order_by: "id", order_type: "desc", keywords: "", privated_product: false, userVerified: false };
  const filas = (j) => { const o = j && (j.objects || j.data || j.products); return Array.isArray(o) ? o : (o && Array.isArray(o.data) ? o.data : []); };
  const out = [], vistos = new Set();
  let primera = null;
  for (let p = 0; p < 10; p++) {
    const L = filas(await dropiPost("/integrations/products/index", Object.assign({}, base, { favorite: true, startData: p * 50 })));
    if (p === 0) primera = L.map((x) => x && x.id).join(",");
    let nuevos = 0;
    for (const r of L) {
      if (!r || r.id == null || !r.name || vistos.has(r.id)) continue;
      vistos.add(r.id); nuevos++;
      const u = (r.user && typeof r.user === "object" ? r.user : null) || {};
      const cat = Array.isArray(r.categories) && r.categories[0] ? r.categories[0].name || "" : "";
      const st = Array.isArray(r.warehouse_product) ? r.warehouse_product.reduce((a, w) => a + (num(w.stock) || 0), 0) : r.stock;
      out.push({ id: String(r.id), n: String(r.name).slice(0, 120), prov: nomProv(r, u)[0], alt: nomProv(r, u).slice(1).join(" · ").slice(0, 120), sid: String(u.id != null ? u.id : r.user_id != null ? r.user_id : ""), tel: telProv(r), cat: String(cat).slice(0, 40), costo: num(r.sale_price), sug: num(r.suggested_price), stock: st == null ? null : num(st) });
    }
    if (L.length < 50 || !nuevos) break;
  }
  // A los que no traen teléfono en la lista se les mira el detalle del producto (máx. 60, de 6 en 6, con caché).
  // Un mismo proveedor comparte número: lo que se encuentra en un producto sirve para los demás del mismo proveedor.
  const porProv = new Map();
  out.forEach((f) => { if (f.tel && f.sid) porProv.set(f.sid, f.tel); });
  const faltan = out.filter((f) => !f.tel && !(f.sid && porProv.has(f.sid)) && !TELC.has(f.id)).slice(0, 60);
  for (let i = 0; i < faltan.length; i += 6) {
    await Promise.all(faltan.slice(i, i + 6).map(async (f) => {
      if (f.sid && porProv.has(f.sid)) return;
      try {
        const j = await dropi("/integrations/products/" + encodeURIComponent(f.id), 8000);
        const t = telProv((j && (j.objects || j.data || j.product)) || j || {});
        TELC.set(f.id, t); if (t && f.sid) porProv.set(f.sid, t);
      } catch (e) { TELC.set(f.id, ""); }
    }));
  }
  out.forEach((f) => { if (!f.tel) f.tel = (f.sid && porProv.get(f.sid)) || TELC.get(f.id) || ""; });
  let v = { ok: true, favs: out, conTel: out.filter((f) => f.tel).length };
  if (out.length) {
    const sin = filas(await dropiPost("/integrations/products/index", Object.assign({}, base, { favorite: false }))).map((x) => x && x.id).join(",");
    if (sin && sin === primera) v = { ok: false, favs: [], motivo: "Dropi no filtra los favoritos con este token: devuelve el catálogo completo." };
  }
  FAVC = { t: Date.now(), v };
  return v;
}

// Trae TODOS los pedidos de la cuenta: pide de 100 en 100 con start=0,100,200... y se detiene cuando ya no llegan pedidos nuevos
// (si Dropi ignorara "start", la segunda página repite los mismos pedidos y ahí se corta: quedan los últimos 100).
async function getRaw() {
  const now = Date.now();
  if (RAW.orders && now - RAW.t < CACHE_TTL) return RAW.orders;
  const all = [], seen = new Set();
  let pages = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const j = await dropi("/integrations/orders/myorders?result_number=" + PAGE + (i ? "&start=" + i * PAGE : ""), 20000);
    const objs = (j && j.objects) || [];
    let nuevos = 0;
    for (const x of objs) { const k = String(x.id); if (!seen.has(k)) { seen.add(k); all.push(x); nuevos++; } }
    pages++;
    if (!nuevos || objs.length < PAGE) break;
  }
  RAW = { t: now, orders: all, pages };
  return RAW.orders;
}

async function warehouseInfo(wid, sampleOrderId) {
  const now = Date.now();
  const c = WH.get(wid);
  if (c && now - c.t < WH_TTL) return c;
  let out;
  try {
    const j = await dropi("/integrations/orders/myorders/" + encodeURIComponent(sampleOrderId), 8000);
    const wh = (j && j.objects && j.objects.warehouse) || {};
    const city = wh.city && typeof wh.city === "object" ? wh.city.name : "";
    out = { name: wh.name || "", phone: String(wh.phone || ""), city: city || "", t: now };
  } catch (e) {
    out = c || { name: "", phone: "", city: "", t: now - WH_TTL + 300000 }; // reintenta en 5 min
  }
  WH.set(wid, out);
  return out;
}

function orderCost(x) {
  let c = 0;
  for (const d of x.orderdetails || []) {
    const p = d.product || {};
    c += num(p.sale_price) * (num(d.quantity) || 1);
  }
  return c;
}
const orderUtil = (x) => num(x.total_order) - orderCost(x) - num(x.shipping_amount);

function ts(s) {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}
function ddays(a, b) {
  const x = ts(a), y = ts(b);
  return x == null || y == null ? null : Math.floor((y - x) / 86400000);
}
function orderMovs(x) {
  const out = [];
  for (const m of x.servientrega_movements || []) {
    if (m && typeof m === "object") out.push({ n: m.nom_mov || m.name || "—", d: m.created_at || "" });
  }
  out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return out;
}
const dOf = (x) => String(x.created_at || "").slice(0, 10);
const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const cnt = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);

async function build(dFrom, dTo) {
  const t0 = Date.now();
  const raw = await getRaw();
  const dates = raw.map(dOf).filter(Boolean).sort();
  const dmin = dates[0] || "", dmax = dates[dates.length - 1] || "";
  let f, t, o;
  if (dFrom || dTo) {
    f = dFrom || dmin; t = dTo || dmax;
    o = raw.filter((x) => dOf(x) && f <= dOf(x) && dOf(x) <= t);
  } else { f = dmin; t = dmax; o = raw.slice(); }

  const orders = [], carriers = new Map(), crev = new Map(), cutil = new Map(), cdias = new Map();
  const statusCt = new Map(), deptCt = new Map(), prodQty = new Map(), prodOrd = new Map(), gCt = new Map();
  const zones = new Map(), trend = new Map(), diasAll = [];
  let revenue = 0, utilEnt = 0, ventaEnt = 0, costoEnt = 0, porCobrar = 0, enTransito = 0, perdidaDevol = 0;

  for (const x of o) {
    const st = x.status || "—";
    const g = groupOf(st);
    const dc = x.distribution_company;
    const carrier = (dc && typeof dc === "object" ? dc.name : null) || x.shipping_company || "—";
    const dept = typeof x.state === "string" && x.state ? x.state : "—";
    const tot = num(x.total_order);
    const util = r2(orderUtil(x));
    const dia = g === "entregado" ? ddays(x.created_at, x.updated_at) : null;
    revenue += tot; cnt(gCt, g); cnt(statusCt, st); cnt(deptCt, dept);
    if (!carriers.has(carrier)) carriers.set(carrier, { total: 0, entregado: 0, devolucion: 0, cancelado: 0, novedad: 0, proceso: 0 });
    const c = carriers.get(carrier); c[g]++; c.total++;
    crev.set(carrier, (crev.get(carrier) || 0) + tot);
    if (g === "entregado") {
      utilEnt += util; ventaEnt += tot; costoEnt += orderCost(x);
      cutil.set(carrier, (cutil.get(carrier) || 0) + util);
      if (dia != null && dia >= 0) { if (!cdias.has(carrier)) cdias.set(carrier, []); cdias.get(carrier).push(dia); diasAll.push(dia); }
    }
    if (g === "proceso") { porCobrar += tot; enTransito++; }
    if (g === "devolucion") perdidaDevol += num(x.shipping_amount);
    if (!zones.has(dept)) zones.set(dept, { total: 0, entregado: 0, devolucion: 0, cancelado: 0, novedad: 0, proceso: 0, revenue: 0, util: 0, dias: [] });
    const z = zones.get(dept); z.total++; z[g]++; z.revenue += tot;
    if (g === "entregado") z.util += util;
    if (dia != null && dia >= 0) z.dias.push(dia);
    const day = dOf(x);
    if (day) {
      if (!trend.has(day)) trend.set(day, { pedidos: 0, recaudo: 0, utilidad: 0 });
      const tr = trend.get(day); tr.pedidos++; tr.recaudo += tot; tr.utilidad += g === "entregado" ? util : 0;
    }
    const seen = new Set();
    for (const det of x.orderdetails || []) {
      const p = det.product || {};
      const pname = (p && p.name) || "Producto";
      cnt(prodQty, pname, parseInt(num(det.quantity)) || 1);
      if (!seen.has(pname)) { cnt(prodOrd, pname); seen.add(pname); }
    }
    orders.push({
      id: x.id, status: st, group: g, carrier,
      name: ((x.name || "") + " " + (x.surname || "")).trim(),
      city: x.city, dept, total: tot, date: x.created_at,
      guia: x.shipping_guide || "", guiaPath: x.guia_urls3 || "",
      supplierId: x.supplier_id, warehouseId: x.warehouse_id,
      clientPhone: x.phone || "", hk: phoneKey(x.phone), prod: (x.orderdetails || []).slice(0, 2).map((d) => (d.product && d.product.name) || "Producto").join(" + "), upd: x.updated_at || "", inv: x.invoiced == null ? null : !!x.invoiced, util, dias: dia, mov: orderMovs(x),
    });
  }

  const total = o.length || 1;
  const carList = [];
  for (const [name, c] of carriers) {
    const fin = c.entregado + c.devolucion + c.cancelado;
    const eff = fin ? Math.round((c.entregado / fin) * 100) : 0;
    const light = fin && eff >= 85 ? "green" : !fin || eff >= 70 ? "yellow" : "red";
    const d = cdias.get(name) || [];
    carList.push({
      name, total: c.total, entregado: c.entregado, devolucion: c.devolucion, cancelado: c.cancelado,
      novedad: c.novedad, proceso: c.proceso, devcan: c.devolucion + c.cancelado,
      revenue: r2(crev.get(name) || 0), utilidad: r2(cutil.get(name) || 0),
      entregaDias: d.length ? r1(avg(d)) : null, effectiveness: eff, light,
    });
  }
  carList.sort((a, b) => b.total - a.total);

  const statusList = top(statusCt).map(([k, v]) => ({ name: k, count: v, pct: r1((v / total) * 100), group: groupOf(k) }));
  const depts = top(deptCt).slice(0, 12).map(([k, v]) => ({ name: k, count: v }));
  const products = top(prodQty).slice(0, 10).map(([k, v]) => ({ name: k, qty: v, orders: prodOrd.get(k) || 0 }));

  const G = (k) => gCt.get(k) || 0;
  const finG = G("entregado") + G("devolucion") + G("cancelado");
  const kpis = {
    total: o.length, revenue: r2(revenue), avg: r2(revenue / (o.length || 1)),
    entregado: G("entregado"), devolucion: G("devolucion"), cancelado: G("cancelado"),
    proceso: G("proceso"), novedad: G("novedad"),
    deliveryRate: finG ? Math.round((G("entregado") / finG) * 100) : 0,
    returnRate: finG ? Math.round((G("devolucion") / finG) * 100) : 0,
    utilidad: r2(utilEnt), costoEnt: r2(costoEnt), ventaEnt: r2(ventaEnt),
    utilidadMargin: ventaEnt ? Math.round((utilEnt / ventaEnt) * 100) : 0,
    utilidadAvg: G("entregado") ? r2(utilEnt / G("entregado")) : 0,
    porCobrar: r2(porCobrar), enTransito, perdidaDevol: r2(perdidaDevol),
    entregaAvg: diasAll.length ? r1(avg(diasAll)) : 0, entregaMax: diasAll.length ? Math.max(...diasAll) : 0,
  };

  const zoneList = [];
  for (const [name, z] of zones) {
    const fin = z.entregado + z.devolucion + z.cancelado;
    const eff = fin ? Math.round((z.entregado / fin) * 100) : 0;
    const devr = fin ? Math.round((z.devolucion / fin) * 100) : 0;
    const light = fin && devr < 15 ? "green" : !fin || devr <= 35 ? "yellow" : "red";
    zoneList.push({
      name, total: z.total, entregado: z.entregado, devolucion: z.devolucion, cancelado: z.cancelado,
      proceso: z.proceso, novedad: z.novedad, devRate: devr, effectiveness: eff, light,
      dias: z.dias.length ? r1(avg(z.dias)) : null, revenue: r2(z.revenue), util: r2(z.util),
    });
  }
  zoneList.sort((a, b) => b.devolucion - a.devolucion || b.total - a.total);
  const trendList = [...trend.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([d, v]) => ({ date: d, pedidos: v.pedidos, recaudo: r2(v.recaudo), utilidad: r2(v.utilidad) }));

  const suppCt = new Map();
  for (const od of orders) if (od.supplierId != null) cnt(suppCt, String(od.supplierId));
  const suppliers = top(suppCt).map(([id, n]) => ({ id, count: n }));

  // contacto por proveedor (bodega más usada), de TODOS los pedidos crudos
  const supWh = new Map(), whSample = new Map();
  for (const x of raw) {
    if (x.supplier_id == null || x.warehouse_id == null) continue;
    const sid = String(x.supplier_id);
    if (!supWh.has(sid)) supWh.set(sid, new Map());
    cnt(supWh.get(sid), x.warehouse_id);
    if (!whSample.has(x.warehouse_id)) whSample.set(x.warehouse_id, x.id);
  }
  await Promise.all([...whSample.keys()].map((w) => warehouseInfo(w, whSample.get(w))));
  const supplierInfo = {};
  for (const [sid, m] of supWh) {
    const whs = top(m).map(([wid, n]) => {
      const w = WH.get(wid) || {};
      return { id: wid, name: w.name || "", phone: w.phone || "", city: w.city || "", orders: n };
    });
    const mainW = whs[0] || {};
    supplierInfo[sid] = { name: mainW.name || "", phone: mainW.phone || "", city: mainW.city || "", warehouses: whs };
  }
  // catálogo: TODOS los productos de todos los pedidos (sin importar las fechas elegidas) con su proveedor más frecuente
  const cat = new Map();
  for (const x of raw) {
    for (const det of x.orderdetails || []) {
      const n = String((det && det.product && det.product.name) || "").trim();
      if (!n) continue;
      const c = cat.get(n) || { c: 0, s: new Map() };
      c.c++; if (x.supplier_id != null) cnt(c.s, String(x.supplier_id));
      cat.set(n, c);
    }
  }
  const catalogo = [...cat.entries()].map(([n, v]) => ({ n, c: v.c, sid: (top(v.s)[0] || [])[0] || "" })).sort((a, b) => b.c - a.c).slice(0, 400);
  const need = new Set(orders.map((x) => x.hk).filter(Boolean));
  const huella = {};
  for (const x of raw) {
    const k = phoneKey(x.phone);
    if (!k || !need.has(k)) continue;
    const h = huella[k] || (huella[k] = { n: 0, entregado: 0, devolucion: 0, cancelado: 0, proceso: 0, novedad: 0, total: 0, orders: [] });
    const g = groupOf(x.status);
    h.n++; h[g]++; h.total += num(x.total_order);
    const dc = x.distribution_company;
    h.orders.push({ id: x.id, d: String(x.created_at || "").slice(0, 10), st: x.status || "—", g, t: num(x.total_order), c: (dc && typeof dc === "object" ? dc.name : null) || x.shipping_company || "—", city: x.city || "" });
  }
  for (const k of Object.keys(huella)) { huella[k].total = r2(huella[k].total); huella[k].orders.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0)); }
  return {
    huella, revisados: raw.length, paginas: RAW.pages || 1,
    updated: new Date().toISOString().slice(0, 19), ms: Date.now() - t0,
    range: { from: f, to: t, min: dmin, max: dmax, applied: !!(dFrom || dTo) },
    kpis, carriers: carList, statusList, depts, products, orders, suppliers, supplierInfo, catalogo, zones: zoneList, trend: trendList,
  };
}

async function redis(cmd) {
  const r = await fetch(RURL, { method: "POST", headers: { Authorization: "Bearer " + RTOK, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || "redis " + r.status);
  return j.result;
}

const okDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : null);

// Huella digital de Dropi: lee el detalle del pedido y devuelve solo los campos que parezcan de huella/riesgo/historial del comprador
// (sin datos personales), más los nombres de campos que trae el pedido para poder ajustar la lectura.
const HUELLA_RE = /huella|finger|riesg|risk|recibe|reliab|score|comportam|buyer|comprador|historial|history|calific|etiqueta|label|nivel|level|frecuen/i;
const PII_RE = /phone|tel|name|surname|dir|address|email|mail|document|dni|nit|lat|lng|coord|notes|nota|comment/i;
function walk(o, path, out, keys, depth) {
  if (!o || typeof o !== "object" || depth > 4) return;
  for (const k of Object.keys(o)) {
    const v = o[k], p = path ? path + "." + k : k;
    if (depth <= 1) keys.push(p);
    if (HUELLA_RE.test(k) && !PII_RE.test(k)) {
      const t = JSON.stringify(v);
      if (t !== undefined && t.length < 600) { out.push({ campo: p, valor: v }); continue; }
    }
    if (v && typeof v === "object") walk(v, p, out, keys, depth + 1);
  }
}
async function huella(id) {
  const j = await dropi("/integrations/orders/myorders/" + encodeURIComponent(id), 15000);
  const ob = (j && j.objects) || {};
  const out = [], keys = [];
  walk(ob, "", out, keys, 0);
  return { campos: out.slice(0, 40), keys: keys.filter((k) => !PII_RE.test(k)).slice(0, 120) };
}

// Responde GET ?a=data|prov|huella y POST ?a=prov. El login ya fue verificado por api/dropi.js.
async function handle(req, send) {
  const u = new URL(req.url, "http://x");
  const a = u.searchParams.get("a");
  try {
    if (a === "data" && req.method === "GET") {
      return send(200, await build(okDate(u.searchParams.get("from")), okDate(u.searchParams.get("to"))));
    }
    if (a === "huella" && req.method === "GET") {
      const id = String(u.searchParams.get("id") || "");
      if (!/^\d{1,12}$/.test(id)) return send(400, { error: "id inválido" });
      const hk = String(u.searchParams.get("hk") || "").replace(/\D/g, "").slice(-8);
      const out = await huella(id).catch((e) => ({ campos: [], keys: [], error: String((e && e.message) || e).slice(0, 120) }));
      if (hk.length === 8 && RURL && RTOK) {
        try { const g = await redis(["HGET", "ec:huella", hk]); if (g) out.guardada = JSON.parse(g); } catch (e) {}
      }
      return send(200, out);
    }
    if (a === "favs" && req.method === "GET") {
      try { return send(200, await favoritos()); } catch (e) { return send(200, { ok: false, favs: [], motivo: String(e.message || e).slice(0, 160) }); }
    }
    if (a === "gest") {
      if (!RURL || !RTOK) return send(req.method === "GET" ? 200 : 503, req.method === "GET" ? {} : { error: "Falta conectar la base (Upstash Redis)." });
      if (req.method === "GET") { const cur = await redis(["HGET", "ec:settings", "dropigest"]); return send(200, cur ? JSON.parse(cur) : {}); }
      if (req.method === "POST") {
        const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
        const t = JSON.stringify(b);
        if (!b || typeof b !== "object" || Array.isArray(b) || t.length > 60000) return send(400, { error: "datos inválidos" });
        await redis(["HSET", "ec:settings", "dropigest", t]);
        return send(200, { ok: true });
      }
    }
    if (a === "prov") {
      if (!RURL || !RTOK) return send(req.method === "GET" ? 200 : 503, req.method === "GET" ? {} : { error: "Falta conectar la base (Upstash Redis)." });
      if (req.method === "GET") {
        const cur = await redis(["HGET", "ec:settings", "dropiprov"]);
        return send(200, cur ? JSON.parse(cur) : {});
      }
      if (req.method === "POST") {
        const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
        const s = JSON.stringify(b);
        if (!b || typeof b !== "object" || Array.isArray(b) || s.length > 120000) return send(400, { error: "datos inválidos" });
        await redis(["HSET", "ec:settings", "dropiprov", s]);
        return send(200, { ok: true });
      }
    }
    return send(405, { error: "method" });
  } catch (e) {
    return send(e && e.code === 503 ? 503 : 502, { error: String((e && e.message) || e).slice(0, 200) });
  }
}

module.exports = { handle };
