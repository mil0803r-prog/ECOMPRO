// Recibe los avisos que Claude manda al tablero: resúmenes de ventas cada 2 horas y alertas de gasto sin compras.
// No usa sesión de Google: se protege con la clave ALERTAS_KEY (variable de Vercel, sensible).
// Guarda cada aviso en la colección "alertas" de la base; el tablero la lee con db.collection("alertas") y muestra la campana.
const crypto = require("crypto");
const push = require("./_push");

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const MAX = 200; // avisos que se conservan

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

const clip = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);

function safeEq(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const send = (c, o) => {
    res.statusCode = c;
    res.end(JSON.stringify(o));
  };
  if (req.method !== "POST") return send(405, { error: "method" });
  const key = process.env.ALERTAS_KEY;
  if (!key) return send(503, { error: "Falta la variable ALERTAS_KEY en Vercel." });
  if (!safeEq(req.headers["x-alertas-key"], key)) return send(401, { error: "Clave incorrecta." });
  if (!URL_ || !TOKEN) return send(503, { error: "Falta conectar la base (Upstash Redis) en Vercel." });
  let b;
  try {
    b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (e) {
    return send(400, { error: "json" });
  }
  const titulo = clip(b.titulo, 120);
  if (!titulo) return send(400, { error: "titulo" });
  const lineas = (Array.isArray(b.lineas) ? b.lineas : []).slice(0, 40).map((l) => clip(l, 240)).filter(Boolean);
  const ts = Date.now();
  const id = "a" + ts.toString(36) + crypto.randomBytes(2).toString("hex");
  const doc = {
    ts,
    tipo: b.tipo === "alerta" ? "alerta" : "resumen",
    titulo,
    texto: clip(b.texto, 400),
    lineas,
  };
  try {
    await redis(["HSET", "ec:alertas", id, JSON.stringify(doc)]);
    const ids = (await redis(["HKEYS", "ec:alertas"])) || [];
    if (ids.length > MAX) {
      const viejos = ids.sort().slice(0, ids.length - MAX);
      if (viejos.length) await redis(["HDEL", "ec:alertas"].concat(viejos));
    }
    // Además del tablero, el aviso llega al celular de quien activó los avisos (si falla, el aviso igual queda guardado).
    let celular = { enviados: 0, equipos: 0 };
    try {
      celular = await Promise.race([push.enviar({ id, ...doc }), new Promise((r) => setTimeout(() => r(celular), 8000))]);
    } catch (e) {}
    return send(200, { ok: true, id, celular });
  } catch (e) {
    return send(500, { error: "No se pudo guardar." });
  }
};
