// Retiros de Dropi anotados A MANO (banco, monto, comisión, neta). No usa el token de Dropi ni llama a Dropi:
// solo guarda y lee en la base (Upstash Redis). Cada cuenta de Dropi (c=1..4) tiene su propia lista.
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmd) {
  const r = await fetch(RURL, { method: "POST", headers: { Authorization: "Bearer " + RTOK, "Content-Type": "application/json" }, body: JSON.stringify(cmd), signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || "redis " + r.status);
  return j.result;
}
const clean = (v, n) => String(v || "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);
const r2 = (x) => Math.round((+x || 0) * 100) / 100;

async function handle(req, send) {
  const u = new URL(req.url, "http://x");
  const c = parseInt(u.searchParams.get("c"));
  const key = "dropiretiros" + (c >= 2 && c <= 4 ? String(c) : "");
  try {
    if (!RURL || !RTOK) return send(req.method === "GET" ? 200 : 503, req.method === "GET" ? { manual: [] } : { error: "Falta conectar la base (Upstash Redis)." });
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const L = (Array.isArray(b.manual) ? b.manual : []).slice(0, 500).map((r) => ({
        id: String((r && r.id) || "").replace(/[^\w-]/g, "").slice(0, 24),
        f: /^\d{4}-\d{2}-\d{2}$/.test((r && r.f) || "") ? r.f : "",
        m: r2(r && r.m), c: Math.max(0, r2(r && r.c)), t: Math.max(0, r2(r && r.t)),
        s: Math.max(0, r2(r && r.s)),
        b: clean(r && r.b, 40), n: clean(r && r.n, 120),
      })).filter((r) => r.id && r.f && r.m > 0);
      await redis(["HSET", "ec:settings", key, JSON.stringify(L)]);
      return send(200, { ok: true, n: L.length });
    }
    const cur = await redis(["HGET", "ec:settings", key]);
    return send(200, { manual: cur ? JSON.parse(cur) : [], auto: null });
  } catch (e) {
    return send(500, { error: String((e && e.message) || e).slice(0, 160) });
  }
}
module.exports = { handle };
