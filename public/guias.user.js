// ==UserScript==
// @name         Guías automáticas desde ECOMPRO (Forza y Gintracom)
// @namespace    ecompro
// @version      2.0
// @description  Al abrir el rastreo de Forza o Gintracom desde ECOMPRO, escribe la guía sola. Tú resuelves el captcha y se toca Buscar.
// @match        https://rastreo.forzadelivery.com/*
// @match        https://gt.gintracom.site/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(function () {
  var m = /[#&?]guia=([^&]+)/.exec(location.hash || location.search);
  if (!m) return;
  var g = decodeURIComponent(m[1]).trim().slice(0, 200);
  if (!g) return;
  var t0 = Date.now();
  function campo() {
    return document.querySelector('input[formcontrolname="input"]') ||
      document.querySelector("app-input input") ||
      document.querySelector('input[name*="guia" i], input[placeholder*="guía" i], input[placeholder*="guia" i]') ||
      document.querySelector('input[type="text"], input:not([type])');
  }
  var iv = setInterval(function () {
    var i = campo();
    if (!i) { if (Date.now() - t0 > 20000) clearInterval(iv); return; }
    clearInterval(iv);
    var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(i, g);
    i.dispatchEvent(new Event("input", { bubbles: true }));
    i.dispatchEvent(new Event("change", { bubbles: true }));
    // Cuando resuelvas el captcha, se toca el botón de buscar.
    var iv2 = setInterval(function () {
      var ta = document.querySelector('textarea[name="g-recaptcha-response"]');
      var captchaListo = !ta || (ta.value || "").length > 20;
      var b = [].slice.call(document.querySelectorAll("button")).filter(function (x) { return /rastrear|buscar/i.test(x.textContent); })[0];
      if (b && !b.disabled && captchaListo) { clearInterval(iv2); b.click(); }
      if (Date.now() - t0 > 180000) clearInterval(iv2);
    }, 500);
  }, 300);
})();
