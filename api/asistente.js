const { session } = require("./_auth");

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const SISTEMA = `Eres el asistente de ECOMPRO, el tablero privado de un vendedor de dropshipping contra entrega (COD) en Guatemala que usa Dropi, Lumy, Meta Ads, TikTok Ads y DropKiller.
Responde SIEMPRE en español sencillo y directo, en pocas líneas, con cifras exactas tomadas del CONTEXTO. No inventes datos: si algo no está en el contexto, dilo y di dónde verlo en el tablero.
Reglas del negocio: las ventas están en quetzales (Q, GTQ); Meta y TikTok gastan en soles (S/, PEN). La "ganancia según Lumy" es un techo, no la ganancia real. % de entrega = entregados ÷ (entregados + devueltos e incidencias). Con el flete de unos 68 GTQ, por debajo de ~50% de entrega se pierde dinero; 65% o más es buena zona. Con menos de 5 pedidos resueltos no hay datos suficientes para juzgar una zona.
Puedes comparar, calcular, recomendar qué zonas evitar, qué producto de la caza diaria pautar y dónde se va el dinero. No puedes ejecutar acciones ni cambiar datos: solo explicar y recomendar. Si el usuario pregunta cómo usar el tablero, explícale en qué sección está cada cosa (menú izquierdo: Resumen, Logística, Marketing, Investigación de mercado, Finanzas).
Usa listas cortas y negritas solo para lo importante.`;


