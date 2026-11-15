// Trae las métricas de Meta Ads directo de la Marketing API y las guarda en la base (ec:metalive).
// Token: variable de entorno META_ACCESS_TOKEN (usuario del sistema con permiso ads_read). Nunca va en el repo.
// GET  -> devuelve lo guardado.  GET ?refresh=1 -> vuelve a consultar Meta (máx. 1 vez cada 10 min).
// Guarda una cuenta por campo (c:<id>) y va ACUMULANDO los días: cada consulta trae los últimos 5 y conserva los anteriores.
// Cron de Vercel: llega con Authorization: Bearer CRON_SECRET.
const crypto = require("crypto");
const { session } = require("./_auth");
const push = require("./_push");

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const MTOKEN = process.env.META_ACCESS_TOKEN;
const GV = "v21.0";
const CUENTAS = (process.env.META_ACCOUNTS || "1345913420795708,27517283797940921,1533623667776634,24945736065120551,1226449025709907,1426099046336722").split(",").map((s) => s.trim()).filter((s) => /^\d{5,20}$/.test(s));
const DIAS = 5;
const BASE = "2026-10-28"; // último día de los datos fijos del tablero: la primera consulta de cada cuenta arranca aquí
const MAX_DIAS = 120; // historia en vivo que se conserva por cuenta
const MIN_MS = 10 * 60 * 1000;

