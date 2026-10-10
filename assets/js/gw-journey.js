/* ==========================================================================
   GROUNDWORK — Guided journey (R1, Ken 9 Oct 2026). Routing and wording only: no calculations here.
   Three paths, sorted by what the visitor will do:
     /journey/#buy   I'm looking to buy        (not selling a home)
     /journey/#move  I'm thinking of moving    (selling and buying)
     /journey/worth/ What's my home worth?     (selling, or just checking: recent sales, gw-value.js)
   Old links keep working: #up opens the moving path with "HDB flat" chosen; #own goes to /journey/worth/.
   Journey context (GWJ.ctx): what the visitor has told any Groundwork page in this browser tab (home type, block or street),
   so the next page doesn't ask again. sessionStorage only, cleared when the tab closes, never sent to analytics.
   Later releases add to it (sale proceeds, budget); every field is optional and every page works without it.
   WhatsApp messages name the home and the plan only, never finances.
   UMD: window.GWJ in the browser; Node uses the same functions to write the default HTML at build time.
   ========================================================================== */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GWJ = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PHONE = '6590908898';
  const wa = (msg) => 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(msg);
  // Official HDB page (a handover, not a Groundwork tool).
  const HDB_BUDGET = 'https://www.hdb.gov.sg/cs/infoweb/residential/buying-a-flat/working-out-your-flat-budget/budget-for-flat';
  const TYPE = { hdb: 'an HDB flat', condo: 'a private condo', landed: 'a landed home' };
  const DIR = { bigger: 'somewhere bigger', smaller: 'somewhere smaller', area: 'a different area', unsure: 'not sure yet' };
  const title = (s) => String(s).toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (x, a, b) => a + b.toUpperCase());
  const flatLabel = (t) => /^\d ROOM$/.test(t) ? t[0] + '-room' : title(t);
  const LHOUSE = { T: 'a terrace house', S: 'a semi-detached house', D: 'a detached house', ST: 'a strata terrace house', SS: 'a strata semi-detached house', SD: 'a strata detached house' };
  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

  // ---- journey context: this tab only ----
  const KEY = 'gw.ctx.v1';
  const ctx = {
    get() { try { const j = JSON.parse(root.sessionStorage.getItem(KEY) || '{}'); return j && typeof j === 'object' ? j : {}; } catch (e) { return {}; } },
    set(patch) { try { const j = Object.assign(ctx.get(), patch, { v: 1 }); root.sessionStorage.setItem(KEY, JSON.stringify(j)); return j; } catch (e) { return patch; } },
  };
  // What the visitor owns, in words, from the context when it matches the chosen type ("a 4-room HDB flat at Blk 612B Punggol Dr").
  function ownText(type, c) {
    c = c || {};
    if (type === 'hdb' && c.hdb && c.hdb.block) return 'a ' + flatLabel(c.hdb.flatType) + ' HDB flat at Blk ' + c.hdb.block + ' ' + title(c.hdb.street);
    if (type === 'landed' && c.landed && c.landed.street && LHOUSE[c.landed.ltype]) return LHOUSE[c.landed.ltype] + ' on ' + title(c.landed.street);
    return TYPE[type];
  }

  // One step: number (or ✓ for Ken), title, text, optional meta, optional button (o.ext = an official site, opens in a new tab).
  const step = (n, t, p, o) => '<div class="gw-step' + (n === '✓' ? ' k' : '') + '"><span class="n">' + n + '</span><div><h3>' + esc(t) + '</h3>' + (p ? '<p>' + esc(p) + '</p>' : '') +
    (o && o.meta ? '<p class="meta">' + esc(o.meta) + '</p>' : '') +
    (o && o.href ? '<a class="gw-btn ' + (o.wa ? 'wa' : o.ext ? '' : 'pri') + '" href="' + esc(o.href) + '"' + (o.wa || o.ext ? ' target="_blank" rel="noopener"' : '') + (o.wa ? ' data-gw-wa="' + esc(o.wa) + '"' : '') + (o.data ? ' ' + o.data : '') + '>' + esc(o.label) + '</a>' : '') +
    (o && o.after ? '<p class="meta">' + esc(o.after) + '</p>' : '') + '</div></div>';
  const KEN_AFTER = 'Optional · your message names your home and plan, nothing about your finances.';
  // Audit fix A6-03: these messages can name the visitor's block and street, so the link keeps only Ken's chat address
  // (analytics read link addresses). The message is kept here and opened only when the visitor taps (gw-wa.js).
  const NEUTRAL = 'https://wa.me/' + PHONE, MSG = {};
  const kenStep = (title_, text, msg, label, ctxName) => { MSG[ctxName] = msg; return step('✓', title_, text, { href: NEUTRAL, label, wa: ctxName, after: KEN_AFTER }); };
  const messageFor = (ctxName) => (MSG[ctxName] ? wa(MSG[ctxName]) : null);

  // ---- I'm thinking of moving: type is required, direction is optional and only changes order and wording ----
  function moveGuide(type, dir, r, c) {
    r = r || '../';
    if (!type) return { head: '', lead: '', steps: '', note: '' };
    c = c || {};
    const d = dir || 'unsure', S = [];
    const msg = 'Hi Ken, I own ' + ownText(type, c) + ' and I’m thinking of moving' + (dir && dir !== 'unsure' ? ' to ' + DIR[dir] : '') + '.';
    const H = type === 'hdb' && c.hdb && c.hdb.block ? c.hdb : null, Ld = type === 'landed' && c.landed && c.landed.street ? c.landed : null;
    const planner = { href: r + 'tools/hdb-upgrade/', label: 'Work out my budget ›', data: 'data-gw-go="hdb-upgrade"' };
    const find = { href: r + 'tools/what-can-i-buy/', label: 'See what it buys ›', data: 'data-gw-go="what-can-i-buy"' };
    // R2.1: the sale proceeds calculator sits between "what it could fetch" and "what I can afford". Figures typed there fill the planner (this tab only).
    const proceeds = (n, kind) => step(n, 'Work out your sale proceeds', 'Cash and CPF back, after the loan and costs.', { href: r + 'tools/sale-proceeds/#' + kind, label: 'Work out my sale proceeds ›', data: 'data-gw-go="sale-proceeds"' });
    const hdbWorth = H ? step(1, 'What flats like yours sold for', 'Blk ' + H.block + ' ' + title(H.street) + ', ' + flatLabel(H.flatType) + (H.lo !== undefined && H.hi !== undefined ? ': ' + H.n + ' recent resales, ' + money(H.lo) + ' – ' + money(H.hi) + '.' : '.'), { href: r + 'journey/worth/#hdb', label: 'See the sales again ›', data: 'data-gw-go="worth-hdb"' })
      : step(1, 'See what flats like yours sold for', 'Recent resales in your block.', { href: r + 'journey/worth/#hdb', label: 'Look up my block ›', data: 'data-gw-go="worth-hdb"' });
    let head, lead, note = '';
    if (type === 'hdb') {
      S.push(hdbWorth);
      if (d === 'smaller') {
        head = 'Moving from your HDB flat to somewhere smaller';
        lead = 'Another HDB flat? HDB’s own calculator covers HDB loans and grants. A private home? Groundwork works out your budget.';
        S.push(proceeds(2, 'hdb'));
        S.push(step(3, 'Plan an HDB-to-HDB move with HDB', 'What you can borrow from HDB and the grants that apply.', { href: HDB_BUDGET, label: 'Open HDB’s calculator ›', ext: true, data: 'data-gw-go="hdb-budget"' }));
        S.push(step(4, 'Moving to a private home instead?', 'Your range for a private home, if you sell first.', planner));
      } else {
        head = 'Moving from your HDB flat';
        lead = 'Four steps: what it could fetch, your cash and CPF, your budget, and what it buys' + (d === 'area' ? ' in the area you have in mind.' : '.');
        S.push(proceeds(2, 'hdb'));
        S.push(step(3, 'Work out your budget', 'Your range for a private home. Step 2’s sale price, loan and CPF refund are filled in.', planner));
        S.push(step(4, 'See what it buys', 'Sizes and developments at that budget.', find));
        note = 'Moving to another HDB flat? HDB’s own calculator covers HDB loans and grants.';
      }
      S.push(kenStep('Talk through the timing with Ken', 'Sell first or buy first, how much to keep in reserve, and which homes fit.', msg, 'Ask Ken on WhatsApp', 'move-hdb'));
    } else if (type === 'condo') {
      // R2.1: no typed text goes into a link; the development is picked with the search on Research.
      head = d === 'smaller' ? 'Moving from your condo to somewhere smaller' : 'Moving from your condo';
      lead = 'What homes like yours sold for, then what your next budget buys.';
      S.push(step(1, 'See what homes in your development sold for', 'Recent sales by size in your development.', { href: r + 'research/', label: 'Look up my development ›', data: 'data-gw-go="research"' }));
      S.push(proceeds(2, 'private'));
      S.push(step(3, 'See what your next budget buys', 'Sizes and developments at the budget you’d have.', find));
      S.push(kenStep(d === 'smaller' ? 'Work out what you’d free up with Ken' : 'Talk through the move with Ken', 'Sale proceeds, CPF refunds, timing and where to buy next depend on your own loan and dates. Ken works through them with you.', msg, 'Ask Ken on WhatsApp', 'move-condo'));
      if (d === 'smaller') note = 'Thinking of an HDB flat next? HDB’s eligibility rules apply, and HDB’s calculator covers HDB loans.';
    } else {
      head = 'Moving from your landed home';
      lead = 'Sales on your street, then what your next budget buys. Every landed home differs, so Ken can look at yours with you.';
      S.push(step(1, Ld ? 'Sales on ' + title(Ld.street) : 'See recent sales on your street', 'Sales on your street, by type of house.', { href: r + 'journey/worth/#landed', label: Ld ? 'See the sales again ›' : 'Look up my street ›', data: 'data-gw-go="worth-landed"' }));
      S.push(proceeds(2, 'private'));
      S.push(step(3, 'See what your next budget buys', 'Sizes and developments at the budget you’d have.', find));
      S.push(kenStep('Get an assessment of your home from Ken', 'Land size, condition and rebuild potential make every landed home different. Ken looks at yours with you.', msg, 'Ask Ken for an assessment', 'move-landed'));
    }
    return { head, lead, steps: S.join(''), note, noteHref: note ? HDB_BUDGET : '' };
  }

  // R2.1: "Upgrade from HDB" is its own four-step path. Each step is a page that also works on its own; figures carry over in this tab.
  // The page marks finished steps and points the main button at the next one (gw-nav.js reads this tab's progress).
  const UP_STEPS = [
    ['worth', 'What your flat could fetch', 'Recent resales in your block', 'journey/worth/#hdb', 'Start: look up my block'],
    ['sale-proceeds', 'Your sale proceeds', 'Cash and CPF back, after the loan and costs', 'tools/sale-proceeds/#hdb', 'Next: work out my sale proceeds'],
    ['hdb-upgrade', 'Your budget', 'What you could afford for a private home', 'tools/hdb-upgrade/', 'Next: work out my budget'],
    ['what-can-i-buy', 'What it buys', 'Sizes and developments at that budget', 'tools/what-can-i-buy/', 'Next: see what it buys'],
  ];
  function upPanel(r) {
    return '<section class="gw-panel gw-up" id="up" data-gw-panel="up" data-gw-up aria-labelledby="gwUpH"><div class="gw-ph"><p class="gw-kicker">Upgrade from HDB</p><h2 id="gwUpH">Four steps to your next home</h2>' +
      '<p class="gw-sub">Your figures carry from one step to the next, in this browser tab only.</p></div>' +
      '<ol class="gw-upsteps">' + UP_STEPS.map((x, i) => '<li data-up-step="' + x[0] + '"' + (i === 0 ? ' class="now"' : '') + '><a href="' + r + x[3] + '" data-gw-go="up-' + x[0] + '"><i aria-hidden="true">' + (i + 1) + '</i><span><b>' + esc(x[1]) + '</b><small>' + esc(x[2]) + '</small></span></a></li>').join('') + '</ol>' +
      '<a class="gw-btn pri gw-upgo" href="' + r + UP_STEPS[0][3] + '" data-gw-up-go data-gw-go="up-worth">' + esc(UP_STEPS[0][4]) + ' ›</a>' +
      '<div class="gw-upmore"><a href="' + esc(wa('Hi Ken, I own an HDB flat and I’m thinking of upgrading. Could we talk it through?')) + '" target="_blank" rel="noopener" data-gw-wa="up-ken">Talk it through with Ken on WhatsApp ›</a>' +
      '<span>Not upgrading from HDB? <a href="#buy" data-gw-go="buy-path">Buying</a> · <a href="#move" data-gw-go="move-path">Other moves</a> · <a href="' + r + 'journey/worth/" data-gw-go="worth">HDB and home prices</a></span></div></section>';
  }
  function guideHtml(g) {
    if (!g.head) return '<p class="gw-fine">Choose one to see your next steps.</p>';
    return '<div class="gw-own-out"><h3 class="gw-out-h">' + esc(g.head) + '</h3><p class="gw-out-l">' + esc(g.lead) + '</p>' +
      '<div>' + g.steps + '</div>' +
      (g.note ? '<p class="gw-fine">' + esc(g.note) + (g.noteHref ? ' <a href="' + esc(g.noteHref) + '" target="_blank" rel="noopener" data-gw-go="hdb-budget">Open HDB’s calculator ›</a>' : '') + '</p>' : '') + '</div>';
  }
  const chip = (q, v, t) => '<button type="button" class="gw-chip" data-gw-q="' + q + '" data-gw-v="' + v + '" aria-pressed="false">' + t + '</button>';
  function moveChips() {
    return '<div class="gw-tile gw-qs"><div class="gw-q"><span class="l">What do you own now?</span><div class="gw-chips" role="group" aria-label="What do you own now?">' + chip('type', 'hdb', 'HDB flat') + chip('type', 'condo', 'Condo or apartment') + chip('type', 'landed', 'Landed home') + '</div></div>' +
      '<div class="gw-q" data-gw-q2><span class="l">Where are you heading? <span class="gw-opt">Optional</span></span><div class="gw-chips" role="group" aria-label="Where are you heading?">' + chip('dir', 'bigger', 'Somewhere bigger') + chip('dir', 'smaller', 'Somewhere smaller') + chip('dir', 'area', 'A different area') + chip('dir', 'unsure', 'Not sure yet') + '</div></div></div>';
  }

  /* ---------- browser behaviour ---------- */
  function mount() {
    if (typeof document === 'undefined') return;
    const KPT = root.KPT || { track: function () {} }, track = (n, p) => { try { KPT.track(n, p || {}); } catch (e) { /* analytics unavailable */ } };
    const rootPath = (document.body && document.body.dataset.root) || '../';
    let hash = (location.hash || '').replace('#', '');
    // Old links: #own → the worth page; #up → moving, with "HDB flat" chosen.
    if (hash === 'own' && document.querySelector('[data-gw-path]')) { location.replace(rootPath + 'journey/worth/'); return; }
    let preset = null;
    // #up (the homepage's "Upgrade from HDB") opens the four-step path directly; older #up links land there too.
    const C = ctx.get();
    if (!preset && TYPE[C.type]) preset = C.type; // the home type this tab already gave us
    // Path choices on /journey/: buy and move open a panel below; "worth" is its own page and a plain link.
    // Nothing is open until the visitor chooses (or arrives with #buy / #move).
    const tabs = [].slice.call(document.querySelectorAll('[data-gw-path]'));
    const panelOf = (k) => document.querySelector('[data-gw-panel="' + k + '"]');
    const show = (k, user, scroll) => {
      if (!tabs.length) return;
      const ok = tabs.some((t) => t.dataset.gwPath === k);
      tabs.forEach((t) => t.setAttribute('aria-expanded', String(ok && t.dataset.gwPath === k)));
      document.querySelectorAll('[data-gw-panel]').forEach((p) => { p.hidden = !ok || p.dataset.gwPanel !== k; });
      if (!ok) return;
      // Audit fix A5-09: only the upgrade choice keeps the four-step upgrade path; any other choice leaves it.
      if (k === 'up') ctx.set({ type: 'hdb', path: 'upgrade' }); else ctx.set({ path: null });
      // Audit fix A5-24: a new history entry, so Back returns to the choices instead of leaving the page.
      if (user) { track('journey_started', { journey: k, placement: 'journey' }); try { if (location.hash !== '#' + k) history.pushState(null, '', '#' + k); } catch (e) { /* ignore */ } }
      if (scroll) { const p = panelOf(k); if (p) p.scrollIntoView({ behavior: user ? 'smooth' : 'auto', block: 'start' }); }
    };
    tabs.forEach((t) => t.addEventListener('click', (e) => { e.preventDefault(); show(t.dataset.gwPath, true, true); }));
    if (tabs.length) show(hash, false, !!hash && tabs.some((t) => t.dataset.gwPath === hash));
    const backToChoices = () => { show('', false, false); const n = document.querySelector('.gw-paths'); if (n) n.scrollIntoView({ block: 'start' }); };
    const onHash = () => { const h = (location.hash || '').replace('#', ''); if (tabs.some((t) => t.dataset.gwPath === h)) show(h, true, true); else if (!h && tabs.length) backToChoices(); };
    window.addEventListener('hashchange', onHash);
    // "What's my home worth?" (HDB and home prices) and "Not upgrading from HDB?" links are other journeys: they leave the upgrade path (A5-09).
    document.querySelectorAll('.gw-path-link, [data-gw-go="worth"]').forEach((a) => a.addEventListener('click', () => ctx.set({ path: null })));
    // The moving guide's "Ask Ken" message is opened on tap, never put in the link (A6-03).
    if (root.GW_WA) root.GW_WA.on('a[data-gw-wa^="move-"]', (a) => messageFor(a.dataset.gwWa));
    // The moving guide: type is required; the optional direction appears once a type is chosen.
    document.querySelectorAll('[data-gw-guide="move"]').forEach((g) => {
      const out = g.querySelector('[data-gw-out]'), q2 = g.querySelector('[data-gw-q2]'), state = { type: null, dir: null };
      if (q2) q2.hidden = true;
      const render = () => { out.innerHTML = guideHtml(moveGuide(state.type, state.dir, rootPath, ctx.get())); };
      const pick = (b, user) => {
        const q = b.dataset.gwQ, v = b.dataset.gwV;
        g.querySelectorAll('[data-gw-q="' + q + '"]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        state[q] = v; if (q2 && state.type) q2.hidden = false; render();
        if (q === 'type' && user) ctx.set({ type: v });
        if (user) { track('tool_started', { tool_name: 'move-router', step: q, value: v, owned_type: state.type || undefined }); if (state.type && q === 'type') { const h = out.querySelector('.gw-out-h'); if (h) { const rc = h.getBoundingClientRect(); if (rc.top > window.innerHeight * 0.7) h.scrollIntoView({ behavior: 'smooth', block: 'center' }); } } }
      };
      g.querySelectorAll('[data-gw-q]').forEach((b) => b.addEventListener('click', () => pick(b, true)));
      if (preset) { const b = g.querySelector('[data-gw-q="type"][data-gw-v="' + preset + '"]'); if (b) pick(b, false); }
    });
    // WhatsApp and onward links are tracked with the existing event names.
    document.addEventListener('click', (e) => {
      const a = e.target.closest ? e.target.closest('[data-gw-wa],[data-gw-go]') : null; if (!a) return;
      if (a.dataset.gwWa) track('whatsapp_click', { tool_name: a.dataset.gwWa, context: a.dataset.gwWa });
      else track('tool_selected', { tool: a.dataset.gwGo, placement: document.body.dataset.view || 'journey' });
    });
  }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount(); }
  return { UP_STEPS, upPanel, moveGuide, guideHtml, moveChips, step, esc, wa, ctx, ownText, HDB_BUDGET, KEN_AFTER, NEUTRAL, messageFor };
});
