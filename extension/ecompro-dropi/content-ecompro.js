// Corre en tu tablero ECOMPRO: deja que el botón "Actualizar desde Dropi" le pida a la extensión recargar la pestaña de Dropi.
(function () {
  var version = chrome.runtime.getManifest().version;
  function decir(o) { window.postMessage(Object.assign({ src: "ecompro-ext" }, o), "*"); }
  window.addEventListener("message", function (ev) {
    if (ev.source !== window || !ev.data || ev.data.src !== "ecompro-page") return;
    if (ev.data.tipo === "hola") { decir({ tipo: "hola", version: version }); return; }
    if (ev.data.tipo === "huella") {
      try {
        chrome.runtime.sendMessage({ tipo: "huellaWeb", tel: ev.data.tel }, function (r) {
          var e = chrome.runtime.lastError;
          if (e || !r || !r.ok) decir({ tipo: "huellaEstado", estado: { estado: "error", error: e ? "La extensión no responde. Recarga esta página." : (r && r.error) || "Sin respuesta." } });
        });
      } catch (e) { decir({ tipo: "huellaEstado", estado: { estado: "error", error: "La extensión no responde. Recarga esta página." } }); }
      return;
    }
    if (ev.data.tipo === "actualizar") {
      try {
        chrome.runtime.sendMessage({ tipo: "refrescar" }, function (r) {
          var e = chrome.runtime.lastError;
          decir({ tipo: "resultado", ok: !e && !!(r && r.ok), accion: r && r.accion, error: e ? String(e.message) : (r && r.error) || "" });
        });
      } catch (e) { decir({ tipo: "resultado", ok: false, error: "La extensión no responde. Recarga esta página." }); }
    }
  });
  // La extensión recuerda la dirección de tu tablero sola (sin que tengas que escribirla).
  try { chrome.storage.local.set({ base: location.origin }); } catch (e) {}
  try {
    chrome.runtime.onMessage.addListener(function (m) {
      if (m && m.tipo === "huellaResultado") decir({ tipo: "huella", items: m.items });
      if (m && m.tipo === "huellaEstado") decir({ tipo: "huellaEstado", estado: m.estado });
    });
  } catch (e) {}
  decir({ tipo: "hola", version: version });
})();
