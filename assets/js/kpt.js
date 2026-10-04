/* =====================================================================
   KEN PROPERTY TOOLS — SHARED SCRIPT (kpt.js)
   ---------------------------------------------------------------------
   Every page loads this one file. It:
     1. loads Google Analytics 4 + Meta Pixel
     2. draws the shared header, breadcrumb, footer and CTA boxes
     3. builds WhatsApp links that say which tool the enquiry came from
     4. sends standard events (tool_started, whatsapp_click, ...)
     5. fills in tool lists from data/tools.js

   You normally only edit the CONFIG block below.
   Test tracking without sending data: add ?kpt_debug=1 to any URL and
   open the browser console. Opening files from your computer never
   sends analytics.
   ===================================================================== */

(function () {
  'use strict';

  /* ---------------- CONFIG ---------------- */
  var CONFIG = {
    siteName: 'Ken Property Tools',
    siteUrl: 'https://tools.kentanthepropertyguy.com',
    ga4: 'G-PGTYDENS24',
    pixel: '525622514314902',
    whatsapp: '6590908898',
    tiktokUrl: 'https://www.tiktok.com/@kennx8898',
    tiktokHandle: '@kennx8898',
    tiktokLive: 'Live on TikTok nightly, 8–9.30pm',
    agentName: 'Ken Tan',
    brand: 'ken tan | the property guy',
    ceaReg: 'R007903D',
    agency: 'Huttons Asia Pte Ltd',
    agencyLicence: 'L3008899K'
  };

  /* Where the site root is, worked out from this script's own address.
     This is why links work on GitHub Pages AND when opened from your computer. */
  var script = document.currentScript;
  var ROOT = script ? script.src.replace(/assets\/js\/kpt\.js.*$/, '') : '/';

  var SECTIONS = {
    calculator: { label: 'Calculators', url: 'calculators/' },
    compare:    { label: 'Compare',     url: 'compare/' },
    project:    { label: 'Projects',    url: 'projects/' },
    guide:      { label: 'Guides',      url: 'guides/' }
  };

  var TOOLS = window.KPT_TOOLS || [];
  var JOURNEYS = window.KPT_JOURNEYS || [];

  var isLocal = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var DEBUG = isLocal || /[?&]kpt_debug=1/.test(location.search);
  var SEND = !isLocal;

  /* ---------------- PAGE CONTEXT ----------------
     Read from <body data-page-type="calculator" data-tool-name="..."> */
  var body = document.body;
  var d = body.dataset;
  var self = findTool(d.toolName);
  var PAGE = {
    page_type: d.pageType || (self && self.category) || 'other',
    tool_name: d.toolName || undefined,
    tool_title: d.toolTitle || (self && self.title) || document.title,
    tool_category: d.toolCategory || (self && self.category) || d.pageType || undefined,
    project_name: d.projectName || undefined
  };
  var waContext = '';
  var journeyContext = '';

  function findTool(id) {
    for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].id === id) return TOOLS[i];
    return null;
  }

  /* ---------------- ANALYTICS LOADING ---------------- */
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  if (SEND) {
    loadScript('https://www.googletagmanager.com/gtag/js?id=' + CONFIG.ga4);
    window.gtag('js', new Date());
    window.gtag('config', CONFIG.ga4);

    /* Standard Meta Pixel loader */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', CONFIG.pixel);
    window.fbq('track', 'PageView');
  }

  function loadScript(src) {
    var s = document.createElement('script'); s.async = true; s.src = src;
    document.head.appendChild(s);
  }

  /* ---------------- TRACKING ---------------- */
  function track(name, extra) {
    var p = {}, k;
    var base = { page_type: PAGE.page_type, tool_name: PAGE.tool_name, tool_category: PAGE.tool_category, project_name: PAGE.project_name };
    for (k in base) if (base[k] !== undefined && base[k] !== '') p[k] = base[k];
    for (k in (extra || {})) if (extra[k] !== undefined && extra[k] !== '') p[k] = extra[k];
    if (DEBUG) console.log('%c[KPT event] ' + name, 'color:#A8803A;font-weight:bold', p);
    if (!SEND) return;
    try { window.gtag('event', name, p); } catch (e) {}
    try { window.fbq && window.fbq('trackCustom', name, p); } catch (e) {}
  }

  var VIEW_EVENTS = { project: 'project_view', calculator: 'tool_view', compare: 'comparison_view', guide: 'guide_view' };

  var started = false, completed = false;
  function onInput(e) {
    if (started || !e.target.closest || !e.target.closest('[data-kpt-inputs]')) return;
    started = true;
    track('tool_started');
  }

  /* ---------------- WHATSAPP ---------------- */
  function waMessage() {
    var t = PAGE.tool_title, msg;
    switch (PAGE.page_type) {
      case 'calculator': msg = 'Hi Ken, I was using your ' + t + ' and would like some help with my situation.'; break;
      case 'project':    msg = 'Hi Ken, I was looking through your ' + (PAGE.project_name || t) + ' analysis and would like to understand the options.'; break;
      case 'compare':    msg = 'Hi Ken, I was using your ' + t + ' comparison and would like help comparing the numbers.'; break;
      case 'guide':      msg = 'Hi Ken, I was reading your ' + t + ' and have a few questions about my situation.'; break;
      default:
        msg = journeyContext
          ? 'Hi Ken, I\'m looking to ' + journeyContext.charAt(0).toLowerCase() + journeyContext.slice(1) + ' and would like some help working out where to start.'
          : 'Hi Ken, I was browsing your property tools and would like some help with my situation.';
    }
    if (d.waMessage) msg = d.waMessage;
    if (waContext) msg += ' ' + waContext;
    msg += ' (ref: ' + (PAGE.tool_name || PAGE.page_type) + ')';
    return msg;
  }

  function waHref() {
    return 'https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(waMessage());
  }

  function refreshWaLinks() {
    var links = document.querySelectorAll('[data-kpt-wa]');
    for (var i = 0; i < links.length; i++) {
      links[i].href = waHref();
      links[i].target = '_blank';
      links[i].rel = 'noopener';
    }
  }

  /* ---------------- HELPERS ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isExternal(t) { return /^https?:\/\//.test(t.url); }
  function href(t) { return isExternal(t) ? t.url : ROOT + t.url; }

  function fmtDate(s) {
    if (!s) return '';
    var p = s.split('-');
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (p.length === 2) return m[+p[1] - 1] + ' ' + p[0];
    return (+p[2]) + ' ' + m[+p[1] - 1] + ' ' + p[0];
  }

  var fmt = {
    money: function (n, dp) {
      if (n == null || isNaN(n)) return '—';
      return '$' + Number(n).toLocaleString('en-SG', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 });
    },
    psf: function (n) { return n == null || isNaN(n) ? '—' : '$' + Math.round(n).toLocaleString('en-SG') + ' psf'; },
    num: function (n) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-SG'); },
    pct: function (n, dp) { return n == null || isNaN(n) ? '—' : Number(n).toFixed(dp == null ? 1 : dp) + '%'; },
    date: fmtDate
  };

  /* ---------------- RENDERING ---------------- */
  var LABELS = { calculator: 'Calculator', compare: 'Comparison', project: 'Project analysis', guide: 'Guide' };

  function cardHTML(t, opts) {
    opts = opts || {};
    var live = t.status === 'live';
    var meta = [];
    meta.push('<span class="kpt-card__cat">' + esc(LABELS[t.category] || '') + '</span>');
    if (!live) meta.push('<span class="kpt-badge">Coming soon</span>');
    else if (isExternal(t)) meta.push('<span class="kpt-badge kpt-badge--out">Project site ↗</span>');
    else if (t.updated) meta.push('<span class="kpt-card__date">Updated ' + fmtDate(t.updated) + '</span>');

    var inner =
      (opts.step ? '<span class="kpt-card__step">' + opts.step + '</span>' : '') +
      '<span class="kpt-card__body">' +
        '<span class="kpt-card__meta">' + meta.join('') + '</span>' +
        '<span class="kpt-card__title">' + esc(t.title) + '</span>' +
        '<span class="kpt-card__short">' + esc(t.short) + '</span>' +
      '</span>' +
      (live ? '<span class="kpt-card__arrow" aria-hidden="true">→</span>' : '');

    var cls = 'kpt-card' + (opts.step ? ' kpt-card--step' : '') + (live ? '' : ' is-soon');
    if (!live) return '<div class="' + cls + '">' + inner + '</div>';

    var attrs = ' href="' + esc(href(t)) + '"';
    if (isExternal(t)) attrs += ' target="_blank" rel="noopener" data-kpt-out="' + esc(t.id) + '"';
    if (opts.track) attrs += ' data-kpt-related="' + esc(t.id) + '" data-kpt-related-from="' + esc(opts.track) + '"';
    return '<a class="' + cls + '"' + attrs + '>' + inner + '</a>';
  }

  function sortTools(list) {
    return list.slice().sort(function (a, b) {
      var la = a.status === 'live' ? 0 : 1, lb = b.status === 'live' ? 0 : 1;
      if (la !== lb) return la - lb;
      return (b.updated || '').localeCompare(a.updated || '');
    });
  }

  function renderHeader(el) {
    var links = ['project', 'calculator', 'compare', 'guide'].map(function (k) {
      var on = PAGE.page_type === k || PAGE.page_type === 'section-' + k ? ' aria-current="page"' : '';
      return '<a href="' + ROOT + SECTIONS[k].url + '"' + on + '>' + SECTIONS[k].label + '</a>';
    }).join('');
    el.outerHTML =
      '<header class="kpt-header"><div class="kpt-wrap kpt-header__in">' +
        '<a class="kpt-logo" href="' + ROOT + '"><span class="kpt-logo__mark" aria-hidden="true">K</span>' +
          '<span class="kpt-logo__text"><span class="kpt-logo__name">Ken Property Tools</span>' +
          '<span class="kpt-logo__by">by Ken Tan | The Property Guy</span></span></a>' +
        '<button class="kpt-menu-btn" type="button" aria-expanded="false" aria-controls="kpt-nav" aria-label="Menu">' +
          '<span></span><span></span></button>' +
        '<nav class="kpt-nav" id="kpt-nav">' + links + '</nav>' +
      '</div></header>';
    var btn = document.querySelector('.kpt-menu-btn');
    btn.addEventListener('click', function () {
      var open = document.querySelector('.kpt-header').classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function renderBreadcrumb(el) {
    var parts = ['<a href="' + ROOT + '">Home</a>'];
    var cat = PAGE.tool_category;
    if (SECTIONS[cat]) parts.push('<a href="' + ROOT + SECTIONS[cat].url + '">' + SECTIONS[cat].label + '</a>');
    parts.push('<span aria-current="page">' + esc(PAGE.tool_title) + '</span>');
    el.innerHTML = parts.join('<span class="kpt-crumb-sep" aria-hidden="true">/</span>');
    el.classList.add('kpt-breadcrumb');
    el.setAttribute('aria-label', 'Breadcrumb');
  }

  var CTA_COPY = {
    calculator: ['Want me to run this on your actual numbers?', 'These figures are estimates. Send me your situation and I\'ll work through it with you, including the parts a calculator can\'t see.'],
    project:    ['Want to understand the options for you?', 'I can walk you through which units and payment routes make sense for your budget and timeline.'],
    compare:    ['Need help comparing the numbers?', 'Tell me what you\'re weighing up and I\'ll lay out the trade-offs for your situation.'],
    guide:      ['I can help you work through your actual situation.', 'Every upgrade is different. Send me a message and I\'ll reply personally.'],
    other:      ['Want me to look at your actual situation?', 'No obligation. I reply personally.']
  };

  function renderCTA(el) {
    var copy = CTA_COPY[PAGE.page_type] || CTA_COPY.other;
    var heading = el.dataset.ctaHeading || copy[0];
    var text = el.dataset.ctaText || copy[1];
    var loc = el.dataset.cta || 'page';
    el.classList.add('kpt-cta');
    el.innerHTML =
      '<p class="kpt-cta__h">' + esc(heading) + '</p>' +
      '<p class="kpt-cta__p">' + esc(text) + '</p>' +
      '<div class="kpt-cta__actions">' +
        '<a class="kpt-btn kpt-btn--wa" data-kpt-wa data-cta="' + esc(loc) + '" href="#">' + ICON_WA + 'WhatsApp Ken</a>' +
        '<a class="kpt-btn kpt-btn--ghost" data-kpt-tiktok data-cta="' + esc(loc) + '" href="' + CONFIG.tiktokUrl + '" target="_blank" rel="noopener">' + ICON_TT + 'Ask me live, 8pm nightly</a>' +
      '</div>';
  }

  function renderFooter(el) {
    var licence = CONFIG.agencyLicence ? ' · Licence ' + CONFIG.agencyLicence : '';
    el.outerHTML =
      '<footer class="kpt-footer"><div class="kpt-wrap">' +
        '<div class="kpt-footer__top">' +
          '<div><p class="kpt-footer__name">Ken Property Tools</p>' +
          '<p class="kpt-footer__by">Singapore property research and calculators by ' + CONFIG.agentName + ', property agent since 2007.</p></div>' +
          '<div class="kpt-footer__links">' +
            ['project', 'calculator', 'compare', 'guide'].map(function (k) { return '<a href="' + ROOT + SECTIONS[k].url + '">' + SECTIONS[k].label + '</a>'; }).join('') +
            '<a href="' + CONFIG.tiktokUrl + '" target="_blank" rel="noopener" data-kpt-tiktok data-cta="footer">TikTok ' + CONFIG.tiktokHandle + '</a>' +
            '<a href="#" data-kpt-wa data-cta="footer">WhatsApp</a>' +
          '</div>' +
        '</div>' +
        '<p class="kpt-footer__legal">' + CONFIG.agentName + ' · CEA Reg ' + CONFIG.ceaReg + ' · ' + CONFIG.agency + licence + '</p>' +
        '<p class="kpt-footer__legal">Figures on this site are estimates for general information only and are not financial, legal or tax advice. Policies and prices change; verify with official sources and your bank before committing. <a href="' + ROOT + 'privacy/">Privacy</a></p>' +
        '<p class="kpt-footer__legal">© ' + new Date().getFullYear() + ' ' + CONFIG.brand + '</p>' +
      '</div></footer>';
  }

  function renderRelated(el) {
    var id = PAGE.tool_name, seen = {}, out = [];
    seen[id] = true;
    JOURNEYS.forEach(function (j) {
      if (j.tools.indexOf(id) === -1) return;
      j.tools.forEach(function (tid) {
        var t = findTool(tid);
        if (t && !seen[tid]) { seen[tid] = true; out.push(t); }
      });
    });
    out = sortTools(out).slice(0, +(el.dataset.limit || 3));
    if (!out.length) { el.hidden = true; return; }
    el.innerHTML = '<h2 class="kpt-h2">Next step</h2><div class="kpt-grid">' +
      out.map(function (t) { return cardHTML(t, { track: id }); }).join('') + '</div>';
  }

  function renderList(el) {
    var what = el.dataset.kptList, list;
    if (what === 'popular') list = TOOLS.filter(function (t) { return t.popular; });
    else list = TOOLS.filter(function (t) { return t.category === what; });
    list = sortTools(list);
    if (el.dataset.limit) list = list.slice(0, +el.dataset.limit);
    el.innerHTML = list.map(function (t) { return cardHTML(t); }).join('') ||
      '<p class="kpt-empty">New tools are being added here.</p>';
  }

  /* Homepage "What are you looking to do?" */
  function renderJourneys(el) {
    var path = document.querySelector('[data-kpt-path]');
    el.innerHTML = JOURNEYS.map(function (j, i) {
      return '<button type="button" class="kpt-journey" data-kpt-journey="' + esc(j.id) + '">' +
        '<span class="kpt-journey__n">0' + (i + 1) + '</span>' +
        '<span class="kpt-journey__label">' + esc(j.label) + '</span>' +
        '<span class="kpt-journey__hint">' + esc(j.hint) + '</span></button>';
    }).join('');

    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-kpt-journey]');
      if (!b) return;
      var j = JOURNEYS.filter(function (x) { return x.id === b.dataset.kptJourney; })[0];
      var all = el.querySelectorAll('.kpt-journey');
      for (var i = 0; i < all.length; i++) all[i].classList.toggle('is-on', all[i] === b);
      journeyContext = j.label;
      track('journey_select', { journey: j.id });
      if (!path) return;
      path.hidden = false;
      path.innerHTML =
        '<p class="kpt-path__eyebrow">Your starting path</p>' +
        '<h2 class="kpt-path__h">' + esc(j.label) + '</h2>' +
        '<div class="kpt-path__steps">' + j.tools.map(function (tid, k) {
          var t = findTool(tid); return t ? cardHTML(t, { step: k + 1, track: 'journey:' + j.id }) : '';
        }).join('') + '</div>' +
        '<p class="kpt-path__help">Not sure where to start? <a href="#" data-kpt-wa data-cta="journey">Tell me your situation on WhatsApp</a> and I\'ll point you to the right numbers.</p>';
      refreshWaLinks();
      var r = path.getBoundingClientRect();
      if (r.top > window.innerHeight * 0.7) path.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ---------------- PROJECT DATA ----------------
     Fills a project page from window.KPT_PROJECT (data/projects/<slug>.js).
     Any element can show one value:  <span data-kpt-field="developer"></span>  */
  function renderProject(p) {
    if (!p) return;
    var fields = document.querySelectorAll('[data-kpt-field]');
    for (var i = 0; i < fields.length; i++) {
      var key = fields[i].dataset.kptField, v = p[key];
      if (key === 'data_as_of') v = fmtDate(v);
      if (v != null && v !== '') fields[i].textContent = v;
    }

    var facts = document.querySelector('[data-kpt-facts]');
    if (facts && p.facts) {
      facts.innerHTML = p.facts.map(function (f) {
        return '<div class="kpt-tile"><span class="kpt-tile__label">' + esc(f.label) + '</span>' +
          '<span class="kpt-tile__value">' + esc(f.value) + '</span>' +
          (f.note ? '<span class="kpt-tile__note">' + esc(f.note) + '</span>' : '') + '</div>';
      }).join('');
    }

    var units = document.querySelector('[data-kpt-units]');
    if (units && p.unit_types) {
      units.innerHTML = '<div class="kpt-table-wrap"><table class="kpt-table"><thead><tr>' +
        '<th>Type</th><th>Size (sqft)</th><th class="num">From</th><th class="num">PSF from</th><th class="num">Available</th>' +
        '</tr></thead><tbody>' + p.unit_types.map(function (u) {
          return '<tr><td>' + esc(u.type) + '</td><td>' + esc(u.size_sqft || '—') + '</td>' +
            '<td class="num">' + fmt.money(u.price_from) + '</td><td class="num">' + fmt.psf(u.psf_from) + '</td>' +
            '<td class="num">' + (u.available == null ? '—' : fmt.num(u.available)) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    var comps = document.querySelector('[data-kpt-comparables]');
    if (comps && p.comparables) {
      var max = Math.max.apply(null, p.comparables.map(function (c) { return c.psf || 0; }).concat([p.avg_psf || 0]));
      var rows = [{ name: p.name + ' (avg)', psf: p.avg_psf, self: true }].concat(p.comparables);
      comps.innerHTML = '<div class="kpt-bars">' + rows.map(function (c) {
        var w = max ? Math.round((c.psf || 0) / max * 100) : 0;
        return '<div class="kpt-bar' + (c.self ? ' is-self' : '') + '"><span class="kpt-bar__name">' + esc(c.name) +
          (c.note ? ' <span class="kpt-bar__note">' + esc(c.note) + '</span>' : '') + '</span>' +
          '<span class="kpt-bar__track"><span class="kpt-bar__fill" style="width:' + w + '%"></span></span>' +
          '<span class="kpt-bar__val">' + fmt.psf(c.psf) + '</span></div>';
      }).join('') + '</div>';
    }

    var src = document.querySelector('[data-kpt-sources]');
    if (src && p.sources) src.textContent = 'Sources: ' + p.sources.join(' · ');
  }

  /* ---------------- ICONS ---------------- */
  var ICON_WA = '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.5-.3Z"/></svg>';
  var ICON_TT = '<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-1.8-2.5V9.7a5.7 5.7 0 1 0 4.9 5.7V9.1a7.3 7.3 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6Z"/></svg>';

  /* ---------------- START ---------------- */
  function init() {
    var el;
    if ((el = document.querySelector('[data-kpt-header]'))) renderHeader(el);
    if ((el = document.querySelector('[data-kpt-breadcrumb]'))) renderBreadcrumb(el);
    document.querySelectorAll('[data-kpt-cta]').forEach(renderCTA);
    document.querySelectorAll('[data-kpt-list]').forEach(renderList);
    if ((el = document.querySelector('[data-kpt-journeys]'))) renderJourneys(el);
    if ((el = document.querySelector('[data-kpt-next]'))) renderRelated(el);
    if (window.KPT_PROJECT) renderProject(window.KPT_PROJECT);
    if ((el = document.querySelector('[data-kpt-footer]'))) renderFooter(el);
    refreshWaLinks();

    if (VIEW_EVENTS[PAGE.page_type]) track(VIEW_EVENTS[PAGE.page_type]);

    document.addEventListener('input', onInput, true);
    document.addEventListener('change', onInput, true);

    document.addEventListener('click', function (e) {
      var a;
      if ((a = e.target.closest('[data-kpt-wa]'))) {
        a.href = waHref();
        track('whatsapp_click', { cta_location: a.dataset.cta || 'page', journey: journeyContext || undefined });
        if (SEND && window.fbq) window.fbq('track', 'Contact');
      } else if ((a = e.target.closest('[data-kpt-tiktok]'))) {
        track('tiktok_click', { cta_location: a.dataset.cta || 'page' });
      } else if ((a = e.target.closest('a[data-kpt-out]'))) {
        track('microsite_click', { target_tool: a.dataset.kptOut });
      }
      if ((a = e.target.closest('a[data-kpt-related]'))) {
        track('related_tool_click', { target_tool: a.dataset.kptRelated, from: a.dataset.kptRelatedFrom });
      }
    });
  }

  /* ---------------- PUBLIC API (used by individual tools) ---------------- */
  window.KPT = {
    config: CONFIG,
    root: ROOT,
    track: track,
    fmt: fmt,
    /* Call whenever a tool shows its result. Fires tool_completed once per
       visit, and only after the visitor has changed an input themselves
       (so the default numbers shown on page load don't count). */
    completed: function (params) {
      if (completed || !started) return;
      completed = true;
      track('tool_completed', params);
    },
    /* Adds a short note to the WhatsApp message, e.g. "My estimate was $1.4m." */
    setWaContext: function (text) { waContext = text || ''; refreshWaLinks(); },
    renderProject: renderProject
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
