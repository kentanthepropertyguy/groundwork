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
    if (type === 'condo' && c.condo && c.condo.q) return 'a unit at ' + c.condo.q;
    return TYPE[type];
  }

  // One step: number (or ✓ for Ken), title, text, optional meta, optional button (o.ext = an official site, opens in a new tab).
  const step = (n, t, p, o) => '<div class="gw-step' + (n === '✓' ? ' k' : '') + '"><span class="n">' + n + '</span><div><h3>' + esc(t) + '</h3>' + (p ? '<p>' + esc(p) + '</p>' : '') +
    (o && o.meta ? '<p class="meta">' + esc(o.meta) + '</p>' : '') +
    (o && o.href ? '<a class="gw-btn ' + (o.wa ? 'wa' : o.ext ? '' : 'pri') + '" href="' + esc(o.href) + '"' + (o.wa || o.ext ? ' target="_blank" rel="noopener"' : '') + (o.wa ? ' data-gw-wa="' + esc(o.wa) + '"' : '') + (o.data ? ' ' + o.data : '') + '>' + esc(o.label) + '</a>' : '') +
    (o && o.after ? '<p class="meta">' + esc(o.after) + '</p>' : '') + '</div></div>';
  const KEN_AFTER = 'Optional · your message names your home and plan, nothing about your finances.';
  const kenStep = (title_, text, msg, label, ctxName) => step('✓', title_, text, { href: wa(msg), label, wa: ctxName, after: KEN_AFTER });

  // ---- I'm thinking of moving: type is required, direction is optional and only changes order and wording ----
  function moveGuide(type, dir, r, c) {
    r = r || '../';
    if (!type) return { head: '', lead: '', steps: '', note: '' };
    c = c || {};
    const d = dir || 'unsure', S = [];
    const msg = 'Hi Ken, I own ' + ownText(type, c) + ' and I’m thinking of moving' + (dir && dir !== 'unsure' ? ' to ' + DIR[dir] : '') + '.';
    const H = type === 'hdb' && c.hdb && c.hdb.block ? c.hdb : null, Ld = type === 'landed' && c.landed && c.landed.street ? c.landed : null;
    const planner = { href: r + 'tools/hdb-upgrade/', label: 'Work out my budget ›', data: 'data-gw-go="hdb-upgrade"', meta: 'About 2 minutes · MAS loan rules and IRAS stamp duties, checked Oct 2026' + (H && H.lo !== undefined && H.hi !== undefined ? ' · it asks for your flat’s rough value' : '') };
    const find = { href: r + 'tools/what-can-i-buy/', label: 'See what it buys ›', data: 'data-gw-go="what-can-i-buy"' };
    const hdbWorth = H ? step(1, 'What flats like yours sold for', 'Blk ' + H.block + ' ' + title(H.street) + ', ' + flatLabel(H.flatType) + (H.lo !== undefined && H.hi !== undefined ? ': ' + H.n + ' recent resales, ' + money(H.lo) + ' – ' + money(H.hi) + '.' : '.'), { href: r + 'journey/worth/#hdb', label: 'See the sales again ›', data: 'data-gw-go="worth-hdb"' })
      : step(1, 'See what flats like yours sold for', 'Recent resales in your block, or on your street, from HDB’s records.', { href: r + 'journey/worth/#hdb', label: 'Look up my block ›', data: 'data-gw-go="worth-hdb"', meta: 'About 1 minute · last 2 years of HDB resales' });
    let head, lead, note = '';
    if (type === 'hdb') {
      S.push(hdbWorth);
      if (d === 'smaller') {
        head = 'Moving from your HDB flat to somewhere smaller';
        lead = 'Another HDB flat? HDB’s own calculator covers HDB loans and grants. A private home? Groundwork works out your budget.';
        S.push(step(2, 'Plan an HDB-to-HDB move with HDB', 'What you can borrow from HDB and the grants that apply.', { href: HDB_BUDGET, label: 'Open HDB’s calculator ›', ext: true, data: 'data-gw-go="hdb-budget"' }));
        S.push(step(3, 'Moving to a private home instead?', 'Your planning range if you sell first, and what limits it: income, cash or the loan rules.', planner));
      } else {
        head = 'Moving from your HDB flat';
        lead = d === 'area' ? 'Know what your flat could fetch, then your budget, then what it buys in the area you have in mind.' : 'Know what your flat could fetch, then what you could afford for a private home, then what that budget has actually bought.';
        S.push(step(2, 'Work out what you could afford next', 'Your planning range for a private home if you sell first, and what limits it: income, cash or the loan rules.', planner));
        S.push(step(3, 'See what that budget buys', 'Typical sizes at your budget and the developments with recent sales around it. Each one opens its research.', find));
        note = 'Moving to another HDB flat? HDB’s own calculator covers HDB loans and grants.';
      }
      S.push(kenStep('Talk through the timing with Ken', 'Sell first or buy first, how much to keep in reserve, and which homes fit.', msg, 'Ask Ken on WhatsApp', 'move-hdb'));
    } else if (type === 'condo') {
      const q = c.condo && c.condo.q;
      head = d === 'smaller' ? 'Moving from your condo to somewhere smaller' : 'Moving from your condo';
      lead = 'Two answers help most: what homes like yours have sold for, and what your next budget buys.';
      S.push(step(1, 'See what homes in your development sold for', 'Recent sales by size, how often homes there change hands, and how prices have moved.', { href: r + 'research/' + (q ? '?q=' + encodeURIComponent(q) : ''), label: q ? 'See ' + q + ' ›' : 'Look up my development ›', data: 'data-gw-go="research"', meta: 'URA records for private homes' }));
      S.push(step(2, 'See what your next budget buys', 'Typical sizes and the developments with recent sales around the budget you’d have after selling.', find));
      S.push(kenStep(d === 'smaller' ? 'Work out what you’d free up with Ken' : 'Talk through the move with Ken', 'Sale proceeds, CPF refunds, timing and where to buy next depend on your own loan and dates. Ken works through them with you.', msg, 'Ask Ken on WhatsApp', 'move-condo'));
      if (d === 'smaller') note = 'Thinking of an HDB flat next? HDB’s eligibility rules apply, and HDB’s calculator covers HDB loans.';
    } else {
      head = 'Moving from your landed home';
      lead = 'See recent sales on your street, then what your next budget buys. Every landed home differs, so Ken can look at yours with you.';
      S.push(step(1, Ld ? 'Sales on ' + title(Ld.street) : 'See recent sales on your street', 'URA records for your street and type of house, with the reasons one figure would mislead.', { href: r + 'journey/worth/#landed', label: Ld ? 'See the sales again ›' : 'Look up my street ›', data: 'data-gw-go="worth-landed"' }));
      S.push(step(2, 'See what your next budget buys', 'Typical sizes and the developments with recent sales around the budget you’d have after selling.', find));
      S.push(kenStep('Get an assessment of your home from Ken', 'Land size, condition and rebuild potential make every landed home different. Ken looks at yours with you.', msg, 'Ask Ken for an assessment', 'move-landed'));
    }
    return { head, lead, steps: S.join(''), note, noteHref: note ? HDB_BUDGET : '' };
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
    if (hash === 'up') { hash = 'move'; preset = 'hdb'; try { history.replaceState(null, '', '#move'); } catch (e) { /* ignore */ } }
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
      if (user) { track('journey_started', { journey: k, placement: 'journey' }); try { history.replaceState(null, '', '#' + k); } catch (e) { /* ignore */ } }
      if (scroll) { const p = panelOf(k); if (p) p.scrollIntoView({ behavior: user ? 'smooth' : 'auto', block: 'start' }); }
    };
    tabs.forEach((t) => t.addEventListener('click', (e) => { e.preventDefault(); show(t.dataset.gwPath, true, true); }));
    if (tabs.length) show(hash, false, !!hash && tabs.some((t) => t.dataset.gwPath === hash));
    window.addEventListener('hashchange', () => { const h = (location.hash || '').replace('#', ''); if (tabs.some((t) => t.dataset.gwPath === h)) show(h, true, true); });
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
  return { moveGuide, guideHtml, moveChips, step, esc, wa, ctx, ownText, HDB_BUDGET, KEN_AFTER };
});
