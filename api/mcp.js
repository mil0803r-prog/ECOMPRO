// API REST + servidor MCP de ECOMPRO en un solo archivo (una sola función de Vercel).
//   MCP (Streamable HTTP, sin sesión):  POST /mcp            (JSON-RPC 2.0)
//   REST:  GET /api/v1 (lista de herramientas) · GET|POST /api/v1/<herramienta>  (argumentos en la query o en el JSON)
// Se protege con la variable MCP_KEY (Sensible): cabecera "Authorization: Bearer <MCP_KEY>" o "x-api-key: <MCP_KEY>".
// Nunca devuelve teléfonos, direcciones ni nombres de clientes. La colección "settings" y las huellas no se exponen.
const crypto = require("crypto");

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const COL = /^[A-Za-z0-9_-]{1,40}$/;
const ID = /^[A-Za-z0-9_.:@+-]{1,200}$/;
const LEER = ["winners", "radar", "tiktokshop", "validations", "gastos", "publicidad", "acciones", "calculos", "alertas"];
const ESCRIBIR = ["winners", "radar", "tiktokshop", "validations"];
const MAX_BODY = 60000; // caracteres de respuesta por herramienta

async function redis(cmd) {
  const r = await fetch(URL_, { method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || "redis " + r.status);
  return j.result;
}
async function hall(key) {
  const flat = (await redis(["HGETALL", key])) || [], o = {};
  for (let i = 0; i < flat.length; i += 2) { try { o[flat[i]] = JSON.parse(flat[i + 1]); } catch (e) {} }
  return o;
}
const clip = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);
const colOk = (c, lista) => COL.test(String(c)) && lista.indexOf(String(c)) >= 0;
function fail(m) { const e = new Error(m); e.user = true; return e; }

