var $ = function (i) { return document.getElementById(i); };
function pintar(c) {
  var l = c.log;
  $("st").innerHTML = l ? '<b class="' + (l.ok ? "ok" : "no") + '">' + (l.ok ? "Funcionando" : "Hay un problema") + "</b><br>" + (l.msg || "") + "<br><small>" + new Date(l.ts).toLocaleString("es") + " · total enviado: " + (c.total || 0) + "</small>" : "Sin datos todavía. Abre Dropi > Mis pedidos y recarga la página.";
}
chrome.storage.local.get({ log: null, total: 0, auto: 0 }, function (c) { $("a").value = String(c.auto || 0); pintar(c); });
$("a").onchange = function () { chrome.storage.local.set({ auto: parseInt($("a").value, 10) || 0 }); $("st").textContent = $("a").value === "0" ? "Recarga automática apagada." : "Dropi se recargará solo cada " + $("a").value + " minutos mientras tengas una pestaña de Dropi abierta."; };
$("u").onclick = function () { $("st").textContent = "Recargando Dropi…"; chrome.runtime.sendMessage({ tipo: "refrescar" }, function (r) { $("st").textContent = r && r.ok ? (r.accion === "abierta" ? "Abrí Dropi. Entra a Mis pedidos." : "Dropi recargado. Los pedidos llegan en unos segundos.") : "No pude: " + ((r && r.error) || "sin respuesta"); }); };
(function () {
  var hoy = new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
  chrome.storage.local.get({ fd: hoy.slice(0, 8) + "01", fh: hoy }, function (c) { $("fd").value = c.fd; $("fh").value = c.fh; });
  function txt(i) {
    if (!i) return "";
    if (i.estado === "corriendo") return "Importando… " + (i.filas || 0) + " pedidos leídos (" + (i.paginas || 0) + " páginas).";
    if (i.estado === "fin") return "Listo: Dropi devolvió " + (i.filas || 0) + " pedidos del " + i.desde + " al " + i.hasta + ". Se subieron al tablero." + (i.avisoPag ? " " + i.avisoPag : "");
    if (i.estado === "error") return "No se pudo: " + i.error;
    if (i.estado === "sin-plantilla") return "Todavía no vi la lista de pedidos. Abre Mis pedidos en Dropi y espera a que cargue.";
    return "";
  }
  $("im").onclick = function () {
    var d = $("fd").value, h = $("fh").value;
    if (!d || !h || d > h) { $("st").textContent = "Elige las fechas: Desde no puede ser mayor que Hasta."; return; }
    chrome.storage.local.set({ fd: d, fh: h });
    $("st").textContent = "Pidiendo los pedidos a Dropi…";
    chrome.runtime.sendMessage({ tipo: "importar", desde: d, hasta: h }, function (r) { if (!r || !r.ok) $("st").textContent = "No pude: " + ((r && r.error) || "sin respuesta"); });
  };
  chrome.storage.onChanged.addListener(function (ch) { if (ch.imp && ch.imp.newValue) $("st").textContent = txt(ch.imp.newValue); });
})();
chrome.storage.onChanged.addListener(function (ch) { if (ch.log || ch.total) chrome.storage.local.get({ log: null, total: 0, dbg: null }, pintar); });
$("d").onclick = function () {
  chrome.storage.local.get({ log: null, total: 0, dbg: null }, function (c) {
    var t = JSON.stringify({ version: chrome.runtime.getManifest().version, total: c.total, log: c.log && { ok: c.log.ok, msg: c.log.msg, ts: c.log.ts, stats: c.log.stats }, dropi: c.dbg }, null, 1);
    navigator.clipboard.writeText(t).then(function () { $("st").textContent = "Diagnóstico copiado. Pégalo en el chat."; });
  });
};

(function () {
  function txt(i) {
    if (!i) return "";
    if (i.estado === "sin-plantilla") return "Todavía no aprendí cómo Dropi pide la huella. En Dropi abre un pedido donde se vea la Huella Digital del comprador y vuelve a pulsar.";
    if (i.estado === "sin-sesion") return "No encontré tu sesión de Dropi en esta pestaña. Recarga Dropi, entra a Mis pedidos y vuelve a pulsar.";
    if (i.estado === "corriendo") return "Trayendo huellas… " + (i.ok || 0) + " de " + (i.total || 0) + (i.fallo ? " (" + i.fallo + " sin respuesta)" : "") + ".";
    if (i.estado === "fin") return "Listo: " + (i.ok || 0) + " huellas leídas de Dropi y enviadas al tablero" + (i.fallo ? " (" + i.fallo + " sin respuesta)" : "") + ".";
    return "";
  }
  $("hu").onclick = function () {
    $("st").textContent = "Pidiendo las huellas a Dropi…";
    chrome.runtime.sendMessage({ tipo: "traerHuellas" }, function (r) { if (!r || !r.ok) $("st").textContent = "No pude: " + ((r && r.error) || "sin respuesta"); });
  };
  chrome.storage.onChanged.addListener(function (ch) { if (ch.hu && ch.hu.newValue) $("st").textContent = txt(ch.hu.newValue); });
})();
