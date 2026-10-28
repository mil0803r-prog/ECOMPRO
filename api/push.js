// Suscribir o quitar un celular/equipo para recibir los avisos de ECOMPRO. Pide sesión de Google, igual que la base.
const { session } = require("./_auth");
const push = require("./_push");

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
  try {
    if (req.method === "GET") return send(200, { publicKey: (await push.vapid()).publicKey });
    let b;
    try {
      b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    } catch (e) {
      return send(400, { error: "json" });
    }
    if (req.method === "POST" && b.prueba) {
      const r = await push.enviar({ tipo: "resumen", titulo: "Prueba de ECOMPRO", texto: "Si ves este aviso en tu celular, los avisos ya funcionan." });
      return send(200, { ok: true, ...r });
    }
    if (req.method === "POST") {
      await push.guardar(b.subscription, req.headers["user-agent"]);
      return send(200, { ok: true });
    }
    if (req.method === "DELETE") {
      if (b.endpoint) await push.quitar(b.endpoint);
      return send(200, { ok: true });
    }
    return send(405, { error: "method" });
  } catch (e) {
    const m = String(e && e.message);
    if (m === "suscripcion") return send(400, { error: "suscripcion" });
    if (m === "limite") return send(409, { error: "limite" });
    return send(500, { error: "No se pudo completar." });
  }
};
