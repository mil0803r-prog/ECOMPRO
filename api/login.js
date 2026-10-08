const crypto = require("crypto");
const { STATE_COOKIE, cookie, origin } = require("./_auth");

module.exports = (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Falta GOOGLE_CLIENT_ID en las variables de entorno de Vercel.");
  }
  const state = crypto.randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: origin(req) + "/auth/callback",
    response_type: "code",
    scope: "openid email",
    state,
    prompt: "select_account",
  });
  res.statusCode = 302;
  res.setHeader("Set-Cookie", cookie(STATE_COOKIE, state, 600));
  res.setHeader("Location", "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString());
  res.end();
};
