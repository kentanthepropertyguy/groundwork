/* ==========================================================================
   GROUNDWORK — "Check an asking price" (R2.1, Ken 9 Oct 2026).
   Places an asking price against recent sales the site already shows: a condo's resales of that size in the last 12 months
   (Research, the same size bands and evidence rules), or an HDB block's resales of that flat type (What's my home worth?).
   It rearranges those figures; it never estimates a value. Where there are too few sales it says so instead of judging.
   Wording on every check: recent sales, not a valuation; floor, facing, stack and condition can justify a different price.
   25 Oct 2026: the answer first. A headline (above / within / below the recent comparable sale range, from place()), then a
   proportional chart (range, middle half, median where supported, the asking marker, and each actual sale as a dot where the page
   already has them: HDB only; condo bands hold aggregates, so no dots are drawn there), then the numbers, and one quiet line.
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
  const NOTE = 'Recent sales are a guide, not a valuation. Floor, facing and condition may affect price.';
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
  // The headline groups place() into three: below | within | above (lower, middle and upper quarters are all within the range).
  const verdict = (p) => (p === 'below' || p === 'above' ? p : p ? 'within' : null);
  const VTEXT = { below: 'Below recent comparable sale range', within: 'Within recent comparable sale range', above: 'Above recent comparable sale range' };
  // How far outside the range, against its nearest end: "6% above the highest sale". '' when within.
  function gapText(x, d, v) {
    if (v !== 'above' && v !== 'below') return '';
    const pc = v === 'above' ? (x / d.hi - 1) * 100 : (1 - x / d.lo) * 100, r = Math.round(pc);
    return (r < 1 ? 'Just ' + v : r + '% ' + v) + ' the ' + (v === 'above' ? 'highest' : 'lowest') + ' sale';
  }
  const showMed = (d) => d.med !== undefined && d.n >= MID_MIN;
  const showMid = (d) => d.q1 !== undefined && d.q3 !== undefined && d.n >= MID_MIN;
  // Median of actual sale prices (HDB, where the page lists every sale). Only with MID_MIN sales or more.
  function median(ps) { if (!ps || ps.length < MID_MIN) return undefined; const s = ps.slice().sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  // One proportional scale for everything: the range, the middle half, the median, the asking price (inside or outside the
  // range) and, where given, each actual sale (ps) as a small dot, stacked where sales are close so none hides another.
  function rangeSvg(x, d, f, label, ps) {
    const lo = Math.min(d.lo, x), hi = Math.max(d.hi, x), pad = (hi - lo) * 0.07 || hi * 0.04, a = lo - pad, b = hi + pad, W = 320;
    const X = (v) => (v - a) / (b - a) * W, F = (v) => v.toFixed(1);
    let dots = '', DH = 0;
    if (ps && ps.length) {
      const R = ps.length > 40 ? 2.6 : 3.4, gx = 2 * R + 0.6, CAP = 4, placed = [];
      ps.slice().sort((p, q) => p - q).forEach((v) => { const cx = X(v); let l = 0; while (placed.some((q) => q.l === l && Math.abs(q.x - cx) < gx)) l++; placed.push({ x: cx, l }); });
      const rows = Math.max.apply(null, placed.map((p) => p.l)) + 1, dy = rows > CAP ? (CAP - 1) * (2 * R + 1) / (rows - 1) : 2 * R + 1;
      DH = Math.min(rows, CAP) * (2 * R + 1) + 4;
      placed.forEach((p) => { dots += '<circle cx="' + F(p.x) + '" cy="' + F(22 + DH - 4 - R - p.l * dy) + '" r="' + R + '" fill="#8A90A8" fill-opacity="0.85"/>'; });
    }
    const TY = 22 + DH + 10, lx = X(d.lo), hx = X(d.hi), ax = X(x);
    let g = dots + '<rect x="' + F(lx) + '" y="' + (TY - 4) + '" width="' + F(Math.max(3, hx - lx)) + '" height="8" rx="4" fill="#DCE0EA"/>';
    if (showMid(d)) g += '<rect x="' + F(X(d.q1)) + '" y="' + (TY - 4) + '" width="' + F(Math.max(3, X(d.q3) - X(d.q1))) + '" height="8" rx="4" fill="#5D6487"/>';
    if (showMed(d)) g += '<rect x="' + F(X(d.med) - 1.25) + '" y="' + (TY - 9) + '" width="2.5" height="18" rx="1" fill="#16213E" stroke="#fff" stroke-width="1"/>';
    // outside the range: a dashed run from the nearest end to the asking price shows the gap at true scale
    if (x > d.hi) g += '<line x1="' + F(hx + 3) + '" x2="' + F(ax - 8) + '" y1="' + TY + '" y2="' + TY + '" stroke="#0B63CE" stroke-width="1.5" stroke-dasharray="3 3"/>';
    if (x < d.lo) g += '<line x1="' + F(ax + 8) + '" x2="' + F(lx - 3) + '" y1="' + TY + '" y2="' + TY + '" stroke="#0B63CE" stroke-width="1.5" stroke-dasharray="3 3"/>';
    g += '<line x1="' + F(ax) + '" x2="' + F(ax) + '" y1="19" y2="' + (TY - 7) + '" stroke="#0B63CE" stroke-width="2"/>';
    g += '<circle cx="' + F(ax) + '" cy="' + TY + '" r="7.5" fill="#0B63CE" stroke="#fff" stroke-width="2.5"/>';
    const anc = (px, m) => (px < m ? 'start' : px > W - m ? 'end' : 'middle');
    g += '<text x="' + F(ax) + '" y="12" font-size="12" font-weight="700" fill="#0B63CE" text-anchor="' + anc(ax, 62) + '">Asking ' + esc(f(x)) + '</text>';
    // value labels under the line, never on top of one another: lowest and highest apart if there is room, else one "lo – hi"
    const vy = TY + 25, cy = TY + 37, lab = (px, v, cap, an) => '<text x="' + F(px) + '" y="' + vy + '" font-size="11.5" font-weight="600" fill="#374151" text-anchor="' + an + '">' + esc(v) + '</text><text x="' + F(px) + '" y="' + cy + '" font-size="10.5" fill="#6B7280" text-anchor="' + an + '">' + cap + '</text>';
    if (d.hi === d.lo) g += lab(lx, f(d.lo), 'every sale', anc(lx, 40));
    else if (hx - lx >= 104) {
      g += lab(lx, f(d.lo), 'lowest', anc(lx, 40)) + lab(hx, f(d.hi), 'highest', anc(hx, 40));
      if (showMed(d)) { const mx = X(d.med); if (mx - lx >= 76 && hx - mx >= 76) g += lab(mx, f(d.med), 'median', 'middle'); }
    } else { const mid = (lx + hx) / 2; g += lab(mid, f(d.lo).replace(/ psf$/, '') + ' – ' + f(d.hi), 'lowest – highest', anc(mid, 70)); }
    return '<svg class="gw-ask-svg" viewBox="-4 0 ' + (W + 8) + ' ' + (cy + 6) + '" role="img" aria-label="' + esc(label) + '">' + g + '</svg>';
  }
  const legend = (d, ps) => '<p class="gw-ask-leg"><span><i class="a"></i>Recent range</span>' + (showMid(d) ? '<span><i class="m"></i>' + (d.midN ? 'Middle ' + d.midN + ' sales' : 'Middle half (about)') + '</span>' : '') + (showMed(d) ? '<span><i class="t"></i>Median</span>' : '') + (ps && ps.length ? '<span><i class="s"></i>Each dot is one sale</span>' : '') + '<span><i class="x"></i>Asking price</span></p>';
  // The answer, then the evidence in plain figures (so nobody has to read the chart to get it).
  function verdictHtml(x, d, f, p, what) {
    const v = verdict(p), gt = gapText(x, d, v);
    return '<div class="gw-ask-v" data-ask-pos="' + v + '"><p class="gw-ask-vh">' + VTEXT[v] + (gt ? ' <span>' + esc(gt) + '</span>' : '') + '</p><p class="gw-ask-say">' + esc(sentence(x, d, f, what)) + '</p></div>';
  }
  const noneHtml = (t) => '<div class="gw-ask-v" data-ask-pos="none"><p class="gw-ask-vh">' + esc(t) + '</p></div>';
  const nums = (rows) => '<dl class="gw-ask-nums">' + rows.filter(Boolean).map((r) => '<div><dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd></div>').join('') + '</dl>';
  const span = (d, f) => (d.hi === d.lo ? esc(f(d.lo)) : esc(f(d.lo)) + ' – ' + esc(f(d.hi)));

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
      return { state: 'none', psf, html: noneHtml('No recent comparable sales') + head + '<p class="gw-ask-say">No ' + words[1] + ' of ' + esc(sizeLabel(c.bin)) + ' homes here in the last 12 months, so there is nothing recent to place this price against.' + (near.length ? ' Nearest sizes with recent ' + words[1] + ': ' + near.map((y) => esc(y.label) + ' (' + y.n + ')').join(', ') + '.' : '') + '</p>' };
    }
    if (!(b.n >= MIN_SALES && b.months >= MIN_MONTHS)) {
      return { state: 'thin', psf, html: noneHtml('Too few recent sales to compare') + head + '<p class="gw-ask-say">Only ' + b.n + ' ' + (b.n === 1 ? words[0] : words[1]) + ' of ' + esc(b.label) + ' homes here in the last 12 months' + (b.n === 1 ? ', at ' + f(b.med) : ', all in ' + esc(b.latest)) + '. That is too few to judge an asking price against.</p>' };
    }
    const d = { lo: b.lo, q1: b.q1, med: b.med, q3: b.q3, hi: b.hi, n: b.n }, what = b.n + ' ' + words[1] + ' of ' + b.label + ' homes here in the last 12 months';
    const pos = place(psf, d);
    return { state: 'ok', psf, pos, verdict: verdict(pos), html: verdictHtml(psf, d, f, pos, what) + rangeSvg(psf, d, f, 'Asking ' + f(psf) + ' against ' + what) + legend(d) +
      nums([['Asking', money(x) + ' · <b>' + money(psf) + ' psf</b>'], ['Recent range', span(d, money) + ' psf'], showMed(d) ? ['Median', esc(f(d.med))] : null, ['Size band', esc(b.label)], ['Sales', b.n + ' ' + esc(b.n === 1 ? words[0] : words[1]) + ' · last 12 months']]) + edgeNote(A, c, words) };
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
    // H.ps: each sale's price, as the page's own sales list shows them; used only when it is the whole set
    const ps = Array.isArray(H.ps) && H.ps.length === H.n ? H.ps : null;
    const d = { lo: H.lo, q1: H.q1, med: median(ps), q3: H.q3, hi: H.hi, n: H.n, midN: H.midN }, where = H.level === 'block' ? 'in this block' : 'on this street', what = H.n + ' resales of ' + H.ft + ' flats ' + where + ' in the last 2 years';
    const pos = place(x, d);
    return { state: 'ok', pos, verdict: verdict(pos), html: verdictHtml(x, d, money, pos, what) + rangeSvg(x, d, money, 'Asking ' + money(x) + ' against ' + what, ps) + legend(d, ps) +
      nums([['Asking', '<b>' + money(x) + '</b>'], ['Recent range', span(d, money)], showMed(d) ? ['Median', money(d.med)] : null, ['Flat type', esc(H.ft) + ' <small>(' + where + ')</small>'], ['Sales', H.n + ' resales · last 2 years']]) };
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
      '<p class="gw-ask-q">' + NOTE + '</p>' +
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
    // 25 Oct 2026: the asking price takes its thousands commas as it is typed (1,780,000), keeping the cursor where it was.
    // Only plain digits are regrouped; "1.78m" or "780k" are left exactly as typed.
    function commas(t) {
      const v = t.value; if (!/^[\d,]*$/.test(v)) return;
      const d = v.replace(/,/g, ''), out = d ? d.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';
      if (out === v) return;
      const at = t.selectionStart == null ? v.length : t.selectionStart, before = v.slice(0, at).replace(/,/g, '').length;
      t.value = out;
      let i = 0, n = 0; while (i < out.length && n < before) { if (out[i] !== ',') n++; i++; }
      try { t.setSelectionRange(i, i); } catch (x) { /* not focusable */ }
    }
    document.addEventListener('input', (e) => { const t = e.target; if (!t.matches || !t.matches('[data-ask-size],[data-ask-price]')) return; if (t.matches('[data-ask-price]')) commas(t); const sec = t.closest('[data-gw-ask]'); if (sec) compute(sec); });
    document.addEventListener('focusout', (e) => { const t = e.target; if (!t.matches || !t.matches('[data-ask-price]')) return; const v = amount(t.value); if (v > 0) t.value = num(v); });
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-ask-wa]'); if (!b) return;
      const sec = b.closest('[data-gw-ask]'), c = compute(sec), msg = c.kind === 'condo' ? condoMsg(c.A, c.size.value, c.price.value) : hdbMsg(c.A, c.price.value);
      try { if (root.KPT && root.KPT.track) root.KPT.track('whatsapp_click', { tool_name: 'asking-price-' + c.kind, context: 'asking-price' }); } catch (x) { /* analytics unavailable */ }
      const tagged = root.KPT && root.KPT.waTag ? root.KPT.waTag(msg) : msg; // R2.4: the page's reference at the end (no figures)
      let w = null; try { w = root.open(waUrl(tagged), '_blank'); } catch (x) { w = null; }
      if (w) { try { w.opener = null; } catch (x) { /* ignore */ } } else root.location.href = 'https://wa.me/6590908898'; // blocked pop-up: the chat opens without the prepared figures
    });
  }
  return { edgeNote, amount, place, verdict, VTEXT, gapText, median, sentence, rangeSvg, condoBand, condoResult, hdbResult, condoMsg, hdbMsg, panelHtml, NOTE, MID_MIN, MIN_SALES, MIN_MONTHS };
});
