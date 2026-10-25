// Descarga de videos públicos de TikTok y Facebook, solo para el tablero (requiere sesión).
//   POST /api/descargar  {url}            -> datos del video y enlaces directos (sin marca de agua en TikTok)
//   GET  /api/descargar?u=<cdn>&n=<nombre> -> entrega el archivo como descarga (solo servidores de video conocidos)
// Úsalo solo con videos propios, con permiso o como referencia: los videos de otras personas tienen derechos de autor.
const { Readable } = require("stream");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const pathMod = require("path");
const { pipeline } = require("stream/promises");
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
  // Anuncios de la Biblioteca de anuncios de Meta: facebook.com/ads/library/?id=NÚMERO
  const esAnuncio = /^\/ads\/(library|archive)/i.test(u.pathname);
  if (esAnuncio) {
    const id = (u.searchParams.get("id") || "").replace(/\D/g, "");
    if (!id) return { error: "Ese enlace de la Biblioteca de anuncios no trae el número del anuncio (id=...)." };
    u = new URL("https://www.facebook.com/ads/library/?id=" + id);
  }
  const r = await get(u.toString(), { "User-Agent": esAnuncio ? UA : UA_FB, "Accept-Language": "es,en;q=0.8", Accept: "text/html" }, 14000);
  let final;
  try {
    final = new URL(r.url);
  } catch (e) {
    final = null;
  }
  if (!final || !hostOk(final.hostname.toLowerCase(), PAGE_HOSTS.facebook)) return { error: "Ese enlace no lleva a un video público de Facebook." };
  const html = await r.text();
  const hd = fbFind(html, "video_hd_url") || fbFind(html, "hd_src") || fbFind(html, "playable_url_quality_hd") || fbFind(html, "browser_native_hd_url");
  const sd = fbFind(html, "video_sd_url") || fbFind(html, "sd_src") || fbFind(html, "playable_url") || fbFind(html, "browser_native_sd_url") || meta(html, "og:video:secure_url") || meta(html, "og:video");
  const videos = [];
  if (hd) videos.push({ calidad: "HD", url: hd });
  if (sd && sd !== hd) videos.push({ calidad: "Normal", url: sd });
  const ok = videos.filter((v) => hostOk((parseUrl(v.url) || { hostname: "" }).hostname, CDN_HOSTS) && /^https:/.test(v.url));
  if (!ok.length) return { error: "No pude sacar el video. Facebook solo deja ver videos públicos: abre el enlace sin iniciar sesión para comprobar. Si es un anuncio, pega el enlace de la Biblioteca de anuncios (facebook.com/ads/library/?id=...) y revisa que el anuncio sea de video y siga activo." };
  return {
    plataforma: "facebook",
    titulo: clean(meta(html, "og:title") || meta(html, "og:description"), 180),
    autor: "",
    portada: httpsOnly(meta(html, "og:image")),
    duracion: 0,
    videos: ok,
  };
}

// ---------- conversión (formato, resolución y proporción) ----------
let FFMPEG = "ffmpeg";
try {
  FFMPEG = require("@ffmpeg-installer/ffmpeg").path;
} catch (e) {}
const RES = [480, 720, 1080, 1440, 2160];
const ARS = { "9:16": [9, 16], "1:1": [1, 1], "3:4": [3, 4] };
const even = (n) => Math.round(n / 2) * 2;

// Devuelve el filtro de video. S = lado corto en píxeles (720 = 720p, 2160 = 4K).
function filtroVideo(S, ar, fit) {
  const a = ARS[ar];
  if (!a) {
    // proporción original: solo se fija el lado corto
    return "scale='if(gt(iw,ih),-2," + S + ")':'if(gt(iw,ih)," + S + ",-2)',setsar=1";
  }
  const W = even(S), H = even((S * a[1]) / a[0]);
  const ww = a[0] >= a[1] ? even((S * a[0]) / a[1]) : W;
  const hh = a[0] >= a[1] ? S : H;
  const w = a[0] >= a[1] ? ww : W, h = a[0] >= a[1] ? hh : H;
  if (fit === "blur") {
    return (
      "split[a][b];[a]scale=" + w + ":" + h + ":force_original_aspect_ratio=increase,crop=" + w + ":" + h + ",boxblur=24:6[bg];" +
      "[b]scale=" + w + ":" + h + ":force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1"
    );
  }
  return "scale=" + w + ":" + h + ":force_original_aspect_ratio=increase,crop=" + w + ":" + h + ",setsar=1";
}

