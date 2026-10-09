/* ==========================================================================
   GROUNDWORK — Guided journey (Phase 1). Presentation and routing only: no calculations.
   - /journey/: three paths (buy, up, own) shown as tabs; the hash (#buy, #up, #own) opens one.
   - /own/ and the "own" path: the owner guide adapts to what you own and what is on your mind,
     and only ever points to tools that exist. Nothing here leads to a dead end.
   UMD: window.GWJ in the browser; Node uses ownGuide() to write the same default HTML at build time.
   ========================================================================== */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GWJ = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PHONE = '6590908898';
  const wa = (msg) => 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(msg);
  const TYPE = { hdb: 'HDB flat', condo: 'private condo', landed: 'landed home' };
  const INTENT = { upgrading: 'thinking about upgrading', selling: 'thinking about selling', checking: 'just checking where I stand' };

  // One step: number (or ✓ for Ken), title, text, optional meta, optional button.
  const step = (n, t, p, o) => '<div class="gw-step' + (n === '✓' ? ' k' : '') + '"><span class="n">' + n + '</span><div><h3>' + esc(t) + '</h3><p>' + esc(p) + '</p>' +
    (o && o.meta ? '<p class="meta">' + esc(o.meta) + '</p>' : '') +
    (o && o.href ? '<a class="gw-btn ' + (o.wa ? 'wa' : 'pri') + '" href="' + esc(o.href) + '"' + (o.wa ? ' target="_blank" rel="noopener" data-gw-wa="' + esc(o.wa) + '"' : '') + (o.data ? ' ' + o.data : '') + '>' + esc(o.label) + '</a>' : '') +
    (o && o.after ? '<p class="meta">' + esc(o.after) + '</p>' : '') + '</div></div>';

  // The owner guide. root = path from the page to the site root ("../").
  function ownGuide(type, intent, rootPath) {
    const r = rootPath || '../', hdb = type === 'hdb', landed = type === 'landed';
    const msg = type && intent ? 'Hi Ken, I own a ' + TYPE[type] + " and I'm " + INTENT[intent] + '.' : "Hi Ken, I own a property and I'd like your view on my options.";
    const research = { href: r + 'research/', label: 'Look up my development ›', data: 'data-gw-go="research"' };
    const find = { href: r + 'tools/what-can-i-buy/', label: 'See what my next budget buys ›', data: 'data-gw-go="what-can-i-buy"' };
    const upgrade = { href: r + 'tools/hdb-upgrade/?from=own', label: 'Work out my upgrade ›', data: 'data-gw-go="hdb-upgrade"' };
    let head, lead, steps = [], note = '';
    if (!type || !intent) {
      head = 'Know where your home stands, then decide.';
      lead = 'Tell us what you own and what is on your mind. We will show what you can work out here today, in the order that helps.';
      return { head, lead, steps: '', note: '', msg };
    }
    if (intent === 'upgrading') { head = hdb ? 'Upgrading from an HDB flat: start with your planning range.' : 'Before you upgrade, know your numbers on both sides.'; }
    else if (intent === 'selling') head = 'Before you sell, know where your home stands.';
    else head = 'See where your home stands today.';
    if (hdb) {
      lead = intent === 'upgrading' ? 'Start with one number: what you could afford for a private home if you sell your flat first. Then see what that budget has actually bought.'
        : 'If you are thinking of moving to a private home, the useful first number is what you could afford after selling. Groundwork covers private-home sales; HDB resale prices are published by HDB.';
      steps.push(step(1, 'Work out what you could afford if you sold', 'Your planning range for a private home, the monthly instalment, and what is limiting it: income, cash or the loan rules.', Object.assign({ meta: 'About 2 minutes · your flat’s rough value, loan left, age and income' }, upgrade)));
      steps.push(step(2, 'See what that budget buys', 'Typical sizes at your budget for older and newer homes, and the developments with recent sales around it.', find));
    } else if (landed) {
      lead = intent === 'checking' ? 'Groundwork does not analyse landed homes yet, so the quickest way to see where your home stands is to ask Ken.' : 'Groundwork does not analyse landed homes yet. What it can show is what your next budget would buy, if you are moving.';
      if (intent !== 'checking') steps.push(step(1, 'See what your next budget buys', 'Typical sizes and developments with recent sales around the budget you would have after selling.', find));
      note = 'Landed values are not analysed on Groundwork yet.';
    } else {
      lead = intent === 'checking' ? 'The clearest picture comes from recent sales of homes like yours in your own development, and how they have moved.'
        : 'Two answers help most: what similar homes in your development have sold for recently, and what your next budget would buy.';
      steps.push(step(1, 'See what homes in your development have sold for', 'Recent sales for your size, how often homes there change hands, and how prices have moved over five years.', Object.assign({ meta: 'URA sales records for private developments' }, research)));
      if (intent === 'checking') steps.push(step(2, 'Compare it with a development you are considering', 'From your development’s page, choose “Compare” to set it against any other, fairly.', null));
      else steps.push(step(2, 'If you are moving, see what your next budget buys', 'Typical sizes and developments with recent sales around the budget you would have after selling.', find));
      if (intent === 'upgrading') note = 'The upgrade calculator covers HDB owners for now.';
      if (intent === 'selling') note = 'A sale-proceeds calculator is not available on Groundwork yet.';
    }
    const kenText = intent === 'selling' ? 'Sale proceeds, timing, Seller’s Stamp Duty and where to buy next depend on your loan, CPF and dates. Ken works through them with you personally.'
      : intent === 'upgrading' ? 'Timing the sale and the purchase, how much to keep in reserve, and which developments fit. Ken works through them with you personally.'
        : 'If you want a view on what your home could fetch, or whether now is a good time to move, Ken can talk it through with you.';
    steps.push(step('✓', intent === 'selling' ? 'Get a selling review from Ken' : 'Talk it through with Ken', kenText, { href: wa(msg), label: intent === 'selling' ? 'Ask Ken for a selling review' : 'Ask Ken on WhatsApp', wa: 'own-router', after: 'Your message says what you own and what is on your mind. Nothing about your finances.' }));
    return { head, lead, steps: steps.join(''), note, msg };
  }
  function ownHtml(g) {
    return '<div class="gw-own-out"><h2>' + esc(g.head) + '</h2><p class="gw-sub" style="color:var(--gw-body);margin-top:10px">' + esc(g.lead) + '</p>' + (g.steps ? '<div style="margin-top:8px">' + g.steps + '</div>' : '') + (g.note ? '<p class="gw-fine">' + esc(g.note) + '</p>' : '') + '</div>';
  }
  function ownChips() {
    const c = (grp, k, t) => '<button type="button" class="gw-chip" data-gw-' + grp + '="' + k + '" aria-pressed="false">' + t + '</button>';
    return '<div class="gw-tile" style="gap:14px"><div class="gw-q"><span class="l">What do you own?</span><div class="gw-chips" role="group" aria-label="What do you own?">' + c('type', 'hdb', 'HDB flat') + c('type', 'condo', 'Private condo') + c('type', 'landed', 'Landed') + '</div></div>' +
      '<div class="gw-q"><span class="l">What’s on your mind?</span><div class="gw-chips" role="group" aria-label="What’s on your mind?">' + c('intent', 'upgrading', 'Thinking about upgrading') + c('intent', 'selling', 'Thinking about selling') + c('intent', 'checking', 'Just checking where I stand') + '</div></div></div>';
  }

  /* ---------- browser behaviour ---------- */
  function mount() {
    if (typeof document === 'undefined') return;
    const KPT = root.KPT || { track: function () {} }, track = (n, p) => { try { KPT.track(n, p || {}); } catch (e) { /* analytics unavailable */ } };
    const rootPath = (document.body && document.body.dataset.root) || '../';
    // Tabs on /journey/
    const tabs = [].slice.call(document.querySelectorAll('[data-gw-path]'));
    const show = (k, user) => {
      if (!tabs.length) return; if (!tabs.some((t) => t.dataset.gwPath === k)) k = tabs[0].dataset.gwPath;
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.gwPath === k)));
      document.querySelectorAll('[data-gw-panel]').forEach((p) => { p.hidden = p.dataset.gwPanel !== k; });
      if (user) { track('journey_started', { journey: k, placement: 'journey' }); try { history.replaceState(null, '', '#' + k); } catch (e) { /* ignore */ } }
    };
    tabs.forEach((t) => t.addEventListener('click', (e) => { e.preventDefault(); show(t.dataset.gwPath, true); if (window.matchMedia && window.matchMedia('(max-width:719px)').matches) { const p = document.querySelector('[data-gw-panel="' + t.dataset.gwPath + '"]'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }));
    if (tabs.length) show((location.hash || '').replace('#', '') || tabs[0].dataset.gwPath, false);
    // Owner guide (on /journey/#own and on /own/)
    const host = document.querySelector('[data-gw-own]'); let type = null, intent = null;
    if (host) {
      document.querySelectorAll('[data-gw-type],[data-gw-intent]').forEach((b) => b.addEventListener('click', () => {
        const grp = b.dataset.gwType ? 'type' : 'intent', v = b.dataset.gwType || b.dataset.gwIntent;
        document.querySelectorAll('[data-gw-' + grp + ']').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        if (grp === 'type') type = v; else intent = v;
        track('tool_started', { tool_name: 'own-router', step: grp === 'type' ? 'type' : 'intent', value: v, owned_type: type || undefined });
        host.innerHTML = ownHtml(ownGuide(type, intent, rootPath));
        if (type && intent) host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }));
    }
    // WhatsApp and onward links are tracked with the existing event names.
    document.addEventListener('click', (e) => {
      const a = e.target.closest ? e.target.closest('[data-gw-wa],[data-gw-go]') : null; if (!a) return;
      if (a.dataset.gwWa) track('whatsapp_click', { tool_name: a.dataset.gwWa, context: a.dataset.gwWa });
      else track('tool_selected', { tool: a.dataset.gwGo, placement: document.body.dataset.view || 'journey' });
    });
  }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount(); }
  return { ownGuide, ownHtml, ownChips, step, esc, wa };
});
