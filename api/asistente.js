const { session } = require("./_auth");

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const SISTEMA = `Eres el asistente de ECOMPRO, el tablero privado de un vendedor de dropshipping contra entrega (COD) en Guatemala que usa Dropi, Lumy, Meta Ads, TikTok Ads y DropKiller.
Responde SIEMPRE en español sencillo y directo, en pocas líneas, con cifras exactas tomadas del CONTEXTO. No inventes datos: si algo no está en el contexto, dilo y di dónde verlo en el tablero.
Reglas del negocio: las ventas están en quetzales (Q, GTQ); Meta y TikTok gastan en soles (S/, PEN). La "ganancia según Lumy" es un techo, no la ganancia real. % de entrega = entregados ÷ (entregados + devueltos e incidencias). Con el flete de unos 68 GTQ, por debajo de ~50% de entrega se pierde dinero; 65% o más es buena zona. Con menos de 5 pedidos resueltos no hay datos suficientes para juzgar una zona.
Puedes comparar, calcular, recomendar qué zonas evitar, qué producto de la caza diaria pautar y dónde se va el dinero. No puedes ejecutar acciones ni cambiar datos: solo explicar y recomendar. Si el usuario pregunta cómo usar el tablero, explícale en qué sección está cada cosa (menú izquierdo: Resumen, Logística, Marketing, Investigación de mercado, Finanzas).
Usa listas cortas y negritas solo para lo importante.`;

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error("redis");
  return j.result;
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const send = (c, o) => {
    res.statusCode = c;
    res.end(JSON.stringify(o));
  };
  let s = null;
  try {
    s = session(req);
  } catch (e) {
    return send(500, { error: "config" });
  }
  if (!s) return send(401, { error: "auth" });
  if (req.method !== "POST") return send(405, { error: "method" });
  const key = process.env.ANTHROPIC_API_KEY, model = process.env.ASSISTANT_MODEL;
  if (!key || !model) return send(503, { error: "Falta conectar el asistente: agrega ANTHROPIC_API_KEY y ASSISTANT_MODEL en Vercel." });
  let b;
  try {
    b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (e) {
    return send(400, { error: "json" });
  }
  const ctx = String(b.contexto || "").slice(0, 60000);
  const msgs = (Array.isArray(b.messages) ? b.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return send(400, { error: "messages" });

  // Límite diario por correo para cuidar el gasto de la API.
  const limit = Math.max(1, parseInt(process.env.ASSISTANT_LIMIT || "80", 10));
  if (URL_ && TOKEN) {
    try {
      const k = "ec:asist:" + String(s.email).toLowerCase() + ":" + new Date().toISOString().slice(0, 10);
      const n = await redis(["INCR", k]);
      if (n === 1) await redis(["EXPIRE", k, 90000]);
      if (n > limit) return send(429, { error: "Llegaste al límite de " + limit + " preguntas de hoy. Vuelve mañana." });
    } catch (e) {}
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        system: [
          { type: "text", text: SISTEMA },
          { type: "text", text: "CONTEXTO ACTUAL DEL TABLERO (datos reales de hoy):\n" + ctx, cache_control: { type: "ephemeral" } },
        ],
        messages: msgs,
      }),
    });
    const j = await r.json();
    if (!r.ok) return send(502, { error: "El asistente no pudo responder (" + r.status + "). " + ((j && j.error && j.error.message) || "").slice(0, 160) });
    const text = (j.content || []).filter((x) => x.type === "text").map((x) => x.text).join("\n").trim();
    return send(200, { text: text || "No tengo respuesta para eso." });
  } catch (e) {
    return send(502, { error: "No se pudo conectar con el asistente." });
  }
};
