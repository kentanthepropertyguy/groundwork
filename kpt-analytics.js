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
  const TOOL_ALIAS = { "worth-hdb": "hdb-value", "worth-landed": "landed-sales", "worth-landed-street": "landed-sales", "worth-condo": "condo-value", "up-ken": "upgrade-path", "journey-buy": "buy-journey", "research-journey": "research", "worth-router": "property-values", "worth": "property-values", "move-router": "move-journey", "planner-sell": "planner" };
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
    // R2.4: one whatsapp_click per tap, whichever handlers on the page report it (see the WhatsApp section below).
    if (eventName === "whatsapp_click" && !firstOfTap()) return;
    const payload = clean(Object.assign({}, ctx, params || {}));
    const tool = toolId(payload); if (tool) payload.tool = tool; // R2.2: the standard tool id, sent to GA4 and Meta
    if (eventName === "whatsapp_click" && !payload.ref) payload.ref = KPT.waRef(); // R2.4: the page's reference, as in the message
    if (window.gtag) window.gtag("event", eventName, payload);
    // Meta: the PageView above already counts the page, so the page's own page_view is not sent again (A6-12).
    if (window.fbq && eventName !== "page_view") window.fbq("trackCustom", eventName, forMeta(payload));
    // R2.4: each WhatsApp tap is also Meta's standard Contact event, once, with the same figure-free parameters.
    if (window.fbq && eventName === "whatsapp_click") window.fbq("track", "Contact", forMeta(payload));
    if (eventName === "page_view") pageViewSent = true;
    if (window.KPT_DEBUG) console.log("[KPT.track]", eventName, payload);
  };

  // ---- R2.4 (Ken, 11 Oct 2026): WhatsApp taps and enquiry references ----
  // A tap is one click. The click is followed from the top of the page (window, capture phase) to the bottom (window, bubble
  // phase), so every handler on the page has run in between. The first whatsapp_click reported during that click is sent; any
  // other is dropped. A WhatsApp link that no handler reported is reported at the end, as a header, menu, footer or page link.
  // Calls outside a click (a page reporting something by itself) are sent as before.
  const WA_LINK = /^https:\/\/(?:wa\.me|api\.whatsapp\.com)\//;
  const CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];
  let tap = null;
  function firstOfTap() { if (!tap) return true; if (tap.wa) return false; tap.wa = true; return true; }

  // The campaign a visitor arrived with, kept for this tab only (the same "kpt_attr" Research already used), on every page.
  (function saveCampaign() {
    try {
      const q = new URLSearchParams(location.search), now = {};
      CAMPAIGN_KEYS.forEach(function (n) { const v = q.get(n); if (v) now[n] = v.slice(0, 100); });
      if (Object.keys(now).length) sessionStorage.setItem("kpt_attr", JSON.stringify(now));
    } catch (e) { /* no storage: the message simply carries no campaign */ }
  })();

  // The page's reference: KPT- plus a short page code. Research adds whether a project or a comparison is open.
  const PAGE_CODES = [[/\/tools\/stamp-duty$/, "CALC-SD"], [/\/tools\/mortgage$/, "CALC-MORT"], [/\/tools\/tdsr$/, "CALC-TDSR"], [/\/tools\/msr$/, "CALC-MSR"],
    [/\/tools\/ssd$/, "CALC-SSD"], [/\/tools\/sale-proceeds$/, "CALC-SALE"], [/\/tools\/hdb-upgrade$/, "HDB-UP"],
    [/\/tools\/what-can-i-buy$/, "FIND"], [/\/tools$/, "TOOLS"], [/\/journey\/worth$/, "VALUE"], [/\/journey$/, "JOURNEY"], [/\/buy$/, "BUY"],
    [/\/research\/reports\/[a-z0-9-]+$/, "RPT"], [/\/research\/sample$/, "SAMPLE"], [/\/research$/, "RES"], [/\/projects$/, "DIR"], [/\/privacy$/, "PRIVACY"], [/^$/, "HOME"]];
  KPT.waRef = function () {
    let p = "", h = "";
    try { p = String(location.pathname || "").replace(/index\.html$/, "").replace(/\/+$/, ""); h = String(location.hash || ""); } catch (e) { /* no address */ }
    let code = "PAGE";
    for (let i = 0; i < PAGE_CODES.length; i++) if (PAGE_CODES[i][0].test(p)) { code = PAGE_CODES[i][1]; break; }
    if (code === "RES") code = /^#\/compare\//.test(h) ? "RES-CMP" : /^#\/p\//.test(h) ? "RES-PRJ" : "RES";
    return "KPT-" + code;
  };
  // The campaign as one short word pair (source/campaign), letters, digits and dashes only. A value with five or more digits
  // in a row (an amount, a phone number) is left out. A tagged link wins; an ad click id only says which network.
  function campaignWord(v) {
    const s = String(v || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
    return /[0-9]{5,}/.test(s) ? "" : s;
  }
  KPT.waCampaign = function () {
    let a = {}; try { a = JSON.parse(sessionStorage.getItem("kpt_attr") || "{}") || {}; } catch (e) { a = {}; }
    const src = campaignWord(a.utm_source), camp = campaignWord(a.utm_campaign);
    if (src || camp) return [src, camp].filter(Boolean).join("/");
    return a.gclid ? "google-ads" : a.fbclid ? "facebook" : "";
  };
  // A message's reference: an existing specific one (a report's, the sample's) is kept; the general home one (KPT-HOME, used by
  // the header on every page) becomes this page's. Nothing else in the message changes. Running it twice gives the same text.
  const REF_IN_TEXT = /[ \t]*\(Ref ([A-Za-z0-9-]+)(?: · [^)]*)?\)/;
  KPT.waTag = function (msg) {
    let m = String(msg == null ? "" : msg);
    const here = KPT.waRef(), r = m.match(REF_IN_TEXT); let code = here;
    if (r) { code = r[1] === "KPT-HOME" ? here : r[1]; m = m.replace(REF_IN_TEXT, ""); }
    const camp = KPT.waCampaign(), ref = "(Ref " + code + (camp ? " · " + camp : "") + ")";
    m = m.replace(/\s+$/, "");
    return m + (m.indexOf("\n") > -1 ? "\n\n" : m ? " " : "") + ref;
  };
  // The same for a wa.me address: only its text changes; an address without text (Ken's plain chat address) stays plain.
  KPT.waUrl = function (url) {
    const u = String(url || ""), q = u.indexOf("?"); if (!WA_LINK.test(u) || q < 0) return u;
    let found = false;
    const parts = u.slice(q + 1).split("&").map(function (p) {
      if (p.indexOf("text=") !== 0) return p;
      let t; try { t = decodeURIComponent(p.slice(5).replace(/\+/g, "%20")); } catch (e) { return p; }
      found = true; return "text=" + encodeURIComponent(KPT.waTag(t));
    });
    return found ? u.slice(0, q + 1) + parts.join("&") : u;
  };
  function linkOf(e) { const a = e && e.target && e.target.closest ? e.target.closest("a[href]") : null; return a && WA_LINK.test(a.getAttribute("href") || "") ? a : null; }
  function tapParams(a) {
    const d = a.dataset || {}, cl = a.classList || { contains: function () { return false; } };
    const placement = d.grWa || d.gwWa || (cl.contains("gw-ask") ? "header" : cl.contains("gw-mask") || a.closest(".gw-drop") ? "menu" : a.closest(".gw-foot, footer") ? "footer" : "page");
    let ref = ""; try { const t = decodeURIComponent((a.getAttribute("href").split("text=")[1] || "").split("&")[0]); ref = (t.match(REF_IN_TEXT) || [])[1] || ""; } catch (e) { ref = ""; }
    return { context: placement === "header" || placement === "menu" ? "ask-ken" : "link", placement: placement, ref: ref || KPT.waRef() };
  }
  if (typeof window.addEventListener === "function") {
    // Top of the click: a new tap, and the link's message gets its reference before the browser follows it.
    window.addEventListener("click", function (e) {
      const cur = tap = { wa: false }; setTimeout(function () { if (tap === cur) tap = null; }, 0);
      const a = linkOf(e); if (!a) return;
      const h = a.getAttribute("href"), t = KPT.waUrl(h); if (t !== h) a.setAttribute("href", t);
    }, true);
    // Bottom of the click: a WhatsApp link no handler reported is reported here.
    window.addEventListener("click", function (e) {
      const cur = tap, a = linkOf(e);
      if (a && cur && !cur.wa) KPT.track("whatsapp_click", tapParams(a));
      if (tap === cur) tap = null;
    });
  }
})();
