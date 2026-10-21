// Corre en tu tablero ECOMPRO: deja que el botón "Actualizar desde Dropi" le pida a la extensión recargar la pestaña de Dropi.
(function () {
  var version = chrome.runtime.getManifest().version;
  function decir(o) { window.postMessage(Object.assign({ src: "ecompro-ext" }, o), "*"); }
  window.addEventListener("message", function (ev) {
    if (ev.source !== window || !ev.data || ev.data.src !== "ecompro-page") return;
    if (ev.data.tipo === "hola") { decir({ tipo: "hola", version: version }); return; }
    if (ev.data.tipo === "actualizar") {
      try {
        chrome.runtime.sendMessage({ tipo: "refrescar" }, function (r) {
          var e = chrome.runtime.lastError;
          decir({ tipo: "resultado", ok: !e && !!(r && r.ok), accion: r && r.accion, error: e ? String(e.message) : (r && r.error) || "" });
        });
      } catch (e) { decir({ tipo: "resultado", ok: false, error: "La extensión no responde. Recarga esta página." }); }
    }
  });
  decir({ tipo: "hola", version: version });
})();
