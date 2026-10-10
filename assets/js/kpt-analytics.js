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

  // Groundwork audit fix (Oct 2026, A6-13): GA4 and the Meta Pixel load only on the live address. Previews, local copies and
  // tests keep events in window.dataLayer (and the console when window.KPT_DEBUG is set), so they never send real hits.
  const GW_LIVE_HOST = "tools.kentanthepropertyguy.com";
  const ON_LIVE = location.hostname === GW_LIVE_HOST && !window.KPT_ANALYTICS_OFF;

  // Groundwork audit fix (A6-04, Ken's rule): no financial information in GA4, Meta Pixel or advertising events.
  // Any parameter that names a budget, price, income, loan, CPF, cash, debt or a band of them is dropped before an event leaves the page.
  const FINANCIAL = /budget|price|income|salary|loan|cpf|cash|debt|psf|amount|band|range|afford/i;
  // Audit V3-02: parameters whose VALUE describes how a visitor's budget or finances came out (out of range, too few sales near
  // the budget, no result, how many homes or which groups fit, whether an EC or a market comparison could be shown at that budget)
  // are financial information too, so they are dropped as well. Event names are unchanged.
  const OUTCOME = ["result_state", "result_bucket", "sale_groups", "shortlist_available", "shortlist_count", "data_basis", "ec_shown", "insight_count", "insight_shown", "lens", "ken_take_shown"];
  // Meta receives the event name and only these non-financial parameters; everything else stays out of the advertising tag.
  const META_PARAMS = ["tool", "page", "placement", "journey", "target"];
  function clean(params) {
    const out = {};
    Object.keys(params || {}).forEach(function (k) { if (!FINANCIAL.test(k) && OUTCOME.indexOf(k) < 0) out[k] = params[k]; });
    return out;
  }
  // R2.2: one identifier per tool, whichever page or button names it. tool_name stays as it was for GA4 reports.
  const TOOL_ALIAS = { "worth-hdb": "hdb-value", "worth-landed": "landed-sales", "worth-landed-street": "landed-sales", "worth-condo": "condo-value", "up-ken": "upgrade-path", "journey-buy": "buy-journey", "research-journey": "research", "worth-router": "property-values", "worth": "property-values", "move-router": "move-journey" };
  function toolId(params) {
    const raw = params && (params.tool || params.tool_name); if (!raw || typeof raw !== "string") return null;
    const t = raw.replace(/^calc-/, "").replace(/-ask$/, "");
    return TOOL_ALIAS[t] || t;
  }
  function forMeta(params) {
    const out = {};
    META_PARAMS.forEach(function (k) { if (params && params[k] != null && !/\$|\d{3,}/.test(String(params[k]))) out[k] = params[k]; });
    return out;
  }

  // --- GA4 (gtag.js) ------------------------------------------------------
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  if (ON_LIVE) (function loadGA() {
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA4_ID;
    document.head.appendChild(s);
    gtag("js", new Date());
    // A6-12: each page sends one page_view of its own (KPT.track("page_view", ...)), so the automatic one is switched off
    // here instead of counting every page twice. The event name is unchanged.
    gtag("config", GA4_ID, { send_page_view: false });
  })();

  // --- Meta Pixel ----------------------------------------------------------
  if (ON_LIVE) (function loadPixel() {
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
    // A6-01: no automatic button-click or page-metadata capture. Meta would otherwise read button text and link addresses,
    // which can carry a visitor's budget or home address. Must come before init.
    window.fbq("set", "autoConfig", false, PIXEL_ID);
    // Audit V3-08: one Meta PageView per page load, as in GA4. Without this the pixel counts another PageView whenever a page
    // changes its own address in place (Research's #/p/..., Guide me's #move). Read by fbevents.js when it loads, so it is set here.
    window.fbq.disablePushState = true;
    window.fbq("init", PIXEL_ID);
    window.fbq("track", "PageView");
  })();

  let ctx = { tool_name: null, project_name: null, tool_category: null };
  // A6-12: a page that doesn't send its own page_view still gets exactly one, once it has loaded.
  let pageViewSent = false;
  window.addEventListener("load", function () { if (!pageViewSent) KPT.track("page_view", {}); });

  /** Set the shared params every event on this page should carry. */
  KPT.setContext = function (partial) {
    ctx = Object.assign(ctx, partial || {});
  };

  /** Fire a consistent event: project_view, tool_started, tool_completed,
   *  whatsapp_click, tiktok_click, plus whatever this journey adds — always
   *  merged with the page's tool_name/project_name/tool_category context. */
  KPT.track = function (eventName, params) {
    const payload = clean(Object.assign({}, ctx, params || {}));
    const tool = toolId(payload); if (tool) payload.tool = tool; // R2.2: the standard tool id, sent to GA4 and Meta
    if (window.gtag) window.gtag("event", eventName, payload);
    // Meta: the PageView above already counts the page, so the page's own page_view is not sent again (A6-12).
    if (window.fbq && eventName !== "page_view") window.fbq("trackCustom", eventName, forMeta(payload));
    if (eventName === "page_view") pageViewSent = true;
    if (window.KPT_DEBUG) console.log("[KPT.track]", eventName, payload);
  };
})();
