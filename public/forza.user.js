// ==UserScript==
// @name         Forza: guía automática desde ECOMPRO
// @namespace    ecompro
// @version      1.0
// @description  Al abrir el rastreo de Forza desde ECOMPRO, escribe la guía sola. Tú resuelves el captcha y se toca Rastrear.
// @match        https://rastreo.forzadelivery.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(function () {
  var m = /[#&?]guia=([^&]+)/.exec(location.hash || location.search);
  if (!m) return;
  var g = decodeURIComponent(m[1]).trim().slice(0, 200);
  if (!g) return;
  var t0 = Date.now();
  var iv = setInterval(function () {
    var i = document.querySelector('input[formcontrolname="input"]') || document.querySelector("app-input input");
    if (!i) { if (Date.now() - t0 > 20000) clearInterval(iv); return; }
    clearInterval(iv);
    var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(i, g);
    i.dispatchEvent(new Event("input", { bubbles: true }));
    i.dispatchEvent(new Event("change", { bubbles: true }));
    // Cuando resuelvas el captcha, el botón se activa y se toca solo.
    var iv2 = setInterval(function () {
      var b = [].slice.call(document.querySelectorAll("button")).filter(function (x) { return /rastrear/i.test(x.textContent); })[0];
      if (b && !b.disabled) { clearInterval(iv2); b.click(); }
      if (Date.now() - t0 > 180000) clearInterval(iv2);
    }, 500);
  }, 300);
})();
