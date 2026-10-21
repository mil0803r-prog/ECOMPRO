// ==UserScript==
// @name         Guías automáticas desde ECOMPRO (Forza y Gintracom)
// @namespace    ecompro
// @version      3.0
// @description  Al abrir el rastreo de Forza o Gintracom desde ECOMPRO, escribe la guía sola. Tú resuelves el captcha y se toca Buscar.
// @match        https://rastreo.forzadelivery.com/*
// @match        https://gt.gintracom.site/*
// @run-at       document-start
// @grant        none
// @updateURL    https://ecompro-iota.vercel.app/guias.user.js
// @downloadURL  https://ecompro-iota.vercel.app/guias.user.js
// ==/UserScript==
(function () {
  "use strict";
  var KEY = "ecompro_guia";
  // 1) Capturar la guía lo antes posible (la página puede borrar el enlace al cargar).
  var g = "";
  var m = /[#&?]guia=([^&]+)/.exec((location.hash || "") + "&" + (location.search || ""));
  if (m) {
    try { g = decodeURIComponent(m[1]).trim().slice(0, 200); } catch (e) { g = ""; }
    if (g) { try { sessionStorage.setItem(KEY, JSON.stringify({ g: g, t: Date.now() })); } catch (e) {} }
  } else {
    try {
      var s = JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (s && s.g && Date.now() - s.t < 15 * 60 * 1000) g = s.g;
    } catch (e) {}
  }
  if (!g) return;

  var badge = null, hecho = false;
  function aviso(txt, boton) {
    if (!document.body) return;
    if (!badge) {
      badge = document.createElement("div");
      badge.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483647;background:#0b3a53;color:#fff;font:600 13px system-ui,sans-serif;padding:10px 12px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:300px;line-height:1.35";
      document.body.appendChild(badge);
    }
    badge.textContent = "";
    var s = document.createElement("div"); s.textContent = "ECOMPRO · " + txt; badge.appendChild(s);
    if (boton) {
      var b = document.createElement("button"); b.textContent = boton.t;
      b.style.cssText = "margin-top:8px;margin-right:6px;padding:5px 10px;border:0;border-radius:8px;background:#38c6f4;color:#04202c;font-weight:700;cursor:pointer";
      b.onclick = boton.f; badge.appendChild(b);
    }
    var c = document.createElement("button"); c.textContent = "Copiar guía";
    c.style.cssText = "margin-top:8px;padding:5px 10px;border:0;border-radius:8px;background:#e8f1f6;color:#0b3a53;font-weight:700;cursor:pointer";
    c.onclick = function () { try { navigator.clipboard.writeText(g); c.textContent = "Copiada"; } catch (e) { c.textContent = g; } };
    badge.appendChild(c);
  }
  function campo() {
    return document.querySelector('input[formcontrolname="input"]') ||
      document.querySelector("app-input input") ||
      document.querySelector('input[name*="guia" i], input[placeholder*="guía" i], input[placeholder*="guia" i], input[placeholder*="gu" i]') ||
      document.querySelector('input[type="text"], input:not([type]), input[type="search"]');
  }
  function escribir() {
    var i = campo();
    if (!i) return false;
    var set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(i, g);
    i.dispatchEvent(new Event("input", { bubbles: true }));
    i.dispatchEvent(new Event("change", { bubbles: true }));
    i.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }
  function esperarCaptcha() {
    var t0 = Date.now();
    var iv2 = setInterval(function () {
      var ta = document.querySelector('textarea[name="g-recaptcha-response"]');
      var captchaListo = !ta || (ta.value || "").length > 20;
      var b = [].slice.call(document.querySelectorAll("button")).filter(function (x) { return /rastrear|buscar/i.test(x.textContent); })[0];
      if (b && !b.disabled && captchaListo) { clearInterval(iv2); aviso("buscando la guía " + g + "…"); b.click(); }
      if (Date.now() - t0 > 180000) clearInterval(iv2);
    }, 500);
  }
  function iniciar() {
    var t0 = Date.now();
    aviso("buscando el campo de la guía…");
    var iv = setInterval(function () {
      if (escribir()) {
        clearInterval(iv); hecho = true;
        aviso("guía " + g + " escrita. Resuelve el captcha y se busca sola.");
        esperarCaptcha();
      } else if (Date.now() - t0 > 25000) {
        clearInterval(iv);
        aviso("no encontré el campo. Toca el botón o pega la guía (Ctrl+V).", { t: "Reintentar", f: function () { if (escribir()) { aviso("guía " + g + " escrita. Resuelve el captcha."); esperarCaptcha(); } else aviso("sigo sin ver el campo de la guía."); } });
      }
    }, 300);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
