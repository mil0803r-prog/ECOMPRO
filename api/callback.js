const { COOKIE, STATE_COOKIE, MAX_AGE, sign, parseCookies, cookie, allowed, origin, fromB64u } = require("./_auth");

function page(res, status, title, msg) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui;max-width:420px;margin:15vh auto;padding:0 16px"><h1 style="font-size:1.3rem">${title}</h1><p>${msg}</p><p><a href="/login">Probar con otra cuenta</a></p></body>`);
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, origin(req));
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const saved = parseCookies(req)[STATE_COOKIE];
    if (url.searchParams.get("error")) return page(res, 400, "Inicio de sesión cancelado", "Google no completó el inicio de sesión.");
    if (!code || !state || !saved || state !== saved) return page(res, 400, "Sesión de inicio no válida", "Vuelve a intentarlo.");

    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: origin(req) + "/auth/callback",
        grant_type: "authorization_code",
      }),
    });
    const tok = await r.json();
    if (!r.ok || !tok.id_token) return page(res, 400, "No se pudo iniciar sesión", "Google rechazó el código. Vuelve a intentarlo.");

    // El id_token llega directo del endpoint de Google por TLS; se comprueban público y correo.
    const claims = JSON.parse(fromB64u(tok.id_token.split(".")[1]).toString("utf8"));
    const email = String(claims.email || "").toLowerCase();
    if (claims.aud !== process.env.GOOGLE_CLIENT_ID || claims.email_verified !== true) {
      return page(res, 403, "Cuenta no válida", "Google no verificó este correo.");
    }
    if (!allowed().includes(email)) {
      return page(res, 403, "Sin acceso", "Este tablero es privado y tu cuenta de Google no está autorizada.");
    }
    const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
    res.statusCode = 302;
    res.setHeader("Set-Cookie", [cookie(COOKIE, sign({ email, exp }), MAX_AGE), cookie(STATE_COOKIE, "", 0)]);
    res.setHeader("Location", "/");
    res.end();
  } catch (e) {
    page(res, 500, "Error al iniciar sesión", "Revisa la configuración en Vercel.");
  }
};