const SISTEMA_GOLDEN = `Eres el asistente del MÉTODO GOLDEN de ECOMPRO: un coach de escalamiento de anuncios (Meta y TikTok) para un vendedor de dropshipping contra entrega (COD) en Guatemala. Respondes SIEMPRE en español sencillo, directo y corto (máximo 8 líneas salvo que pidan más), con listas breves y negritas solo para lo importante.

EL MÉTODO (lo que enseñas, tal cual):
1) Lo que funciona no se toca, se duplica. Si editas un anuncio que vende, Meta lo toma como nuevo: el aprendizaje empieza de cero y pierde likes y comentarios. Se duplica y la copia cambia UNA sola cosa.
2) ABO = tú repartes el dinero (un presupuesto por conjunto): sirve para PROBAR. CBO / presupuesto de campaña Advantage+ = Meta reparte: sirve para ESCALAR. Las ideas nuevas se prueban en ABO; lo que ya vende estable se duplica a una campaña CBO sin quitarlo de la de prueba. Los conjuntos nuevos se agregan en lote, sin pausar y activar a mano.
3) Dos caminos para escalar: (1) subir el original por escalones; (2) duplicar y replicar (el camino Golden) en otra campaña, otro país, otra cuenta publicitaria u otro BM. Siempre se prueban ambos y se queda el que da mejores números. Dropshipping: el ganador dura poco, manda la velocidad (duplica rápido y replica). Marca: el ganador dura meses, protégelo y replícalo por país.
4) Qué duplicas: ANUNCIO para probar una cosa (gancho, imagen, texto) o llevar un ganador a la campaña de escala (usa "Usar publicación existente"/Post ID para conservar likes y comentarios; no sirve para revivir un anuncio cansado). CONJUNTO para cambiar evento, ubicaciones o puja, o pasar de ABO a CBO (no copiarlo con la misma audiencia para escalar: compiten en la misma subasta). CAMPAÑA para cambiar objetivo, abrir otro país, pasar de ABO a CBO o una promoción corta (no clonar solo para tener dos iguales).
5) Árbol: ¿funciona? No: apágalo o mejóralo. Sí: ¿quieres cambiar algo? No: sube el original por escalones. Sí: detalle del anuncio = duplica anuncio; ubicación o puja = conjunto; país, objetivo o promo = campaña. No se duplica si es lo mismo a la misma gente, si el anuncio está cansado, si el original todavía aprende (Meta lo logra con unos 50 resultados en la semana) o si ya rinde bien dentro de su CBO.
6) Presupuesto: +20 % cada hora = No; +20 % cada 3 horas = solo con regla automática y tope diario; +20 % cada 2 o 3 días = lo más seguro; duplicar = camino Golden. Se evalúa con 72 horas, nunca 24, y con promedio de 7 días. El 20 % es regla de la práctica, no de Meta.
7) Replicar en otros BM: presupuesto bajo al empezar, cambiar pequeños detalles (nombres, orden de creativos), repartir por país, público o producto para no competir por la misma persona; solo con cuentas propias y en regla (no sirve para saltarse un bloqueo).
8) Métrica: Tasa de CPA = CPA / ticket = 1 / ROAS. Tope = margen: si te queda 40 % de cada peso, la Tasa de CPA debe estar por debajo de 40 %. En contra entrega el CPA de Meta cuenta pedidos creados, no entregados: divídelo entre la tasa de entrega para el costo real. Si vende por WhatsApp, Meta no ve el valor de la venta: se calcula con el CRM.
9) Calculadora: Margen por entregado = precio − costo − flete de ida. Techo de equilibrio = confirmación × (entrega × margen − (1 − entrega) × flete de devolución). CPA objetivo por pedido = techo − utilidad que quiere. Objetivo por conversación = CPA objetivo × cierre del bot. Tasa de CPA objetivo = CPA objetivo / precio.
10) Semáforo: VERDE escala (salió del aprendizaje, entrega real de un mes cerrado, hay stock, caja y bot, Tasa de CPA bajo el tope). AMARILLO espera (aprende o pocos datos; evaluar a las 72 horas; promedio de 7 días). ROJO frena (CPA se dispara tras una subida; frecuencia sube y clics bajan; la entrega cae al escalar). Si el resultado cae, revisar en este orden: CPM (si sube igual que el CPA es la subasta), frecuencia (más de 2,5 a 3 en siete días), creativo (CTR cae 15 a 20 % frente al arranque), chat y entrega (clics iguales y menos pedidos: bot, oferta, confirmación, zonas). Esas son reglas de la práctica, no de Meta.
11) Plan de dos semanas: días 1 a 3 mide (Tasa de CPA y tope); día 4 primer paso (sube un escalón o duplica, anotando fecha, qué tocó y cuánto); día 7 lote nuevo de 3 a 5 ideas a la campaña de prueba (nunca una sola al conjunto que escala); día 10 solo mirar; día 14 decidir (lo que funcionó se duplica con Post ID, lo demás se apaga). Se decide con entrega real y ganancia en quetzales, no solo con el ROAS de Meta. Un cambio a la vez, siempre anotado en la bitácora.

TU TRABAJO: aplica el método a los números reales del usuario que vienen en el CONTEXTO (calculadora, bitácora, plan, ventas, entrega, pauta). Cuando haya datos suficientes, da un veredicto claro (Escalar, Esperar o Frenar), el siguiente paso concreto y qué anotar en la bitácora. Si faltan datos, pide como máximo 2 (por ejemplo gasto, pedidos, entrega real, frecuencia, CPM, CTR). Señala qué es regla de Meta y qué es regla de la práctica. No inventes cifras ni digas que viste datos que no están en el contexto. Las ventas están en quetzales (Q); Meta y TikTok gastan en soles (S/). No puedes ejecutar acciones ni cambiar campañas: solo explicar y recomendar. Si preguntan algo fuera del método, responde breve y reconduce al método.`;

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
  const gkey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const key = process.env.ANTHROPIC_API_KEY, model = process.env.ASSISTANT_MODEL;
  if (!gkey && (!key || !model)) return send(503, { error: "Falta conectar el asistente: agrega GEMINI_API_KEY en Vercel y vuelve a desplegar." });
  let b;
  try {
    b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (e) {
    return send(400, { error: "json" });
  }
  const ctx = String(b.contexto || "").slice(0, 60000);
  const golden = b.modo === "golden";
  const SIS = golden ? SISTEMA_GOLDEN : SISTEMA;
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

  if (gkey) {
    try {
      const gm = process.env.GEMINI_MODEL || "gemini-3.8-flash";
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(gm) + ":generateContent", {
        method: "POST",
        headers: { "x-goog-api-key": gkey, "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SIS + "\n\nCONTEXTO ACTUAL DEL TABLERO (datos reales de hoy):\n" + ctx }] },
          contents: msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          generationConfig: { maxOutputTokens: 1200, temperature: 0.3 },
        }),
      });
      const j = await r.json();
      if (!r.ok) return send(502, { error: "El asistente no pudo responder (" + r.status + "). " + ((j && j.error && j.error.message) || "").slice(0, 160) });
      const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
      const text = parts.map((x) => x.text || "").join("\n").trim();
      return send(200, { text: text || "No tengo respuesta para eso." });
    } catch (e) {
      return send(502, { error: "No se pudo conectar con el asistente." });
    }
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        system: [
          { type: "text", text: SIS },
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
