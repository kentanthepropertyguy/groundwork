/* ==========================================================================
   KPT "Data-based comparison": the Research V2 presentation, filled from the data for ANY two developments.
   Presentation only. Every figure is read from the model that kpt-research.js builds from the generated cells; the strength of the evidence
   comes from kpt-evidence.js. Nothing here is typed per project, and nothing here calls anything a better buy, a bargain or a winner.
   Mounted by research/index.html in place of the older text-heavy comparison. Same address, same hooks (data-sale, data-win, #wa, #cmp).
   UMD: window.KPTV2 and Node (the Node export is used by the tests).
   ========================================================================== */
(function (root, factory) {
  const E = typeof module === 'object' && module.exports ? require('./kpt-evidence.js') : root.KPT_EVIDENCE;
  const api = factory(E, root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.KPTV2 = api;
})(typeof self !== 'undefined' ? self : this, function (E, root) {
  'use strict';

  const LABEL = 'Data-based comparison';
  const DISCLAIMER = 'Generated from available URA transaction records using consistent comparison rules. It describes historical transactions and is not personalised advice, a valuation or a forecast.';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  const money = (n) => '$' + num(n);
  const SALE_CODE = { new: 1, sub: 2, resale: 3 };
  // A4-08, A4-09: the period the URA records cover and when they were retrieved (from the data manifest), with the latest month's caveat.
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ymLabel = (s) => { const a = String(s || '').split('-').map(Number); return a[1] ? MON[a[1] - 1] + ' ' + a[0] : ''; };
  const dayLabel = (s) => { const a = String(s || '').split('-').map(Number); return a[2] ? a[2] + ' ' + MON[a[1] - 1] + ' ' + a[0] : ''; };
  const dataSpan = (m) => (m && m.monthStart && m.latestMonth ? 'URA private residential transactions, ' + ymLabel(m.monthStart) + ' to ' + ymLabel(m.latestMonth) + (m.asOf ? ' (retrieved ' + dayLabel(m.asOf) + ')' : '') + '. ' + ymLabel(m.latestMonth) + ' may be incomplete: sales reported later are added in later updates.' : 'URA private residential transactions.');

  /* ---------- a development's own most active size (facts for its card; never compared across projects) ---------- */
  function ownBand(R, P, proj, m, saleLabel) {
    const code = SALE_CODE[saleLabel]; if (!code) return null;
    const cells = P.cells(proj, m).window.filter((c) => c.sale === code), w12 = m.windows.indexOf(12), wAll = m.windows.indexOf('all');
    const in12 = cells.filter((c) => c.win === w12), tot12 = in12.reduce((t, c) => t + c.n, 0);
    const best = (arr) => arr.slice().sort((x, y) => y.n - x.n || x.bin - y.bin)[0];
    let c = best(in12), older = false;
    if (!c) { c = best(cells.filter((x) => x.win === wAll)); older = true; }
    if (!c) return null;
    return { bin: c.bin, label: R.bandLabel(c.bin, m.bin), n: c.n, months: c.act, last: c.last, latestLabel: R.fmtMonth(c.last), psf: P.dist5([c.min, c.q1, c.med, c.q3, c.max]), older, total12: tot12, sale: saleLabel };
  }
  const SALE_WORD = { resale: 'resale', new: 'new sale', sub: 'sub-sale' };
  // When a development has no sales in the compared sale type, show its own figures in the sale type it does have, clearly labelled and never set against the other side.
  function ownAny(R, P, proj, m, prefer) {
    const first = prefer ? ownBand(R, P, proj, m, prefer) : null; if (first) return first;
    const order = ['resale', 'new', 'sub'].filter((k) => k !== prefer && proj.sale && proj.sale[k] > 0).sort((x, y) => proj.sale[y] - proj.sale[x]);
    for (let i = 0; i < order.length; i++) { const o = ownBand(R, P, proj, m, order[i]); if (o) { o.otherSale = true; return o; } }
    return null;
  }
  const salesOnRecord = (proj) => ['resale', 'new', 'sub'].filter((k) => proj && proj.sale && proj.sale[k] > 0).map((k) => num(proj.sale[k]) + ' ' + SALE_WORD[k] + (proj.sale[k] === 1 ? '' : 's')).join(' · ') || 'None';

  /* ---------- small drawing helpers ---------- */
  const layer = (kind, text) => '<span class="v2-layer ' + kind + '">' + esc(text) + '</span>';
  function history(R, series, nameA, nameB) {
    const W = 360, H = 190, L = 12, Rr = 12, T = 26, B = 44;
    const labels = series.map((p) => p.label), vals = []; series.forEach((p) => { vals.push(p.a.med, p.b.med); });
    let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals); const pad = (hi - lo) * 0.18 || 30; lo -= pad; hi += pad;
    const xs = (i) => (labels.length === 1 ? W / 2 : L + 16 + i * ((W - L - Rr - 32) / (labels.length - 1))), ys = (v) => T + (hi - v) / (hi - lo) * (H - T - B);
    const short = (l) => { const e = String(l).split('–')[1] || l, a = e.split(' '); return a[0] + ' ’' + String(a[1]).slice(2); };
    let g = '';
    labels.forEach((l, i) => { g += '<text x="' + xs(i) + '" y="' + (H - 24) + '" text-anchor="middle" class="ax">' + esc(short(l)) + '</text>'; });
    [['a', 'sa'], ['b', 'sb']].forEach((s, si) => {
      const off = si ? 7 : -7, pts = series.map((p, i) => ({ x: xs(i) + off, y: ys(p[s[0]].med), n: p[s[0]].n, med: p[s[0]].med }));
      if (pts.length > 1) g += '<polyline class="ln ' + s[1] + '" fill="none" points="' + pts.map((q) => q.x + ',' + q.y).join(' ') + '"/>';
      pts.forEach((q) => { g += '<circle class="pt ' + s[1] + '" cx="' + q.x + '" cy="' + q.y + '" r="4"/><text class="nn ' + s[1] + '" x="' + q.x + '" y="' + (H - 9) + '" text-anchor="middle">n=' + q.n + '</text>'; });
    });
    return '<div class="v2-hist"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Median PSF by 12-month period for ' + esc(nameA) + ' and ' + esc(nameB) + ', oldest to newest, approximate">' + g + '</svg><p class="v2-key"><i class="sa"></i>' + esc(nameA) + ' &nbsp; <i class="sb"></i>' + esc(nameB) + '</p></div>';
  }

  /* ---------- the page ---------- */
  const SAMPLE = { v: null };
  function suggestHtml(M, ev, ctx) {
    const I = M.interpretation; if (!I || ev.state === 'insufficient') return '';
    const paras = I.paragraphs.filter((p) => ev.state === 'stronger' || p.id === 'lead' || p.id === 'caution');
    return '<section class="v2-sec" id="v2-read" aria-labelledby="v2rh"><div class="v2-sh"><h2 id="v2rh">What the numbers suggest</h2>' + layer('auto', 'Automated reading · rule-based, not Ken’s view') + '</div>' +
      paras.map((p) => '<p class="v2-p">' + esc(p.text) + '</p>').join('') + (ev.state === 'stronger' ? '<div class="v2-judge"><b>Still needs judgement</b><p>' + esc(I.question) + '</p></div>' : '') + '</section>';
  }
  function timeHtml(M) {
    if (!M.history || !M.history.bands.length) return '';
    return '<details class="v2-d"><summary>Matched sizes over time</summary><div class="in">' + M.history.bands.slice(0, 3).map((h) => '<h3 class="v2-h3">' + esc(h.label) + '</h3>' + history(null, h.points, M.a.name, M.b.name) + '<p class="v2-p">' + esc(h.text) + '</p>').join('') + '<p class="v2-muted">' + esc(M.history.note) + '</p></div></details>';
  }
  function requestMessage(M) {
    let seen = false; try { seen = sessionStorage.getItem('kpt_sample_seen') === '1'; } catch (e) { seen = false; }
    return 'Hi Ken, I\'ve compared ' + M.a.name + ' and ' + M.b.name + ' on Groundwork' + (seen ? ' and viewed the sample research' : '') + '. I\'d like to understand these two developments in more detail.';
  }
  function evidenceHtml(M, ev, ctx) {
    const cfg = E.CONFIG, s = cfg.stronger, mn = cfg.minimum, q = new Set(ev.qualifying);
    const defs = '<table class="v2-table"><thead><tr><th scope="col">Evidence</th><th scope="col">What it needs</th></tr></thead><tbody>' +
      '<tr><th scope="row">Stronger</th><td>The last 12 months. At least ' + s.sales + ' sales over ' + s.months + ' months on each side in the same size band. Each side’s latest sale within ' + s.maxMonthsSinceLatest + ' months of the data end. The matched sizes cover more than ' + Math.round(s.minCoverage * 100) + '% of each project’s sales.</td></tr>' +
      '<tr><th scope="row">Limited</th><td>At least ' + mn.sales + ' sales over ' + mn.months + ' months on each side in the same size band, but not the stronger rule, or evidence from an older window. Shown as indicative, never as a conclusion.</td></tr>' +
      '<tr><th scope="row">Insufficient</th><td>No shared size band meets the minimum in any window, no shared sale type, or full-history evidence whose latest sale is over ' + cfg.allHistoryMaxMonthsSinceLatest + ' months old. No price gap is shown.</td></tr></tbody></table>';
    const bands = M.bands.length ? '<div class="v2-scroll"><table class="v2-table"><caption>Matched size bands in the ' + esc(M.windowLabel || 'selected window') + '</caption><thead><tr><th scope="col">Size</th><th scope="col">' + esc(M.a.name) + '</th><th scope="col">' + esc(M.b.name) + '</th><th scope="col">Meets minimum</th></tr></thead><tbody>' +
      M.bands.slice().sort((x, y) => x.bin - y.bin).map((b) => '<tr><th scope="row">' + esc(b.label) + '</th><td>' + esc(b.a.evidence.line) + ' · median ' + money(b.a.psf.med) + '</td><td>' + esc(b.b.evidence.line) + ' · median ' + money(b.b.psf.med) + '</td><td>' + (q.has(b.bin) ? 'Yes' : 'No') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="v2-p">No shared size band in this window.</p>';
    const lad = '<div class="v2-scroll"><table class="v2-table"><caption>Every time window</caption><thead><tr><th scope="col">Window</th><th scope="col">Shared bands</th><th scope="col">Sales covered</th></tr></thead><tbody>' + M.ladder.map((l) => '<tr><th scope="row">' + esc(cap(l.label)) + '</th><td>' + (l.hasMatch ? l.bands : 'None') + '</td><td>' + (l.hasMatch ? esc(M.a.name) + ' ' + l.coverage.aN + ' of ' + l.coverage.aOf + ' · ' + esc(M.b.name) + ' ' + l.coverage.bN + ' of ' + l.coverage.bOf : '—') + '</td></tr>').join('') + '</tbody></table></div>';
    const layers = '<ul class="v2-layers"><li>' + layer('fact', 'Facts') + ' URA transaction records and sourced project facts.</li><li>' + layer('calc', 'Calculated') + ' Medians, counts and gaps worked out from those records, the same way for every pair.</li><li>' + layer('auto', 'Automated reading') + ' Plain-language summary written by fixed rules. It is not written by a person and is not Ken’s view.</li><li>' + layer('ken', 'Ken’s Take') + ' Shown only where Ken has written or approved a comment.</li></ul>';
    return '<details class="v2-d v2-evidence" id="v2-how"><summary><span>Evidence and method</span><small>How strong this is, sample sizes, windows, what the sales cannot show</small></summary><div class="in">' +
      '<h3 class="v2-h3">How this comparison is rated: ' + esc(ev.label) + '</h3>' + defs +
      '<h3 class="v2-h3">The sales behind it</h3>' + bands + lad +
      '<h3 class="v2-h3">The four kinds of statement on this page</h3>' + layers +
      '<h3 class="v2-h3">What the transactions cannot tell you</h3><ul class="v2-list">' + M.notMeasured.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
      '<h3 class="v2-h3">Data</h3><p class="v2-p">' + esc(dataSpan(ctx.m)) + esc(newNote(M)) + ' ' + esc(M.notes.psf) + ' ' + esc(M.notes.history) + ' ' + esc(M.notes.floor) + ' ' + esc(M.notes.substitute) + '</p>' +
      '<p class="v2-muted">Rating rules: ' + esc(cfg.version) + '.</p></div></details>';
  }

  // The window to open on: the first one that gives usable evidence, otherwise the engine's own default.
  // Which sale type to open on when the link names none: the engine's default, unless its evidence is insufficient and another shared sale type has a qualifying band.
  function bestSale(R, A, B, m) {
    const base = R.analyseComparison(A, B, m, {}); if (!base.sale || !base.sale.selected) return undefined;
    const stateFor = (s) => { const dw = E.defaultWindow((i) => R.analyseComparison(A, B, m, { sale: s, window: i }), m.windows.length); return dw ? dw.state.state : 'insufficient'; };
    if (stateFor(base.sale.selected) !== 'insufficient') return undefined;
    const alt = base.sale.options.map((o) => o.id).filter((s) => s !== base.sale.selected);
    for (let i = 0; i < alt.length; i++) if (stateFor(alt[i]) !== 'insufficient') return alt[i];
    return undefined;
  }
  function defaultWindow(R, A, B, m, sale) {
    const base = R.analyseComparison(A, B, m, { sale: sale || undefined });
    if (!base.sale || !base.sale.selected) return null;
    const an = (i) => R.analyseComparison(A, B, m, { sale: base.sale.selected, window: i });
    const d = E.defaultWindow(an, m.windows.length); return d ? d.windowIndex : null;
  }

  /* ---------- the comparison page (KPT redesign, Oct 2026) ----------
     Order: hero (one honest paragraph + evidence pill) · side by side · questions a buyer would ask · show me the numbers · the full sample · Ken.
     Every sentence is assembled from the model (and, after drawing, from the registry's sourced facts); a sentence whose fields are missing is left out. */
  // A4-24: URA also lists a net price after developer discounts for some new sales; figures here use the recorded price.
  const newNote = (M) => (M.sale && M.sale.selected === 'new' ? ' New-sale prices are as URA records them, before any developer rebate.' : '');
  const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const titleCase = (s) => String(s || '').toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
  const sqft = (label) => String(label || '').replace(/\s*sqft$/, ' sq ft');
  const REGION = { CCR: 'Core Central Region', RCR: 'Rest of Central Region', OCR: 'Outside Central Region' };
  const diff = (M, l) => M.differences.find((d) => d.label === l) || {};
  const leaseYear = (s) => { const x = /from (\d{4})/.exec(String(s || '')); return x ? Number(x[1]) : null; };
  // A4-05: a few developments have sales on more than one tenure (Orchard Court: 99 and 993 years). Their lease is never printed as one
  // value, and lease comparisons leave them out. MIX is set from the raw records when the page is drawn.
  const MIX = { a: null, b: null };
  const mixedText = (t) => 'Mixed tenure in these records' + (t && t.variants && t.variants.length ? ' (' + t.variants.map((v) => v[0]).join('; ') + ')' : '');
  const leaseOf = (M, side) => (MIX[side] ? null : diff(M, 'Lease')[side]);
  const isFree = (s) => /freehold/i.test(String(s || ''));
  const saleWords = (M) => ({ resale: ['resale', 'resales'], 'new sale': ['new sale', 'new sales'], 'sub-sale': ['sub-sale', 'sub-sales'] }[M.sale && M.sale.label] || ['sale', 'sales']);
  const poss = (n) => n + (/s$/i.test(n) ? '’' : '’s');

  // S1: what the records say about the two, before prices (lease and tenure; home counts are added from sourced facts after drawing).
  function leadFacts(M) {
    if (MIX.a || MIX.b) return (MIX.a && MIX.b ? 'Both have' : poss(MIX.a ? M.a.name : M.b.name) + ' records have') + ' sales on more than one tenure, so their leases are not compared here.';
    const l = diff(M, 'Lease'), ya = leaseYear(l.a), yb = leaseYear(l.b), A = M.a.name, B = M.b.name;
    if (ya && yb && ya !== yb) { const later = ya > yb ? A : B; return poss(later) + ' lease started ' + plural(Math.abs(ya - yb), 'year') + ' later (' + Math.max(ya, yb) + ' against ' + Math.min(ya, yb) + ').'; }
    if (ya && yb) return 'Both leases started in ' + ya + '.';
    if (isFree(l.a) !== isFree(l.b) && (l.a || l.b)) return (isFree(l.a) ? A : B) + ' is freehold and ' + (isFree(l.a) ? B : A) + ' is leasehold.';
    return '';
  }
  function leadPrice(M, ev) {
    if (!ev.band) return '';
    const g = ev.band.gap, w = saleWords(M), hi = g.dir === 'a' ? M.a.name : M.b.name, band = sqft(ev.band.label);
    const first = ev.state === 'limited' ? 'On the few sales available, ' : '';
    if (g.dir === 'level') return cap(first + 'recent ' + w[1] + ' of ' + band + ' homes cost about the same per square foot (PSF) at both.');
    const s = cap(first + poss(hi) + ' recent ' + w[1] + ' of ' + band + ' homes cost about ' + E.pctText(g.pct) + ' (' + money(g.abs) + ') more per square foot (PSF).');
    return s + (ev.close ? ' The middle ranges overlap, so the two are close.' : ' That gap is worth understanding, but on its own it doesn’t say which one suits you better.');
  }
  function evidencePill(M, ev, ctx) {
    const w = saleWords(M), fb = [];
    if (ev.band && ev.windowIndex) fb.push('The last 12 months were too thin, so this uses the ' + ev.windowLabel + '.');
    if (ctx && ctx.saleFallback) fb.push('Compared on ' + w[1] + ', the sale type with enough matched sales on both sides.');
    const tail = fb.length ? ' ' + fb.join(' ') : '';
    if (ev.state === 'stronger') return '<span class="lg-pill" data-lg-ev="stronger">Based on ' + ev.band.a.n + ' and ' + ev.band.b.n + ' ' + w[1] + ' of ' + esc(sqft(ev.band.label)) + ' homes in the ' + esc(ev.windowLabel) + '. Enough to compare fairly.' + esc(tail) + '</span>';
    if (ev.state === 'limited') return '<span class="lg-pill warn" data-lg-ev="limited">Based on only ' + ev.band.a.n + ' and ' + ev.band.b.n + ' ' + w[1] + ' of ' + esc(sqft(ev.band.label)) + ' homes in the ' + esc(ev.windowLabel) + '. Read this as a first look, not a settled price.' + esc(tail) + '</span>';
    return '<span class="lg-pill grey" data-lg-ev="insufficient">There aren’t enough similar recent sales to compare prices fairly.</span>';
  }
  // Plain reasons a price comparison is not possible (Phase 4 headings, kept).
  const INSUFFICIENT = {
    'no-shared-sale-type': { title: 'These two have no sale type in common.', text: 'One has sold only as new sales or sub-sales and the other only as resales (or similar), so there is no like-for-like price to compare. Each development’s own sales are listed under How often homes sell, labelled with their sale type.' },
    'all-history-stale': { title: 'The only like-for-like sales are more than two years old.', text: 'Both developments have sales in a shared size, but the latest of them is too old to say anything about prices today. Each development’s own recent sales are listed under How often homes sell.' },
    'no-qualifying-band': { title: 'No size has enough sales on both sides yet.', text: 'The two sell mostly in different sizes, or too few homes have changed hands in any size they share. Each development’s own most active size is listed under How often homes sell.' },
  };
  function heroLead(M, ev) {
    if (ev.state === 'insufficient') { const why = INSUFFICIENT[(ev.reasons[0] || {}).id] || { title: 'Not enough matched evidence to compare prices.', text: '' }; return '<b>' + esc(why.title) + '</b> ' + esc(why.text); }
    return ['<span data-lg-s1>' + esc(leadFacts(M)) + '</span>', esc(leadPrice(M, ev))].filter((x) => x && x !== '<span data-lg-s1></span>').join(' ');
  }

  /* side by side */
  function rangeAxis(ev) {
    const v = [ev.band.a.q1, ev.band.a.q3, ev.band.b.q1, ev.band.b.q3, ev.band.a.med, ev.band.b.med];
    const lo = Math.floor((Math.min.apply(null, v) - 60) / 100) * 100, hi = Math.ceil((Math.max.apply(null, v) + 60) / 100) * 100;
    return { lo, hi };
  }
  function rangeHtml(st, ax, col, who) {
    const x = (val) => Math.max(0, Math.min(100, (val - ax.lo) / (ax.hi - ax.lo) * 100)).toFixed(1);
    return '<div class="lg-rb" role="img" aria-label="' + esc(who) + ': the middle half of sales between ' + money(st.q1) + ' and ' + money(st.q3) + ' per square foot, typical ' + money(st.med) + '"><div class="t"><i style="left:' + x(st.q1) + '%;width:' + Math.max(1, x(st.q3) - x(st.q1)) + '%;background:' + col + '"></i><b style="left:' + x(st.med) + '%;background:' + col + '"></b></div>' +
      '<span class="ax"><span>' + money(ax.lo) + '</span><span>middle half of sales ' + money(st.q1) + '–' + money(st.q3) + ' · ' + plural(st.n, 'sale') + '</span><span>' + money(ax.hi) + '</span></span></div>';
  }
  function sideCard(side, M, ev, ax) {
    const nm = M[side].name, st = ev.band ? ev.band[side] : null, col = side === 'a' ? '#5a55d6' : '#2f7c97';
    const where = [titleCase(diff(M, 'Street')[side]), diff(M, 'District')[side] ? 'District ' + String(diff(M, 'District')[side]).replace(/^D/, '') : ''].filter(Boolean).join(' · ');
    const lease = leaseOf(M, side), size = diff(M, 'Typical unit size')[side], reg = diff(M, 'Region')[side];
    const facts = [MIX[side] ? mixedText(MIX[side]) : '', lease ? (isFree(lease) ? 'Freehold' : String(lease).replace(/(\d+) yrs from (\d{4})/, '$1-year lease from $2')) : '', size ? 'Typical home sold here: about ' + sqft(size) : '', REGION[reg] || reg || ''].filter(Boolean);
    return '<article class="lg-card lg-pc ' + side + '"><span class="who" data-lg-who="' + side + '">' + esc(where) + '</span><h2>' + esc(nm) + '</h2>' +
      (st ? '<p class="big">' + money(st.med) + '<small>PSF</small></p>' + rangeHtml(st, ax, col, nm)
        : '<p class="none">No price shown: there is nothing like-for-like to set against the other.</p><a class="lg-btn" href="#/p/' + esc(M[side].id) + '" style="justify-self:start">See ' + esc(poss(nm)) + ' own sales ›</a>') +
      '<ul data-lg-cardfacts="' + side + '">' + facts.map((f) => '<li>' + esc(f) + '</li>').join('') + '</ul></article>';
  }
  function sideNote(M, ev) {
    if (!ev.band) return 'Facts from URA records' + (Object.keys(factIds).length ? ' and sourced project pages' : '') + '. Small numbers are sources.';
    const w = saleWords(M), small = [['a', ev.band.a.n], ['b', ev.band.b.n]].filter((x) => x[1] < 10).sort((x, y) => x[1] - y[1])[0];
    return 'Typical price is the median ' + w[0] + ' price per square foot (PSF) for ' + sqft(ev.band.label) + ' homes, ' + ev.windowLabel + '. Not adjusted for age, floor, facing or condition.' +
      (small ? ' ' + cap(small[1] < 10 ? SMALL[small[1]] : String(small[1])) + ' is a small number of sales, so a few unusual units can move ' + poss(M[small[0]].name) + ' figure.' : '') +
      (MIX.a || MIX.b ? ' ' + (MIX.a && MIX.b ? 'Both figures mix' : poss(MIX.a ? M.a.name : M.b.name) + ' figure mixes') + ' sales on different tenures.' : '') + newNote(M) + ' Small numbers are sources.';
  }

  /* questions a buyer would ask: only questions the records can answer are asked */
  function questions(M, ev) {
    const A = M.a.name, B = M.b.name, out = [];
    // What am I paying more for? (only when there is a price gap)
    if (ev.band && ev.band.gap.dir !== 'level') {
      const s = [], l = { a: leaseOf(M, 'a'), b: leaseOf(M, 'b') }, ya = leaseYear(l.a), yb = leaseYear(l.b), hi = ev.band.gap.dir === 'a' ? A : B;
      if (MIX.a || MIX.b) s.push((MIX.a && MIX.b ? 'Both developments have' : (MIX.a ? A : B) + ' has') + ' sales on more than one tenure in these records, and the typical price mixes them. Ask which tenure a unit is on.');
      if (ya && yb && Math.abs(ya - yb) >= 3) s.push(poss(ya > yb ? A : B) + ' lease started ' + plural(Math.abs(ya - yb), 'year') + ' later (' + Math.max(ya, yb) + ' against ' + Math.min(ya, yb) + '). That is lease age, not building age, so check each development’s completion (TOP) date too.');
      else if (isFree(l.a) !== isFree(l.b) && (ya || yb)) s.push((isFree(l.a) ? A : B) + ' is freehold and ' + (isFree(l.a) ? B : A) + ' is leasehold. Tenure can affect price, financing and how long you would want to hold.');
      const rg = diff(M, 'Region'); if (rg.a && rg.b && rg.a !== rg.b) s.push('They sit in different market segments (' + (REGION[rg.a] || rg.a) + ' and ' + (REGION[rg.b] || rg.b) + '), which tend to price differently for reasons beyond the building itself.');
      if (s.length) s.push('Prices here are not adjusted for any of that, so part of the ' + E.pctText(ev.band.gap.pct) + ' gap may reflect it.');
      else { const same = []; if (ya && yb) same.push(ya === yb ? 'leases that started in the same year' : 'leases that started within ' + plural(Math.abs(ya - yb), 'year') + ' of each other (' + Math.min(ya, yb) + ' and ' + Math.max(ya, yb) + ')'); if (rg.a && rg.a === rg.b) same.push('the same market segment'); s.push((same.length ? 'The records show ' + same.join(' and ') + ', so those don’t account for ' + poss(hi) + ' higher figure. ' : '') + 'Look at the units themselves: floor, facing, layout and condition all move price.'); }
      out.push(['What am I paying more for?', s.join(' ')]);
    }
    // What am I trading off? (other sizes both sell in)
    if (ev.band && ev.qualifying.length > 1) {
      const others = M.bands.filter((b) => ev.qualifying.indexOf(b.bin) > -1 && b.bin !== ev.band.bin).sort((x, y) => x.bin - y.bin).slice(0, 2);
      const s = others.map((b) => { const g = E.gapOf(b); return g.dir === 'level' ? 'In ' + sqft(b.label) + ' homes the two are level.' : 'In ' + sqft(b.label) + ' homes ' + (g.dir === 'a' ? A : B) + ' is about ' + E.pctText(g.pct) + ' higher (' + b.a.n + ' and ' + b.b.n + ' sales).'; });
      if (ev.mixed) s.push('Because the gap points different ways in different sizes, the size you would buy matters more than the headline.');
      s.push('Neither figure makes one development better in itself; it depends on the home you would actually buy.');
      out.push(['What am I trading off?', s.join(' ')]);
    }
    // What should I check before deciding? (always)
    const c = [];
    if (ev.state === 'stronger') c.push('The figures rest on ' + ev.band.a.n + ' and ' + ev.band.b.n + ' recent sales in one size. A particular unit can still differ: floor, facing, stack and condition all move price.');
    else if (ev.state === 'limited') c.push('With few matched sales, ask for recent sales of the exact unit type in each before relying on these figures.');
    else c.push('Ask for recent sales of the exact unit type in each development; that is the comparison these records cannot make yet.');
    c.push('Walk to transport at the time you would commute, and ask each MCST what the monthly fees are and what they cover. None of this is in the sales records.');
    out.push(['What should I check before deciding?', c.join(' ')]);
    return out;
  }
  function questionsHtml(M, ev) {
    const q = questions(M, ev);
    return '<section class="lg-band" id="matters"><div class="lg-wrap" style="gap:26px"><div class="lg-head"><p class="lg-kicker">What this means for you</p><h2>' + (q.length === 4 ? 'Four questions' : q.length === 3 ? 'Three questions' : q.length === 2 ? 'Two questions' : 'One question') + ' a buyer would ask.</h2></div>' +
      '<div class="lg-g2">' + q.map((x) => '<div class="lg-tile lg-q"><h3>' + esc(x[0]) + '</h3><p>' + esc(x[1]) + '</p></div>').join('') + '</div>' +
      '<p class="lg-fine lg-center">Written automatically from the sourced facts and sales above. Not Ken’s personal view.</p></div></section>';
  }

  /* show me the numbers */
  function rankedBars(M, ev) {
    const q = M.bands.filter((b) => ev.qualifying.indexOf(b.bin) > -1).sort((x, y) => x.bin - y.bin);
    if (!q.length) return '';
    const max = Math.max.apply(null, q.map((b) => Math.max(b.a.psf.med, b.b.psf.med))), wpc = (v) => (v / max * 100).toFixed(1);
    const rows = q.map((b) => {
      // A4-01: "less" is measured against the higher price (gapOf's pct is against the lower one, which is right for "more").
      const g = E.gapOf(b), lowA = g.dir === 'b', lowB = g.dir === 'a', hiMed = Math.max(b.a.psf.med, b.b.psf.med), less = hiMed ? g.abs / hiMed * 100 : 0;
      const lab = (v, low) => money(v) + (low ? ' · ' + E.pctText(less) + ' less' : '');
      return '<div class="lg-row' + (ev.band && ev.band.bin === b.bin ? ' head' : '') + '"><div class="lab">' + esc(sqft(b.label)) + '<small>' + b.a.n + ' and ' + b.b.n + ' sales' + (ev.band && ev.band.bin === b.bin ? ' · headline size' : '') + (b.isFocus ? ' · your size' : '') + '</small></div>' +
        '<div class="bars"><div class="lg-bar" role="img" aria-label="' + esc(M.a.name) + ' ' + money(b.a.psf.med) + ' PSF"><i style="width:' + wpc(b.a.psf.med) + '%;background:#5a55d6"></i><span class="lg-bval">' + lab(b.a.psf.med, lowA) + '</span></div>' +
        '<div class="lg-bar" role="img" aria-label="' + esc(M.b.name) + ' ' + money(b.b.psf.med) + ' PSF"><i style="width:' + wpc(b.b.psf.med) + '%;background:#2f7c97"></i><span class="lg-bval">' + lab(b.b.psf.med, lowB) + '</span></div></div></div>';
    }).join('');
    const left = M.bands.length - q.length;
    return '<div class="lg-card" style="gap:22px;padding:30px 32px"><div class="lg-rows">' + rows + '</div>' +
      '<div class="lg-key"><span><i style="background:#5a55d6"></i>' + esc(M.a.name) + '</span><span><i style="background:#2f7c97"></i>' + esc(M.b.name) + '</span><span>Median ' + esc(saleWords(M)[0]) + ' PSF, ' + esc(ev.windowLabel) + '</span></div>' +
      (left > 0 ? '<p class="lg-fine">' + plural(left, 'other size') + ' had too few sales on one side to compare.</p>' : '') + '</div>';
  }
  function activityHtml(M, ctx, own) {
    const rows = M.differences.map((d) => (d.label === 'Sales in the data' && ctx ? { label: 'Sales on record', a: salesOnRecord(ctx.A), b: salesOnRecord(ctx.B) }
      : d.label === 'Lease' && (MIX.a || MIX.b) ? { label: 'Lease', a: MIX.a ? mixedText(MIX.a) : d.a, b: MIX.b ? mixedText(MIX.b) : d.b } : d));
    const ownLine = (side) => { const o = own[side]; if (!o) return 'No sales found.'; return esc(o.label) + ': ' + plural(o.n, o.otherSale ? SALE_WORD[o.sale] : 'sale') + (o.older ? ' (older evidence)' : ' in the last 12 months') + ', median ' + money(o.psf.med) + ' PSF' + (o.otherSale ? '. Not the same sale type as the other, so not compared' : '') + '.'; };
    return '<div class="lg-card"><div class="lg-scroll"><table class="lg-table"><thead><tr><th scope="col"><span class="lg-vh">Fact</span></th><th scope="col">' + esc(M.a.name) + '</th><th scope="col">' + esc(M.b.name) + '</th></tr></thead><tbody>' +
      rows.map((d) => '<tr><th scope="row">' + esc(d.label) + '</th><td>' + esc(d.a) + '</td><td>' + esc(d.b) + '</td></tr>').join('') +
      '<tr><th scope="row">Most active size, on its own</th><td>' + ownLine('a') + '</td><td>' + ownLine('b') + '</td></tr></tbody></table></div>' +
      '<p class="lg-fine">These are facts from the records, each development on its own. They are not an explanation of any price gap.</p></div>';
  }
  function windowsHtml(M) {
    if (!M.ladder.length) return '';
    return '<div class="lg-card"><p>How far back the matched sales go. The page opens on the most recent window with enough matched sales.</p><div class="lg-chips v2-ladder" role="group" aria-label="Time window" style="justify-content:flex-start">' +
      M.ladder.map((l) => '<button type="button" data-win="' + l.win + '" aria-pressed="' + (l.win === M.activeWindow) + '">' + esc(cap(l.label)) + ' · ' + (l.hasMatch ? plural(l.bands, 'shared size') : 'no shared size') + '</button>').join('') + '</div></div>';
  }
  function saleTypeHtml(M) {
    if (!M.sale.options || M.sale.options.length < 2) return '';
    return '<div class="lg-card"><p>Each sale type is compared on its own, so prices are never mixed.</p><div class="lg-chips" role="group" aria-label="Sale type" style="justify-content:flex-start">' +
      M.sale.options.map((o) => '<button type="button" data-sale="' + esc(o.id) + '" aria-pressed="' + (o.id === M.sale.selected) + '">' + esc(cap(o.label)) + 's · ' + esc(o.note) + '</button>').join('') + '</div></div>';
  }
  function numbersHtml(M, ev, ctx, own) {
    const ins = ev.state === 'insufficient', tabs = [];
    if (!ins) tabs.push(['size', 'Price by size', rankedBars(M, ev) + (ctx.focusHtml ? '<div class="lg-card v2-tools">' + ctx.focusHtml(M, 'compare') + '</div>' : '')]);
    if (!ins && M.history && M.history.bands.length) tabs.push(['moved', 'How prices moved', '<div class="lg-card">' + timeHtml(M).replace('<details class="v2-d">', '<details class="v2-d" open>') + '</div>']);
    tabs.push(['often', 'How often homes sell', activityHtml(M, ctx, own)]);
    if (!ins && M.ladder.length > 1) tabs.push(['window', 'Last 24 or 36 months', windowsHtml(M)]);
    if (M.sale.options && M.sale.options.length > 1) tabs.push(['sale', 'New sales and sub-sales', saleTypeHtml(M)]);
    tabs.push(['how', 'How we worked this out', '<div class="lg-card">' + suggestHtml(M, ev, ctx) + evidenceHtml(M, ev, ctx).replace('<details class="v2-d v2-evidence" id="v2-how">', '<details class="v2-d v2-evidence" id="v2-how" open>') + '</div>']);
    tabs.push(['sources', 'Sources', '<div class="lg-card"><p>Prices and sales: ' + esc(dataSpan(ctx.m)) + ' Project facts carry numbered sources.</p><div id="v2facts"></div></div>']);
    return '<section class="lg-band grey" id="numbers"><div class="lg-wrap" style="gap:24px"><div class="lg-head"><p class="lg-kicker">Show me the numbers</p><h2>' + (ins ? 'The sales on record.' : 'Price by size.') + '</h2>' +
      '<p class="lg-sub">' + (ins ? 'Each development on its own. Nothing here is set against the other.' : 'Same sale type, same size, same time window. Open the other views if you want more.') + '</p></div>' +
      '<div class="lg-chips" role="group" aria-label="Views" data-lg-tabs>' + tabs.map((t, i) => '<button type="button" data-lg-tab="' + t[0] + '" aria-pressed="' + (i === 0) + '">' + esc(t[1]) + '</button>').join('') + '</div>' +
      tabs.map((t, i) => '<div class="lg-panel" data-lg-panel="' + t[0] + '"' + (i ? ' hidden' : '') + '>' + t[2] + '</div>').join('') + '</div></section>';
  }

  /* the full sample, then Ken */
  function sampleCard(M) {
    const S = SAMPLE.v, href = 'sample/?a=' + encodeURIComponent(M.a.id) + '&b=' + encodeURIComponent(M.b.id);
    if (!S) return '';
    const same = [S.a, S.b].join('|') === [M.a.name, M.b.name].join('|') || [S.b, S.a].join('|') === [M.a.name, M.b.name].join('|');
    return '<section class="lg-band" id="sample"><div class="lg-wrap"><a class="lg-navy" href="' + esc(href) + '" data-kpt-sample="comparison"><span style="display:grid;gap:12px">' +
      '<span class="k">' + (same ? 'This is the short read. Here’s the full one.' : 'This is the short read. Here’s what a full one looks like.') + '</span>' +
      '<span class="t">' + (same ? 'Read the full sample research on this pair.' : 'See the full sample research: ' + esc(S.a) + ' or ' + esc(S.b) + '?') + '</span>' +
      '<span class="s">Who each development may suit, what could explain the price gap, layouts and facilities with sources, five years of prices, and the questions to put at a viewing. Free to read.</span>' +
      '<span class="lg-btn white">Open the sample research ›</span></span>' +
      '<ul>' + (S.covers || []).map((c) => '<li>' + esc(c) + '</li>').join('') + '<li class="f">Prepared with AI assistance, not reviewed by Ken.</li></ul></a></div></section>';
  }
  function askBand(M, root) {
    return '<section class="lg-band grey lg-ask" id="ask"><div class="lg-wrap"><p class="lg-kicker">Your shortlist</p><h2>Want a deeper comparison for your shortlisted properties?</h2>' +
      '<p class="lg-sub">Tell Ken what you’re considering and what matters most to you. He replies personally on WhatsApp. The project names you compared are already in the message, and you can edit it before sending. Please leave income, CPF and debt details out of it.</p>' +
      '<a class="lg-btn wa" id="wa" href="#" target="_blank" rel="noopener">Message Ken on WhatsApp</a>' +
      '<div class="lg-ken"><img src="' + esc(root) + 'assets/img/ken-portrait.jpg" alt="Ken Tan" width="72" height="72"><div><b>Ken Tan</b><span>The Property Guy · Group District Director, Huttons Asia · Property agent since 2007 · CEA R007903D</span><span>Live on TikTok most nights, 8–9.30pm</span></div></div>' +
      '<p class="lg-fine">Or <a id="cmp" href="#/compare/' + esc(M.a.id) + '">compare ' + esc(M.a.name) + ' with a different development</a>.</p></div></section>';
  }
  function kenTake(M, root) {
    return M.ken ? '<section class="lg-band tight" aria-label="Ken’s Take"><div class="lg-wrap"><div class="lg-kenstrip"><div class="who"><img src="' + esc(root) + 'assets/img/ken-portrait.jpg" alt="Ken Tan" width="56" height="56"><div><b>Ken’s Take</b><span>“' + esc(M.ken.note) + '” My judgement, not URA data.</span></div></div></div></div></section>' : '';
  }
  function render(M, ctx) {
    const R = ctx.R, P = ctx.P, ev = E.stateOf(M), root = ctx.root || '../';
    MIX.a = ctx.A && ctx.A.tenure && ctx.A.tenure.mixed ? ctx.A.tenure : null; MIX.b = ctx.B && ctx.B.tenure && ctx.B.tenure.mixed ? ctx.B.tenure : null;
    const own = { a: ownAny(R, P, ctx.A, ctx.m, M.sale.selected), b: ownAny(R, P, ctx.B, ctx.m, M.sale.selected) };
    let saleFallback = false; try { const d = R.analyseComparison(ctx.A, ctx.B, ctx.m, {}); saleFallback = !!(d.sale && d.sale.selected && M.sale.selected && d.sale.selected !== M.sale.selected); } catch (e) { saleFallback = false; }
    const rg = diff(M, 'Region'), dd = diff(M, 'District');
    const kick = [M.sale.label ? cap(M.sale.label) + ' comparison' : 'Comparison', dd.a ? (dd.a === dd.b ? 'District ' + String(dd.a).replace(/^D/, '') : 'Districts ' + String(dd.a).replace(/^D/, '') + ' and ' + String(dd.b).replace(/^D/, '')) : null].filter(Boolean).join(' · ');
    const ax = ev.band ? rangeAxis(ev) : null, why = ev.state === 'limited' && ev.reasons.length ? '<details class="lg-fold" style="max-width:640px;width:100%;text-align:left"><summary>Why only a first look?</summary><div class="in"><ul class="lg-why">' + ev.reasons.map((r) => '<li>' + esc(r.text) + '</li>').join('') + '</ul>' + (ev.strengthen.length ? '<p><b>What would make it stronger:</b> ' + esc(ev.strengthen.join(' ')) + '</p>' : '') + '</div></details>' : '';
    ctx.last = ev;
    return '<div class="lg-page v2" data-lg="compare" data-state="' + esc(ev.state) + '" data-evidence="' + esc(ev.version) + '">' +
      '<header class="lg-hero"><div class="lg-wrap"><button class="kpr-back lg-back" type="button" data-act="back">← Back to ' + esc(M.a.name) + '</button>' +
        '<p class="lg-kicker">' + esc(kick) + ' · ' + LABEL + '</p>' +
        '<h1 tabindex="-1"><span class="a">' + esc(M.a.name) + '</span> or <span class="b">' + esc(M.b.name) + '</span>?</h1>' +
        '<p class="lg-lead lg-center" data-lg-lead>' + heroLead(M, ev) + '</p>' + evidencePill(M, ev, { saleFallback }) + why +
        '<div class="lg-btns" style="margin-top:6px"><button class="lg-btn primary" type="button" data-lg-scroll="side">See them side by side ↓</button>' + (SAMPLE.v ? '<a class="lg-btn" href="' + esc('sample/?a=' + encodeURIComponent(M.a.id) + '&b=' + encodeURIComponent(M.b.id)) + '" data-kpt-sample="comparison-hero">Read the sample research</a>' : '') + '</div>' +
      '</div></header>' +
      '<section class="lg-band grey" id="side" aria-label="Side by side" style="padding-top:64px"><div class="lg-wrap"><div class="lg-side">' + sideCard('a', M, ev, ax) + '<span class="vs" aria-hidden="true">VS</span>' + sideCard('b', M, ev, ax) + '</div>' +
        '<p class="lg-fine lg-center">' + esc(sideNote(M, ev)) + '</p></div></section>' +
      questionsHtml(M, ev) + numbersHtml(M, ev, ctx, own) + kenTake(M, root) + sampleCard(M) + askBand(M, root) +
      '<p class="lg-fine" style="max-width:1040px;margin:0 auto;padding:20px 22px 0">' + esc(DISCLAIMER) + '</p></div>';
  }

  // Verified facts for the two developments, from the registry, where a development has them. Added after the page is drawn.
  function sourcedFacts(p) {
    const keep = (p.facts || []).filter((f) => f.status === 'verified' && (f.sources || []).some((s) => s.n));
    const nums = {}; (p.sources || []).forEach((s) => { nums[s.n] = s; });
    return { rows: keep, sources: nums };
  }
  function factsHtml(list) {
    const rows = list.filter((x) => x.facts.rows.length); if (!rows.length) return '';
    return '<div class="v2-facts"><h3 class="v2-h3">Verified facts</h3>' + rows.map((x) => '<p class="v2-p">' + (rows.length > 1 ? '<b>' + esc(x.name) + ':</b> ' : '') + x.facts.rows.map((f) => esc(f.label) + ' ' + esc(f.display) + ' <sup>' + f.sources.filter((s) => s.n).map((s) => esc(s.n)).join(', ') + '</sup>').join(' · ') + '</p>').join('') +
      '<details class="v2-d"><summary>Sources</summary><div class="in"><ol class="v2-list">' + rows.map((x) => Object.keys(x.facts.sources).filter((n) => x.facts.rows.some((f) => f.sources.some((s) => String(s.n) === n))).map((n) => '<li value="' + esc(n) + '">' + esc(x.name) + ': ' + (x.facts.sources[n].url ? '<a href="' + esc(x.facts.sources[n].url) + '" target="_blank" rel="noopener noreferrer">' + esc(x.facts.sources[n].title) + '</a>' : esc(x.facts.sources[n].title)) + '</li>').join('')).join('') + '</ol></div></details></div>';
  }
  function afterCompare(M, app, root) {
    const wa = app.querySelector('#wa'); if (wa) wa.href = 'https://wa.me/' + PHONE + '?text=' + encodeURIComponent(requestMessage(M));
    try { sessionStorage.setItem('kpt_pair', JSON.stringify({ a: { id: M.a.id, name: M.a.name }, b: { id: M.b.id, name: M.b.name } })); } catch (e) { /* storage unavailable */ }
    app.querySelectorAll('[data-kpt-sample]').forEach((sl) => sl.addEventListener('click', () => KPT().track('research_sample_opened', { project_a: M.a.id, project_b: M.b.id })));
    const host = app.querySelector('#v2facts'); if (!host || !root || typeof fetch !== 'function') return;
    Promise.all([M.a.id, M.b.id].map((id) => !factIds[id] ? Promise.resolve(null) : fetch(root + 'data/registry/p/' + id + '.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)))
      .then((ps) => {
        const list = ps.map((p, i) => (p ? { side: i ? 'b' : 'a', name: [M.a, M.b][i].name, facts: sourcedFacts(p) } : null)).filter(Boolean);
        const h = factsHtml(list); if (h) host.innerHTML = h;
        const sup = (f) => '<sup>' + f.sources.filter((s) => s.n).map((s) => esc(s.n)).join(',') + '</sup>';
        const homes = {};
        list.forEach((x) => {
          const ul = app.querySelector('[data-lg-cardfacts="' + x.side + '"]'), who = app.querySelector('[data-lg-who="' + x.side + '"]');
          const u = x.facts.rows.find((f) => f.field === 'units'), dev = x.facts.rows.find((f) => f.field === 'developer');
          if (u) { const n = Number((String(u.display).match(/([\d,]+)/) || [, ''])[1].replace(/,/g, '')); if (n) homes[x.side] = { n, f: u }; if (who) who.insertAdjacentHTML('beforeend', ' · ' + esc(u.display) + sup(u)); }
          if (ul && dev) ul.insertAdjacentHTML('beforeend', '<li>Developer: ' + esc(dev.display) + sup(dev) + '</li>');
        });
        // One more sentence for the lead, only when both home counts are sourced.
        const s1 = app.querySelector('[data-lg-s1]');
        if (s1 && homes.a && homes.b && homes.a.n !== homes.b.n) {
          const big = homes.a.n > homes.b.n ? 'a' : 'b', sm = big === 'a' ? 'b' : 'a';
          s1.insertAdjacentHTML('beforeend', ' ' + esc(M[big].name) + ' is the larger development, with ' + num(homes[big].n) + ' homes' + sup(homes[big].f) + ' against ' + num(homes[sm].n) + sup(homes[sm].f) + '.');
        }
      });
  }

  /* ---------- the rest of the single Research journey ---------- */
  // Site root, from where this script was loaded (assets/js/ is two levels down). Null in Node.
  const ROOT = (function () { try { return new URL('../../', document.currentScript.src).href; } catch (e) { return null; } })();
  const KPT = () => root.KPT || { track: function () {} };
  const norm = (s) => String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (typeof document !== 'undefined') {
  (function () { try { const k = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'], q = new URLSearchParams(location.search), now = {}; k.forEach((n) => { if (q.get(n)) now[n] = q.get(n).slice(0, 100); }); if (Object.keys(now).length) sessionStorage.setItem('kpt_attr', JSON.stringify(now)); } catch (e) { /* storage unavailable */ } })();
  }
  const sites = {}, factIds = {}; let PHONE = '6590908898';
  const ready = (typeof fetch === 'function' && ROOT) ? fetch(ROOT + 'data/research/sites.json').then((r) => (r.ok ? r.json() : null)).then((d) => { ((d && d.sites) || []).forEach((x) => { sites[x.id] = x; }); ((d && d.facts) || []).forEach((id) => { factIds[id] = 1; }); if (d && d.sample) SAMPLE.v = d.sample; if (d && d.phone) PHONE = String(d.phone).replace(/[^0-9]/g, ''); }).catch(function () {}) : Promise.resolve();

  // Developments with their own site: found by name in Research search, linked out, never copied. A link is shown only where an address is configured.
  const siteMatches = (q) => { const nq = norm(q); if (nq.length < 2) return []; return Object.keys(sites).map((k) => sites[k]).filter((x) => x.url && [x.name].concat(x.aliases || []).some((n) => { const k = norm(n); return k.indexOf(nq) === 0 || nq.split(' ').every((t) => k.split(' ').some((w) => w.indexOf(t) === 0)); })); };
  const siteCard = (x, ctx) => '<div class="v2-site"><b>' + esc(x.name) + '</b><span>' + esc(x.tagline || 'Has its own site for current details.') + '</span><a class="v2-btn pri" href="' + esc(x.url) + '" target="_blank" rel="noopener" data-kpt-ms="' + esc(x.id) + '" data-placement="' + esc(ctx) + '" data-host="' + esc(x.host || '') + '">Open its site ↗</a></div>';
  function siteHref(url, placement) {
    const u = new URL(url); let saved = {}; try { saved = JSON.parse(sessionStorage.getItem('kpt_attr') || '{}'); } catch (e) { saved = {}; }
    if (Object.keys(saved).length) Object.keys(saved).forEach((k) => u.searchParams.set(k, saved[k])); else { u.searchParams.set('utm_source', 'kpt'); u.searchParams.set('utm_medium', 'referral'); u.searchParams.set('utm_campaign', 'research'); }
    u.searchParams.set('kpt_from', placement); return u.toString();
  }
  if (typeof document !== 'undefined') document.addEventListener('click', (e) => {
    const a = e.target.closest ? e.target.closest('a[data-kpt-ms]') : null; if (!a || !a.dataset.placement) return;
    try { a.href = siteHref(a.getAttribute('href'), a.dataset.placement); } catch (x) { /* keep the clean address */ }
    KPT().track('microsite_clicked', { project_id: a.dataset.kptMs, destination_host: a.dataset.host, placement: a.dataset.placement });
  }, true);
  function afterSearch(res, q, nRows) {
    const hits = siteMatches(q); if (!hits.length) return;
    if (!nRows) { const e = res.querySelector('.kpr-empty'); if (e && e.parentNode) e.parentNode.remove(); }
    res.insertAdjacentHTML('beforeend', '<div class="v2-sites"><p class="v2-sites-h">Has its own site</p>' + hits.map((x) => siteCard(x, 'research-search')).join('') + '</div>');
  }
  // A plain one-band page for the states where there is nothing to analyse (own-site launch, no transactions, nothing recent).
  function quietPage(o) {
    return '<div class="lg-page" data-lg="' + esc(o.kind) + '"><header class="lg-hero"><div class="lg-wrap"><button class="kpr-back lg-back" type="button" data-act="home">← Search another development</button>' +
      (o.kick ? '<p class="lg-kicker">' + esc(o.kick) + '</p>' : '') + '<h1 class="md" tabindex="-1">' + esc(o.title) + '</h1>' + (o.meta ? '<p class="lg-sub lg-center">' + esc(o.meta) + '</p>' : '') +
      '<p class="lg-lead lg-center">' + o.lead + '</p>' + (o.pill ? '<span class="lg-pill grey">' + esc(o.pill) + '</span>' : '') + (o.extra || '') + '</div></header>' +
      '<section class="lg-band grey tight"><div class="lg-wrap" style="max-width:760px"><p class="lg-sub lg-center" style="justify-self:center">' + esc(o.next || 'To research another development, search below.') + '</p><div class="lg-sb" id="sb"></div></div></section></div>';
  }
  function mountQuiet(app, hooks) {
    const b = app.querySelector('[data-act=home]'); if (b) b.addEventListener('click', () => { location.hash = '#/'; });
    const sb = app.querySelector('#sb'); if (sb && hooks && hooks.searchBox) sb.appendChild(hooks.searchBox(null, hooks.onPick));
    const h = app.querySelector('h1'); if (h) h.focus({ preventScroll: true });
  }
  function showSite(id, app, hooks) {
    const x = sites[id]; document.body.dataset.view = 'site'; document.title = x.name + ' — Groundwork';
    app.innerHTML = quietPage({ kind: 'site', kick: x.stage === 'new-launch' ? 'New launch' : 'Development', title: x.name,
      lead: x.url ? esc(x.name) + ' keeps its own site for current details. We link to it rather than copy it, so what you read there is always up to date.' : esc(x.name) + (x.status === 'planned' ? ' is planned, with a dedicated site to follow.' : ' is a new development. Its dedicated site is not linked here yet.'),
      pill: 'There are no resale transactions to analyse yet, so there is nothing to compare here.', extra: x.url ? '<div class="lg-sb" style="width:100%;max-width:680px">' + siteCard(x, 'research-project') + '</div>' : '' });
    mountQuiet(app, hooks);
  }

  // A comparison where one side has no transactions at all (for example a new launch with its own site): say so plainly; never imply a price gap.
  const NO_DATA = 'We don’t currently have sufficient transaction data to provide a meaningful comparison.';
  function showNoData(aId, bId, app, hooks) {
    const nm = (id) => (sites[id] ? sites[id].name : null), empty = [aId, bId].filter((id) => sites[id]), other = [aId, bId].find((id) => !sites[id]);
    document.body.dataset.view = 'compare'; document.title = 'Comparison — Research — Groundwork';
    app.innerHTML = quietPage({ kind: 'nodata', kick: LABEL, title: empty.map(nm).join(' and ') + ' has no transactions to compare yet',
      lead: '<b>' + esc(NO_DATA) + '</b> ' + esc(empty.map(nm).join(' and ')) + (empty.length > 1 ? ' have' : ' has') + ' no URA transactions in the data we hold, so there is nothing to set against ' + (other ? 'the other development' : 'each other') + '. No price gap is shown.',
      extra: '<div class="lg-btns">' + (other ? '<a class="lg-btn primary" href="#/p/' + esc(other) + '">See the other development’s sales ›</a>' : '') + '</div>' + (empty.filter((id) => sites[id].url).length ? '<div class="lg-sb" style="width:100%;max-width:680px">' + empty.filter((id) => sites[id].url).map((id) => siteCard(sites[id], 'research-compare')).join('') + '</div>' : '') });
    mountQuiet(app, hooks);
  }

  // A development with nothing recent to analyse is shown plainly, not as a page of empty sections.
  // Otherwise: the redesigned page's own behaviour (KPTLG), then its sourced facts, when the registry has them.
  function afterProject(M, app, raw, m, hooks) {
    if (!raw || !m) return;
    const ex = E.projectExperience(raw, m);
    if (ex.experience === 'directory') {
      const R = hooks.R, last = raw.last ? R.fmtMonth(raw.last) : null, tot = raw.sale ? (raw.sale.new || 0) + (raw.sale.sub || 0) + (raw.sale.resale || 0) : 0;
      app.innerHTML = quietPage({ kind: 'directory', title: M.name, meta: [M.street, M.districtLabel, M.region, M.tenure.mixed ? 'Mixed tenure in these records' : M.tenure.label].filter(Boolean).join(' · '),
        lead: (last ? 'The last recorded sale was in ' + esc(last) + ', and there ' + (tot === 1 ? 'has' : 'have') + ' been ' + plural(tot, 'sale') + ' in the data we hold, none in the last ' + E.CONFIG.project.recentMonths + ' months. ' : 'There are no transactions for this development in the data we hold. ') + 'Without recent sales we cannot give a fair read of what it transacts at, so we do not draw one.',
        pill: 'Nothing recent to analyse' });
      mountQuiet(app, hooks);
      return;
    }
    const LG = root.KPTLG; if (LG && app.querySelector('[data-lg="project"]')) LG.afterProject(M, app, { root: ROOT || '../', track: hooks.track, onCompare: hooks.onCompare, manifest: m });
    if (typeof fetch !== 'function' || !ROOT) return;
    (factIds[M.id] ? fetch(ROOT + 'data/registry/p/' + M.id + '.json').then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null)).then((p) => {
      if (!p) return;
      if (LG && LG.fillFacts(app, p, factsHtml, sourcedFacts)) return;
      const h = factsHtml([{ name: M.name, facts: sourcedFacts(p) }]); if (!h || app.querySelector('.v2-facts')) return;
      const cta = app.querySelector('#cmp'), at = cta ? cta.closest('.kpr-a-actions') || cta : null, meta = app.querySelector('.kpr-meta');
      if (at) at.insertAdjacentHTML('beforebegin', '<div class="v2-factsbar">' + h + '</div>'); else if (meta) meta.insertAdjacentHTML('afterend', '<div class="v2-factsbar">' + h + '</div>');
    });
  }

  // "Compare with…": developments that share the most evidence with this one, ranked by evidence strength (built from the same rules, ahead of time).
  const STATE_TEXT = { s: 'Enough to compare fairly', l: 'A first look' };
  function enhancePick(aId, app, go) {
    if (typeof fetch !== 'function' || !ROOT) return;
    fetch(ROOT + 'data/research/suggest.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => {
      const list = d && d.p && d.p[aId]; if (!list || !list.length) return;
      app.querySelectorAll('.kpr-sugg-h, ul.kpr-results[role=list], .kpr-note').forEach((el) => { if (!el.closest('#sb')) el.remove(); });
      const sb = app.querySelector('#sb'); if (!sb) return;
      sb.insertAdjacentHTML('afterend', '<p class="kpr-sugg-h">Developments with the most similar recent sales</p><ul class="kpr-results" role="list" id="v2sugg">' + list.map((x) => '<li><button type="button" data-id="' + esc(x[0]) + '"><b>' + esc(x[1]) + '</b><span>' + esc(STATE_TEXT[x[2]]) + ' · ' + x[3] + ' and ' + x[4] + ' sales of ' + esc(sqft(x[5])) + ' homes</span></button></li>').join('') + '</ul><p class="kpr-note">Ranked by how many similar recent sales the two share. Being in the same district doesn’t make two developments comparable, and some pairs can only be a first look.</p>');
      app.querySelectorAll('#v2sugg button[data-id]').forEach((b) => b.addEventListener('click', () => go(b.dataset.id)));
    });
  }

  return { dataSpan, SAMPLE, requestMessage, INSUFFICIENT, LABEL, DISCLAIMER, NO_DATA, render, questions, leadFacts, leadPrice, defaultWindow, bestSale, showNoData, ownAny, salesOnRecord, afterCompare, afterSearch, afterProject, enhancePick, showSite, ready, sites, siteMatches, siteHref, ownBand, factsHtml, sourcedFacts, norm };
});
