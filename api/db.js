const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { session } = require("./_auth");

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const COL = /^[A-Za-z0-9_-]{1,40}$/;
const ID = /^[A-Za-z0-9_.:@+-]{1,200}$/;

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

// Siembra por versión: agrega a la base los documentos nuevos de private/seed.json
// (sin pisar los que ya existen ni volver a crear los que borraste).
async function seedSync() {
  let raw;
  try {
    raw = fs.readFileSync(path.join(process.cwd(), "private", "seed.json"), "utf8");
  } catch (e) {
    return;
  }
  const hash = crypto.createHash("sha1").update(raw).digest("hex");
  if ((await redis(["GET", "ec:seedhash"])) === hash) return;
  let seed = {};
  try {
    seed = JSON.parse(raw);
  } catch (e) {
    return;
  }
  const done = new Set((await redis(["SMEMBERS", "ec:seeded_ids"])) || []);
  const legacy = (await redis(["GET", "ec:seeded"])) === "1" && done.size === 0;
  for (const col of Object.keys(seed)) {
    for (const id of Object.keys(seed[col])) {
      const tag = col + "/" + id;
      if (done.has(tag)) continue;
      await redis(["HSETNX", "ec:" + col, id, JSON.stringify(seed[col][id])]);
      await redis(["SADD", "ec:seeded_ids", tag]);
    }
  }
  if (legacy) await redis(["SET", "ec:seeded", "1"]);
  await redis(["SET", "ec:seedhash", hash]);
}

function split(p) {
  const i = String(p || "").indexOf("/");
  if (i < 1) return null;
  const col = p.slice(0, i), id = p.slice(i + 1);
  return COL.test(col) && ID.test(id) ? [col, id] : null;
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const send = (code, obj) => {
    res.statusCode = code;
    res.end(JSON.stringify(obj));
  };
  let s = null;
  try {
    s = session(req);
  } catch (e) {
    return send(500, { error: "config" });
  }
  if (!s) return send(401, { error: "auth" });
  if (req.method !== "POST") return send(405, { error: "method" });
  if (!URL_ || !TOKEN) return send(503, { error: "Falta conectar la base (Upstash Redis) en Vercel." });
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  try {
    await seedSync();
    if (b.op === "list") {
      if (!COL.test(String(b.col))) return send(400, { error: "col" });
      const flat = (await redis(["HGETALL", "ec:" + b.col])) || [];
      const docs = {};
      for (let i = 0; i < flat.length; i += 2) {
        try { docs[flat[i]] = JSON.parse(flat[i + 1]); } catch (e) {}
      }
      return send(200, { docs });
    }
    const p = split(b.path);
    if (!p) return send(400, { error: "path" });
    const key = "ec:" + p[0];
    if (b.op === "set") {
      if (!b.data || typeof b.data !== "object") return send(400, { error: "data" });
      await redis(["HSET", key, p[1], JSON.stringify(b.data)]);
      return send(200, { ok: true });
    }
    if (b.op === "update") {
      if (!b.data || typeof b.data !== "object") return send(400, { error: "data" });
      const cur = await redis(["HGET", key, p[1]]);
      const merged = Object.assign(cur ? JSON.parse(cur) : {}, b.data);
      await redis(["HSET", key, p[1], JSON.stringify(merged)]);
      return send(200, { ok: true });
    }
    if (b.op === "delete") {
      await redis(["HDEL", key, p[1]]);
      return send(200, { ok: true });
    }
    return send(400, { error: "op" });
  } catch (e) {
    return send(500, { error: "db" });
  }
};
