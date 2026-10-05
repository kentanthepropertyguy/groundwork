/* ==========================================================================
   Ken Property Tools — shared analytics
   One GA4 property + one Meta Pixel across every tool/journey, with a
   consistent event vocabulary so new tools never invent their own naming.
   Load this once per page, then call KPT.setContext({...}) and KPT.track(...).
   ========================================================================== */
window.KPT = window.KPT || {};

(function () {
  const GA4_ID = "G-PGTYDENS24";
  const PIXEL_ID = "525622514314902";

  // --- GA4 (gtag.js) ------------------------------------------------------
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  (function loadGA() {
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA4_ID;
    document.head.appendChild(s);
    gtag("js", new Date());
    gtag("config", GA4_ID);
  })();

  // --- Meta Pixel ----------------------------------------------------------
  (function loadPixel() {
    if (window.fbq) return;
    const n = (window.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!window._fbq) window._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
    window.fbq("init", PIXEL_ID);
    window.fbq("track", "PageView");
  })();

  let ctx = { tool_name: null, project_name: null, tool_category: null };

  /** Set the shared params every event on this page should carry. */
  KPT.setContext = function (partial) {
    ctx = Object.assign(ctx, partial || {});
  };

  /** Fire a consistent event: project_view, tool_started, tool_completed,
   *  whatsapp_click, tiktok_click, plus whatever this journey adds — always
   *  merged with the page's tool_name/project_name/tool_category context. */
  KPT.track = function (eventName, params) {
    const payload = Object.assign({}, ctx, params || {});
    if (window.gtag) window.gtag("event", eventName, payload);
    if (window.fbq) window.fbq("trackCustom", eventName, payload);
    if (window.KPT_DEBUG) console.log("[KPT.track]", eventName, payload);
  };
})();
