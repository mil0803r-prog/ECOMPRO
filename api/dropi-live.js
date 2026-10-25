// Recibe los pedidos que la extensión de ECOMPRO lee de la página de Dropi abierta en tu navegador.
// No usa la API de Dropi. Se protege con la clave DROPI_LIVE_KEY (variable de Vercel, sensible).
// Une los pedidos con settings/pedextra: nunca repite un número de orden y mantiene el estado al día.
const crypto = require("crypto");

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || "redis " + r.status);
  return j.result;
}

const norm = (v) =>
  String(v == null ? "" : v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const digits = (v) => String(v == null ? "" : v).replace(/\D/g, "");
const clip = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);

// Estado de Dropi -> código del tablero (E entregado, D devolución, C cancelado, F/P pendiente, K recolectado, G guía, R en ruta, I/J incidencia)
function estado(v) {
  const t = norm(v);
  if (!t) return "";
  if (/incidencia/.test(t)) return /ruta|transito/.test(t) ? "J" : "I";
  if (/entreg/.test(t) && !/no entreg/.test(t)) return "E";
  if (/devol|retorn|rechaz|no entreg/.test(t)) return "D";
  if (/cancel|anulad/.test(t)) return "C";
  if (/pendiente.*confirm|por confirm/.test(t)) return "F";
  if (/pendiente/.test(t)) return "P";
  if (/recolect|recogid/.test(t)) return "K";
  if (/guia (generada|creada)|generad/.test(t)) return "G";
  if (/transito|ruta|camino|reparto|despach|bodega|inventario|alistamiento|enviad/.test(t)) return "R";
  return "";
}

function fecha(v) {
  const t = String(v || "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return null;
  return { d: m[1] + "-" + m[2] + "-" + m[3], t: m[4] ? m[4] + ":" + m[5] : "" };
}

function safeEq(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function cors(res, req) {
  const o = req.headers.origin || "";
  if (/^https:\/\/([a-z0-9-]+\.)*dropi\.(gt|co)$/i.test(o)) res.setHeader("Access-Control-Allow-Origin", o);
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-ec-key");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Vary", "Origin");
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  cors(res, req);
  const send = (c, o) => {
    res.statusCode = c;
    res.end(JSON.stringify(o));
  };
  if (req.method === "OPTIONS") return send(204, {});
  if (req.method !== "POST") return send(405, { error: "method" });
  const key = process.env.DROPI_LIVE_KEY;
  if (!key) return send(503, { error: "Falta la variable DROPI_LIVE_KEY en Vercel." });
  if (!safeEq(req.headers["x-ec-key"], key)) return send(401, { error: "Clave incorrecta." });
  if (!URL_ || !TOKEN) return send(503, { error: "Falta conectar la base (Upstash Redis) en Vercel." });
  let b;
  try {
    b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (e) {
    return send(400, { error: "json" });
  }
  const lista = Array.isArray(b.orders) ? b.orders.slice(0, 500) : [];
  if (!lista.length) return send(200, { ok: true, recibidos: 0, nuevos: 0, actualizados: 0 });
  try {
    const cur = await redis(["HGET", "ec:settings", "pedextra"]);
    const doc = cur ? JSON.parse(cur) : {};
    const map = doc.map && typeof doc.map === "object" ? doc.map : {};
    const nuevos = doc.nuevos && typeof doc.nuevos === "object" ? doc.nuevos : {};
    let nNuevos = 0, nAct = 0, omitidos = 0;
    for (const o of lista) {
      const n = digits(o && o.n);
      if (!n || n.length > 12) { omitidos++; continue; }
      const m = map[n] || {};
      const s = estado(o.s);
      const x = Object.assign({}, m);
      [["g", "g", 80], ["c", "cl", 80], ["p", "p", 200], ["t", "tr", 80], ["a", "a", 200], ["nv", "nv", 200], ["tl", "tl", 20]].forEach(([dst, src, len]) => {
        const v = dst === "tl" ? String(o[src] == null ? "" : o[src]).replace(/[^\d+]/g, "").slice(0, len) : clip(o[src], len);
        if (v) x[dst] = v;
      });
      const dep = clip(o.dep, 30);
      if (dep) x.dp = dep;
      if (s) x.s = s;
      if (JSON.stringify(x) !== JSON.stringify(m)) nAct++;
      map[n] = x;
      const f = fecha(o.d);
      if (!nuevos[n] && f && s) {
        nuevos[n] = { d: f.d, t: clip(o.t, 5) || f.t, s, c: clip(o.c, 40).toUpperCase(), v: Math.max(0, Math.round(+o.v || 0)) };
        if (dep) nuevos[n].dp = dep;
        nNuevos++;
      } else if (nuevos[n] && s) {
        nuevos[n].s = s;
      }
    }
    await redis(["HSET", "ec:settings", "pedextra", JSON.stringify({ map, nuevos })]);
    await redis(["HSET", "ec:settings", "pedlive", JSON.stringify({ ts: Date.now(), recibidos: lista.length, nuevos: nNuevos, actualizados: nAct })]);
    return send(200, { ok: true, recibidos: lista.length, nuevos: nNuevos, actualizados: nAct, omitidos });
  } catch (e) {
    return send(500, { error: "No se pudo guardar." });
  }
};
