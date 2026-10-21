// Manda los pedidos a tu servidor de ECOMPRO con tu clave. Guarda el resultado para el panel.
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
async function cfg() { return chrome.storage.local.get({ base: "https://ecompro-iota.vercel.app", key: "", log: null, total: 0 }); }
chrome.runtime.onMessage.addListener(function (msg, sender, resp) {
  if (msg && msg.tipo === "refrescar") { recargarDropi(true, resp); return true; }
  if (!msg || msg.tipo !== "pedidos") return;
  (async function () {
    var c = await cfg();
    if (!c.key) { await chrome.storage.local.set({ log: { ok: false, ts: Date.now(), msg: "Falta la clave. Ábrela en el icono de la extensión." } }); chrome.action.setBadgeText({ text: "!" }); avisar(false, "Falta la clave. Ábrela en el icono de la extensión."); return; }
    try {
      var base = String(c.base || "").replace(/\/+$/, "");
      var tot = { nuevos: 0, actualizados: 0 };
      for (var i = 0; i < msg.orders.length; i += 200) {
        var r = await fetch(base + "/api/dropi-live", { method: "POST", headers: { "Content-Type": "application/json", "x-ec-key": c.key }, body: JSON.stringify({ orders: msg.orders.slice(i, i + 200) }) });
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
