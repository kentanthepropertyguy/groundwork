/* ==========================================================================
   KPT redesign (light, conversational style, Oct 2026): presentation of the Research landing (search) and a development's page.
   Presentation only. Every figure comes from the model that kpt-research.js builds (analyseProject) and from the public registry
   facts; nothing is typed per project. Sentences are assembled from fields that exist and are left out when a field is missing,
   so nothing is guessed. Wording never calls a development cheaper, better value, a bargain or a winner.
   The page (research/index.html) keeps all wiring: [data-act=home], #wa, #cmp, [data-sale], button.kpr-link[data-bin], #sizeIn/#sizeGo.
   UMD: window.KPTLG and Node (the Node export is used by the tests).
   ========================================================================== */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.KPTLG = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const money = (n) => '$' + num(n);
  const plural = (n, w, ws) => n + ' ' + (n === 1 ? w : (ws || w + 's'));
  const sqft = (label) => String(label || '').replace(/\s*sqft$/, ' sq ft');
  const titleCase = (s) => String(s || '').toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
  const SALE_WORDS = { resale: ['resale', 'resales', 'resold'], 'new sale': ['new sale', 'new sales', 'sold'], 'sub-sale': ['sub-sale', 'sub-sales', 'sold'] };
  const REGION = { CCR: 'Core Central Region', RCR: 'Rest of Central Region', OCR: 'Outside Central Region' };
  const words = (M) => SALE_WORDS[M.sale && M.sale.label] || ['sale', 'sales', 'sold'];
  // A4-04: a "typical price" needs the comparison page's stronger rule: at least 5 sales over at least 3 months (kpt-evidence.js CONFIG).
  const EV = () => root.KPT_EVIDENCE || (typeof require === 'function' ? (() => { try { return require('./kpt-evidence.js'); } catch (e) { return null; } })() : null);
  const STRONG = () => { const e = EV(), s = e && e.CONFIG && e.CONFIG.stronger; return { sales: s ? s.sales : 5, months: s ? s.months : 3 }; };
  function strong(M) { const A = M && M.answer, f = A && A.facts, s = STRONG(); return !!(A && A.state === 'recent' && f && f.recentN >= s.sales && f.recentMonths >= s.months); }
  // A4-08, A4-09: the period the records cover, when they were retrieved, and the freshness check the budget tool uses (kpt-engine.js:
  // older than 120 days is labelled, older than 270 days gives no typical price).
  const FRESH = { staleDays: 120, expiredDays: 270 };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ymLabel = (s) => { const a = String(s || '').split('-').map(Number); return a[1] ? MON[a[1] - 1] + ' ' + a[0] : ''; };
  const dayLabel = (s) => { const a = String(s || '').split('-').map(Number); return a[2] ? a[2] + ' ' + MON[a[1] - 1] + ' ' + a[0] : ''; };
  const ymAdd = (s, k) => { const a = String(s).split('-').map(Number), i = a[0] * 12 + a[1] - 1 + k; return Math.floor(i / 12) + '-' + String(i % 12 + 1).padStart(2, '0'); };
  function freshness(m, now) {
    if (!m || !m.asOf) return null;
    const age = Math.floor(((now == null ? Date.now() : now) - Date.parse(m.asOf + 'T00:00:00Z')) / 864e5);
    return { age, state: age > FRESH.expiredDays ? 'expired' : age > FRESH.staleDays ? 'stale' : 'ok', from12: ymLabel(ymAdd(m.latestMonth, -11)), to: ymLabel(m.latestMonth), first: ymLabel(m.monthStart), asOf: dayLabel(m.asOf) };
  }
  function freshLine(m, now) {
    const F = freshness(m, now); if (!F) return '';
    return '<p class="lg-fine lg-center" data-lg-fresh="' + F.state + '">The past 12 months are ' + esc(F.from12) + ' to ' + esc(F.to) + ', from URA records retrieved ' + esc(F.asOf) + '. ' + esc(F.to) + ' may be incomplete: sales reported later are added in later updates.' +
      (F.state !== 'ok' ? ' <b>These records are ' + (F.state === 'expired' ? 'over nine months' : 'over four months') + ' old, so newer sales aren’t included' + (F.state === 'expired' ? ' and no typical price is shown' : '') + '.</b>' : '') + '</p>';
  }
  function dataSpan(m) {
    return m && m.monthStart && m.latestMonth ? 'URA private residential transactions, ' + ymLabel(m.monthStart) + ' to ' + ymLabel(m.latestMonth) + (m.asOf ? ' (retrieved ' + dayLabel(m.asOf) + ')' : '') + '. ' + ymLabel(m.latestMonth) + ' may be incomplete: sales reported later are added in later updates.' : 'URA private residential transactions.';
  }
  // A4-24: URA also lists a net price after developer discounts for some new sales; figures here use the recorded price.
  const newNote = (M) => (M.sale && M.sale.selected === 'new' ? ' New-sale prices are as URA records them, before any developer rebate.' : '');
  // A4-05: some developments have sales on more than one tenure. Their lease is never printed as one value.
  const mixedLine = (t) => 'Mixed tenure in these records' + (t && t.variants && t.variants.length ? ': ' + t.variants.map((v) => v[0] + ' (' + plural(v[1], 'sale') + ')').join(', ') : '') + '. Typical prices here mix them.';

  /* ---------- small pieces ---------- */
  // A4-23: a development whose sales sit in two districts (Eastern Lagoon: 15 and 16) names both.
  const district = (M) => { const ds = (M.districtsAll || []).map(Number).filter(Boolean); if (ds.length > 1) return 'Districts ' + ds.slice(0, -1).join(', ') + ' and ' + ds[ds.length - 1]; const d = Number(M.district); return d ? 'District ' + d : (M.districtLabel || ''); };
  function tenurePhrase(t) {
    if (!t || t.mixed || !t.label) return '';
    const m = /^(\d+)\s*yrs?\s*from\s*(\d{4})$/i.exec(String(t.label).trim());
    if (m) return 'on a ' + m[1] + '-year lease that started in ' + m[2];
    if (/freehold/i.test(t.label)) return 'with freehold tenure';
    return '';
  }
  // A4-12: the count only. "Often" or "rarely" from a fixed count would ignore how many homes the development has.
  function activitySentence(M) {
    const w = words(M), n = M.recent ? M.recent.n : 0;
    if (!n) return M.recent && M.recent.latestLabel ? 'There have been no ' + w[1] + ' in the past 12 months. The latest was in ' + M.recent.latestLabel + '.' : '';
    return 'There ' + (n === 1 ? 'was ' : 'were ') + plural(n, w[0], w[1]) + ' in the past 12 months.';
  }
  function priceSentence(M) {
    const A = M.answer, w = words(M), b = A && A.size && A.size.label ? sqft(A.size.label) : null, f = A && A.facts;
    if (!A || !b) return '';
    if (A.state === 'recent' && strong(M)) return 'A typical ' + b + ' home ' + w[2] + ' for about <b>' + money(f.recentMedian) + ' per square foot (PSF)</b>.';
    if (A.state === 'recent') return plural(f.recentN, 'home') + ' of ' + b + ' ' + w[2] + ' in the past 12 months, at a median of about ' + money(f.recentMedian) + ' per square foot (PSF).';
    if (A.state === 'recent-thin') return 'Only ' + plural(f.recentN, b + ' home') + ' ' + w[2] + ' in the past 12 months, at around ' + money(f.recentMedian) + ' per square foot (PSF). That is too few to call a typical price.';
    if (A.state === 'older') return 'No ' + b + ' homes ' + w[2] + ' in the past 12 months. The latest ' + w[0] + ' at this size was in ' + esc(M.bands.find((x) => x.bin === A.size.bin).evidence.latestLabel) + '.';
    return '';
  }
  // The evidence pill under the paragraph: the engine's own strength for this size, in plain words.
  function projectPill(M) {
    const A = M.answer, w = words(M), f = A && A.facts;
    if (!A) return '';
    if (A.state === 'recent' && strong(M)) return '<span class="lg-pill" data-lg-ev="good">Based on ' + plural(f.recentN, w[0], w[1]) + ' of this size across ' + f.recentMonths + ' of the last 12 months. Enough to read as a typical price. Past sales, not a valuation.</span>';
    if (A.state === 'recent') { const s = STRONG(); return '<span class="lg-pill warn" data-lg-ev="limited">Based on only ' + plural(f.recentN, w[0], w[1]) + ' of this size, in ' + plural(f.recentMonths, 'month') + ' of the last 12. A typical price needs at least ' + s.sales + ' sales over ' + s.months + ' months, so read this as a first look.</span>'; }
    if (A.state === 'recent-thin') return '<span class="lg-pill warn" data-lg-ev="limited">Based on only ' + plural(f.recentN, w[0], w[1]) + ' of this size in the last 12 months. Read this as a first look, not a settled price.</span>';
    if (A.state === 'older') return '<span class="lg-pill warn" data-lg-ev="older">No ' + w[1] + ' of this size in the last 12 months. Older sales may not reflect today’s prices.</span>';
    return '<span class="lg-pill grey" data-lg-ev="none">There aren’t enough recent ' + w[1] + ' with a recorded size to show a typical price.</span>';
  }
  function projectLead(M) {
    const where = [M.street ? 'on ' + titleCase(M.street) : '', district(M) ? 'in ' + district(M) : ''].filter(Boolean).join(' '), ten = M.tenure && M.tenure.mixed ? 'with mixed tenure in these records' : tenurePhrase(M.tenure);
    const s1 = esc(M.name) + ' is <span data-lg-what>a private residential development</span>' + (where ? ' ' + esc(where) : '') + (ten ? ', ' + esc(ten) : '') + '.';
    return [s1, esc(activitySentence(M)), priceSentence(M)].filter(Boolean).join(' ');
  }

  /* ---------- the five-year line (handoff §6.1) ---------- */
  function lineChart(points, color, label) {
    const pts = (points || []).filter((p) => p && p.med);
    if (pts.length < 2) return '';
    const W = 560, H = 230, L = 62, Rr = 70, T = 30, B = 46;
    const meds = pts.map((p) => p.med);
    let lo = Math.floor((Math.min.apply(null, meds) - 40) / 100) * 100, hi = Math.ceil((Math.max.apply(null, meds) + 40) / 100) * 100;
    const step = hi - lo > 600 ? 200 : 100; lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const xs = (i) => L + (pts.length === 1 ? 0 : i * ((W - L - Rr) / (pts.length - 1))), ys = (v) => T + (hi - v) / (hi - lo) * (H - T - B);
    const short = (l) => { const e = String(l).split('–')[1] || l, a = e.trim().split(' '); return 'to ' + a[0] + ' ’' + String(a[1] || '').slice(2); };
    let g = '<g stroke="#E7E7EA" stroke-width="1">';
    for (let v = lo; v <= hi; v += step) g += '<line x1="' + L + '" y1="' + ys(v) + '" x2="' + (W - 20) + '" y2="' + ys(v) + '"/>';
    g += '</g><g fill="#6B7280" font-size="11">';
    for (let v = lo; v <= hi; v += step) g += '<text x="4" y="' + (ys(v) + 4) + '">' + money(v) + '</text>';
    pts.forEach((p, i) => { g += '<text x="' + xs(i) + '" y="' + (H - 16) + '" text-anchor="middle">' + esc(short(p.label)) + '</text>'; });
    g += '</g><polyline fill="none" stroke="' + color + '" stroke-width="3" stroke-linejoin="round" points="' + pts.map((p, i) => xs(i) + ',' + ys(p.med)).join(' ') + '"/>';
    pts.forEach((p, i) => {
      const hollow = p.n < 3;
      g += '<circle cx="' + xs(i) + '" cy="' + ys(p.med) + '" r="5" fill="' + (hollow ? '#fff' : color) + '" stroke="' + color + '" stroke-width="3"/>';
      g += '<text x="' + xs(i) + '" y="' + (ys(p.med) + 20) + '" text-anchor="middle" fill="#6B7280" font-size="11">' + (i === 0 ? plural(p.n, 'sale') : p.n) + '</text>';
    });
    const last = pts[pts.length - 1];
    g += '<text x="' + (xs(pts.length - 1) + 10) + '" y="' + (ys(last.med) + 4) + '" fill="' + color + '" font-size="13" font-weight="600">' + money(last.med) + '</text>';
    return '<svg class="lg-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '">' + g + '</svg>';
  }

  /* ---------- Research landing (search) ---------- */
  // The worked example from the free sample report (two developments, same size band), written into the page at build time.
  function sampleExample() {
    const S = typeof window !== 'undefined' ? window.GW_SAMPLE : null;
    if (!S || !S.psf || S.psf.length !== 2) return '';
    const mx = Math.max(S.psf[0], S.psf[1]), row = (n, v, c) => '<div class="gw-rex-r"><b style="color:' + c + '">' + esc(n) + '</b><b>$' + num(v) + ' <small>psf</small></b></div><div class="gw-bar"><i style="width:' + (v / mx * 86).toFixed(1) + '%;background:' + c + '"></i></div>';
    return '<div class="gw-rex"><p class="gw-lane">Example · sample research report</p><p class="gw-rex-h">' + esc(S.a) + ' or ' + esc(S.b) + '? What each really sells for, size by size.</p>' +
      '<p class="gw-fine">' + esc(String(S.band).replace('sqft', 'sq ft')) + ' resales, ' + esc(S.period) + ', median price per square foot</p>' + row(S.a, S.psf[0], 'var(--gw-a)') + row(S.b, S.psf[1], 'var(--gw-b)') +
      '<a class="gw-rex-go" href="sample/" data-gw-nav-to="sample">Open the free sample report ›</a><p class="gw-fine">The sample is prepared with AI assistance from public sources and URA data, not reviewed by Ken.</p></div>';
  }
  function landingHtml(total) {
    return '<div class="lg-page"><header class="lg-hero" style="padding-bottom:28px"><div class="lg-wrap">' +
      '<nav class="gw-secs" aria-label="Ways to use Groundwork"><a href="../journey/" data-gw-nav-to="journey">Guide me</a><a href="../tools/" data-gw-nav-to="tools">Tools</a><a href="./" data-gw-nav-to="research" aria-current="page">Research</a></nav>' +
      '<p class="lg-kicker">Research</p><h1 class="md" tabindex="-1">Which property are you looking at?</h1>' +
      '<div class="lg-sb" id="sb" style="width:100%"></div>' +
      '<p class="lg-fine lg-center" id="lgCount">Type part of a name. If several match, check the street and district to pick the one you mean.</p></div></header>' +
      '<section class="lg-band tight" style="padding-top:0"><div class="lg-wrap" style="max-width:760px">' +
      // Everything else in Research, one tap away (the same pages the menu lists under Research).
      '<div class="gw-rmore"><p class="gw-lane">More ways to research</p><div class="gw-rlinks">' +
      [['../journey/worth/', 'HDB and home prices', 'Resales in your block · asking price', 'worth'], ['../tools/what-can-i-buy/', 'What can this budget buy?', 'Homes that sold around your budget', 'what-can-i-buy'], ['../projects/', 'Browse every development', 'A–Z list', 'directory']]
        .map((x) => '<a href="' + x[0] + '" data-gw-nav-to="' + x[3] + '"><b>' + x[1] + '</b><small>' + x[2] + '</small></a>').join('') + '</div></div>' + sampleExample() +
      '<p class="lg-fine lg-center" data-lg-scope>Can’t see it? Research covers private condos and apartments with sales in the last five years. Executive condominiums (ECs) and cluster houses aren’t covered in Research yet, and an unsold launch won’t appear. <a href="../projects/">Browse all ' + (total ? num(total) + ' ' : '') + 'developments</a>, including new launches with sites of their own.</p></div></section></div>';
  }
  // One search result row (the page's searchBox keeps its own events and keyboard handling).
  function resultRow(r, i, max, R) {
    const w = max ? Math.max(6, Math.round(110 * r.n / max)) : 0;
    const meta = [titleCase(r.street), 'District ' + Number(r.district), r.last ? 'latest sale ' + R.fmtMonth(r.last) : ''].filter(Boolean).join(' · ');
    return '<li role="option"><button type="button" data-id="' + esc(r.id) + '"' + (i === 0 ? ' aria-selected="true"' : '') + '><span><b>' + esc(R.displayName(r.name)) + '</b><span class="m">' + esc(meta) + '</span></span>' +
      '<span class="r"><span>' + plural(r.n, 'sale') + ' in 5 years</span><i style="width:' + w + 'px"></i></span></button></li>';
  }

  /* ---------- A4-03: names Research leaves out (window.GW_NOT_COVERED, written into the page at build time) ---------- */
  const normName = (s) => String(s == null ? '' : s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/&/g, ' AND ').replace(/@/g, ' AT ').replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  function notCoveredMatches(q, list) {
    const L = list || (typeof window !== 'undefined' ? window.GW_NOT_COVERED : null), nq = normName(q); if (!L || nq.length < 2) return [];
    const qt = nq.split(' '), c = nq.replace(/ /g, ''), out = [];
    [['ec', L.ec || []], ['cluster', L.cluster || []]].forEach(([kind, names]) => names.forEach((name) => {
      const k = normName(name), kt = k.split(' ');
      if (qt.every((x) => kt.some((w) => w.indexOf(x) === 0)) || (c.length >= 3 && k.replace(/ /g, '').indexOf(c) > -1)) out.push({ name, kind });
    }));
    return out.slice(0, 5);
  }
  const ncKind = { ec: 'executive condominium (EC)', cluster: 'cluster-house development' };
  const ncName = (x, R) => esc(R && R.displayName ? R.displayName(x.name) : titleCase(x.name));
  function emptySearch(q, R, list) {
    const m = notCoveredMatches(q, list);
    if (!m.length) return '<div class="kpr-results"><div class="kpr-empty">No transactions found under that name in the last 5 years. It may be a launch with no sales yet, or spelled differently. Executive condominiums (ECs) and cluster houses aren’t covered in Research yet.</div></div>';
    return '<div class="kpr-results"><div class="kpr-empty" data-lg-nc>' + (m.length === 1 ? '<b>' + ncName(m[0], R) + '</b> is ' + (m[0].kind === 'ec' ? 'an ' : 'a ') + ncKind[m[0].kind] + '.' : 'Matching names: ' + m.map((x) => '<b>' + ncName(x, R) + '</b> (' + (x.kind === 'ec' ? 'EC' : 'cluster houses') + ')').join(', ') + '.') +
      ' ECs and cluster houses aren’t covered in Research yet: it looks at private condos and apartments only.</div></div>';
  }
  function notCoveredNote(q, R, list) {
    const m = notCoveredMatches(q, list); if (!m.length) return '';
    return '<p class="lg-fine" data-lg-nc>Also matching, but not covered in Research yet: ' + m.map((x) => ncName(x, R) + ' (' + (x.kind === 'ec' ? 'EC' : 'cluster houses') + ')').join(', ') + '. ECs and cluster houses aren’t covered in Research yet.</p>';
  }

  /* ---------- a development's page ---------- */
  function sizeChips(M) {
    const f = M.focus || {}, rec = (M.bands || []).filter((b) => b.recent || b.bin === f.bin);
    const list = (rec.length ? rec : M.bands || []).slice().sort((x, y) => x.bin - y.bin);
    return list.map((b) => '<button type="button" class="kpr-link" data-bin="' + b.bin + '" aria-pressed="' + (b.bin === f.bin) + '">' + esc(b.label.replace(/\s*sqft$/, '')) + '</button>').join('') +
      '<button type="button" data-lg-size aria-expanded="false" aria-controls="lgSize">Enter a size</button>';
  }
  function sizeLine(M) {
    const f = M.focus || {}, A = M.answer || {};
    if (f.requested && f.bin == null) return 'No sales recorded around ' + esc(sqft(f.requestedLabel)) + '.' + (A.nearest && A.nearest.length ? ' Closest sizes with sales: ' + A.nearest.map((x) => esc(sqft(x.label)) + ' (' + x.n + ')').join(', ') + '.' : '');
    if (f.userChosen) return 'Showing ' + esc(sqft(f.label)) + ', the size you chose.';
    if (f.bin != null) return 'Showing ' + esc(sqft(f.label)) + (A.sizeNote ? ', the size that sold most in the last 12 months' : ', the size with the most sales on record') + '. Looking at a different size?';
    return '';
  }
  function sizeForm(S) {
    return '<div class="lg-sizeform" id="lgSize"' + (S && S.size ? '' : ' hidden') + '><label class="lg-vh" for="sizeIn">Size in square feet</label><input id="sizeIn" inputmode="numeric" autocomplete="off" placeholder="Size in sq ft, e.g. 1,000" value="' + esc(S && S.size) + '" aria-describedby="sizeNote">' +
      '<button class="lg-btn" type="button" id="sizeGo" style="min-height:44px;padding:9px 18px">Show this size</button>' + (S && S.size ? '<button class="lg-btn" type="button" id="sizeClear" style="min-height:44px;padding:9px 18px;border-color:transparent">Back to the most-sold size</button>' : '') +
      '<p class="lg-fine" id="sizeNote" style="width:100%;text-align:center">Square feet only. Kept on this device, never sent to analytics or WhatsApp.</p><p class="err" id="sizeErr" role="alert"></p></div>';
  }
  function sizesTable(M) {
    if (!M.bands || !M.bands.length) return '<p>No sales with a recorded size for this sale type.</p>';
    const w = words(M);
    return '<div class="lg-scroll"><table class="lg-table"><thead><tr><th scope="col">Size</th><th scope="col">Last 12 months</th><th scope="col">Median PSF, last 12 months</th><th scope="col">All ' + esc(w[1]) + ' on record</th><th scope="col">Middle half, all ' + esc(w[1]) + '</th></tr></thead><tbody>' +
      M.bands.slice().sort((x, y) => x.bin - y.bin).map((b) => '<tr><th scope="row">' + esc(sqft(b.label)) + '</th><td>' + (b.recent ? b.recent.n : 0) + '</td><td>' + (b.recent ? money(b.recent.psf.med) : '—') + '</td><td>' + b.n + '</td><td>' + money(b.psf.q1) + '–' + money(b.psf.q3) + '</td></tr>').join('') +
      '</tbody></table></div><p class="lg-fine">' + esc(M.notes && M.notes.psf) + ' Tap a size above to make it the headline.</p>';
  }
  function saleTypes(M) {
    if (!M.sale || M.sale.options.length < 2) return '';
    return '<details class="lg-fold"><summary>New sales and sub-sales<small>' + esc('Showing ' + M.sale.label + 's') + '</small></summary><div class="in"><p>Each sale type is shown on its own, so the typical price is never a mix of them.</p>' +
      '<div class="lg-chips" style="justify-content:flex-start">' + M.sale.options.map((o) => '<button type="button" data-sale="' + esc(o.id) + '" aria-pressed="' + (o.id === M.sale.selected) + '">' + esc(o.label.charAt(0).toUpperCase() + o.label.slice(1) + 's') + ' · ' + o.recent + ' in the last 12 months</button>').join('') + '</div></div></details>';
  }
  function methodHtml(M, IN) {
    const found = IN && IN.found && IN.found.length ? '<h3 style="font-size:16px">What KPT found</h3><ul class="lg-list">' + IN.found.map((f) => '<li data-ins="' + esc(f.id) + '">' + esc(f.text) + '</li>').join('') + '</ul>' : '';
    const checks = IN && IN.checklist ? '<h3 style="font-size:16px">What KPT checked</h3>' + IN.checklist.map((c) => '<div data-area="' + esc(c.id) + '"><b>' + esc(c.label) + '</b>' + c.lines.map((l) => '<p class="kpr-chk-' + esc(l.status) + '">' + esc(l.text) + (l.note ? ' <span class="lg-fine">' + esc(l.note) + '</span>' : '') + '</p>').join('') + '</div>').join('') : '';
    const read = (M.read || []).map((r) => '<p>' + esc(r.text) + '</p>').join('');
    const all = M.history && M.history.all && M.history.all.points.length ? '<p>' + esc(M.history.all.text) + ' Overall PSF mixes every size sold, and that mix changes over time.' + (M.history.mixShift ? ' ' + esc(M.history.mixShift.text) : '') + '</p>' : '';
    const floors = M.floors && M.floors.rows && M.floors.rows.length ? '<h3 style="font-size:16px">By floor band, ' + esc(sqft(M.floors.band)) + ', ' + esc(M.floors.window) + '</h3><ul class="lg-list">' + M.floors.rows.map((r) => '<li>Floors ' + esc(r.band) + ': median ' + money(r.psf.med) + ' · ' + esc(r.evidence.line) + '</li>').join('') + '</ul><p class="lg-fine">' + esc(M.floors.note) + '</p>' : '';
    const ctx = M.context ? '<h3 style="font-size:16px">Market context, not direct comparables</h3><p>' + esc(M.context.note) + '</p>' + M.context.rows.map((r) => '<p><b>' + esc(String(r.label).replace(/^District D(\d+)$/, 'District $1')) + ':</b> ' + r.windows.map((w) => esc(w.label) + ', ' + plural(w.n, 'sale') + ' from ' + plural(w.projects, 'project') + ', median ' + money(w.psf.med)).join(' · ') + '</p>').join('') : '';
    return '<details class="lg-fold" id="evidence"><summary>How we worked this out<small>Sales checked, size, recency, floors</small></summary><div class="in">' + found + read + all + checks + floors + ctx +
      '<h3 style="font-size:16px">What the sales can’t tell you</h3><ul class="lg-list">' + (M.notMeasured || []).map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
      '<p class="lg-fine">' + esc(M.notes && M.notes.psf) + ' ' + esc(M.history && M.history.note) + '</p></div></details>';
  }
  function factsFallback(M) {
    const w = words(M), eb = M.evidenceBase;
    return [M.street ? titleCase(M.street) : '', district(M), REGION[M.region] || M.region, M.tenure && M.tenure.mixed ? 'Mixed tenure in these records' : M.tenure && M.tenure.label ? M.tenure.label.replace(/yrs/, 'years') : '', eb && eb.total ? plural(eb.total, w[0], w[1]) + ' on record since ' + eb.first.replace(/^(\d{4})-(\d{2})$/, (x, y, mo) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mo) - 1] + ' ' + y) : ''].filter(Boolean).map(esc).join(' · ');
  }
  /* ---------- R2.1: what you can do with this development (each backed by figures this page already has) ---------- */
  const ASKM = () => root.GWASK || (typeof require === 'function' ? (() => { try { return require('./gw-ask.js'); } catch (e) { return null; } })() : null);
  // The 12-month figures of each size band, for the asking-price check (the same cells the size chips and table use).
  function askData(M) {
    const w = words(M);
    return { id: M.id, name: M.name, words: [w[0], w[1]], bands: (M.bands || []).slice().sort((x, y) => x.bin - y.bin).map((b) => (b.recent
      ? { bin: b.bin, label: sqft(b.label), n: b.recent.n, months: b.recent.evidence.months, latest: b.recent.evidence.latestLabel, lo: b.recent.psf.min, q1: b.recent.psf.q1, med: b.recent.psf.med, q3: b.recent.psf.q3, hi: b.recent.psf.max }
      : { bin: b.bin, label: sqft(b.label), n: 0 })) };
  }
  // A4-07: the price for "Run the numbers" is the median sale PRICE of the same sales (same sale type, size band and last 12 months),
  // read from data/projects/find.json, which holds those medians. Median PSF times the middle of the band could describe a size
  // nobody bought there (The Hillford: $522k against an actual median of $594k). Only where the typical price rule is met (A4-04),
  // only where find.json's count and months agree with the cell on show, and never on records over 270 days old.
  function typicalPrice(M, F, m, now) {
    const A = M.answer, f = A && A.facts, key = M.sale && M.sale.selected === 'new' ? 'new' : M.sale && M.sale.selected === 'resale' ? 'resale' : null;
    if (!strong(M) || !F || !key || f.sizeBin == null) return null;
    const fr = freshness(m, now); if (fr && fr.state === 'expired') return null;
    const row = (F[key] || []).find((r) => r[0] === f.sizeBin);
    if (!row || row[1] !== f.recentN || row[2] !== f.recentMonths || !(row[5] > 0)) return null;
    return { price: Math.round(row[5] / 1000) * 1000, median: row[5], n: row[1], label: sqft(A.size && A.size.label), psf: f.recentMedian };
  }
  const runWhat = (T, M) => 'Run the numbers at about ' + money(T.price) + ', the median price of the ' + plural(T.n, words(M)[0], words(M)[1]) + ' of ' + T.label + ' homes here in the last 12 months (past sales, not a valuation):';
  function actions(M) {
    const K = ASKM(), canAsk = !!K && (M.bands || []).some((b) => b.recent && b.recent.n), T = strong(M);
    const act = (attrs, icon, t) => '<button type="button" class="lg-act" ' + attrs + '>' + icon + '<span>' + t + '</span></button>';
    const I = (d) => '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
    return '<div class="lg-acts" role="group" aria-label="What you can do here">' +
      act('data-lg-scroll="numbers"', I('<path d="M5 20V12m5 8V7m5 13v-6m5 6V4"/>'), 'Recent sales') +
      (canAsk ? act('data-lg-ask aria-expanded="false" aria-controls="lgAsk"', I('<path d="M4 7h16v10H4z"/><path d="M8 12h8"/><path d="M12 9v6"/>'), 'Check an asking price') : '') +
      '<a class="lg-act" id="cmp" href="#/compare/' + esc(M.id) + '">' + I('<path d="M8 4v16M16 4v16M4 8h4M16 16h4"/>') + '<span>Compare</span></a></div>' +
      (canAsk ? K.panelHtml('condo', askData(M), { id: 'lgAsk', hidden: true }) : '') +
      // Progressive payments only where the sales on show are new sales (a home still under construction); resales are paid on completion.
      // The line is filled after the page is drawn, once find.json has given the median price (afterProject); until then it is hidden.
      // V2-01: on a first-look page (no typical price) the line is still there, hidden, so an asking price typed above can be sent on.
      (T || canAsk ? '<p class="lg-run" data-lg-run-line data-typical="" hidden><span data-lg-run-what></span> ' +
        '<a href="../tools/stamp-duty/" data-lg-run="stamp-duty">Stamp duty</a> · <a href="../tools/mortgage/" data-lg-run="mortgage">Mortgage (75% loan)</a>' + (M.sale && M.sale.selected === 'new' ? ' · <a href="../tools/progressive-payments/" data-lg-run="progressive">New launch payments</a>' : '') + '</p>' : '');
  }
  // ctx: { S, IN, root }
  function projectHtml(M, ctx) {
    const S = (ctx && ctx.S) || {}, IN = ctx && ctx.IN, root = (ctx && ctx.root) || '../', f = M.focus || {}, A = M.answer || {}, mf = S.rawM || null;
    if (S.rawP && S.rawP.id === M.id && Array.isArray(S.rawP.districts)) M.districtsAll = S.rawP.districts;
    const kick = [M.street ? titleCase(M.street) : '', district(M)].filter(Boolean).join(' · ');
    const chartPts = M.history && M.history.band && M.history.band.points ? M.history.band.points : [];
    const chart = lineChart(chartPts, '#5a55d6', 'Median ' + (words(M)[0]) + ' PSF of ' + (f.label || '') + ' homes at ' + M.name + ' in each 12-month period, oldest to newest');
    const ken = M.ken ? '<div class="lg-tile" style="grid-column:1/-1"><b>Ken’s Take</b><p>“' + esc(M.ken.note) + '”</p><p class="lg-fine">Ken’s judgement, not URA data.</p></div>' : '';
    return '<div class="lg-page" data-lg="project" data-state="' + esc(A.state || '') + '">' +
      '<header class="lg-hero"><div class="lg-wrap">' +
        '<button class="kpr-back lg-back" type="button" data-act="home">← Search another development</button>' +
        (kick ? '<p class="lg-kicker">' + esc(kick) + '</p>' : '') +
        '<h1 class="lg-name" tabindex="-1">' + esc(M.name) + '</h1>' +
        '<p class="lg-lead lg-center" data-lg-lead>' + projectLead(M) + '</p>' + projectPill(M) +
        (M.tenure && M.tenure.mixed ? '<p class="lg-fine lg-center" data-lg-mixed>' + esc(mixedLine(M.tenure)) + '</p>' : '') + freshLine(mf) +
        (A.lines && A.state !== 'recent' ? '<p class="lg-fine lg-center">' + A.lines.map((l) => esc(l.text)).join(' ') + '</p>' : '') +
        ((M.bands || []).length ? '<div class="lg-sizes"><span class="lbl">' + sizeLine(M) + '</span><div class="lg-chips" role="group" aria-label="Size">' + sizeChips(M) + '</div>' + sizeForm(S) + '</div>' : '') +
        actions(M) +
      '</div></header>' +
      '<section class="lg-band grey" id="lgCompare"><div class="lg-wrap" style="gap:22px"><div class="lg-head"><p class="lg-kicker">Compare</p><h2>Often compared with ' + esc(M.name) + '</h2><p class="lg-sub" data-lg-sugg-sub>Developments that share enough recent sales in the same sizes for a fair comparison.</p></div>' +
        '<div class="lg-sugg" data-lg-sugg></div><p class="lg-fine lg-center">Or <a href="#/compare/' + esc(M.id) + '" data-lg-pick>search for any other development</a>.</p></div></section>' +
      '<section class="lg-band" id="numbers"><div class="lg-wrap" style="gap:26px"><div class="lg-head"><p class="lg-kicker">The numbers</p><h2>How the price has moved.</h2>' +
        '<p class="lg-sub">' + (chart ? 'Median ' + esc(words(M)[0]) + ' PSF of ' + esc(sqft(f.label)) + ' homes in each 12-month period, however many sold. Past sales, not a forecast.' : esc((M.history && M.history.note) || 'Historical transactions only.')) + '</p></div>' +
        '<div class="lg-g2 lg-numgrid">' +
          (chart ? '<div class="lg-tile" style="padding:26px 28px">' + chart + '<span class="lg-fine">Hollow dot: fewer than 3 sales. ' + esc(M.history.band.text || '') + '</span></div>' : '<div class="lg-tile">' + (M.read || []).map((r) => '<p>' + esc(r.text) + '</p>').join('') + '</div>') +
          '<div style="display:grid;gap:14px"><div class="lg-tile"><span class="lg-fine">What we know for sure</span><div data-lg-facts><span style="font-size:15.5px;line-height:1.5">' + factsFallback(M) + '</span></div></div>' +
          '<div class="lg-tile"><span class="lg-fine">Before you decide, check</span><span style="font-size:15.5px;line-height:1.5">' + (M.notMeasured || []).slice(0, 4).map(esc).join(' · ') + '</span></div>' + ken + '</div>' +
        '</div>' +
        '<div class="lg-folds"><details class="lg-fold"><summary>Every size, in a table<small>' + plural((M.bands || []).length, 'size') + '</small></summary><div class="in">' + sizesTable(M) + '</div></details>' + saleTypes(M) + methodHtml(M, IN) +
        '<details class="lg-fold" id="lgSources"><summary>Sources</summary><div class="in" data-lg-sources><p>Prices and sales: ' + esc(dataSpan(mf)) + (M.recent && M.recent.latestLabel ? ' Latest ' + esc(words(M)[0]) + ' here: ' + esc(M.recent.latestLabel) + '.' : '') + esc(newNote(M)) + ' Small numbers next to a fact link to its source.</p></div></details></div>' +
      '</div></section>' +
      '<section class="lg-band tight" style="padding-top:0"><div class="lg-wrap"><div class="lg-kenstrip"><div class="who"><img src="' + esc(root) + 'assets/img/ken-portrait.jpg" alt="Ken Tan" width="56" height="56"><div><b>Looking at a particular unit?</b><span>The sales can’t tell us its facing, layout or whether an asking price is justified. Ken replies personally on WhatsApp.</span></div></div>' +
        '<a class="lg-btn wa" id="wa" href="#" target="_blank" rel="noopener">Ask Ken on WhatsApp</a></div><p class="lg-fine">Only the development’s name goes into the message, nothing you typed. Please leave income, CPF and debt details out of it.</p></div></section>' +
    '</div>';
  }

  /* ---------- after the page is drawn ---------- */
  const STATE_WORD = { s: 'Enough to compare fairly', l: 'A first look' };
  const KPT = () => root.KPT || { track: function () {} };
  // hooks: { root, onCompare(otherId), track }
  function afterProject(M, app, hooks) {
    const h = hooks || {}, base = h.root || '../';
    // "Enter a size" opens the size box (the page wires #sizeGo / #sizeIn).
    const tg = app.querySelector('[data-lg-size]'), box = app.querySelector('#lgSize');
    if (tg && box) tg.addEventListener('click', () => { box.hidden = !box.hidden; tg.setAttribute('aria-expanded', String(!box.hidden)); if (!box.hidden) { const i = box.querySelector('input'); if (i) i.focus(); } });
    if (box && !box.hidden && tg) tg.setAttribute('aria-expanded', 'true');
    // Suggested comparisons, ranked ahead of time by the same evidence rules.
    const host = app.querySelector('[data-lg-sugg]');
    if (host && typeof fetch === 'function') fetch(base + 'data/research/suggest.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => {
      const list = d && d.p && d.p[M.id];
      if (!list || !list.length) { host.outerHTML = '<p class="lg-sub lg-center" data-lg-sugg-none>No development shares enough recent sales with ' + esc(M.name) + ' to suggest one. You can still compare it with any development, and the page will say how much the sales can support.</p>'; const s = app.querySelector('[data-lg-sugg-sub]'); if (s) s.remove(); return; }
      host.innerHTML = list.slice(0, 3).map((x) => '<button type="button" class="lg-tile" data-lg-go="' + esc(x[0]) + '"><b>' + esc(x[1]) + '</b><span class="m">' + esc(STATE_WORD[x[2]] || '') + ' · ' + x[3] + ' and ' + x[4] + ' sales of ' + esc(sqft(x[5])) + ' homes</span><span class="go">Compare ›</span></button>').join('');
      host.querySelectorAll('[data-lg-go]').forEach((b) => b.addEventListener('click', () => { if (h.track) h.track('research_compare_started', { project_id: M.id }); if (h.onCompare) h.onCompare(b.dataset.lgGo); }));
    });
    const pk = app.querySelector('[data-lg-pick]'); if (pk && h.track) pk.addEventListener('click', () => h.track('research_compare_started', { project_id: M.id }));
    // A4-07: "Run the numbers" at the median price of the same sales.
    const run = app.querySelector('[data-lg-run-line]');
    if (run && typeof fetch === 'function') findData(base).then((F) => {
      const T = typicalPrice(M, F && F[M.id], h.manifest), what = run.querySelector('[data-lg-run-what]');
      if (!T || !what || !run.isConnected) { if (run.isConnected && !app.querySelector('#lgAsk')) run.remove(); return; } // V2-01: kept for an asking price
      run.dataset.typical = String(T.price); what.textContent = runWhat(T, M); run.hidden = false;
    });
  }
  // data/projects/find.json, fetched once per page: project id -> { new: [[bin, n, months, last, q1, med, q3]], resale: [...] }.
  let FIND = null;
  function findData(base) {
    if (!FIND) FIND = fetch(base + 'data/projects/find.json').then((r) => (r.ok ? r.json() : null)).then((d) => { const o = {}; ((d && d.projects) || []).forEach((p) => { o[p.id] = { new: p.new || [], resale: p.resale || [] }; }); return o; }).catch(() => { FIND = null; return null; });
    return FIND;
  }
  // Registry facts for the development, when it has them (filled by KPTV2.afterProject, which owns the fetch).
  function fillFacts(app, p, factsHtml, sourced) {
    const host = app.querySelector('[data-lg-facts]'); if (!host || !p) return false;
    const f = sourced(p), rows = f.rows; if (!rows.length) return false;
    const sup = (x) => '<sup>' + x.sources.filter((s) => s.n).map((s) => '<a href="#" data-lg-src="' + esc(s.n) + '">' + esc(s.n) + '</a>').join(',') + '</sup>';
    const named = rows.filter((x) => x.sources.some((s) => s.n));
    host.innerHTML = '<span style="font-size:15.5px;line-height:1.5">' + named.map((x) => esc(x.field === 'units' ? x.display : x.label.charAt(0).toUpperCase() + x.label.slice(1) + ': ' + x.display) + sup(x)).join(' · ') + '</span>';
    const homes = rows.find((x) => x.field === 'units'), what = app.querySelector('[data-lg-what]');
    if (homes && what) { const n = (String(homes.display).match(/([\d,]+)/) || [])[1]; if (n) what.innerHTML = (/^8|^(11|18)(,\d{3})*$/.test(n) ? 'an ' : 'a ') + esc(n) + '-home development' + sup(homes); }
    const src = app.querySelector('[data-lg-sources]');
    if (src) src.insertAdjacentHTML('beforeend', '<ol class="lg-list">' + Object.keys(f.sources).filter((n) => rows.some((x) => x.sources.some((s) => String(s.n) === n))).map((n) => '<li value="' + esc(n) + '" id="lgsrc' + esc(n) + '">' + (f.sources[n].url ? '<a href="' + esc(f.sources[n].url) + '" target="_blank" rel="noopener noreferrer">' + esc(f.sources[n].title) + '</a>' : esc(f.sources[n].title)) + '</li>').join('') + '</ol>');
    return true;
  }

  /* ---------- "Run the numbers": the typical price, or the asking price typed above, goes to the calculator in this tab only ---------- */
  function askedPrice() { const i = document.querySelector('#lgAsk [data-ask-price]'), K = ASKM(), v = i && K ? K.amount(i.value) : 0; return v >= 10000 && v <= 1e8 ? v : 0; }
  function runNumbers(a) {
    const line = a.closest('[data-lg-run-line]'), price = askedPrice() || Number(line && line.dataset.typical) || 0; if (!price) return;
    try {
      const k = 'gw.fin.v1', s = JSON.parse(root.sessionStorage.getItem(k) || '{}') || {};
      s.buyPrice = String(price); if (a.dataset.lgRun === 'mortgage') s.loan = String(Math.round(price * 0.75));
      root.sessionStorage.setItem(k, JSON.stringify(s));
    } catch (e) { /* storage blocked: the calculator opens empty */ }
    try { KPT().track('tool_selected', { tool: 'calc-' + a.dataset.lgRun, placement: 'research-project' }); } catch (e) { /* analytics unavailable */ }
  }
  if (typeof document !== 'undefined') document.addEventListener('input', (e) => {
    if (!e.target.matches || !e.target.matches('#lgAsk [data-ask-price]')) return;
    const w = document.querySelector('[data-lg-run-what]'), v = askedPrice(); if (!w) return;
    w.textContent = v ? 'Run the numbers at this asking price (' + money(v) + '):' : w.dataset.def || w.textContent;
    // V2-01: with no typical price the line shows only while an asking price is typed
    const line = w.closest('[data-lg-run-line]'); if (line) line.hidden = !v && !line.dataset.typical;
  });
  if (typeof document !== 'undefined') document.addEventListener('focusin', (e) => { if (e.target.matches && e.target.matches('#lgAsk [data-ask-price]')) { const w = document.querySelector('[data-lg-run-what]'); if (w && !w.dataset.def) w.dataset.def = w.textContent; } });

  /* ---------- page-wide behaviour ---------- */
  // In-page jumps use buttons, never "#section" links: the Research page routes on the hash, so a section link would leave the page.
  if (typeof document !== 'undefined') document.addEventListener('click', (e) => {
    const ak = e.target.closest ? e.target.closest('[data-lg-ask]') : null;
    if (ak) { const p = document.getElementById('lgAsk'); if (p) { p.hidden = !p.hidden; ak.setAttribute('aria-expanded', String(!p.hidden)); if (!p.hidden) { const i = p.querySelector('input'); if (i) i.focus({ preventScroll: true }); p.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } } return; }
    const rn = e.target.closest ? e.target.closest('[data-lg-run]') : null;
    if (rn) { runNumbers(rn); return; }
    const t = e.target.closest ? e.target.closest('[data-lg-scroll],[data-lg-src],[data-lg-tab]') : null; if (!t) return;
    if (t.dataset.lgScroll) { const el = document.getElementById(t.dataset.lgScroll); if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } return; }
    if (t.dataset.lgSrc) { e.preventDefault(); const d = document.getElementById('lgSources'), li = document.getElementById('lgsrc' + t.dataset.lgSrc); if (d) d.open = true; (li || d).scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (t.dataset.lgTab) {
      const bar = t.closest('[data-lg-tabs]'); if (!bar) return; const scope = bar.parentElement;
      bar.querySelectorAll('[data-lg-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
      scope.querySelectorAll('[data-lg-panel]').forEach((p) => { p.hidden = p.dataset.lgPanel !== t.dataset.lgTab; });
    }
  });

  return { strong, STRONG, freshness, freshLine, dataSpan, mixedLine, emptySearch, notCoveredNote, notCoveredMatches, runWhat, district, askData, typicalPrice, landingHtml, resultRow, projectHtml, afterProject, fillFacts, lineChart, projectLead, projectPill, activitySentence, priceSentence, tenurePhrase, titleCase, sqft, esc, money, num, plural };
});