async function redis(cmd) {
  const r = await fetch(URL_, { method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || "redis " + r.status);
  return j.result;
}

function igual(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

async function graph(path, params) {
  const out = [];
  let url = "https://graph.facebook.com/" + GV + "/" + path + "?" + new URLSearchParams(Object.assign({ access_token: MTOKEN, limit: "500" }, params)).toString();
  for (let i = 0; i < 20 && url; i++) {
    const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error((j.error && j.error.message) || "meta " + r.status);
    (j.data || []).forEach((x) => out.push(x));
    url = j.paging && j.paging.next ? j.paging.next : null;
  }
  return out;
}

const num = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;
function acc(list, tipos) {
  let t = 0;
  (list || []).forEach((a) => { if (tipos.indexOf(a.action_type) > -1) t += parseFloat(a.value) || 0; });
  return Math.round(t);
}

function fila(x, idKey) {
  const d = String(x.date_start || "").slice(5);
  const cv = acc(x.actions, ["onsite_conversion.messaging_conversation_started_7d"]);
  const pu = acc(x.actions, ["omni_purchase", "purchase"]);
  return [d, x[idKey], num(x.spend), parseInt(x.impressions, 10) || 0, parseInt(x.inline_link_clicks, 10) || 0, cv, pu];
}

async function cuenta(id, since, until) {
  const act = "act_" + id;
  const tr = JSON.stringify({ since, until });
  const ins = (level, idKey) =>
    graph(act + "/insights", { level, time_increment: "1", time_range: tr, fields: "date_start,spend,impressions,inline_link_clicks,actions," + idKey }).then((l) => l.map((x) => fila(x, idKey)).filter((r) => r[2] || r[3] || r[5] || r[6]));
  const [camp, conj, anun, fc, fj, fa, ac] = await Promise.all([
    graph(act + "/campaigns", { fields: "id,name,effective_status" }),
    graph(act + "/adsets", { fields: "id,name,effective_status,campaign_id" }),
    graph(act + "/ads", { fields: "id,name,effective_status,adset_id" }),
    ins("campaign", "campaign_id"),
    ins("adset", "adset_id"),
    ins("ad", "ad_id"),
    graph(act + "/insights", { level: "ad", date_preset: "maximum", fields: "ad_id,spend,actions", filtering: JSON.stringify([{ field: "ad.effective_status", operator: "IN", value: ["ACTIVE"] }]) }).catch(() => []),
  ]);
  return {
    campanas: camp.map((x) => ({ id: x.id, nombre: x.name, estado: x.effective_status })),
    conjuntos: conj.map((x) => ({ id: x.id, nombre: x.name, campId: x.campaign_id, estado: x.effective_status })),
    anuncios: anun.map((x) => ({ id: x.id, nombre: x.name, conjId: x.adset_id, estado: x.effective_status })),
    filasCamp: fc, filasConj: fj, filasAnun: fa,
    acum: ac.map((x) => ({ id: x.ad_id, sp: num(x.spend), cv: acc(x.actions, ["onsite_conversion.messaging_conversation_started_7d"]), pu: acc(x.actions, ["omni_purchase", "purchase"]) })),
  };
}

function fechas() {
  // Día de hoy en hora de Perú/Colombia (UTC-5), la misma que usa la cuenta publicitaria.
  const hoy = new Date(Date.now() - 5 * 3600 * 1000);
  const ini = new Date(hoy.getTime() - (DIAS - 1) * 86400000);
  const f = (d) => d.toISOString().slice(0, 10);
  return { since: f(ini), until: f(hoy), corte: f(new Date(hoy.getTime() - MAX_DIAS * 86400000)) };
}

// Une lo nuevo con lo guardado: las entidades se actualizan por id y las filas anteriores a "since" se conservan.
function unir(old, nu, since, corte) {
  const sMD = since.slice(5), cMD = corte.slice(0, 4) === since.slice(0, 4) ? corte.slice(5) : "00-00";
  const ent = (k) => { const by = new Map(); ((old && old[k]) || []).forEach((x) => by.set(x.id, x)); nu[k].forEach((x) => by.set(x.id, x)); return [...by.values()]; };
  const fil = (k) => ((old && old[k]) || []).filter((r) => r[0] < sMD && r[0] >= cMD).concat(nu[k]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const desde = old && old.desde && old.desde < since ? old.desde : since;
  return { desde: desde < corte ? corte : desde, campanas: ent("campanas"), conjuntos: ent("conjuntos"), anuncios: ent("anuncios"), filasCamp: fil("filasCamp"), filasConj: fil("filasConj"), filasAnun: fil("filasAnun") };
}

// Lee todo lo guardado: { meta, cuentas }. Acepta el formato viejo (todo dentro de "cur"), que no trae historia.
async function leer() {
  const flat = (await redis(["HGETALL", "ec:metalive"])) || [];
  let meta = null; const cuentas = {};
  for (let i = 0; i < flat.length; i += 2) {
    try {
      if (flat[i] === "cur") meta = JSON.parse(flat[i + 1]);
      else if (flat[i].slice(0, 2) === "c:") cuentas[flat[i].slice(2)] = JSON.parse(flat[i + 1]);
    } catch (e) {}
  }
  if (meta && meta.cuentas) delete meta.cuentas;
  return { meta, cuentas };
}
function salida(meta, cuentas) {
  if (!meta && !Object.keys(cuentas).length) return null;
  const out = Object.assign({}, meta, { cuentas: {} });
  Object.keys(cuentas).forEach((k) => { const c = Object.assign({}, cuentas[k]); c.desde = String(c.desde || "").slice(5); out.cuentas[k] = c; });
  return out;
}

// Alertas al celular: anuncio ACTIVO con S/ 8 gastados desde que empezó y 0 compras, y anuncio activo con costo por conversación mayor a S/ 1.
const LIM_GASTO = 8, LIM_CONV = 1;
async function alertar(cuentas) {
  const visto = {};
  const flat = (await redis(["HGETALL", "ec:metaalert"])) || [];
  for (let i = 0; i < flat.length; i += 2) visto[flat[i]] = parseFloat(flat[i + 1]) || 0;
  const A = [], C = [], upd = [];
  Object.keys(cuentas).forEach((cid) => {
    const L = cuentas[cid];
    const activo = {};
    L.anuncios.forEach((a) => { if (a.estado === "ACTIVE") activo[a.id] = a.nombre; });
    (L.acum || []).forEach((x) => {
      const nom = activo[x.id];
      if (!nom) return;
      if (x.pu === 0 && x.sp >= LIM_GASTO) {
        const k = "A:" + x.id;
        if (visto[k] === undefined || x.sp >= visto[k] + 4) { A.push("«" + nom + "»: S/ " + x.sp.toFixed(2) + " gastados, 0 compras"); upd.push(k, x.sp); }
      }
      if (x.cv >= 1 && x.sp >= 2 && x.sp / x.cv > LIM_CONV) {
        const c = x.sp / x.cv, k = "C:" + x.id;
        if (visto[k] === undefined || c >= visto[k] + 0.5) { C.push("«" + nom + "»: S/ " + c.toFixed(2) + " por conversación (" + x.cv + " conv., S/ " + x.sp.toFixed(2) + ")"); upd.push(k, c.toFixed(2)); }
      }
    });
  });
  const avisos = [];
  if (A.length) avisos.push({ titulo: "Meta: S/ 8 gastados sin ventas (" + A.length + ")", lineas: A });
  if (C.length) avisos.push({ titulo: "Meta: costo por conversación pasó S/ 1 (" + C.length + ")", lineas: C });
  for (const av of avisos) {
    const ts = Date.now();
    const id = "m" + ts.toString(36) + crypto.randomBytes(2).toString("hex");
    const doc = { ts, tipo: "alerta", titulo: av.titulo, texto: av.lineas.slice(0, 3).join(" · ").slice(0, 400), lineas: av.lineas.slice(0, 40) };
    await redis(["HSET", "ec:alertas", id, JSON.stringify(doc)]);
    try { await Promise.race([push.enviar({ id, ...doc }), new Promise((r) => setTimeout(r, 8000))]); } catch (e) {}
  }
  for (let i = 0; i < upd.length; i += 2) await redis(["HSET", "ec:metaalert", upd[i], String(upd[i + 1])]);
  return avisos.length;
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const send = (code, obj) => { res.statusCode = code; res.end(JSON.stringify(obj)); };
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const cron = !!process.env.CRON_SECRET && igual(bearer, process.env.CRON_SECRET);
  if (!cron) {
    let s = null;
    try { s = session(req); } catch (e) { return send(500, { error: "config" }); }
    if (!s) return send(401, { error: "auth" });
  }
  if (!URL_ || !TOKEN) return send(503, { error: "Falta conectar la base (Upstash Redis) en Vercel." });
  const q = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  try {
    const g = await leer();
    const cur = salida(g.meta, g.cuentas);
    const quiere = cron || q.refresh === "1";
    if (!quiere || (!cron && g.meta && Object.keys(g.cuentas).length && Date.now() - g.meta.ts < MIN_MS)) return send(200, { ok: true, cur, sin_token: !MTOKEN });
    if (!MTOKEN) return send(200, { ok: false, error: "Falta META_ACCESS_TOKEN en Vercel.", cur, sin_token: true });
    const { since, until, corte } = fechas();
    const nuevas = {}, fallas = {};
    // Todas las cuentas a la vez. La que aún no tiene historia arranca desde BASE para no dejar días sin datos.
    await Promise.all(CUENTAS.map(async (id) => {
      const old = g.cuentas[id];
      const desde = old && old.desde ? since : (BASE > corte ? BASE : corte);
      try { nuevas[id] = { desde, datos: await cuenta(id, desde, until) }; } catch (e) { fallas[id] = String(e.message || e).slice(0, 200); }
    }));
    if (!Object.keys(nuevas).length) {
      const motivo = Object.keys(fallas).map((k) => fallas[k]).join(" | ").slice(0, 300);
      return send(200, { ok: false, error: "meta", detalle: motivo || "Meta no devolvió datos", cur });
    }
    const paraAlertas = {};
    for (const id of Object.keys(nuevas)) {
      const n = nuevas[id];
      paraAlertas[id] = n.datos;
      const u = unir(g.cuentas[id], n.datos, n.desde, corte);
      g.cuentas[id] = u;
      await redis(["HSET", "ec:metalive", "c:" + id, JSON.stringify(u)]);
    }
    const meta = { ts: Date.now(), since: since.slice(5), until, fallas };
    await redis(["HSET", "ec:metalive", "cur", JSON.stringify(meta)]);
    let avisos = 0;
    try { avisos = await alertar(paraAlertas); } catch (e) {}
    return send(200, { ok: true, cur: salida(meta, g.cuentas), avisos });
  } catch (e) {
    let cur = null;
    try { const g2 = await leer(); cur = salida(g2.meta, g2.cuentas); } catch (e2) {}
    return send(200, { ok: false, error: "meta", detalle: String(e.message || e).slice(0, 200), cur });
  }
};