const TOOLS = [
  {
    name: "estado",
    description: "Resumen rápido de ECOMPRO: cuántos documentos hay en cada colección, cuándo fue la última consulta a Meta y de Dropi.",
    inputSchema: { type: "object", properties: {} },
    async run() {
      const cols = {};
      for (const c of LEER) cols[c] = (await redis(["HLEN", "ec:" + c])) || 0;
      const st = await hall("ec:settings");
      const meta = await hall("ec:metalive");
      return { colecciones: cols, meta_ultima_consulta: meta.cur ? new Date(meta.cur.ts).toISOString() : null, pedidos_dropi_ultima_carga: st.pedlive ? new Date(st.pedlive.ts).toISOString() : null };
    },
  },
  {
    name: "leer_coleccion",
    description: "Lee los documentos de una colección: winners (ganadores), radar (Caza diaria), tiktokshop, validations, gastos, publicidad, acciones, calculos o alertas.",
    inputSchema: { type: "object", properties: { coleccion: { type: "string", enum: LEER }, limite: { type: "integer", description: "Máximo de documentos (por defecto 50, tope 200)" }, buscar: { type: "string", description: "Texto a buscar dentro del documento (opcional)" } }, required: ["coleccion"] },
    async run(a) {
      if (!colOk(a.coleccion, LEER)) throw fail("Colección no permitida.");
      const docs = await hall("ec:" + a.coleccion);
      let ids = Object.keys(docs).sort().reverse();
      const t = clip(a.buscar, 80).toLowerCase();
      if (t) ids = ids.filter((k) => (k + JSON.stringify(docs[k])).toLowerCase().indexOf(t) >= 0);
      const lim = Math.min(200, Math.max(1, +a.limite || 50)), out = {};
      ids.slice(0, lim).forEach((k) => (out[k] = docs[k]));
      return { total: ids.length, devueltos: Math.min(lim, ids.length), docs: out };
    },
  },
  {
    name: "leer_documento",
    description: "Lee un documento por colección e id.",
    inputSchema: { type: "object", properties: { coleccion: { type: "string", enum: LEER }, id: { type: "string" } }, required: ["coleccion", "id"] },
    async run(a) {
      if (!colOk(a.coleccion, LEER) || !ID.test(String(a.id))) throw fail("Colección o id no válidos.");
      const v = await redis(["HGET", "ec:" + a.coleccion, String(a.id)]);
      if (!v) throw fail("No existe ese documento.");
      return JSON.parse(v);
    },
  },
  {
    name: "guardar_documento",
    description: "Crea o actualiza un documento en winners, radar, tiktokshop o validations (por ejemplo para guardar los productos de la Caza diaria). Con combinar=true mezcla los campos con el documento existente.",
    inputSchema: { type: "object", properties: { coleccion: { type: "string", enum: ESCRIBIR }, id: { type: "string" }, datos: { type: "object" }, combinar: { type: "boolean" } }, required: ["coleccion", "id", "datos"] },
    async run(a) {
      if (!colOk(a.coleccion, ESCRIBIR) || !ID.test(String(a.id))) throw fail("Colección o id no válidos (solo se puede escribir en: " + ESCRIBIR.join(", ") + ").");
      if (!a.datos || typeof a.datos !== "object" || Array.isArray(a.datos)) throw fail("datos debe ser un objeto.");
      let doc = a.datos;
      if (a.combinar) { const cur = await redis(["HGET", "ec:" + a.coleccion, String(a.id)]); doc = Object.assign(cur ? JSON.parse(cur) : {}, a.datos); }
      const s = JSON.stringify(doc);
      if (s.length > 100000) throw fail("El documento es demasiado grande.");
      await redis(["HSET", "ec:" + a.coleccion, String(a.id), s]);
      return { ok: true };
    },
  },
  {
    name: "meta_ads",
    description: "Métricas guardadas de Meta Ads por cuenta publicitaria (campañas, conjuntos, anuncios). Sin 'cuenta' devuelve solo la lista de cuentas y sus fechas.",
    inputSchema: { type: "object", properties: { cuenta: { type: "string", description: "ID de la cuenta publicitaria (opcional)" } } },
    async run(a) {
      const m = await hall("ec:metalive"), cuentas = {};
      Object.keys(m).forEach((k) => { if (k.slice(0, 2) === "c:") cuentas[k.slice(2)] = m[k]; });
      if (!a.cuenta) return { ultima_consulta: m.cur ? new Date(m.cur.ts).toISOString() : null, fallas: (m.cur && m.cur.fallas) || {}, cuentas: Object.keys(cuentas).map((k) => ({ id: k, desde: cuentas[k].desde })) };
      const c = cuentas[String(a.cuenta).replace(/^act_/, "")];
      if (!c) throw fail("Esa cuenta no tiene datos guardados.");
      return c;
    },
  },
  {
    name: "pedidos_dropi",
    description: "Pedidos de Dropi ya cargados al tablero (sin datos personales de clientes). Filtra por estado (E entregado, D devolución, C cancelado, F/P pendiente, K recolectado, G guía, R en ruta, I/J incidencia), por fecha (desde/hasta, AAAA-MM-DD) o por departamento.",
    inputSchema: { type: "object", properties: { estado: { type: "string" }, desde: { type: "string" }, hasta: { type: "string" }, departamento: { type: "string" }, limite: { type: "integer", description: "Pedidos a listar (por defecto 50, tope 500)" } } },
    async run(a) {
      const raw = await redis(["HGET", "ec:settings", "pedextra"]);
      const doc = raw ? JSON.parse(raw) : {}, nuevos = doc.nuevos || {}, map = doc.map || {};
      const dep = clip(a.departamento, 30).toLowerCase(), est = clip(a.estado, 1).toUpperCase();
      const f = /^\d{4}-\d{2}-\d{2}$/;
      let rows = Object.keys(nuevos).map((n) => {
        const x = nuevos[n], m = map[n] || {};
        return { pedido: n, fecha: x.d, hora: x.t, estado: m.s || x.s, valor: x.v, departamento: m.dp || x.dp || "", producto: m.p || "", guia: m.g || "", transportadora: m.tr || "" };
      });
      if (est) rows = rows.filter((r) => r.estado === est);
      if (dep) rows = rows.filter((r) => String(r.departamento).toLowerCase().indexOf(dep) >= 0);
      if (f.test(a.desde || "")) rows = rows.filter((r) => r.fecha >= a.desde);
      if (f.test(a.hasta || "")) rows = rows.filter((r) => r.fecha <= a.hasta);
      const porEstado = {}; let valor = 0;
      rows.forEach((r) => { porEstado[r.estado] = (porEstado[r.estado] || 0) + 1; valor += r.valor || 0; });
      rows.sort((x, y) => (y.fecha + y.hora).localeCompare(x.fecha + x.hora));
      const lim = Math.min(500, Math.max(1, +a.limite || 50));
      return { total: rows.length, valor_total: valor, por_estado: porEstado, pedidos: rows.slice(0, lim) };
    },
  },
  {
    name: "crear_alerta",
    description: "Manda un aviso a la campana 🔔 del tablero y al celular registrado.",
    inputSchema: { type: "object", properties: { titulo: { type: "string" }, texto: { type: "string" }, lineas: { type: "array", items: { type: "string" } }, tipo: { type: "string", enum: ["resumen", "alerta"] } }, required: ["titulo"] },
    async run(a) {
      const titulo = clip(a.titulo, 120);
      if (!titulo) throw fail("Falta el título.");
      const ts = Date.now(), id = "a" + ts.toString(36) + crypto.randomBytes(2).toString("hex");
      const doc = { ts, tipo: a.tipo === "alerta" ? "alerta" : "resumen", titulo, texto: clip(a.texto, 400), lineas: (Array.isArray(a.lineas) ? a.lineas : []).slice(0, 40).map((l) => clip(l, 240)).filter(Boolean) };
      await redis(["HSET", "ec:alertas", id, JSON.stringify(doc)]);
      let celular = { enviados: 0, equipos: 0 };
      try { celular = await Promise.race([require("./_push").enviar({ id, ...doc }), new Promise((r) => setTimeout(() => r(celular), 8000))]); } catch (e) {}
      return { ok: true, id, celular };
    },
  },
];

