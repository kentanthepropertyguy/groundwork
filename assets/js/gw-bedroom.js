/* ==========================================================================
   GROUNDWORK — Research by bedroom type (V1, 25 Oct 2026). Pure functions; the page (research/index.html, kpt-lg.js) draws and wires them.

   Reads data/projects/bedroom/ (tools/market-data/build-bedroom-research.js): aggregates per development, sale type and bedroom type, only where
   the accepted 12-quarter classification covers enough of the sales. Bedroom type is an INFERENCE (floor plans, or URA rental records for the
   same size), never a URA field, and the answer says which.

   What a visitor reads, in order: the typical total price (median) of that type's sales, the price most of them sold for (the middle half), how
   many and over which months, the size range (one type spans several sizes, so a particular unit can be well above or below), and the median
   psf. Price movement is never a bedroom-wide median: it is the Market Pulse reading for the type's most-sold size (gw-pulse.js bedroomText).
   Nothing is chosen for the visitor: no type is shown until one is picked, and a type kept from another development is shown only where it
   exists, never swapped for another.
   UMD: window.GW_BED and Node.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./gw-pulse.js'));
  else root.GW_BED = factory(root.GW_PULSE);
})(typeof self !== 'undefined' ? self : this, function (PULSE) {
  'use strict';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const ym = (s) => { const a = String(s).split('-'); return MON[Number(a[1]) - 1] + ' ' + a[0]; };
  const WORDS = { resale: ['resale', 'resales'], sub: ['sub-sale', 'sub-sales'], new: ['new sale', 'new sales'] };
  const words = (sale) => WORDS[sale] || WORDS.resale;
  const plural = (n, w) => num(n) + ' ' + w[n === 1 ? 0 : 1];
  const ORDER = (g) => (g === 'PH' ? 99 : Number(g));
  const label = (g) => (g === 'PH' ? 'Penthouse' : g === '0' ? 'Studio' : g + '-bedroom');
  // Prices people say: $915k, $1.28m, $2.05m (the full figure is in the title attribute).
  function short(v) {
    if (!(v > 0)) return '–';
    if (v >= 1e6) return '$' + (Math.round(v / 1e4) / 100).toFixed(2).replace(/0$/, '').replace(/\.0$/, '') + 'm';
    return '$' + num(Math.round(v / 1000)) + 'k';
  }
  const full = (v) => '$' + num(v);
  const span = (w) => (w === 12 ? 'the last 12 months' : w === 24 ? 'the last 2 years' : 'the last 3 years');

  /* ---------- the data ---------- */
  // The development's record, only when it was built from the same data month as the page's own figures (so the two never disagree).
  function pick(shard, meta, id, manifest) {
    if (!shard || !meta || !manifest || meta.latestMonth !== manifest.latestMonth) return null;
    const r = shard.projects ? shard.projects[id] : null;
    return r ? Object.assign({ id, meta }, r) : null;
  }
  // What the page needs for the sale type on show: the types with figures, the types too few to show, and the chosen one if it is here.
  // want: the type the visitor chose (here or on another development). missing: they chose one this development cannot show.
  function view(rec, sale, want) {
    const s = rec && rec[sale];
    if (!s || !s.types || !s.types.length) return want ? { types: [], few: [], g: null, missing: want } : null;
    const types = s.types.slice().sort((a, b) => ORDER(a.g) - ORDER(b.g)), t = want ? types.find((x) => x.g === want) || null : null;
    return { types, few: (s.few || []).slice().sort((a, b) => ORDER(a) - ORDER(b)), coverage: s.coverage, g: t ? t.g : null, t, missing: want && !t ? want : null, sale, meta: rec.meta };
  }

  /* ---------- the choice ---------- */
  function chipsHtml(V) {
    return '<div class="lg-chips gwb-chips" role="group" aria-label="Bedrooms">' + V.types.map((t) => '<button type="button" data-bed="' + esc(t.g) + '" aria-pressed="' + (V.g === t.g) + '">' + esc(label(t.g)) + '</button>').join('') + '</div>';
  }
  function lineHtml(V) {
    if (V.g) return 'Showing ' + esc(label(V.g)) + ' homes, the type you chose.';
    if (V.missing) return 'No reliable ' + esc(label(V.missing)) + ' figures here. Choose another type, or search by floor area.';
    return 'Prices differ a lot between home types. Choose one to see what it sold for.';
  }

  /* ---------- the answer ---------- */
  function basisText(b) {
    if (!b) return '';
    if (b.verified && !b.inferred) return 'Bedrooms from the developer’s floor plans.';
    if (b.inferred && !b.verified) return 'Bedrooms matched from URA rental records for homes of the same size. URA doesn’t record bedrooms with a sale.';
    return 'Bedrooms from the developer’s floor plans and, for some sizes, URA rental records.';
  }
  function sizeText(t) {
    const a = t.sqft[0], b = t.sqft[1];
    if (a === b) return 'All ' + num(a) + ' sq ft.';
    return 'Sizes from ' + num(a) + ' to ' + num(b) + ' sq ft' + (b / a >= 1.25 ? ', a wide spread, so a particular unit can sell well above or below this.' : ', and larger ones usually sell for more.');
  }
  // budget: the maximum budget from What can I afford? in this tab (a single figure), or null. Compares prices only.
  function budgetText(t, budget) {
    if (!(budget > 0) || !t || !t.price) return '';
    const q1 = t.price[1], q3 = t.price[3], b = short(budget);
    const where = budget >= q3 ? 'Most of these sold at or below your budget of ' + b + '.' : budget < q1 ? 'Most of these sold above your budget of ' + b + '.' : 'Your budget of ' + b + ' is within the range most of these sold for.';
    return where + ' This compares prices only. It doesn’t mean a loan or a purchase would be approved.';
  }
  function answerHtml(V, opt) {
    opt = opt || {};
    const t = V.t, w = words(V.sale), recent = t.win === 12;
    const k = esc(label(t.g)) + ' · ' + esc(w[1]) + ', ' + ym(t.from) + ' to ' + ym(t.to);
    const range = t.n >= 4 ? 'Half of the ' + plural(t.n, w) + ' sold between ' + short(t.price[1]) + ' and ' + short(t.price[3]) + '.' : plural(t.n, w) + ', from ' + short(t.price[0]) + ' to ' + short(t.price[4]) + '.';
    const win = recent ? '' : '<p class="lg-fine" data-gwb-win>Too few in the last 12 months, so this covers ' + span(t.win) + '.</p>';
    const bud = budgetText(t, opt.budget);
    return '<div class="lg-ans gwb-ans" data-gwb-ans data-gwb-g="' + esc(t.g) + '"><p class="lg-ans-k">' + k + '</p>' +
      '<p class="lg-ans-main"><span class="lg-ans-v" title="' + esc(full(t.price[2])) + '">' + short(t.price[2]) + '<small> typical price</small></span></p>' +
      '<p class="gwb-l" data-gwb-range>' + range + '</p>' +
      '<p class="gwb-l" data-gwb-size>' + esc(sizeText(t)) + ' Median ' + full(t.psf[2]) + ' psf.</p>' + win +
      (bud ? '<p class="gwb-l gwb-bud" data-gwb-budget>' + esc(bud) + '</p>' : '') + (opt.rent || '') +
      '<p class="lg-fine lg-ans-basis" data-gwb-basis>Past sales, not a valuation. ' + esc(basisText(t.basis)) + '</p>' + (opt.fresh || '') + '</div>';
  }
  // Price movement: the Market Pulse reading for the type's most-sold size; with no reading, why, and the way to the size trend.
  function trendHtml(V, opt) {
    opt = opt || {};
    const t = V.t;
    if (V.sale !== 'resale') return '<section class="mp gwb-mp" data-gwb-trend data-mp-state="other" aria-label="Price movement"><p class="mp-k">Price movement</p><h2 class="mp-h">Shown for resales only</h2><p class="mp-s">' + esc(words(V.sale)[1].charAt(0).toUpperCase() + words(V.sale)[1].slice(1)) + ' are priced by the developer or the seller’s purchase date, so a price direction isn’t read from them.</p></section>';
    const R = PULSE && PULSE.bedroomText ? PULSE.bedroomText(t) : null;
    if (!R) return '';
    const r = t.trend || {}, size = r.bin != null ? '<button type="button" class="kpr-link" data-bin="' + r.bin + '" data-gwb-size-trend>See how prices moved by size ›</button>' : '';
    return '<section class="mp gwb-mp" data-gwb-trend data-mp-dir="' + esc(r.dir || '') + '" data-mp-evidence="' + esc(r.evidence || 'none') + '" aria-label="Price movement">' +
      '<p class="mp-k">Price movement<span> · ' + esc(label(t.g)) + (R.band ? ', ' + esc(R.band) : '') + '</span></p>' +
      '<h2 class="mp-h" data-gwb-head>' + esc(R.head) + '</h2><p class="mp-s" data-gwb-sub>' + esc(R.sub) + '</p>' +
      '<p class="mp-fine">Measured on homes of one size only, so a change in which sizes sold doesn’t move it. Past sales, not a forecast.</p>' +
      '<p class="mp-acts">' + size + (opt.mapHref ? '<a href="' + esc(opt.mapHref) + '" data-mp-sales>See the individual sales on the Map ›</a>' : '') + '<a href="#next" data-lg-scroll="next" data-mp-next="' + esc(opt.forWho || '') + '">Ask Ken about a particular unit ›</a></p></section>';
  }
  // "The numbers" section: the chart is per size, so with a type chosen it points to the type's most-sold size.
  function numbersHtml(V) {
    const r = V.t && V.t.trend, b = r && r.bin != null ? r.bin : null;
    return '<div class="lg-tile lg-pickprompt" data-gwb-numbers><b>Price history is shown for one size at a time</b><p>One home type comes in several sizes, and the mix of sizes sold changes from year to year.' + (b != null ? ' The most-sold ' + esc(label(V.t.g)) + ' size here is ' + esc(PULSE.bandLabel(b)) + '.' : '') + '</p>' +
      (b != null ? '<button type="button" class="lg-btn" data-bin="' + b + '">See its price history</button>' : '<button type="button" class="lg-btn" data-lg-scroll="lgPick">Choose a size</button>') + '</div>';
  }

  /* ---------- what leaves the page ---------- */
  // WhatsApp: the type and its typical price from past sales (a chosen category, never anything typed).
  function finding(V) {
    if (!V || !V.t) return '';
    const t = V.t;
    return label(t.g) + ' ' + words(V.sale)[1] + ' at a typical ' + short(t.price[2]) + ' (' + plural(t.n, words(V.sale)) + ', ' + ym(t.from) + ' to ' + ym(t.to) + ')';
  }
  // "Run the numbers": the median price of these sales, to the nearest $1,000.
  function typical(V) {
    if (!V || !V.t || ['resale', 'new'].indexOf(V.sale) < 0) return null;
    const t = V.t;
    return { price: Math.round(t.price[2] / 1000) * 1000, text: 'Run the numbers at about ' + full(Math.round(t.price[2] / 1000) * 1000) + ', the median price of the ' + plural(t.n, words(V.sale)) + ' of ' + label(t.g) + ' homes here in ' + span(t.win) + ' (past sales, not a valuation):' };
  }

  // Sources: where the bedroom types come from, and when (the accepted classification and its 12-quarter rental window).
  function sourceText(V) {
    const m = V && V.meta; if (!m) return '';
    const q = (s) => { const x = /^(\d{2})q([1-4])$/.exec(s || ''); return x ? ['Jan', 'Apr', 'Jul', 'Oct'][x[2] - 1] + ' 20' + x[1] : s; }, qEnd = (s) => { const x = /^(\d{2})q([1-4])$/.exec(s || ''); return x ? ['Mar', 'Jun', 'Sep', 'Dec'][x[2] - 1] + ' 20' + x[1] : s; };
    return 'Bedroom types: inferred by Groundwork, not recorded by URA, from developers’ floor plans where checked, otherwise from the bedroom counts declared in URA rental contracts for homes of the same size' + (m.rentalWindow ? ' (' + q(m.rentalWindow.from) + ' to ' + qEnd(m.rentalWindow.to) + ')' : '') + '. Sales whose size fits more than one bedroom count are left out.';
  }

  return { sourceText, pick, view, chipsHtml, lineHtml, answerHtml, trendHtml, numbersHtml, basisText, sizeText, budgetText, finding, typical, short, label };
});
