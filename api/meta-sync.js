// Trae las métricas de Meta Ads directo de la Marketing API y las guarda en la base (ec:metalive).
// Token: variable de entorno META_ACCESS_TOKEN (usuario del sistema con permiso ads_read). Nunca va en el repo.
// GET  -> devuelve lo guardado.  GET ?refresh=1 -> vuelve a consultar Meta (máx. 1 vez cada 4 min).
// Cron de Vercel: llega con Authorization: Bearer CRON_SECRET.
const crypto = require("crypto");
const { session } = require("./_auth");
const push = require("./_push");

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const MTOKEN = process.env.META_ACCESS_TOKEN;
const GV = "v21.0";
const CUENTAS = (process.env.META_ACCOUNTS || "1345913420795708,27517283797940921").split(",").map((s) => s.trim()).filter((s) => /^\d{5,20}$/.test(s));
const DIAS = 5;
const MIN_MS = 4 * 60 * 1000;

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
    const r = await fetch(url);
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
    graph(act + "/insights", { level: "ad", date_preset: "maximum", fields: "ad_id,spend,actions" }),
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
  return { since: f(ini), until: f(hoy) };
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
    const cur = JSON.parse((await redis(["HGET", "ec:metalive", "cur"])) || "null");
    const quiere = cron || q.refresh === "1";
    if (!quiere || (!cron && cur && Date.now() - cur.ts < MIN_MS)) return send(200, { ok: true, cur, sin_token: !MTOKEN });
    if (!MTOKEN) return send(200, { ok: false, error: "Falta META_ACCESS_TOKEN en Vercel.", cur, sin_token: true });
    const { since, until } = fechas();
    const cuentas = {}, fallas = {};
    for (const id of CUENTAS) {
      try { cuentas[id] = await cuenta(id, since, until); } catch (e) { fallas[id] = String(e.message || e).slice(0, 200); }
    }
    const nuevo = { ts: Date.now(), since: since.slice(5), until, cuentas: Object.assign({}, cur && cur.cuentas, cuentas), fallas };
    // Las cifras acumuladas solo sirven para las alertas: no se guardan en el tablero.
    const sinAcum = JSON.parse(JSON.stringify(nuevo));
    Object.keys(sinAcum.cuentas).forEach((k) => { delete sinAcum.cuentas[k].acum; });
    await redis(["HSET", "ec:metalive", "cur", JSON.stringify(sinAcum)]);
    let avisos = 0;
    try { avisos = await alertar(cuentas); } catch (e) {}
    return send(200, { ok: true, cur: sinAcum, avisos });
  } catch (e) {
    return send(500, { error: "meta", detalle: String(e.message || e).slice(0, 200) });
  }
};
