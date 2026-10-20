// Descarga de videos públicos de TikTok y Facebook, solo para el tablero (requiere sesión).
//   POST /api/descargar  {url}            -> datos del video y enlaces directos (sin marca de agua en TikTok)
//   GET  /api/descargar?u=<cdn>&n=<nombre> -> entrega el archivo como descarga (solo servidores de video conocidos)
// Úsalo solo con videos propios, con permiso o como referencia: los videos de otras personas tienen derechos de autor.
const { Readable } = require("stream");
const { session } = require("./_auth");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const UA_FB = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

const PAGE_HOSTS = {
  tiktok: ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
  facebook: ["facebook.com", "fb.watch", "fb.com", "m.facebook.com", "web.facebook.com"],
};
const CDN_HOSTS = ["tikwm.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokv.com", "tiktokv.us", "muscdn.com", "fbcdn.net"];

const hostOk = (host, list) => list.some((h) => host === h || host.endsWith("." + h));
function parseUrl(s) {
  try {
    const u = new URL(String(s || "").trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch (e) {
    return null;
  }
}
function platform(u) {
  for (const k of Object.keys(PAGE_HOSTS)) if (hostOk(u.hostname.toLowerCase(), PAGE_HOSTS[k])) return k;
  return null;
}
async function get(url, headers, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 12000);
  try {
    return await fetch(url, { headers, redirect: "follow", signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}
const unesc = (s) =>
  String(s || "")
    .replace(/\\u0025/g, "%")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003C/gi, "<")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n || 200);
const httpsOnly = (s) => (/^https:\/\//i.test(s) ? s : "");

// ---------- TikTok ----------
async function tiktok(u) {
  const r = await get("https://www.tikwm.com/api/?hd=1&url=" + encodeURIComponent(u.toString()), { "User-Agent": UA, Accept: "application/json" });
  const j = await r.json().catch(() => null);
  const d = j && j.code === 0 && j.data;
  if (!d) return { error: "No pude leer ese video de TikTok. Revisa que el enlace sea público y completo." };
  const abs = (p) => (p ? (/^https?:/i.test(p) ? p : "https://www.tikwm.com" + p) : "");
  const videos = [];
  if (d.hdplay) videos.push({ calidad: "HD sin marca de agua", url: abs(d.hdplay) });
  if (d.play) videos.push({ calidad: "Sin marca de agua", url: abs(d.play) });
  if (!videos.length) return { error: "TikTok no entregó el video sin marca de agua para este enlace." };
  return {
    plataforma: "tiktok",
    titulo: clean(d.title, 180),
    autor: clean((d.author && (d.author.nickname || d.author.unique_id)) || "", 80),
    portada: httpsOnly(abs(d.cover || d.origin_cover || "")),
    duracion: +d.duration || 0,
    videos,
  };
}

// ---------- Facebook ----------
function meta(html, prop) {
  const re = new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*content=["\']([^"\']*)["\']', "i");
  const re2 = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + prop + '["\']', "i");
  const m = html.match(re) || html.match(re2);
  return m ? unesc(m[1]) : "";
}
function fbFind(html, key) {
  const m = html.match(new RegExp('"' + key + '":"(https:[^"]+)"'));
  return m ? unesc(m[1]) : "";
}
async function facebook(u) {
  const r = await get(u.toString(), { "User-Agent": UA_FB, "Accept-Language": "es,en;q=0.8", Accept: "text/html" }, 14000);
  let final;
  try {
    final = new URL(r.url);
  } catch (e) {
    final = null;
  }
  if (!final || !hostOk(final.hostname.toLowerCase(), PAGE_HOSTS.facebook)) return { error: "Ese enlace no lleva a un video público de Facebook." };
  const html = await r.text();
  const hd = fbFind(html, "hd_src") || fbFind(html, "playable_url_quality_hd") || fbFind(html, "browser_native_hd_url");
  const sd = fbFind(html, "sd_src") || fbFind(html, "playable_url") || fbFind(html, "browser_native_sd_url") || meta(html, "og:video:secure_url") || meta(html, "og:video");
  const videos = [];
  if (hd) videos.push({ calidad: "HD", url: hd });
  if (sd && sd !== hd) videos.push({ calidad: "Normal", url: sd });
  const ok = videos.filter((v) => hostOk((parseUrl(v.url) || { hostname: "" }).hostname, CDN_HOSTS) && /^https:/.test(v.url));
  if (!ok.length) return { error: "No pude sacar el video. Facebook solo deja ver videos públicos: abre el enlace sin iniciar sesión para comprobar." };
  return {
    plataforma: "facebook",
    titulo: clean(meta(html, "og:title") || meta(html, "og:description"), 180),
    autor: "",
    portada: httpsOnly(meta(html, "og:image")),
    duracion: 0,
    videos: ok,
  };
}

// ---------- entrega del archivo ----------
async function entregar(req, res, q) {
  const u = parseUrl(q.u);
  if (!u || u.protocol !== "https:" || !hostOk(u.hostname.toLowerCase(), CDN_HOSTS)) {
    res.statusCode = 400;
    return res.end("enlace no permitido");
  }
  const nombre = (String(q.n || "video").replace(/[^A-Za-z0-9_\-]/g, "_").slice(0, 60) || "video") + ".mp4";
  try {
    const r = await get(u.toString(), { "User-Agent": UA, Referer: /tik|muscdn/.test(u.hostname) ? "https://www.tiktok.com/" : "https://www.facebook.com/" }, 25000);
    const len = +r.headers.get("content-length") || 0;
    let fin;
    try {
      fin = new URL(r.url);
    } catch (e) {
      fin = u;
    }
    if (!r.ok || !r.body || !hostOk(fin.hostname.toLowerCase(), CDN_HOSTS)) {
      res.statusCode = 502;
      return res.end("no se pudo bajar");
    }
    if (len > 150 * 1024 * 1024) {
      res.statusCode = 413;
      return res.end("archivo muy grande");
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", r.headers.get("content-type") || "video/mp4");
    res.setHeader("Content-Disposition", 'attachment; filename="' + nombre + '"');
    res.setHeader("Cache-Control", "no-store");
    if (len) res.setHeader("Content-Length", String(len));
    Readable.fromWeb(r.body).pipe(res);
  } catch (e) {
    res.statusCode = 502;
    res.end("no se pudo bajar");
  }
}

module.exports = async (req, res) => {
  let s = null;
  try {
    s = session(req);
  } catch (e) {
    res.statusCode = 500;
    return res.end("config");
  }
  if (!s) {
    res.statusCode = 401;
    return res.end("auth");
  }
  const q = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  if (req.method === "GET") return entregar(req, res, q);

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const send = (c, o) => {
    res.statusCode = c;
    res.end(JSON.stringify(o));
  };
  if (req.method !== "POST") return send(405, { error: "method" });
  let b;
  try {
    b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (e) {
    return send(400, { error: "Datos inválidos." });
  }
  const u = parseUrl(b.url);
  const p = u && platform(u);
  if (!p) return send(400, { error: "Pega un enlace de TikTok o de Facebook (por ejemplo tiktok.com/@usuario/video/… o facebook.com/…/videos/…)." });
  if (b.plataforma && b.plataforma !== p) return send(400, { error: "Ese enlace es de " + (p === "tiktok" ? "TikTok" : "Facebook") + ", usa la otra pestaña." });
  try {
    const out = p === "tiktok" ? await tiktok(u) : await facebook(u);
    if (out.error) return send(422, { error: out.error });
    return send(200, { ok: true, ...out });
  } catch (e) {
    return send(502, { error: "No se pudo conectar para leer el video. Intenta otra vez en un momento." });
  }
};
