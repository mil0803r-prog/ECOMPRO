const fs = require("fs");
const path = require("path");
const { session } = require("./_auth");
const shim = require("./_shim");

const LOGIN = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ECOMPRO</title>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#eef0ee;color:#161a18">
<main style="text-align:center;padding:0 16px"><h1 style="font-size:2rem;margin:0 0 4px;letter-spacing:.02em">ECOMPRO</h1><p style="margin:0 0 20px;color:#5d6661">Semáforo Dropi GT · acceso privado</p>
<a href="/login" style="display:inline-block;background:#24302a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Iniciar sesión con Google</a></main></body></html>`;

module.exports = (req, res) => {
  let s = null;
  try {
    s = session(req);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Falta SESSION_SECRET en las variables de entorno de Vercel.");
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (!s) {
    res.statusCode = 401;
    return res.end(LOGIN);
  }
  const html = fs.readFileSync(path.join(process.cwd(), "private", "ecompro.html"), "utf8");
  res.statusCode = 200;
  res.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>' + shim + "</script></head><body>" + html + "</body></html>");
};
