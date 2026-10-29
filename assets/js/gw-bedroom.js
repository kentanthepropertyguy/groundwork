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
   "Matched sales only" (V2, Ken 27 Oct 2026): a type withheld from the figures (too ambiguous, or too few for a typical price) but with at least 3
   matched resales in the last 2 years is still offered, with counts only (resale.matched in the data). It never feeds a price statistic, trend,
   budget comparison, asking-price check or Budget Search, and every word shown for it must pass assertMatchedOnlyCopy.
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
  // V2: matched (every type with enough matched resales, figured or not, by bedroom count) and only (the matched-only ones, figures:false).
  // t: the chosen type with figures; m: the chosen type when it is matched-only (counts only). A type in "only" is no longer listed as "few".
  function view(rec, sale, want) {
    const s = rec && rec[sale], types = s && s.types ? s.types.slice().sort((a, b) => ORDER(a.g) - ORDER(b.g)) : [];
    const matched = s && s.matched ? s.matched.slice().sort((a, b) => ORDER(a.g) - ORDER(b.g)) : [], only = matched.filter((x) => !x.figures);
    if (!types.length && !only.length) return want ? { types: [], few: [], matched: [], only: [], g: null, missing: want } : null;
    const t = want ? types.find((x) => x.g === want) || null : null, m = want && !t ? only.find((x) => x.g === want) || null : null, og = only.map((x) => x.g);
    return { types, few: (s.few || []).filter((g) => og.indexOf(g) < 0).sort((a, b) => ORDER(a) - ORDER(b)), matched, only, of: s.of, unknown: s.unknown, coverage: s.coverage,
      g: t ? t.g : m ? m.g : null, t, m, missing: want && !t && !m ? want : null, sale, meta: rec.meta };
  }
  const anyType = (V) => !!(V && ((V.types && V.types.length) || (V.only && V.only.length)));   // the bedroom question is asked

  /* ---------- the choice ---------- */
  // Figured types and matched-only types together, in bedroom order. A matched-only chip says so on the chip itself.
  function chipsHtml(V) {
    const all = V.types.map((t) => ({ g: t.g, m: false })).concat((V.only || []).map((x) => ({ g: x.g, m: true }))).sort((a, b) => ORDER(a.g) - ORDER(b.g));
    return '<div class="lg-chips gwb-chips" role="group" aria-label="Bedrooms">' + all.map((c) => c.m
      ? '<button type="button" class="gwb-mchip" data-bed="' + esc(c.g) + '" data-gwb-tier="matched" aria-pressed="' + (V.g === c.g) + '" aria-label="' + esc(label(c.g)) + ', matched sales only">' + esc(label(c.g)) + '<span class="gwb-mtag" aria-hidden="true">' + MATCHED_TAG + '</span></button>'
      : '<button type="button" data-bed="' + esc(c.g) + '" aria-pressed="' + (V.g === c.g) + '">' + esc(label(c.g)) + '</button>').join('') + '</div>';
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

  /* ---------- a matched-only type: counts, never a price (V2) ---------- */
  const MATCHED_TAG = 'Matched sales only';
  // V2.1 (Amendment 1, Ken 29 Oct 2026): the panel lists up to this many of the type's own matched resales, newest first (GW_REC.matchedRows).
  const MATCHED_ROWS = 5, ROWS_HEAD = 'Latest matched resales', ROWS_NOTE = 'Individual sales, newest first, not a typical price.';
  // The panel in place of the answer, price movement and numbers blocks. Exactly the approved copy (Claude C's handover, section 3).
  // opt.tx: the development's transactions are on the page, so "See the N matched resales" can show them. opt.rows: their latest matched
  // resales as HTML (GW_REC.matchedRowsHtml of GW_REC.matchedRows), shown under the count; none without the transactions.
  function matchedLines(V) {
    const m = V.m, L = label(m.g), unk = V.unknown || 0, rs = (n) => plural(n, WORDS.resale);
    const one = rs(m.n24) + ' in the last 2 years ' + (m.n24 === 1 ? 'was' : 'were') + ' matched as ' + L + '. ' + basisText(m.basis);
    const two = m.couldBe > 0 ? num(m.couldBe) + ' other ' + WORDS.resale[m.couldBe === 1 ? 0 : 1] + ' here could also be ' + L + ' but could not be matched, so this is not every ' + L + ' sale.'
      : unk > 0 ? num(unk) + ' other ' + WORDS.resale[unk === 1 ? 0 : 1] + ' here could not be matched to a bedroom count, and ' + (unk === 1 ? 'it' : 'some') + ' may be ' + L + ', so this is not every ' + L + ' sale.' : '';
    const three = m.why === 'ambiguous' ? 'Because too many unmatched sales could be ' + L + ', no typical price or price movement is shown.' : 'There are too few matched sales to show a typical price or price movement.';
    return { one, two, three };
  }
  function matchedHtml(V, opt) {
    opt = opt || {};
    const m = V.m, L = matchedLines(V), first = L.one.indexOf('. ') + 1, lab = esc(label(m.g));
    const nw = (t) => esc(t).split(lab).join('<span class="gwb-nw">' + lab + '</span>');   // "3-bedroom" never breaks at its hyphen
    return '<div class="lg-ans gwb-m" data-gwb-matched data-gwb-g="' + esc(m.g) + '" data-gwb-why="' + esc(m.why) + '">' +
      '<p class="lg-ans-k gwb-m-k">' + esc(label(m.g)) + ' · <span class="gwb-mtag" data-gwb-mtag>' + MATCHED_TAG + '</span></p>' +
      '<p class="gwb-m1" data-gwb-m1><b>' + nw(L.one.slice(0, first)) + '</b> <span>' + esc(L.one.slice(first + 1)) + '</span></p>' +
      (opt.tx && opt.rows ? '<div class="gwb-mrows" data-gwb-mrows><p class="gwb-mrows-h">' + ROWS_HEAD + '</p><p class="gwb-mrows-n">' + ROWS_NOTE + '</p>' + opt.rows + '</div>' : '') +
      (L.two ? '<p class="gwb-l" data-gwb-m2>' + nw(L.two) + '</p>' : '') +
      '<p class="gwb-l gwb-m3" data-gwb-m3>' + nw(L.three) + '</p>' +
      (opt.tx ? '<p class="gwb-m-act"><button type="button" class="lg-btn" data-gwr-mbed="' + esc(m.g) + '">See the ' + num(m.n24) + ' matched ' + WORDS.resale[m.n24 === 1 ? 0 : 1] + '</button></p>' : '') + '</div>';
  }
  // V2.1: the rows block checked on its own (the panel's sentences still go through assertMatchedOnlyCopy without it). html: the block
  // ([data-gwb-mrows]); rows: the transaction rows it must be, in order (GW_REC.matchedRows). Each line is exactly one sale's month, size and
  // price (and its flags); the only other words are the heading and the note; newest first; nothing else, no statistic. Throws on any problem.
  function assertMatchedRows(html, rows) {
    const bad = [], t = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const items = (String(html).match(/<li[^>]*data-gwr-mrow[^>]*>[\s\S]*?<\/li>/g) || []).map(t);
    const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], FL = ['before the developer’s discount', 'unusual price for this development', 'unusual size for a [1-9]-bedroom'];
    if (!rows || items.length !== rows.length || items.length > MATCHED_ROWS) bad.push(items.length + ' lines for ' + (rows ? rows.length : 0) + ' sales');
    (rows || []).forEach((r, i) => {
      const want = MO[(r[0] % 100) - 1] + ' ' + Math.floor(r[0] / 100) + ' ≈ ' + num(r[3] * 10.7639) + ' sq ft $' + num(r[4]), got = items[i] || '';
      if (got.indexOf(want) !== 0 || !new RegExp('^(\\s*(' + FL.join('|') + ')( · )?)*$').test(got.slice(want.length))) bad.push('line ' + (i + 1) + ' "' + got + '" is not the sale "' + want + '"');
      if (i && r[0] > rows[i - 1][0]) bad.push('not newest first');
    });
    let rest = t(String(html).replace(/<li[^>]*data-gwr-mrow[^>]*>[\s\S]*?<\/li>/g, ' ')).split(ROWS_HEAD).join(' ').split(ROWS_NOTE).join(' ').trim();
    if (rest) bad.push('other text: "' + rest + '"');
    const words = t(html).split(ROWS_NOTE).join(' ');
    [BLOCKED[3]].concat(BLOCKED.slice(7)).forEach((re) => {   // psf, statistics, ranges, movement, budget, completeness (sizes and prices are the point)
      const x = re.exec(words); if (x) bad.push('blocked "' + x[0] + '"'); });
    if (bad.length) throw new Error('matched rows: ' + bad.join('; '));
    return true;
  }

  // Copy validation (handover section 4): block price statistics and misleading claims; allow explaining why a statistic is absent.
  // text: what a visitor reads for a matched-only type; record: the matched entry plus the development's of / unknown (or, for the Transactions
  // notice, { N, M }); opt.part: 'panel' (default, also checks the required content), 'line' or 'notice'. Throws with every problem found.
  const MATCHED_ONLY_ALLOWED = ['no typical price or price movement is shown', 'too few matched sales to show a typical price or price movement', 'so this is not every {label} sale', 'Matched sales only'];
  const BLOCKED = [/\$\s?\d/i, /\bS\$/i, /\b\d+(\.\d+)?\s?[km]\b/i, /psf/i, /per\s+sq(uare)?\.?\s*f(oo)?t/i, /sq\s?ft/i, /sqft/i, /\b(median|average|mean|typical|representative|usual)\b/i,
    /\b(price range|middle half|lowest|highest|cheapest|most expensive|ranged? from)\b/i, /\b(trend|trending|rose|rise|rising|fell|fall|falling|increase[ds]?|decrease[ds]?|appreciat\w*|higher|lower)\b/i, /\d+\s?%/i,
    /\b(budget|afford\w*|within your|above your|below your)\b/i, /\b(all|every|each|whole|entire|complete|total|represent\w*)\b/i];
  function assertMatchedOnlyCopy(text, record, opt) {
    opt = opt || {};
    const part = opt.part || 'panel', recs = [].concat(record || []), bad = [];
    const lab = (r) => (r && r.g ? label(r.g) : '');
    let rest = String(text == null ? '' : text).replace(/\s+/g, ' ');
    MATCHED_ONLY_ALLOWED.forEach((ph) => { recs.concat([{}]).forEach((r) => { const p = ph.replace('{label}', lab(r) || '\u0000'); rest = rest.split(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')).join(' '); }); });
    BLOCKED.forEach((re) => { const x = re.exec(rest); if (x) bad.push('blocked "' + x[0] + '"'); });
    const allowed = new Set(); recs.forEach((r) => ['n12', 'n24', 'couldBe', 'unknown', 'of', 'N', 'M'].forEach((k) => { if (r && r[k] != null) allowed.add(Number(r[k])); }));
    const nums = rest.replace(/\b[1-5]-bedroom\b|\bStudio\b|\bPenthouse\b/gi, ' ').replace(/last 2 years/gi, ' ').match(/\d[\d,]*/g) || [];
    nums.forEach((n) => { const v = Number(n.replace(/,/g, '')); if (!allowed.has(v)) bad.push('number ' + n + ' is not in the record'); });
    if (part === 'panel') {
      const r = recs[0] || {}, L = lab(r), t = String(text);
      if (!(new RegExp('\\b' + r.n24 + ' resales?\\b').test(t))) bad.push('no matched count');
      if (t.indexOf('last 2 years') < 0) bad.push('no "last 2 years" window');
      if (t.indexOf(basisText(r.basis)) < 0) bad.push('no basis sentence');
      if ((r.couldBe > 0 || r.unknown > 0) && t.indexOf('so this is not every ' + L + ' sale') < 0) bad.push('no "not every ' + L + ' sale" sentence');
      const three = r.why === 'ambiguous' ? 'Because too many unmatched sales could be ' + L + ', no typical price or price movement is shown.' : 'There are too few matched sales to show a typical price or price movement.';
      if (t.indexOf(three) < 0) bad.push('wrong or missing reason for ' + r.why);
    }
    if (bad.length) throw new Error('matched-only copy: ' + bad.join('; ') + ' in: ' + text);
    return true;
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

  return { MATCHED_TAG, MATCHED_ROWS, ROWS_HEAD, ROWS_NOTE, assertMatchedRows, MATCHED_ONLY_ALLOWED, assertMatchedOnlyCopy, anyType, matchedLines, matchedHtml, sourceText, pick, view, chipsHtml, lineHtml, answerHtml, trendHtml, numbersHtml, basisText, sizeText, budgetText, finding, typical, short, label };
});
