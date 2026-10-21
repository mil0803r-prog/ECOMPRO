// Corre dentro de la página de Dropi: copia (sin alterar) las respuestas JSON de la página y las pasa a la extensión.
(function () {
  if (window.__ecDropiHook) return;
  window.__ecDropiHook = true;
  function enviar(url, texto) {
    try {
      if (!texto || texto.length > 8e6 || texto.charAt(0) !== "{" && texto.charAt(0) !== "[") return;
      window.postMessage({ src: "ecompro-dropi", url: String(url).slice(0, 300), texto: texto }, "*");
    } catch (e) {}
  }
  var of = window.fetch;
  if (of) {
    window.fetch = function () {
      var args = arguments;
      return of.apply(this, args).then(function (r) {
        try {
          var u = (args[0] && args[0].url) || args[0];
          var ct = (r.headers && r.headers.get && r.headers.get("content-type")) || "";
          if (/json/i.test(ct)) r.clone().text().then(function (t) { enviar(u, t); }).catch(function () {});
        } catch (e) {}
        return r;
      });
    };
  }
  var oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__ecu = u; return oo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    var x = this;
    x.addEventListener("load", function () {
      try {
        if (x.responseType === "" || x.responseType === "text") enviar(x.__ecu, x.responseText);
        else if (x.responseType === "json" && x.response) enviar(x.__ecu, JSON.stringify(x.response));
      } catch (e) {}
    });
    return os.apply(this, arguments);
  };
})();