function convertir(entrada, salida, opt) {
  return new Promise((resolve, reject) => {
    const S = opt.gif ? Math.min(opt.S, 720) : opt.S;
    const vf = filtroVideo(S, opt.ar, opt.fit);
    let args = ["-y", "-hide_banner", "-loglevel", "error", "-i", entrada];
    if (opt.gif) {
      const g = vf.includes("[") ? vf + "[v];[v]" : vf + ",";
      args = args.concat(["-t", "15", "-an", "-filter_complex", g + "fps=12,split[x][y];[x]palettegen=max_colors=128[p];[y][p]paletteuse=dither=bayer", "-f", "gif", salida]);
    } else {
      args = args.concat(["-vf", vf.includes("[") ? vf : vf, "-c:v", "libx264", "-preset", S >= 1440 ? "ultrafast" : "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-f", "mp4", salida]);
      // los filtros con varias entradas necesitan -filter_complex
      if (vf.includes("[")) {
        const i = args.indexOf("-vf");
        args.splice(i, 2, "-filter_complex", vf.replace(/,setsar=1$/, ",setsar=1[v]"), "-map", "[v]", "-map", "0:a?");
      }
    }
    const ps = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    ps.stderr.on("data", (d) => (err = (err + d).slice(-600)));
    const t = setTimeout(() => {
      ps.kill("SIGKILL");
      reject(new Error("tiempo"));
    }, 48000);
    ps.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    ps.on("close", (c) => {
      clearTimeout(t);
      c === 0 ? resolve() : reject(new Error(err || "ffmpeg " + c));
    });
  });
}

async function entregarConvertido(res, u, q, nombre) {
  const gif = q.fmt === "gif";
  const S = RES.includes(+q.h) ? +q.h : 0;
  const ar = ARS[q.ar] ? q.ar : "";
  const fit = q.fit === "blur" ? "blur" : "crop";
  const base = pathMod.join(os.tmpdir(), "dl-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
  const ent = base + ".src", sal = base + (gif ? ".gif" : ".mp4");
  const limpiar = () => [ent, sal].forEach((f) => fs.unlink(f, () => {}));
  try {
    const r = await get(u.toString(), { "User-Agent": UA, Referer: /tik|muscdn/.test(u.hostname) ? "https://www.tiktok.com/" : "https://www.facebook.com/" }, 25000);
    const len = +r.headers.get("content-length") || 0;
    if (!r.ok || !r.body || len > 120 * 1024 * 1024) {
      res.statusCode = r.ok ? 413 : 502;
      return res.end(r.ok ? "archivo muy grande" : "no se pudo bajar");
    }
    await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(ent));
    await convertir(ent, sal, { gif, S: S || 720, ar, fit });
    const st = fs.statSync(sal);
    res.statusCode = 200;
    res.setHeader("Content-Type", gif ? "image/gif" : "video/mp4");
    res.setHeader("Content-Disposition", 'attachment; filename="' + nombre.replace(/\.mp4$/, gif ? ".gif" : ".mp4") + '"');
    res.setHeader("Content-Length", String(st.size));
    res.setHeader("Cache-Control", "no-store");
    const rs = fs.createReadStream(sal);
    rs.on("close", limpiar);
    rs.pipe(res);
  } catch (e) {
    limpiar();
    res.statusCode = /tiempo/.test(String(e && e.message)) ? 504 : 502;
    res.end(res.statusCode === 504 ? "tardó demasiado: baja la resolución o usa un video más corto" : "no se pudo convertir");
  }
}

// ---------- entrega del archivo ----------
async function entregar(req, res, q) {
  const ver = q.v === "1";
  const u = parseUrl(q.u);
  if (!u || u.protocol !== "https:" || !hostOk(u.hostname.toLowerCase(), CDN_HOSTS)) {
    res.statusCode = 400;
    return res.end("enlace no permitido");
  }
  const nombre = (String(q.n || "video").replace(/[^A-Za-z0-9_\-]/g, "_").slice(0, 60) || "video") + ".mp4";
  const conv = q.fmt === "gif" || RES.includes(+q.h) || ARS[q.ar];
  if (conv) return entregarConvertido(res, u, q, nombre);
  try {
    const hdr = { "User-Agent": UA, Referer: /tik|muscdn/.test(u.hostname) ? "https://www.tiktok.com/" : "https://www.facebook.com/" };
    const rango = ver && /^bytes=\d*-\d*$/.test(String(req.headers.range || "")) ? req.headers.range : "";
    if (rango) hdr.Range = rango;
    const r = await get(u.toString(), hdr, 25000);
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
    res.statusCode = r.status === 206 ? 206 : 200;
    res.setHeader("Content-Type", r.headers.get("content-type") || "video/mp4");
    if (ver) {
      res.setHeader("Accept-Ranges", "bytes");
      if (r.headers.get("content-range")) res.setHeader("Content-Range", r.headers.get("content-range"));
    }
    res.setHeader("Content-Disposition", (ver ? "inline" : "attachment") + '; filename="' + nombre + '"');
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