function safeEq(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
function autorizado(req) {
  const key = process.env.MCP_KEY;
  if (!key) return 503;
  const h = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return safeEq(h, key) || safeEq(req.headers["x-api-key"], key) ? 200 : 401;
}
function recortar(v) {
  let s = JSON.stringify(v, null, 1);
  if (s.length > MAX_BODY) s = s.slice(0, MAX_BODY) + "\n…(recortado: usa 'limite' o 'buscar' para ver menos)";
  return s;
}
function coerce(tool, q) {
  const props = (tool.inputSchema && tool.inputSchema.properties) || {}, out = {};
  Object.keys(q).forEach((k) => {
    const t = props[k] && props[k].type, v = q[k];
    out[k] = t === "integer" ? parseInt(v, 10) : t === "boolean" ? v === "true" || v === "1" || v === true : v;
  });
  return out;
}
async function correr(nombre, args) {
  const t = TOOLS.find((x) => x.name === nombre);
  if (!t) throw fail("Herramienta desconocida: " + nombre);
  if (!URL_ || !TOKEN) throw fail("Falta conectar la base (Upstash Redis) en Vercel.");
  return t.run(args || {});
}

async function rpc(m) {
  const id = m && m.id;
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  const err = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return err(-32600, "Solicitud no válida");
  if (id === undefined) return null; // notificación (por ejemplo notifications/initialized)
  switch (m.method) {
    case "initialize":
      return ok({ protocolVersion: (m.params && m.params.protocolVersion) || "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "ecompro", version: "1.0.0" }, instructions: "ECOMPRO: tablero de Dropi Guatemala. Lee pedidos, Meta Ads, Caza diaria y ganadores; guarda documentos de investigación y manda alertas." });
    case "ping": return ok({});
    case "tools/list": return ok({ tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
    case "tools/call":
      try {
        const r = await correr(m.params && m.params.name, m.params && m.params.arguments);
        return ok({ content: [{ type: "text", text: recortar(r) }] });
      } catch (e) {
        return ok({ isError: true, content: [{ type: "text", text: e.user ? e.message : "Error interno." }] });
      }
    default: return err(-32601, "Método no encontrado: " + m.method);
  }
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const send = (c, o) => { res.statusCode = c; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(o === undefined ? "" : JSON.stringify(o)); };
  const a = autorizado(req);
  if (a === 503) return send(503, { error: "Falta la variable MCP_KEY en Vercel." });
  if (a !== 200) { res.setHeader("WWW-Authenticate", "Bearer"); return send(401, { error: "Clave incorrecta." }); }
  const u = new URL(req.url, "http://x"), tool = u.searchParams.get("tool");
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b || "{}"); } catch (e) { return send(400, { error: "json" }); } }
  // REST: /api/v1 y /api/v1/<herramienta>
  if (/^\/api\/v1(\/|$)/.test(u.pathname) || tool !== null || (req.method === "GET" && u.searchParams.get("r"))) {
    if (!tool) return send(200, { herramientas: TOOLS.map((t) => ({ nombre: t.name, descripcion: t.description, parametros: t.inputSchema })) });
    const t = TOOLS.find((x) => x.name === tool);
    if (!t) return send(404, { error: "Herramienta desconocida." });
    if (req.method !== "GET" && req.method !== "POST") return send(405, { error: "method" });
    const q = {}; u.searchParams.forEach((v, k) => { if (k !== "tool") q[k] = v; });
    const args = Object.assign({}, coerce(t, q), req.method === "POST" && b && typeof b === "object" ? b : {});
    if (req.method === "GET" && t.name === "guardar_documento") return send(405, { error: "Usa POST." });
    if (req.method === "GET" && t.name === "crear_alerta") return send(405, { error: "Usa POST." });
    try { return send(200, { ok: true, resultado: await correr(tool, args) }); }
    catch (e) { return send(e.user ? 400 : 500, { ok: false, error: e.user ? e.message : "Error interno." }); }
  }
  // MCP
  if (req.method === "GET" || req.method === "DELETE") return send(405, { error: "Usa POST con JSON-RPC." });
  if (req.method !== "POST") return send(405, { error: "method" });
  if (Array.isArray(b)) {
    const out = (await Promise.all(b.map(rpc))).filter(Boolean);
    return out.length ? send(200, out) : send(202);
  }
  const r = await rpc(b);
  return r ? send(200, r) : send(202);
};
