// Manda los pedidos a tu tablero de ECOMPRO con tu sesión (sin clave). Guarda el resultado para el panel.
function recargarDropi(abrir, resp) {
  chrome.tabs.query({ url: ["https://*.dropi.gt/*", "https://*.dropi.co/*"] }, function (tabs) {
    if (chrome.runtime.lastError) { resp && resp({ ok: false, error: String(chrome.runtime.lastError.message) }); return; }
    if (tabs && tabs.length) {
      var t = tabs.filter(function (x) { return /order|pedido/i.test(x.url || ""); })[0] || tabs[0];
      chrome.tabs.reload(t.id, function () { resp && resp({ ok: true, accion: "recargada", url: (t.url || "").replace(/[?#].*$/, "") }); });
    } else if (abrir) {
      chrome.tabs.create({ url: "https://app.dropi.gt/", active: false }, function () { resp && resp({ ok: true, accion: "abierta" }); });
    } else { resp && resp({ ok: false, error: "No hay una pestaña de Dropi abierta." }); }
  });
}
function programar() {
  chrome.storage.local.get({ auto: 0 }, function (c) {
    chrome.alarms.clear("auto", function () {
      var n = Math.max(0, parseInt(c.auto, 10) || 0);
      if (n >= 1) chrome.alarms.create("auto", { periodInMinutes: n });
    });
  });
}
chrome.alarms.onAlarm.addListener(function (a) { if (a && a.name === "auto") recargarDropi(false); });
chrome.runtime.onInstalled.addListener(programar);
chrome.runtime.onStartup.addListener(programar);
chrome.storage.onChanged.addListener(function (ch) { if (ch.auto) programar(); });
function avisar(ok, texto) {
  try {
    chrome.notifications.create("ec-" + Date.now(), { type: "basic", iconUrl: "icon-128.png", title: ok ? "ECOMPRO: pedidos subidos ✔" : "ECOMPRO: error ✖", message: texto, priority: 1, silent: !!ok });
  } catch (e) {}
}
// Sube datos al tablero con la sesión que ya tienes abierta en este Chrome (sin clave).
async function subir(base, body) {
  var c = await chrome.storage.local.get({ key: "" });
  var h = { "Content-Type": "application/json" };
  if (c.key) h["x-ec-key"] = c.key;
  return fetch(String(base || "").replace(/\/+$/, "") + "/api/dropi-live", { method: "POST", headers: h, credentials: "include", body: JSON.stringify(body) });
}
// Reenvía algo a las pestañas del tablero abiertas (para que el botón de huella se actualice al instante).
async function alTablero(msg) {
  var c = await chrome.storage.local.get({ base: "https://ecompro-iota.vercel.app" });
  try {
    var o = new URL(c.base).origin;
    chrome.tabs.query({ url: [o + "/*"] }, function (tabs) { (tabs || []).forEach(function (t) { chrome.tabs.sendMessage(t.id, msg, function () { void chrome.runtime.lastError; }); }); });
  } catch (e) {}
}
// Busca una pestaña de Dropi; si no hay, abre una (sin sacarte de donde estás) y espera a que cargue.
function conDropi(cb) {
  chrome.tabs.query({ url: ["https://*.dropi.gt/*", "https://*.dropi.co/*"] }, function (tabs) {
    var t = (tabs || []).filter(function (x) { return /order|pedido/i.test(x.url || ""); })[0] || (tabs || [])[0];
    if (t) { cb(t); return; }
    chrome.tabs.create({ url: "https://app.dropi.gt/", active: false }, function (nt) {
      if (!nt) { cb(null); return; }
      var hecho = false;
      function listo(id, info) { if (id === nt.id && info.status === "complete" && !hecho) { hecho = true; chrome.tabs.onUpdated.removeListener(listo); setTimeout(function () { cb(nt); }, 6000); } }
      chrome.tabs.onUpdated.addListener(listo);
      setTimeout(function () { if (!hecho) { hecho = true; chrome.tabs.onUpdated.removeListener(listo); cb(nt); } }, 25000);
    });
  });
}
async function cfg() { return chrome.storage.local.get({ base: "https://ecompro-iota.vercel.app", key: "", log: null, total: 0 }); }
chrome.runtime.onMessage.addListener(function (msg, sender, resp) {
  if (msg && msg.tipo === "refrescar") { recargarDropi(true, resp); return true; }
  if (msg && msg.tipo === "importar") {
    chrome.tabs.query({ url: ["https://*.dropi.gt/*", "https://*.dropi.co/*"] }, function (tabs) {
      var t = (tabs || []).filter(function (x) { return /order|pedido/i.test(x.url || ""); })[0] || (tabs || [])[0];
      if (!t) { resp({ ok: false, error: "Abre Dropi en una pestaña (Mis pedidos) y vuelve a intentar." }); return; }
      chrome.tabs.sendMessage(t.id, { tipo: "importar", desde: msg.desde, hasta: msg.hasta }, function (r) {
        if (chrome.runtime.lastError) { resp({ ok: false, error: "Recarga la pestaña de Dropi (Ctrl+Shift+R) y vuelve a intentar." }); return; }
        resp(r || { ok: false, error: "Sin respuesta de Dropi." });
      });
    });
    return true;
  }
  if (msg && msg.tipo === "traerHuellas") {
    chrome.tabs.query({ url: ["https://*.dropi.gt/*", "https://*.dropi.co/*"] }, function (tabs) {
      var t = (tabs || []).filter(function (x) { return /order|pedido/i.test(x.url || ""); })[0] || (tabs || [])[0];
      if (!t) { resp({ ok: false, error: "Abre Dropi en una pestaña (Mis pedidos) y vuelve a intentar." }); return; }
      chrome.tabs.sendMessage(t.id, { tipo: "traerHuellas" }, function (r) {
        if (chrome.runtime.lastError) { resp({ ok: false, error: "Recarga la pestaña de Dropi (Ctrl+Shift+R) y vuelve a intentar." }); return; }
        resp(r || { ok: false, error: "Sin respuesta de Dropi." });
      });
    });
    return true;
  }
  if (msg && msg.tipo === "huellaWeb") {
    var tel = String(msg.tel || "").replace(/\D/g, "").slice(-8);
    if (tel.length !== 8) { resp({ ok: false, error: "Este pedido no trae un teléfono válido." }); return false; }
    conDropi(function (t) {
      if (!t) { resp({ ok: false, error: "No pude abrir Dropi." }); return; }
      chrome.tabs.sendMessage(t.id, { tipo: "traerHuellas", tels: [tel] }, function (r) {
        if (chrome.runtime.lastError) { resp({ ok: false, error: "Recarga la pestaña de Dropi (Ctrl+Shift+R) y vuelve a intentar." }); return; }
        resp(r || { ok: false, error: "Sin respuesta de Dropi." });
      });
    });
    return true;
  }
  if (msg && msg.tipo === "huellaEstado") { chrome.storage.local.set({ hu: Object.assign({ ts: Date.now() }, msg.estado) }); alTablero({ tipo: "huellaEstado", estado: msg.estado }); return false; }
  if (msg && msg.tipo === "huellas") {
    alTablero({ tipo: "huellaResultado", items: (msg.items || []).slice(0, 60) });
    (async function () {
      var c = await cfg();
      try { await subir(c.base, { huellas: (msg.items || []).slice(0, 60) }); } catch (e) {}
    })();
    return false;
  }
  if (msg && msg.tipo === "prog") {
    chrome.storage.local.set({ imp: Object.assign({ ts: Date.now() }, msg.prog) });
    if (msg.prog.estado === "fin") avisar(true, "Importación lista (" + msg.prog.desde + " a " + msg.prog.hasta + "): Dropi devolvió " + msg.prog.filas + " pedidos. Se están subiendo al tablero.");
    if (msg.prog.estado === "error") avisar(false, msg.prog.error);
    return false;
  }
  if (msg && msg.tipo === "dbg") { chrome.storage.local.set({ dbg: Object.assign({ ts: Date.now() }, msg.dbg) }); return false; }
  if (!msg || msg.tipo !== "pedidos") return;
  (async function () {
    var c = await cfg();
    try {
      var base = String(c.base || "").replace(/\/+$/, "");
      var tot = { nuevos: 0, actualizados: 0 };
      for (var i = 0; i < msg.orders.length; i += 200) {
        var r = await subir(base, { orders: msg.orders.slice(i, i + 200) });
        var j = await r.json().catch(function () { return {}; });
        if (!r.ok) throw new Error(j.error || ("Error " + r.status));
        c.total += (j.recibidos || 0); tot.nuevos += (j.nuevos || 0); tot.actualizados += (j.actualizados || 0);
        await chrome.storage.local.set({ total: c.total, log: { ok: true, ts: Date.now(), msg: "Enviados " + (j.recibidos || 0) + ": " + (j.nuevos || 0) + " nuevos, " + (j.actualizados || 0) + " actualizados.", stats: msg.stats } });
      }
      avisar(true, "Listo: " + msg.orders.length + " pedidos leídos de Dropi y subidos al tablero (" + (tot.nuevos || 0) + " nuevos, " + (tot.actualizados || 0) + " actualizados).");
      chrome.action.setBadgeBackgroundColor({ color: "#16a34a" }); chrome.action.setBadgeText({ text: "OK" });
      setTimeout(function () { chrome.action.setBadgeText({ text: "" }); }, 4000);
    } catch (e) {
      await chrome.storage.local.set({ log: { ok: false, ts: Date.now(), msg: String(e && e.message || e).slice(0, 160), stats: msg.stats } });
      avisar(false, "No se pudieron subir los pedidos: " + String(e && e.message || e).slice(0, 120));
      chrome.action.setBadgeBackgroundColor({ color: "#dc2626" }); chrome.action.setBadgeText({ text: "!" });
    }
  })();
  return false;
});
