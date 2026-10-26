/* ==========================================================================
   GROUNDWORK — the one-page A4 summary ("Save as PDF"), 26 Oct 2026.
   One template, five bands, every tool:
     1 header      wordmark · "Summary · prepared [date] · Ref [code]"          (identical for every tool)
     2 question    the tool's question and one line of basis: every assumption in words   (from the tool)
     3 answer      three figures and the judgement sentence                     (identical layout; figures from the tool)
     4 workings    two columns of rows                                          (from the tool)
     5 footer      Ken's details, the rules-checked line, the privacy line      (identical for every tool)
   The tool hands over a plain object built from the same engine result that draws its answer card; nothing here
   calculates and nothing is read back from the page. Printing goes through the browser (window.print): no PDF library.
   Privacy: the sheet exists only while printing, in this tab; the reference carries no figures and is not stored.
   UMD: window.GW_SHEET in the browser; Node can call render() for tests.
   ========================================================================== */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GW_SHEET = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const today = (d) => d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear();
  const FOOT_LEFT_NAME = 'Ken Tan · The Property Guy';
  const FOOT_LEFT_REST = 'Property agent since 2007 · CEA R007903D · Huttons Asia Pte Ltd (L3008899K) · WhatsApp 9090 8898 · tools.kentanthepropertyguy.com';
  const FOOT_PRIVACY = 'Figures were entered by you on your device; Groundwork stores nothing.';
  const RULES_LINE = (checked) => 'Planning estimates from MAS, IRAS, CPF and Housing Developers Rules as checked ' + checked + '. Not a bank offer, valuation or financial advice.';

  // V3.7 (Ken, 27 Oct 2026): Ken's own photograph in the footer (the site's file, unaltered; only sized by CSS). Its address comes from where this script is served.
  const PHOTO = 'assets/img/ken-circle-600.jpg';
  const photoUrl = () => { try { const me = root.document && root.document.querySelector('script[src*="assets/js/gw-sheet.js"]'); return me ? me.src.replace(/assets\/js\/gw-sheet\.js.*$/, '') + PHOTO : null; } catch (e) { return null; } };
  let preloaded = null;
  const preload = () => { const u = photoUrl(); if (u && !preloaded && root.Image) { preloaded = new root.Image(); preloaded.src = u; } return u; };
  // A short reference, like the WhatsApp refs: the tool and roughly when. Four characters from the day and a counter; no figures, never stored.
  const ALPH = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';   // 32 characters, no 0/O/1/I
  let counter = 0;
  function ref(tool, d) {
    d = d || new Date();
    const day = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 0, 1)) / 864e5) & 1023;   // the day, within ~2.8 years
    const slot = ((d.getHours() * 60 + d.getMinutes()) >> 2) + (counter++ * 37);                                      // roughly when, and a counter
    let n = day * 1024 + (slot & 1023), s = '';
    for (let k = 0; k < 4; k++) { s = ALPH[n & 31] + s; n >>= 5; }
    return 'GW-' + String(tool).toUpperCase() + '-' + s;
  }

  // band 4 rows: a label (with an optional quieter part and a sub-line), an optional "when", and a figure
  const rowHtml = (r) => '<div class="gs-r' + (r.cls ? ' ' + r.cls : '') + '"><div class="gs-rl"><span class="gs-rn">' + r.label + (r.muted ? ' <i>' + r.muted + '</i>' : '') + '</span>' + (r.sub ? '<small>' + r.sub + '</small>' : '') + '</div>' +
    (r.when !== undefined ? '<span class="gs-rw">' + (r.when || '') + '</span>' : '') + '<b class="gs-rv"' + (r.key ? ' data-sheet-fig="' + r.key + '"' : '') + '>' + (r.value || '') + '</b></div>';
  function blockHtml(b) {
    let h = '<section class="gs-blk' + (b.cls ? ' ' + b.cls : '') + '">' + (b.title ? '<h3 class="gs-bt">' + b.title + '</h3>' : '');
    if (b.groups) h += b.groups.map((g) => (g.title ? '<p class="gs-gt">' + g.title + '</p>' : '') + '<div class="gs-rows gs-when">' + g.rows.map(rowHtml).join('') + '</div>').join('');
    if (b.rows) h += '<div class="gs-rows">' + b.rows.map(rowHtml).join('') + '</div>';
    if (b.note) h += '<p class="gs-note">' + b.note + '</p>';
    return h + '</section>';
  }
  // o: { tool, ref, date, checked, question, basis: [first (bold), ...], figures: [{ key, label, value, sub }] (three), judge, left: [blocks], right: [blocks] }
  function render(o) {
    const d = o.date || new Date();
    const basis = (o.basis || []).map((x, k) => (k === 0 ? '<b>' + x + '</b>' : x)).join(' · ');
    return '<article class="gs-sheet" data-sheet="' + esc(o.tool) + '" lang="en-SG"><div class="gs-main">' +
      '<header class="gs-hd"><span class="gs-wm">GROUNDWORK</span><span class="gs-meta">Summary · prepared ' + today(d) + ' · Ref <span data-sheet-ref>' + esc(o.ref || ref(o.tool, d)) + '</span></span></header>' +
      '<section class="gs-q"><h1>' + esc(o.question) + '</h1><p class="gs-basis" data-sheet-basis>' + basis + '</p></section>' +
      '<section class="gs-figs">' + (o.figures || []).map((f, k) => '<div class="gs-f' + (k === 0 ? ' gs-f1' : '') + '"><span class="gs-fl">' + f.label + '</span><b class="gs-fv" data-sheet-fig="' + f.key + '">' + f.value + '</b>' + (f.sub ? '<span class="gs-fs">' + f.sub + '</span>' : '') + '</div>').join('') + '</section>' +
      (o.judge ? '<p class="gs-judge" data-sheet-judge>' + o.judge + '</p>' : '') +
      '<section class="gs-work"><div class="gs-col">' + (o.left || []).map(blockHtml).join('') + '</div><div class="gs-col">' + (o.right || []).map(blockHtml).join('') + '</div></section>' +
      '</div><footer class="gs-ft' + (o.photo ? ' gs-ft-ph' : '') + '">' + (o.photo ? '<img class="gs-ph" data-sheet-photo src="' + esc(o.photo) + '" alt="Ken Tan">' : '') + '<p class="gs-ftl" data-sheet-foot-left><b>' + FOOT_LEFT_NAME + '</b><span class="gs-dash"> — </span><span class="gs-ftr">' + FOOT_LEFT_REST + '</span></p>' +
      '<p class="gs-ftrt" data-sheet-foot-right><span>' + esc(RULES_LINE(o.checked || '9 Oct 2026')) + '</span> <span>' + FOOT_PRIVACY + '</span></p></footer></article>';
  }

  // The print-only container: built on demand, measured, tightened until it fits one A4 page, printed, then removed.
  function mount(o) {
    const doc = root.document; unmount();
    const host = doc.createElement('div'); host.className = 'gw-sheet-host'; host.setAttribute('aria-hidden', 'true'); host.innerHTML = render(Object.assign({ photo: preload() }, o));
    doc.body.appendChild(host);
    const main = host.querySelector('.gs-main'), work = host.querySelector('.gs-work'), fits = () => main.scrollHeight <= main.clientHeight + 1;
    const ok = ['', 'gs-tight', 'gs-tighter', 'gs-tightest'].some((cls) => { if (cls) host.firstChild.classList.add(cls); return fits(); });
    // V3.7: never cut words off. If the tightest spacing still does not fit, the workings are scaled down a step at a time until everything shows.
    if (!ok && work) { for (let z = 0.95; z >= 0.6 && !fits(); z -= 0.05) work.style.zoom = String(Math.round(z * 100) / 100); }
    return host;
  }
  function unmount() { const doc = root.document; [].slice.call(doc.querySelectorAll('.gw-sheet-host')).forEach((h) => h.parentNode.removeChild(h)); }
  // print(build): build() returns the sheet object for the figures on screen now (or null when there is no answer yet)
  let builder = null, wired = false;
  function wire(build) {
    builder = build; preload();
    if (wired) return; wired = true;
    // Printing from the browser's own menu prints the same sheet; the on-screen page never prints (gw-sheet.css)
    root.addEventListener('beforeprint', () => { if (!root.document.querySelector('.gw-sheet-host') && builder) { const o = builder(); if (o) mount(o); } });
    root.addEventListener('afterprint', () => { setTimeout(unmount, 0); });
  }
  function print(track) {
    const o = builder && builder(); if (!o) return false;
    const host = mount(o);
    if (track) track();
    // the photograph is preloaded when the page wires the sheet; wait for it (briefly) so it is in the PDF
    const img = host.querySelector('[data-sheet-photo]');
    const go = () => root.print();
    if (img && !img.complete && img.decode) { let done = false; const once = () => { if (!done) { done = true; go(); } }; img.decode().then(once, once); root.setTimeout(once, 1500); } else go();
    return true;
  }
  return { render, mount, unmount, wire, print, ref, FOOT_LEFT: FOOT_LEFT_NAME + ' — ' + FOOT_LEFT_REST, FOOT_PRIVACY, RULES_LINE };
});
