// Avisos al celular (Web Push). Guarda las suscripciones de cada equipo en la base y les manda cada aviso.
// Las claves VAPID se crean solas la primera vez y se guardan en la base (no hay que poner variables en Vercel).
const crypto = require("crypto");
const webpush = require("web-push");

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const MAX_SUBS = 20;

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

async function vapid() {
  let raw = await redis(["HGET", "ec:cfg", "vapid"]);
  if (!raw) {
    await redis(["HSETNX", "ec:cfg", "vapid", JSON.stringify(webpush.generateVAPIDKeys())]);
    raw = await redis(["HGET", "ec:cfg", "vapid"]);
  }
  return JSON.parse(raw);
}

const idDe = (endpoint) => crypto.createHash("sha1").update(String(endpoint)).digest("hex").slice(0, 24);

function valida(sub) {
  return (
    sub &&
    typeof sub.endpoint === "string" &&
    /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)\//i.test(sub.endpoint) &&
    sub.endpoint.length < 600 &&
    sub.keys &&
    typeof sub.keys.p256dh === "string" &&
    typeof sub.keys.auth === "string"
  );
}

async function guardar(sub, ua) {
  if (!valida(sub)) throw new Error("suscripcion");
  const n = (await redis(["HLEN", "ec:push"])) || 0;
  const id = idDe(sub.endpoint);
  if (n >= MAX_SUBS && !(await redis(["HEXISTS", "ec:push", id]))) throw new Error("limite");
  const doc = { sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, ts: Date.now(), ua: String(ua || "").slice(0, 160) };
  await redis(["HSET", "ec:push", id, JSON.stringify(doc)]);
  return id;
}

async function quitar(endpoint) {
  await redis(["HDEL", "ec:push", idDe(endpoint)]);
}

// Manda el aviso a todos los equipos suscritos. Devuelve cuántos lo recibieron.
async function enviar(aviso) {
  const todas = (await redis(["HGETALL", "ec:push"])) || [];
  if (!todas.length) return { enviados: 0, equipos: 0 };
  const k = await vapid();
  const subj = String(process.env.VAPID_SUBJECT || "").trim() || "mailto:" + (String(process.env.ALLOWED_EMAILS || "").split(",")[0].trim() || "avisos@ecompro.app");
  webpush.setVapidDetails(subj, k.publicKey, k.privateKey);
  const payload = JSON.stringify({
    id: aviso.id || "",
    tipo: aviso.tipo === "alerta" ? "alerta" : "resumen",
    titulo: String(aviso.titulo || "ECOMPRO").slice(0, 120),
    texto: String(aviso.texto || (aviso.lineas || []).slice(0, 3).join(" · ")).slice(0, 300),
  });
  let ok = 0;
  const equipos = todas.length / 2;
  const jobs = [];
  for (let i = 0; i < todas.length; i += 2) {
    const id = todas[i];
    let doc;
    try {
      doc = JSON.parse(todas[i + 1]);
    } catch (e) {
      jobs.push(redis(["HDEL", "ec:push", id]).catch(() => {}));
      continue;
    }
    jobs.push(
      webpush
        .sendNotification(doc.sub, payload, { TTL: 60 * 60 * 12, urgency: "high" })
        .then(() => {
          ok++;
        })
        .catch((e) => {
          if (e && (e.statusCode === 404 || e.statusCode === 410)) return redis(["HDEL", "ec:push", id]).catch(() => {});
        })
    );
  }
  await Promise.all(jobs);
  return { enviados: ok, equipos };
}

module.exports = { vapid, guardar, quitar, enviar };
