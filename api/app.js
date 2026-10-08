const fs = require("fs");
const path = require("path");
const { session } = require("./_auth");
const shim = require("./_shim");

const ICONS = '<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#edf4f8"><meta name="color-scheme" content="light">';

const LOGIN = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ECOMPRO</title>${ICONS}
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#041018;color:#e9fcff">
<main style="text-align:center;padding:0 16px"><img src="/icon-192.png" width="96" height="96" alt="" style="border-radius:22px;margin-bottom:12px"><h1 style="font-size:2rem;margin:0 0 4px;letter-spacing:.02em">ECOMPRO</h1><p style="margin:0 0 20px;color:#8fb8c8">Semáforo Dropi GT · acceso privado</p>
<a href="/login" style="display:inline-block;background:#38c6f4;color:#04202c;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Iniciar sesión con Google</a></main></body></html>`;

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
  res.end('<!doctype html><html lang="es" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + ICONS + '<script>try{var t=localStorage.getItem("ec_theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script><script>' + shim + "</script></head><body>" + html + "</body></html>");
};
