var $ = function (i) { return document.getElementById(i); };
function pintar(c) {
  var l = c.log;
  $("st").innerHTML = l ? '<b class="' + (l.ok ? "ok" : "no") + '">' + (l.ok ? "Funcionando" : "Hay un problema") + "</b><br>" + (l.msg || "") + "<br><small>" + new Date(l.ts).toLocaleString("es") + " · total enviado: " + (c.total || 0) + "</small>" : "Sin datos todavía. Abre Dropi > Mis pedidos y recarga la página.";
}
chrome.storage.local.get({ base: "https://ecompro-iota.vercel.app", key: "", log: null, total: 0 }, function (c) { $("b").value = c.base; $("k").value = c.key; pintar(c); });
chrome.storage.onChanged.addListener(function () { chrome.storage.local.get({ log: null, total: 0 }, pintar); });
$("g").onclick = function () { chrome.storage.local.set({ base: $("b").value.trim(), key: $("k").value.trim() }, function () { $("st").textContent = "Guardado."; }); };
$("p").onclick = function () {
  var base = $("b").value.trim().replace(/\/+$/, ""), key = $("k").value.trim();
  $("st").textContent = "Probando…";
  fetch(base + "/api/dropi-live", { method: "POST", headers: { "Content-Type": "application/json", "x-ec-key": key }, body: JSON.stringify({ orders: [] }) })
    .then(function (r) { return r.json().then(function (j) { $("st").innerHTML = r.ok ? '<b class="ok">Conexión correcta.</b>' : '<b class="no">' + (j.error || "Error " + r.status) + "</b>"; }); })
    .catch(function () { $("st").innerHTML = '<b class="no">No se pudo conectar. Revisa la dirección.</b>'; });
};
$("d").onclick = function () {
  chrome.storage.local.get({ log: null, total: 0 }, function (c) {
    var t = JSON.stringify({ version: chrome.runtime.getManifest().version, total: c.total, log: c.log && { ok: c.log.ok, msg: c.log.msg, ts: c.log.ts, stats: c.log.stats } }, null, 1);
    navigator.clipboard.writeText(t).then(function () { $("st").textContent = "Diagnóstico copiado. Pégalo en el chat."; });
  });
};
