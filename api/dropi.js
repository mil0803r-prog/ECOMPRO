// Trae de Dropi, solo para el tablero: producto, guía y transportadora de cada pedido.
// El token vive en la variable de Vercel DROPI_TOKEN; nunca sale al navegador ni se guarda en el código.
// No pide ni devuelve nombres, teléfonos ni direcciones de clientes.
const { session } = require("./_auth");

const BASES = (process.env.DROPI_API_BASE ? [process.env.DROPI_API_BASE] : ["https://api.dropi.gt", "https://api.dropi.co"]).map((b) => b.replace(/\/+$/, ""));
const PATHS = ["/integrations/orders/myorders", "/api/orders/myorders"];

function pick(o, keys) {
  for (const k of keys) {
    const v = k.split(".").reduce((a, p) => (a == null ? a : a[p]), o);
    if (v != null && v !== "") return String(v);
  }
  return "";
}
function slim(o) {
  const det = o.orderdetails || o.order_details || o.products || [];
  const prods = (Array.isArray(det) ? det : [])
    .map((d) => pick(d, ["product.name", "name", "product_name"]))
    .filter(Boolean);
  return {
    n: pick(o, ["id", "order_id", "orden_id"]),
    g: pick(o, ["shipping_guide", "guide", "guia", "tracking_number", "shipping_guide_number"]),
    t: pick(o, ["distribution_company.name", "shipping_company", "shipping_company_name", "transportadora", "carrier"]),
    p: prods.join(" + "),
  };
}

async function ask(base, path, token, start, size, from, until) {
  const q = new URLSearchParams({
    orderBy: "id", orderDirection: "desc", result_number: String(size), start: String(start),
    textToSearch: "", status: "", supplier_id: "false", user_id: "false", from, untill: until, until,
  });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(base + path + "?" + q, {
      headers: { "dropi-integration-key": token, Accept: "application/json" },
      signal: ctl.signal,
    });
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch (e) {}
    return { status: r.status, j, head: text.slice(0, 160).replace(token, "***") };
  } finally {
    clearTimeout(t);
  }
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const send = (code, obj) => { res.statusCode = code; res.end(JSON.stringify(obj)); };
  let s = null;
  try { s = session(req); } catch (e) { return send(500, { error: "config" }); }
  if (!s) return send(401, { error: "auth" });
  if (req.method !== "POST") return send(405, { error: "method" });
  const token = process.env.DROPI_TOKEN;
  if (!token) return send(503, { error: "Falta la variable DROPI_TOKEN en Vercel (Settings > Environment Variables, marcada Sensitive)." });
  const from = "2026-03-01";
  const until = new Date().toISOString().slice(0, 10);
  const tried = [];
  for (const base of BASES) {
    for (const path of PATHS) {
      let first;
      try { first = await ask(base, path, token, 0, 50, from, until); }
      catch (e) { tried.push({ base, path, error: String(e && e.name === "AbortError" ? "tiempo agotado" : (e && e.message) || e).slice(0, 120) }); continue; }
      const list = first.j && (first.j.objects || first.j.data || first.j.orders);
      if (first.status === 200 && Array.isArray(list)) {
        const rows = list.map(slim);
        const total = Number(first.j.count || first.j.total || 0);
        const t0 = Date.now();
        let start = 50;
        while (start < Math.min(total || 3000, 3000) && Date.now() - t0 < 40000) {
          let page;
          try { page = await ask(base, path, token, start, 50, from, until); } catch (e) { break; }
          const l2 = page.j && (page.j.objects || page.j.data || page.j.orders);
          if (!Array.isArray(l2) || !l2.length) break;
          l2.forEach((o) => rows.push(slim(o)));
          start += 50;
        }
        return send(200, { ok: true, usado: base + path, total: total || rows.length, rows: rows.filter((x) => x.n) });
      }
      tried.push({ base, path, status: first.status, respuesta: first.head });
    }
  }
  return send(502, { error: "Dropi no respondió con la lista de pedidos.", tried });
};
