// Manda los pedidos a tu servidor de ECOMPRO con tu clave. Guarda el resultado para el panel.
async function cfg() { return chrome.storage.local.get({ base: "https://ecompro-iota.vercel.app", key: "", log: null, total: 0 }); }
chrome.runtime.onMessage.addListener(function (msg, sender, resp) {
  if (msg && msg.tipo === "refrescar") {
    chrome.tabs.query({ url: ["https://*.dropi.gt/*", "https://*.dropi.co/*"] }, function (tabs) {
      if (chrome.runtime.lastError) { resp({ ok: false, error: String(chrome.runtime.lastError.message) }); return; }
      if (tabs && tabs.length) {
        var t = tabs.filter(function (x) { return /order|pedido/i.test(x.url || ""); })[0] || tabs[0];
        chrome.tabs.reload(t.id, function () { resp({ ok: true, accion: "recargada", url: (t.url || "").replace(/[?#].*$/, "") }); });
      } else {
        chrome.tabs.create({ url: "https://app.dropi.gt/", active: false }, function () { resp({ ok: true, accion: "abierta" }); });
      }
    });
    return true;
  }
  if (!msg || msg.tipo !== "pedidos") return;
  (async function () {
    var c = await cfg();
    if (!c.key) { await chrome.storage.local.set({ log: { ok: false, ts: Date.now(), msg: "Falta la clave. Ábrela en el icono de la extensión." } }); chrome.action.setBadgeText({ text: "!" }); return; }
    try {
      var base = String(c.base || "").replace(/\/+$/, "");
      for (var i = 0; i < msg.orders.length; i += 200) {
        var r = await fetch(base + "/api/dropi-live", { method: "POST", headers: { "Content-Type": "application/json", "x-ec-key": c.key }, body: JSON.stringify({ orders: msg.orders.slice(i, i + 200) }) });
        var j = await r.json().catch(function () { return {}; });
        if (!r.ok) throw new Error(j.error || ("Error " + r.status));
        c.total += (j.recibidos || 0);
        await chrome.storage.local.set({ total: c.total, log: { ok: true, ts: Date.now(), msg: "Enviados " + (j.recibidos || 0) + ": " + (j.nuevos || 0) + " nuevos, " + (j.actualizados || 0) + " actualizados.", stats: msg.stats } });
      }
      chrome.action.setBadgeBackgroundColor({ color: "#16a34a" }); chrome.action.setBadgeText({ text: "OK" });
      setTimeout(function () { chrome.action.setBadgeText({ text: "" }); }, 4000);
    } catch (e) {
      await chrome.storage.local.set({ log: { ok: false, ts: Date.now(), msg: String(e && e.message || e).slice(0, 160), stats: msg.stats } });
      chrome.action.setBadgeBackgroundColor({ color: "#dc2626" }); chrome.action.setBadgeText({ text: "!" });
    }
  })();
  return false;
});
