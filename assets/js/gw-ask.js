/* ==========================================================================
   GROUNDWORK — "Check an asking price" (R2.1, Ken 9 Oct 2026).
   Places an asking price against recent sales the site already shows: a condo's resales of that size in the last 12 months
   (Research, the same size bands and evidence rules), or an HDB block's resales of that flat type (What's my home worth?).
   It rearranges those figures; it never estimates a value. Where there are too few sales it says so instead of judging.
   Wording on every check: recent sales, not a valuation; floor, facing, stack and condition can justify a different price.
   Privacy: the asking price and size stay on the page. They are never put in a page address or analytics; the optional
   WhatsApp message to Ken is opened from a button (never a link the analytics tags can read), only when the visitor taps it.
   UMD: window.GWASK in the browser; Node uses the same functions in the tests.
   ========================================================================== */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GWASK = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Math.round(n).toLocaleString('en-US'), money = (n) => '$' + num(n);
  const PHONE = '6590908898', waUrl = (m) => 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(m);
  const NOTE = 'Recent sales, not a valuation. Floor, facing, stack and condition can justify a different price.';
  // "1,780,000", "$1.78m", "780k". Never negative.
  const amount = (s) => { const t = String(s == null ? '' : s).trim().toLowerCase().replace(/[$,\s]/g, ''), m = /^(\d+(?:\.\d+)?)(m|mil|million|k)?$/.exec(t); if (!m) return NaN; return +m[1] * (m[2] ? (m[2] === 'k' ? 1e3 : 1e6) : 1); };
  // A5-23: say why a typed price can't be used (unreadable, too low to be a full price, or implausibly high), instead of asking again
  const PRICE_MIN = 10000, PRICE_MAX = 1e8;
  function priceIssue(price, eg) {
    const t = String(price == null ? '' : price).trim(); if (!t) return '';
    const x = amount(t);
    if (isNaN(x)) return 'Type the asking price in dollars, e.g. ' + eg + '.';
    if (x < PRICE_MIN) return 'That looks too low for an asking price: type the full amount in dollars, e.g. ' + eg + '.';
    if (x > PRICE_MAX) return 'That’s more than $100 million: check the asking price.';
    return '';
  }
  const warn = (s) => '<p class="gw-warn" role="alert">' + esc(s) + '</p>';
  const MID_MIN = 4; // the middle half needs at least 4 sales (the rule What's my home worth? already uses)
  const MIN_SALES = 2, MIN_MONTHS = 2; // the least Research shows a recent price on (kpt-research.js); a typical price needs 5 sales over 3 months (kpt-lg.js)

  /* ---------------- pure ---------------- */
  // d: { lo, q1, med, q3, hi, n }. Returns where x falls: below | lower | middle | upper | above, or within (no middle half).
  function place(x, d) {
    if (!(x > 0) || !d || !(d.n > 0)) return null;
    if (x < d.lo) return 'below';
    if (x > d.hi) return 'above';
    if (d.q1 === undefined || d.q3 === undefined || d.n < MID_MIN) return 'within';
    if (x < d.q1) return 'lower';
    if (x > d.q3) return 'upper';
    return 'middle';
  }
  // One sentence, from the figures only (the price itself is shown just above it). f: money or psf. what: "23 resales of 700–799 sq ft homes here in the last 12 months".
  // d.midN (HDB): the middle group is that many actual sales, so it is named by its count (A4-10). Without it (condos) the
  // quarters are worked out between sales, so the middle half is given as "about" (A4-19).
  function sentence(x, d, f, what) {
    const p = place(x, d); if (!p) return '';
    const mid = d.midN ? 'middle ' + d.midN : 'middle half';
    const half = d.midN ? ' The middle ' + d.midN + ' sold for ' + f(d.q1) + ' – ' + f(d.q3) + '.' : ' The middle half is about ' + f(d.q1) + ' – ' + f(d.q3) + '.';
    if (p === 'below') return 'Below every one of the ' + what + ' (lowest ' + f(d.lo) + ').';
    if (p === 'above') return 'Above every one of the ' + what + ' (highest ' + f(d.hi) + ').';
    if (p === 'lower') return (d.midN ? 'Below the middle ' + d.midN + ' of the ' : 'In the lower quarter of the ') + what + '.' + half;
    if (p === 'upper') return (d.midN ? 'Above the middle ' + d.midN + ' of the ' : 'In the upper quarter of the ') + what + '.' + half;
    if (p === 'within') return 'Within the range of the ' + what + '.';
    return 'Within the ' + mid + ' of the ' + what + (d.med !== undefined ? ', ' + (x > d.med ? 'above' : x < d.med ? 'below' : 'at') + ' the typical ' + f(d.med) : '') + '.';
  }
  // The range on one line: all sales (light), the middle half (dark), the typical figure (tick) and the asking price (marker).
  function rangeSvg(x, d, f, label) {
    const lo = Math.min(d.lo, x), hi = Math.max(d.hi, x), pad = (hi - lo) * 0.08 || hi * 0.04, a = lo - pad, b = hi + pad, W = 320;
    const X = (v) => ((v - a) / (b - a) * W).toFixed(1);
    let g = '<rect x="' + X(d.lo) + '" y="22" width="' + Math.max(2, X(d.hi) - X(d.lo)) + '" height="10" rx="5" fill="#D9DCE6"/>';
    if (d.q1 !== undefined && d.q3 !== undefined && d.n >= MID_MIN) g += '<rect x="' + X(d.q1) + '" y="22" width="' + Math.max(2, X(d.q3) - X(d.q1)) + '" height="10" rx="5" fill="#5D6487"/>';
    if (d.med !== undefined && d.n >= MID_MIN) g += '<rect x="' + (X(d.med) - 1) + '" y="18" width="2" height="18" fill="#16213E"/>';
    g += '<circle cx="' + X(x) + '" cy="27" r="8" fill="#0B63CE" stroke="#fff" stroke-width="2.5"/>';
    const ax = +X(x), anchor = ax < 60 ? 'start' : ax > W - 60 ? 'end' : 'middle';
    g += '<text x="' + X(x) + '" y="10" font-size="11.5" font-weight="700" fill="#0B63CE" text-anchor="' + anchor + '">Asking ' + esc(f(x)) + '</text>';
    g += '<text x="' + X(d.lo) + '" y="52" font-size="11" fill="#6B7280" text-anchor="' + (X(d.lo) < 40 ? 'start' : 'middle') + '">' + esc(f(d.lo)) + '</text>';
    if (d.hi !== d.lo) g += '<text x="' + X(d.hi) + '" y="52" font-size="11" fill="#6B7280" text-anchor="' + (X(d.hi) > W - 40 ? 'end' : 'middle') + '">' + esc(f(d.hi)) + '</text>';
    return '<svg class="gw-ask-svg" viewBox="-4 0 ' + (W + 8) + ' 58" role="img" aria-label="' + esc(label) + '">' + g + '</svg>';
  }
  const legend = (d, span) => '<p class="gw-ask-leg"><span><i class="a"></i>All ' + d.n + ' sales, ' + span + '</span>' + (d.n >= MID_MIN && d.q1 !== undefined ? '<span><i class="m"></i>' + (d.midN ? 'Middle ' + d.midN : 'Middle half (about)') + '</span>' : '') + (d.med !== undefined && d.n >= MID_MIN ? '<span><i class="t"></i>Typical</span>' : '') + '<span><i class="x"></i>Asking price</span></p>';

  // ---- condos: one size band of a development (the band data comes from Research's own model) ----
  // B: { bin, label, n, months, lo, q1, med, q3, hi, latest } (the last 12 months, the sale type on show)
  function condoBand(bands, sqft) {
    const v = Number(String(sqft == null ? '' : sqft).replace(/[^0-9.]/g, ''));
    if (!(v >= 100 && v <= 20000)) return { error: 'size', typed: String(sqft == null ? '' : sqft).trim() !== '' };
    const bin = Math.floor(v / 100) * 100, b = bands.find((x) => x.bin === bin);
    return { bin, size: v, band: b || null };
  }
  function condoResult(A, sqft, price) {
    const words = A.words || ['resale', 'resales'], f = (p) => money(p) + ' psf';
    const c = condoBand(A.bands, sqft), x = amount(price);
    if (c.error) return { state: 'input', html: c.typed ? warn('Enter a size between 100 and 20,000 sq ft, as on the listing.') : '<p class="gw-fine">Enter the home’s size in square feet, then the asking price.</p>' };
    const pi = priceIssue(price, '1,780,000');
    if (pi) return { state: 'input', html: warn(pi) };
    if (!(x >= PRICE_MIN)) return { state: 'input', html: '<p class="gw-fine">Now enter the asking price.</p>' };
    const psf = x / c.size, b = c.band;
    const head = '<div class="gw-ask-h"><span>' + num(c.size) + ' sq ft at ' + money(x) + '</span><b>' + money(psf) + ' psf</b></div>';
    if (!b || !b.n) {
      const near = A.bands.filter((y) => y.n).map((y) => ({ y, d: Math.abs(y.bin - c.bin) })).sort((p, q) => p.d - q.d).slice(0, 2).map((p) => p.y).sort((p, q) => p.bin - q.bin);
      return { state: 'none', psf, html: head + '<p class="gw-ask-say">No ' + words[1] + ' of ' + esc(sizeLabel(c.bin)) + ' homes here in the last 12 months, so there is nothing recent to place this price against.' + (near.length ? ' Nearest sizes with recent ' + words[1] + ': ' + near.map((y) => esc(y.label) + ' (' + y.n + ')').join(', ') + '.' : '') + '</p>' };
    }
    if (!(b.n >= MIN_SALES && b.months >= MIN_MONTHS)) {
      return { state: 'thin', psf, html: head + '<p class="gw-ask-say">Only ' + b.n + ' ' + (b.n === 1 ? words[0] : words[1]) + ' of ' + esc(b.label) + ' homes here in the last 12 months' + (b.n === 1 ? ', at ' + f(b.med) : ', all in ' + esc(b.latest)) + '. That is too few to judge an asking price against.</p>' };
    }
    const d = { lo: b.lo, q1: b.q1, med: b.med, q3: b.q3, hi: b.hi, n: b.n }, what = b.n + ' ' + words[1] + ' of ' + b.label + ' homes here in the last 12 months';
    return { state: 'ok', psf, pos: place(psf, d), html: head + rangeSvg(psf, d, f, 'Asking ' + f(psf) + ' against ' + what) + legend(d, 'last 12 months') + '<p class="gw-ask-say">' + esc(sentence(psf, d, f, what)) + '</p>' + edgeNote(A, c, words) };
  }
  // A4-18: a listing's round size can sit just above a band edge while URA records the same home just below it (65 sq m is
  // 699.65 sq ft, in the 600–699 band, but is usually listed as 700 sq ft). Name the band below too, with its own count and range.
  function edgeNote(A, c, words) {
    if (!(c.size - c.bin < 1)) return '';
    const lb = A.bands.find((y) => y.bin === c.bin - 100);
    if (!lb || !lb.n) return '';
    return '<p class="gw-fine" data-ask-edge>A listing’s ' + num(c.size) + ' sq ft may be the same home URA records just under ' + num(c.bin) + ' sq ft (for example 65 sq m is 699.6 sq ft). ' +
      lb.n + ' ' + (lb.n === 1 ? words[0] : words[1]) + ' of ' + esc(lb.label) + ' homes here in the last 12 months' + (lb.n >= MID_MIN ? ', middle half about ' + money(lb.q1) + ' – ' + money(lb.q3) + ' psf' : ', ' + money(lb.lo) + (lb.hi !== lb.lo ? ' – ' + money(lb.hi) : '') + ' psf') + '.</p>';
  }
  const sizeLabel = (bin) => num(bin) + '–' + num(bin + 99) + ' sq ft';
  const condoMsg = (A, sqft, price) => 'Hi Ken, I’m looking at a ' + num(Number(String(sqft).replace(/[^0-9.]/g, ''))) + ' sq ft home at ' + A.name + ' with an asking price of ' + money(amount(price)) + '. I’ve checked it against recent sales on Groundwork. Could I get your view on it?';

  // ---- HDB: a block's (or street's) resales of one flat type, in actual sale prices ----
  // H: { lo, q1, q3, hi, n, level, where, ft }
  function hdbResult(H, price) {
    const x = amount(price);
    const pi = priceIssue(price, '680,000');
    if (pi) return { state: 'input', html: warn(pi) };
    if (!(x >= PRICE_MIN)) return { state: 'input', html: '<p class="gw-fine">Enter the asking price to see where it sits.</p>' };
    if (!H || !(H.n >= 3) || H.lo === undefined) return { state: 'thin', html: '<p class="gw-ask-say">Too few resales here to judge an asking price against.</p>' };
    const d = { lo: H.lo, q1: H.q1, q3: H.q3, hi: H.hi, n: H.n, midN: H.midN }, what = H.n + ' resales of ' + H.ft + ' flats ' + (H.level === 'block' ? 'in this block' : 'on this street') + ' in the last 2 years';
    return { state: 'ok', pos: place(x, d), html: '<div class="gw-ask-h"><span>Asking price</span><b>' + money(x) + '</b></div>' + rangeSvg(x, d, money, 'Asking ' + money(x) + ' against ' + what) + legend(d, 'last 2 years') + '<p class="gw-ask-say">' + esc(sentence(x, d, money, what)) + '</p>' };
  }
  const hdbMsg = (H, price) => 'Hi Ken, I’m looking at a ' + H.ft + ' HDB flat at ' + H.where + ' with an asking price of ' + money(amount(price)) + '. I’ve checked it against recent resales on Groundwork. Could I get your view on it?';

  /* ---------------- markup ---------------- */
  const field = (k, label, pre, unit, ph) => '<label class="gw-fld"><span>' + label + '</span><div class="gw-in">' + (pre ? '<i>' + pre + '</i>' : '') + '<input type="text" inputmode="numeric" autocomplete="off" data-ask-' + k + ' placeholder="' + esc(ph) + '">' + (unit ? '<i class="u">' + unit + '</i>' : '') + '</div></label>';
  // The panel; data is the public figures the page already shows, as JSON.
  // Audit V3-12: the block or street (data.where) is needed only for the optional WhatsApp message, so it stays inside this script
  // and is not written into the page's markup; the attribute holds only what the price check uses.
  const KEEP = {}; let refN = 0;
  function panelHtml(kind, data, o) {
    o = o || {};
    const pub = Object.assign({}, data), ref = 'a' + (++refN);
    if (pub.where !== undefined) { KEEP[ref] = { where: pub.where }; delete pub.where; }
    return '<section class="gw-apc" data-gw-ask="' + kind + '"' + (o.id ? ' id="' + o.id + '"' : '') + (o.hidden ? ' hidden' : '') + ' aria-label="Check an asking price" data-ask="' + esc(JSON.stringify(pub)) + '" data-ask-ref="' + ref + '">' +
      '<div class="gw-ask-top"><h2 class="gw-ask-t">' + esc(o.title || 'Check an asking price') + '</h2>' + (o.sub ? '<p class="gw-fine">' + esc(o.sub) + '</p>' : '') + '</div>' +
      '<div class="gw-ask-f">' + (kind === 'condo' ? field('size', 'Size', '', 'sq ft', 'e.g. 753') : '') + field('price', 'Asking price', '$', '', kind === 'condo' ? 'e.g. 1,780,000' : 'e.g. 680,000') + '</div>' +
      '<div class="gw-ask-out" data-ask-out aria-live="polite"><p class="gw-fine">' + (kind === 'condo' ? 'Type the size and price from the listing.' : 'Type the asking price.') + '</p></div>' +
      '<p class="gw-ask-note"><b>' + NOTE + '</b> ' + esc(kind === 'hdb' ? 'HDB’s valuation, after the Option to Purchase, is separate.' : 'A bank valuation is separate.') + '</p>' +
      '<div class="gw-ask-ken" data-ask-ken hidden><button type="button" class="gw-btn wa" data-ask-wa>Ask Ken about this price</button><p class="gw-fine">Opens WhatsApp with the ' + (kind === 'condo' ? 'development, size' : 'flat') + ' and price, to edit before sending. Your figures never go into the page address or analytics.</p></div></section>';
  }

  /* ---------------- browser behaviour (delegated, so it works on pages that redraw) ---------------- */
  function compute(sec) {
    let A = {}; try { A = JSON.parse(sec.dataset.ask || '{}'); } catch (e) { A = {}; }
    A = Object.assign(A, KEEP[sec.dataset.askRef] || {});
    const kind = sec.dataset.gwAsk, size = sec.querySelector('[data-ask-size]'), price = sec.querySelector('[data-ask-price]');
    const r = kind === 'condo' ? condoResult(A, size && size.value, price && price.value) : hdbResult(A, price && price.value);
    sec.querySelector('[data-ask-out]').innerHTML = r.html;
    const k = sec.querySelector('[data-ask-ken]'); if (k) k.hidden = r.state === 'input';
    if (r.state !== 'input' && !sec.__tracked) { sec.__tracked = true; const K = root.KPT; try { if (K && K.track) K.track('tool_completed', { tool_name: 'asking-price-' + kind }); } catch (e) { /* analytics unavailable */ } }
    return { A, kind, size, price };
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('input', (e) => { const t = e.target; if (!t.matches || !t.matches('[data-ask-size],[data-ask-price]')) return; const sec = t.closest('[data-gw-ask]'); if (sec) compute(sec); });
    document.addEventListener('focusout', (e) => { const t = e.target; if (!t.matches || !t.matches('[data-ask-price]')) return; const v = amount(t.value); if (v > 0) t.value = num(v); });
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-ask-wa]'); if (!b) return;
      const sec = b.closest('[data-gw-ask]'), c = compute(sec), msg = c.kind === 'condo' ? condoMsg(c.A, c.size.value, c.price.value) : hdbMsg(c.A, c.price.value);
      try { if (root.KPT && root.KPT.track) root.KPT.track('whatsapp_click', { tool_name: 'asking-price-' + c.kind, context: 'asking-price' }); } catch (x) { /* analytics unavailable */ }
      let w = null; try { w = root.open(waUrl(msg), '_blank'); } catch (x) { w = null; }
      if (w) { try { w.opener = null; } catch (x) { /* ignore */ } } else root.location.href = 'https://wa.me/6590908898'; // blocked pop-up: the chat opens without the prepared figures
    });
  }
  return { edgeNote, amount, place, sentence, rangeSvg, condoBand, condoResult, hdbResult, condoMsg, hdbMsg, panelHtml, NOTE, MID_MIN, MIN_SALES, MIN_MONTHS };
});
