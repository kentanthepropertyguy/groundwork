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
  const GLOBAL = root;   // projectHtml's own `root` is the path prefix

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const money = (n) => '$' + num(n);
  const plural = (n, w, ws) => n + ' ' + (n === 1 ? w : (ws || w + 's'));
  const sqft = (label) => String(label || '').replace(/\s*sqft$/, ' sq ft');
  const titleCase = (s) => String(s || '').toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
  const SALE_WORDS = { resale: ['resale', 'resales', 'resold'], 'new sale': ['new sale', 'new sales', 'sold'], 'sub-sale': ['sub-sale', 'sub-sales', 'sold'] };
  // Development class (shared register): condo | ec | cluster. Rows and models from older data carry none and are condos.
  const CLS = {
    condo: { label: 'Condominium', what: 'a private residential development', short: '', like: '' },
    ec: { label: 'Executive Condominium', what: 'an executive condominium (EC)', short: 'Priced under different rules from private condominiums, so compared only with other ECs.', like: 'Executive condominiums are sold under different rules from private condominiums, so their prices are not comparable with condominium prices. Comparisons here are with other ECs only.' },
    cluster: { label: 'Cluster housing', what: 'a strata landed (cluster housing) development', short: 'Priced differently from condominiums, so compared only with other cluster housing.', like: 'Strata landed homes in a gated development sell at different price levels from condominiums. Comparisons here are with other cluster-housing developments only.' },
  };
  const clsOf = (x) => (x && CLS[x.cls] ? x.cls : 'condo');
  const ALSO = { condo: ['condominium sale', 'condominium sales'], ec: ['EC sale', 'EC sales'], cluster: ['cluster-housing sale', 'cluster-housing sales'] };
  function alsoLine(M) {
    const a = M && M.also; if (!a) return '';
    const parts = Object.keys(a).filter((k) => ALSO[k]).map((k) => a[k] + ' ' + ALSO[k][a[k] === 1 ? 0 : 1]);
    return parts.length ? 'The same name also appears in URA records with ' + parts.join(' and ') + ' of another property type. They are counted separately and are not part of the prices on this page.' : '';
  }
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
  function freshLine(m, now, cls) {
    const F = freshness(m, now); if (!F) return '';
    return '<p class="' + (cls || 'lg-fine lg-center') + '" data-lg-fresh="' + F.state + '">Sales from ' + esc(F.from12) + ' to ' + esc(F.to) + ', from URA records retrieved ' + esc(F.asOf) + '. ' + esc(F.to) + ' may be incomplete.' +
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
    if (A.state === 'recent' && strong(M)) return '<span class="lg-pill" data-lg-ev="good">Based on ' + plural(f.recentN, w[0], w[1]) + ' of this size across ' + f.recentMonths + ' of the last 12 months. Past sales, not a valuation.</span>';
    if (A.state === 'recent') { const s = STRONG(); return '<span class="lg-pill warn" data-lg-ev="limited">Based on only ' + plural(f.recentN, 'comparable ' + w[0], 'comparable ' + w[1]) + (f.recentN >= s.sales ? ', in ' + plural(f.recentMonths, 'month') : '') + '. Interpret with care.</span>'; }
    if (A.state === 'recent-thin') return '<span class="lg-pill warn" data-lg-ev="limited">Based on only ' + plural(f.recentN, 'comparable ' + w[0], 'comparable ' + w[1]) + '. Interpret with care.</span>';
    if (A.state === 'older') return '<span class="lg-pill warn" data-lg-ev="older">No ' + w[1] + ' of this size in the last 12 months. Older sales may not reflect today’s prices.</span>';
    return '<span class="lg-pill grey" data-lg-ev="none">There aren’t enough recent ' + w[1] + ' with a recorded size to show a typical price.</span>';
  }
  function projectLead(M) {
    const where = [M.street ? 'on ' + titleCase(M.street) : '', district(M) ? 'in ' + district(M) : ''].filter(Boolean).join(' '), ten = M.tenure && M.tenure.mixed ? 'with mixed tenure in these records' : tenurePhrase(M.tenure);
    const s1 = esc(M.name) + ' is <span data-lg-what>' + CLS[clsOf(M)].what + '</span>' + (where ? ' ' + esc(where) : '') + (ten ? ', ' + esc(ten) : '') + '.';
    return [s1, esc(activitySentence(M)), priceSentence(M)].filter(Boolean).join(' ');
  }

  // Phase 2 (answer first): what the development is, in one short line. The price is not repeated here; the answer block above it carries it.
  function projectFacts(M, noActivity) {   // noActivity (CX V2): the "at a glance" card above already gives the same 12-month count
    const where = [M.street ? 'on ' + titleCase(M.street) : '', district(M) ? 'in ' + district(M) : ''].filter(Boolean).join(' '), ten = M.tenure && M.tenure.mixed ? 'with mixed tenure in these records' : tenurePhrase(M.tenure);
    return [esc(M.name) + ' is <span data-lg-what>' + CLS[clsOf(M)].what + '</span>' + (where ? ' ' + esc(where) : '') + (ten ? ', ' + esc(ten) : '') + '.', noActivity ? '' : esc(activitySentence(M))].filter(Boolean).join(' ');
  }
  // The answer: the median price for the size on show, with its sample size and price basis right beside it (never further down the page).
  function answerBlock(M, mf, rent) {
    const A = M.answer || {}, f = A.facts || {}, w = words(M), sz = A.size && A.size.label ? sqft(A.size.label) : '';
    const priced = (A.state === 'recent' || A.state === 'recent-thin') && f.recentMedian != null;
    const k = priced ? 'Median price per sq ft (PSF)' + (sz ? ' · ' + sz : '') + ' · ' + w[1] + ', last 12 months' : (A.price && A.price.label ? A.price.label : 'Recent sales') + (sz ? ' · ' + sz : '');
    const v = priced ? '<span class="lg-ans-v">' + money(f.recentMedian) + '<small> psf</small></span>' : '<span class="lg-ans-v txt">' + esc(A.price && A.price.value ? A.price.value : 'not available yet') + '</span>';
    const lines = A.lines && A.state !== 'recent' ? A.lines.map((l) => l.text).join(' ') : '';
    const basis = ((strong(M) ? '' : 'Past sales, not a valuation.') + newNote(M) + (lines ? ' ' + lines : '')).trim();
    return '<div class="lg-ans" data-lg-ans="' + esc(A.state || '') + '"><p class="lg-ans-k">' + k + '</p><p class="lg-ans-main">' + v + '</p>' + projectPill(M) +
      (basis ? '<p class="lg-fine lg-ans-basis" data-lg-basis>' + esc(basis) + '</p>' : '') +
      (M.tenure && M.tenure.mixed ? '<p class="lg-fine" data-lg-mixed>' + esc(mixedLine(M.tenure)) + '</p>' : '') + (rent || '') + freshLine(mf, undefined, 'lg-fine') + '</div>';
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
      '<a class="gw-rex-go" href="sample/" data-gw-nav-to="sample">Open the free sample report ›</a></div>';
  }
  // Research home: two ways in, one open at a time (26 Oct 2026). "Research a property" is ONE search for a development, a postal code, an HDB block or a road: what it
  // recognises opens a short overview with a clear way into the full report. The page script (research/index.html) switches them and fills the workspaces.
  const RESEARCH_OPTS = [
    ['dev', 'Research a property', 'HDB, condo or landed — prices, past sales, rents and comparisons.', 'Property', 'Research a property', 'Search a development, a postal code, an HDB block or a road.'],
    ['budget', 'What can this budget buy?', 'By budget, area and must-haves', 'Budget', 'What can this budget buy?', 'Tell us your budget and what matters. We show the developments that fit.']];
  function landingHtml(total, opt) {
    const cur = opt || 'dev', n = total ? num(total) : '';
    const tabs = RESEARCH_OPTS.map((o) => '<button type="button" class="gw-ropt" data-opt="' + o[0] + '" id="opt-' + o[0] + '" aria-expanded="' + (o[0] === cur) + '" aria-controls="ws-' + o[0] + '"><b><span class="l">' + esc(o[1]) + '</span><span class="s">' + esc(o[3]) + '</span></b><small>' + esc(o[2]) + '</small></button>').join('');
    const ws = (o, inner) => '<section class="gw-rws" id="ws-' + o[0] + '" aria-labelledby="ws-' + o[0] + '-h"' + (o[0] === cur ? '' : ' hidden') + '><h2 id="ws-' + o[0] + '-h">' + esc(o[4]) + '</h2><p class="gw-rws-sub">' + esc(o[5]) + '</p>' + inner + '</section>';
    const dev = '<div class="lg-sb" id="sb"></div><div id="rwOver" class="gw-rover" aria-live="polite"></div><div id="rwLanded" class="gw-rhost gw-rprop" hidden></div>' +
      '<p class="lg-fine" id="lgCount">If several match, check the street and district.</p>' +
      '<div id="rwOwn"></div><div class="gw-raz"><button type="button" class="gw-razb" id="azBtn" aria-expanded="false" aria-controls="rwAz">Or browse all ' + (n ? n + ' ' : '') + 'developments A–Z</button><div id="rwAz" hidden></div></div>' + sampleExample() +
      '<p class="lg-fine" data-lg-scope>Can’t see it? Research covers private condos and apartments, executive condominiums (ECs) and strata cluster houses with sales in the last five years, each kept to its own type. A launch with no sales yet is listed without prices and opens on the Map, and landed homes on their own land are found by road or postal code.</p>';
    return '<div class="lg-page gw-rhome"><header class="gw-rhead"><h1 tabindex="-1">What would you like to research?</h1><p class="gw-rlede">Free, from URA and HDB records.</p></header>' +
      '<div class="gw-ropts" role="group" aria-label="What to research">' + tabs + '</div>' +
      ws(RESEARCH_OPTS[0], dev) + ws(RESEARCH_OPTS[1], '<div id="rwBudget" class="gw-rhost"><p class="lg-fine">Loading…</p></div>') + '</div>';
  }
  // One search result row (the page's searchBox keeps its own events and keyboard handling).
  function resultRow(r, i, max, R) {
    const w = max ? Math.max(6, Math.round(110 * r.n / max)) : 0;
    const meta = [clsOf(r) === 'condo' ? '' : CLS[clsOf(r)].label, titleCase(r.street), 'District ' + Number(r.district), r.last ? 'latest sale ' + R.fmtMonth(r.last) : ''].filter(Boolean).join(' · ');
    return '<li role="option"><button type="button" data-id="' + esc(r.id) + '"' + (i === 0 ? ' aria-selected="true"' : '') + '><span><b>' + esc(R.displayName(r.name)) + '</b><span class="m">' + esc(meta) + '</span></span>' +
      '<span class="r"><span>' + plural(r.n, 'sale') + ' in 5 years</span><i style="width:' + w + 'px"></i></span></button></li>';
  }

  // The register of launches and awarded sites (data/map/upcoming.json, the file the Map and the site search read), matched by name or any name it is known by.
  const lnorm = (v) => String(v == null ? '' : v).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  function matchLaunches(items, query, max) {
    const q = lnorm(query); if (q.length < 3 || !Array.isArray(items)) return [];
    const qs = /^the .{2,}/.test(q) ? [q, q.slice(4)] : [q];   // a leading "The" is optional
    return items.map((it) => { let sc = 0; [it.name].concat(it.aliases || []).forEach((a) => { const n = lnorm(a); qs.forEach((qq) => { const v = n === qq ? 3 : n.indexOf(qq) === 0 ? 2 : (' ' + n).indexOf(' ' + qq) >= 0 ? 1 : 0; if (v > sc) sc = v; }); }); return { sc, it }; })
      .filter((x) => x.sc).sort((a, b) => b.sc - a.sc).slice(0, max || 3).map((x) => x.it);
  }
  let launchP = null;
  function findLaunches(query, max, url) {
    if (lnorm(query).length < 3 || typeof fetch !== 'function') return Promise.resolve([]);
    launchP = launchP || fetch(url || '../data/map/upcoming.json').then((x) => (x.ok ? x.json() : null)).then((d) => (d && Array.isArray(d.items) ? d.items : [])).catch(() => { launchP = null; return []; });
    return launchP.then((l) => matchLaunches(l, query, max));
  }
  // Registered launches and awarded sites (the same register the Map and the site search read). They have no recorded sales, so they are listed apart from the transaction results and lead to the Map, never to a price.
  function launchMeta(u) {
    const dev = ((u.facts || []).filter((f) => f[0] === 'Developer')[0] || [])[1];
    const kind = u.kind === 'launch' ? (u.stage === 'launched' ? 'New launch' : 'New launch, not yet completed') : u.unnamed ? 'Awarded ' + (u.agency || 'URA') + ' site, no project name yet' : 'Awarded ' + (u.agency || 'URA') + ' site';
    return [kind, u.district ? 'District ' + Number(u.district) : u.area || '', u.tenure || '', dev].filter(Boolean).join(' · ');
  }
  function launchRows(list, hasSales) {
    if (!list || !list.length) return '';
    const rows = list.map((u) => '<li role="option"><button type="button" data-launch="map/#p=' + encodeURIComponent(u.id) + '"><span><b>' + esc(u.name) + '</b><span class="m">' + esc(launchMeta(u)) + '</span><span class="m">No sales recorded yet</span><span class="m" style="color:var(--kpt-blue);font-weight:600">View on Map ›</span></span></button></li>').join('');
    return '<div data-lg-launches>' + (hasSales ? '<p class="lg-fine" style="margin:14px 0 4px;text-align:left">New launches and sites, with no sales recorded yet</p>' : '') +
      '<ul class="kpr-results" role="listbox" aria-label="New launches and sites">' + rows + '</ul>' +
      '<p class="lg-fine" data-lg-launch-note style="margin-top:8px">Research shows prices once sales are recorded. The Map shows where ' + (list.length === 1 ? 'it is' : 'they are') + ', what is nearby and the confirmed project facts.</p></div>';
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
    if (!m.length) return '<div class="kpr-results"><div class="kpr-empty">No transactions found under that name in the last 5 years. It may be a launch with no sales yet, or spelled differently.</div></div>';
    return '<div class="kpr-results"><div class="kpr-empty" data-lg-nc>' + (m.length === 1 ? '<b>' + ncName(m[0], R) + '</b> is ' + (m[0].kind === 'ec' ? 'an ' : 'a ') + ncKind[m[0].kind] + '.' : 'Matching names: ' + m.map((x) => '<b>' + ncName(x, R) + '</b> (' + (x.kind === 'ec' ? 'EC' : 'cluster houses') + ')').join(', ') + '.') +
      ' Research can’t show it: URA records no single-home sale with a price and size under ' + (m.length === 1 ? 'that name' : 'those names') + ' (for example, one sale of several homes together).</div></div>';
  }
  function notCoveredNote(q, R, list) {
    const m = notCoveredMatches(q, list); if (!m.length) return '';
    return '<p class="lg-fine" data-lg-nc>Also matching, but Research has no prices for ' + (m.length === 1 ? 'it' : 'them') + ': ' + m.map((x) => ncName(x, R) + ' (' + (x.kind === 'ec' ? 'EC' : 'cluster houses') + ')').join(', ') + '. URA records no single-home sale with a price and size under ' + (m.length === 1 ? 'that name' : 'those names') + '.</p>';
  }

  /* ---------- a development's page ---------- */
  // A size is "chosen" only when the visitor picked one (a chip, a typed size, or one carried from the Map). Without one, no size's price or reading is shown.
  const chosen = (M) => !!(M && M.focus && M.focus.userChosen);
  // One compact drop-down instead of a row of options: the sizes (with how many sold in the last 12 months) appear only when it is opened.
  function sizeSelect(M) {
    const f = M.focus || {}, ch = chosen(M), rec = (M.bands || []).filter((b) => b.recent || b.bin === f.bin);
    const list = (rec.length ? rec : M.bands || []).slice().sort((x, y) => x.bin - y.bin), w = words(M);
    const opt = (b) => '<option value="' + b.bin + '"' + (ch && b.bin === f.bin ? ' selected' : '') + '>' + esc(sqft(b.label)) + ' · ' + (b.recent ? b.recent.n : 0) + ' sold</option>';
    const missing = ch && f.bin == null && f.requestedBin != null ? '<option value="' + f.requestedBin + '" selected>' + esc(sqft(f.requestedLabel)) + ' · none recorded</option>' : '';
    return '<select id="sizeSel" class="lg-select" data-lg-sel aria-labelledby="lgPickH" data-chosen="' + ch + '">' + (ch ? '' : '<option value="" selected>Choose a size</option>') + missing + '<optgroup label="' + esc('Sold in the last 12 months (' + w[1] + ')') + '">' + list.map(opt).join('') + '</optgroup></select>';
  }
  function sizeLine(M) {
    const f = M.focus || {}, A = M.answer || {};
    if (f.requested && f.bin == null) return 'No sales recorded around ' + esc(sqft(f.requestedLabel)) + '.' + (A.nearest && A.nearest.length ? ' Closest sizes with sales: ' + A.nearest.map((x) => esc(sqft(x.label)) + ' (' + x.n + ')').join(', ') + '.' : '');
    if (f.userChosen) return 'Showing ' + esc(sqft(f.label)) + ', the size you chose.';
    return 'Prices differ a lot between sizes. Choose yours to see its price and market reading.';
  }
  function sizeForm(S, M) {
    return '<div class="lg-sizeform" id="lgSize" hidden><label class="lg-vh" for="sizeIn">Size in square feet</label><input id="sizeIn" inputmode="numeric" autocomplete="off" placeholder="e.g. 1,000" value="' + esc(S && S.size) + '" aria-describedby="sizeNote">' +
      '<button class="lg-btn" type="button" id="sizeGo" style="min-height:44px;padding:9px 18px">Show this size</button>' +
      '<p class="lg-fine" id="sizeNote">Square feet only. The number you type stays on this device.</p><p class="err" id="sizeErr" role="alert"></p></div>';
  }
  // What a visitor sees first: the question, the sizes (with how many sold at each, so it is also the neutral picture of the mix), and the way to type an exact size.
  // Bedroom-first where reliable (V1, 25 Oct 2026): where data/projects/bedroom has types for this development and sale type (BV, from GW_BED.view),
  // the question is the home type, with the sizes one line below for anyone who prefers them. Nothing is pre-selected; a type kept from another
  // development that this one cannot show is said plainly, never swapped for another.
  function sizePicker(M, S, BV) {
    if (!(M.bands || []).length) return '';
    const ch = chosen(M), B = GLOBAL.GW_BED, bed = !!(B && BV && ((BV.types && BV.types.length) || (BV.only && BV.only.length)));   // V2: matched-only types are offered too
    // A size the visitor chose keeps the size question as it was (the price and the Market Pulse stay on a phone's first screen), with one link back to the types.
    if (bed && !ch) {
      const line = B.lineHtml(BV) + (BV.g ? ' <button type="button" class="kpr-link lg-clear" id="bedClear">Clear</button>' : '');
      // 25 Oct 2026: the floor area is secondary, behind one quiet "Search by floor area" (it opens the same size drop-down and exact-size box).
      return '<div class="lg-sizes lg-pick gwb-pick" id="lgPick" data-lg-pick="' + (BV.g ? 'bed' : 'none') + '"><h2 class="lg-pick-h" id="lgPickH">How many bedrooms?</h2>' +
        B.chipsHtml(BV) +
        '<p class="lbl lg-pick-s" data-gwb-line>' + line + '</p>' +
        '<button type="button" class="kpr-link gwb-area-t" data-gwb-area aria-expanded="false" aria-controls="gwbArea">Search by floor area</button>' +
        '<div class="gwb-area" id="gwbArea" hidden><div class="lg-pick-row"><span class="lg-selwrap">' + sizeSelect(M) + '</span>' +
        '<button type="button" class="kpr-link lg-typeit" data-lg-size aria-expanded="false" aria-controls="lgSize">Type an exact size</button></div>' +
        (BV.few && BV.few.length ? '<p class="lg-fine gwb-few" data-gwb-few>' + BV.few.map((g) => esc(B.label(g))).join(' and ') + ' homes have too few recent resales to show by type: choose their floor area here.</p>' : '') +
        sizeForm(S, M) + '</div></div>';
    }
    const gone = B && BV && BV.missing && !ch ? '<p class="lg-fine gwb-few" data-gwb-none>Bedroom types aren’t shown for ' + esc(words(M)[1]) + ' here: too few of them could be matched to a bedroom count. Choose a size instead.</p>' : '';
    return '<div class="lg-sizes lg-pick" id="lgPick" data-lg-pick="' + (ch ? 'chosen' : 'none') + '"><h2 class="lg-pick-h" id="lgPickH">What size home are you looking at?</h2>' + gone +
      '<div class="lg-pick-row"><span class="lg-selwrap">' + sizeSelect(M) + '</span>' +
      '<button type="button" class="kpr-link lg-typeit" data-lg-size aria-expanded="false" aria-controls="lgSize">Type an exact size</button></div>' +
      '<p class="lbl lg-pick-s">' + sizeLine(M) + (ch ? ' <button type="button" class="kpr-link lg-clear" id="sizeClear">Clear size</button>' : '') + (ch && bed ? ' <button type="button" class="kpr-link lg-clear" id="bedSwitch" data-gwb-switch>Choose by bedrooms</button>' : '') + '</p>' +
      sizeForm(S, M) + '</div>';
  }
  // No size chosen: the development's recent activity, in counts only, with no price or direction. Nothing here is one size standing in for the whole development.
  function overviewHtml(M, mf, bed, rows) {   // rows (CX V2): the "What each home type / size sells for" section is on the page
    const w = words(M), R = M.recent || {}, rec = (M.bands || []).filter((b) => b.recent && b.recent.n), nb = rec.length;
    let head, sub;
    if (R.n > 0) {
      const lo = Math.min.apply(null, rec.map((b) => b.bin)), hi = Math.max.apply(null, rec.map((b) => b.bin)) + 99;
      head = plural(R.n, w[0], w[1]) + ' in the last 12 months';
      sub = (nb > 1 ? 'Across ' + nb + ' sizes, from ' + num(lo) + ' to ' + num(hi) + ' sq ft. ' : nb === 1 ? 'All of them ' + esc(sqft(rec[0].label)) + '. ' : '') + 'Latest sale ' + (R.latestLabel || '') + '.';
    } else if (R.latest) {
      head = 'No ' + w[1] + ' in the last 12 months';
      sub = 'The latest was ' + R.latestLabel + ', and there ' + (R.since ? 'are ' + ((M.evidenceBase && M.evidenceBase.total) || 0) + ' on record since ' + R.since + '.' : 'are older ones on record.');
    } else { head = 'No sales recorded'; sub = 'URA records no sale of this type here in the period we hold.'; }
    return '<section class="lg-ov" data-lg-ov aria-label="Recent sales at a glance"><p class="lg-ov-k">At a glance · ' + esc(M.sale && M.sale.label ? M.sale.label.charAt(0).toUpperCase() + M.sale.label.slice(1) + 's' : 'Sales') + '</p>' +
      '<h2 class="lg-ov-h" data-lg-ov-head>' + esc(head) + '</h2><p class="lg-ov-s">' + sub + '</p>' +
      (rows ? '<p class="lg-ov-n" data-lg-ov-rows>No single price fits the whole development. <button type="button" class="kpr-link" data-lg-scroll="lgTypes">See what each ' + (bed ? 'home type' : 'size') + ' sells for ›</button></p>' : '<p class="lg-ov-n">' + (bed ? 'Prices are different for every home type and size, so there is no single price for the whole development. Choose a type or a size to see what it sold for and how prices have moved.' : 'Price per sq ft is different for every size, so there is no single price for the whole development. Choose a size to see its price, how it has moved and what is behind it.') + '</p>') +
      freshLine(mf, undefined, 'lg-fine') +
      '</section>';
  }
  // A size was chosen but URA records no sale around it: say so, offer the closest sizes, and the same three next steps as a thin-evidence size.
  function noSizeHtml(M, forWho) {
    const f = M.focus || {}, A = M.answer || {}, w = words(M), near = (A.nearest || []).slice(0, 3);
    return '<section class="mp" data-mp data-mp-state="nosize" data-mp-sized="1" aria-label="Market pulse"><p class="mp-k">Market pulse<span> · ' + esc(sqft(f.requestedLabel)) + '</span></p>' +
      '<h2 class="mp-h" data-mp-head>No ' + esc(w[1]) + ' of ' + esc(sqft(f.requestedLabel)) + ' recorded here</h2>' +
      '<p class="mp-s" data-mp-sub>URA records no ' + esc(w[0]) + ' of this size at ' + esc(M.name) + ' in the period we hold, so there is no price or trend to show for it.' + (near.length ? ' The closest sizes with sales:' : '') + '</p>' +
      (near.length ? '<p class="mp-near lg-chips">' + near.map((x) => '<button type="button" class="kpr-link" data-bin="' + x.bin + '" aria-pressed="false">' + esc(x.label.replace(/\s*sqft$/, '')) + '<small class="lg-n">' + x.n + '</small></button>').join('') + '</p>' : '') +
      '<p class="mp-fine" data-mp-fine>Past sales only. Other developments are context, not a price trend for this one.</p>' +
      (GLOBAL.GW_PULSE ? GLOBAL.GW_PULSE.sizedActs({ mapHref: 'map/#p=' + encodeURIComponent(M.id), forWho: forWho }) : '') + '</section>';
  }
  function sizesTable(M) {
    if (!M.bands || !M.bands.length) return '<p>No sales with a recorded size for this sale type.</p>';
    const w = words(M);
    return '<div class="lg-scroll"><table class="lg-table"><thead><tr><th scope="col">Size</th><th scope="col">Last 12 months</th><th scope="col">Median PSF, last 12 months</th><th scope="col">All ' + esc(w[1]) + ' on record</th><th scope="col">Middle half, all ' + esc(w[1]) + '</th></tr></thead><tbody>' +
      M.bands.slice().sort((x, y) => x.bin - y.bin).map((b) => '<tr><th scope="row">' + esc(sqft(b.label)) + '</th><td>' + (b.recent ? b.recent.n : 0) + '</td><td>' + (b.recent ? money(b.recent.psf.med) : '—') + '</td><td>' + b.n + '</td><td>' + money(b.psf.q1) + '–' + money(b.psf.q3) + '</td></tr>').join('') +
      '</tbody></table></div><p class="lg-fine">' + esc(M.notes && M.notes.psf) + ' Choose a size at the top of the page to see its price.</p>';
  }
  function saleTypes(M) {
    if (!M.sale || M.sale.options.length < 2) return '';
    return '<details class="lg-fold"><summary>New sales and sub-sales<small>' + esc('Showing ' + M.sale.label + 's') + '</small></summary><div class="in"><p>Each sale type is shown on its own, so the typical price is never a mix of them.</p>' +
      '<div class="lg-chips" style="justify-content:flex-start">' + M.sale.options.map((o) => '<button type="button" data-sale="' + esc(o.id) + '" aria-pressed="' + (o.id === M.sale.selected) + '">' + esc(o.label.charAt(0).toUpperCase() + o.label.slice(1) + 's') + ' · ' + o.recent + ' in the last 12 months</button>').join('') + '</div></div></details>';
  }
  function methodHtml(M, IN) {
    const found = IN && IN.found && IN.found.length ? '<h3 style="font-size:16px">What KPT found</h3><ul class="lg-list">' + IN.found.map((f) => '<li data-ins="' + esc(f.id) + '">' + esc(f.text) + '</li>').join('') + '</ul>' : '';
    const checks = IN && IN.checklist ? '<h3 style="font-size:16px">What KPT checked</h3>' + IN.checklist.map((c) => '<div data-area="' + esc(c.id) + '"><b>' + esc(c.label) + '</b>' + c.lines.map((l) => '<p class="kpr-chk-' + esc(l.status) + '">' + esc(l.text) + (l.note ? ' <span class="lg-fine">' + esc(l.note) + '</span>' : '') + '</p>').join('') + '</div>').join('') : '';
    const A0 = M.answer, f0 = A0 && A0.facts, s0 = STRONG(), w0 = words(M);
    const rule = (A0 && (A0.state === 'recent' || A0.state === 'recent-thin') && f0 && !strong(M)) ? '<p data-lg-rule>Why “interpret with care”: a typical price needs at least ' + s0.sales + ' ' + esc(w0[1]) + ' of the same size across at least ' + s0.months + ' months. This size has ' + plural(f0.recentN, w0[0], w0[1]) + ' in ' + plural(f0.recentMonths, 'month') + ' of the last 12, so the median is a first look, not a settled price.</p>' : '';
    const read = (M.read || []).map((r) => '<p>' + esc(r.text) + '</p>').join('');
    const all = M.history && M.history.all && M.history.all.points.length ? '<p>' + esc(M.history.all.text) + ' Overall PSF mixes every size sold, and that mix changes over time.' + (M.history.mixShift ? ' ' + esc(M.history.mixShift.text) : '') + '</p>' : '';
    const floors = M.floors && M.floors.rows && M.floors.rows.length ? '<h3 style="font-size:16px">By floor band, ' + esc(sqft(M.floors.band)) + ', ' + esc(M.floors.window) + '</h3><ul class="lg-list">' + M.floors.rows.map((r) => '<li>Floors ' + esc(r.band) + ': median ' + money(r.psf.med) + ' · ' + esc(r.evidence.line) + '</li>').join('') + '</ul><p class="lg-fine">' + esc(M.floors.note) + '</p>' : '';
    const ctx = M.context ? '<h3 style="font-size:16px">Market context, not direct comparables</h3><p>' + esc(M.context.note) + '</p>' + M.context.rows.map((r) => '<p><b>' + esc(String(r.label).replace(/^District D(\d+)/, 'District $1')) + ':</b> ' + r.windows.map((w) => esc(w.label) + ', ' + plural(w.n, 'sale') + ' from ' + plural(w.projects, 'project') + ', median ' + money(w.psf.med)).join(' · ') + '</p>').join('') : '';
    return '<details class="lg-fold" id="evidence"><summary>How we worked this out<small>Sales checked, size, recency, floors</small></summary><div class="in">' + (clsOf(M) !== 'condo' ? '<p data-lg-classnote>' + esc(CLS[clsOf(M)].like) + '</p>' : '') + rule + found + read + all + checks + floors + ctx +
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
  // 25 Oct 2026: with the development's transactions (TX, GW_REC.pick), each band also carries the psf of exactly the sales it counts (ps), for
  // the chart's dots; a band whose sales don't match its own count and range gets none.
  function askData(M, TX) {
    const w = words(M), REC = GLOBAL.GW_REC, code = REC && M.sale ? REC.CODE[M.sale.selected] : null;
    return { id: M.id, name: M.name, words: [w[0], w[1]], saleCode: code || undefined, bands: (M.bands || []).slice().sort((x, y) => x.bin - y.bin).map((b) => {
      if (!b.recent) return { bin: b.bin, label: sqft(b.label), n: 0 };
      const o = { bin: b.bin, label: sqft(b.label), n: b.recent.n, months: b.recent.evidence.months, latest: b.recent.evidence.latestLabel, lo: b.recent.psf.min, q1: b.recent.psf.q1, med: b.recent.psf.med, q3: b.recent.psf.q3, hi: b.recent.psf.max };
      const ps = TX && REC && code ? REC.bandPsf(TX, code, b.bin, o) : null; if (ps) o.ps = ps;
      return o;
    }) };
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
  function actions(M, bedOn, TX) {
    const K = ASKM(), canAsk = !!K && (M.bands || []).some((b) => b.recent && b.recent.n), T = (chosen(M) && strong(M)) || !!bedOn;
    const act = (attrs, icon, t) => '<button type="button" class="lg-act" ' + attrs + '>' + icon + '<span>' + t + '</span></button>';
    const I = (d) => '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
    return '<div class="lg-acts" role="group" aria-label="What you can do here">' +
      (chosen(M) ? act('data-lg-scroll="numbers"', I('<path d="M5 20V12m5 8V7m5 13v-6m5 6V4"/>'), 'Recent sales') : '') +
      (canAsk ? act('data-lg-ask aria-expanded="false" aria-controls="lgAsk"', I('<path d="M4 7h16v10H4z"/><path d="M8 12h8"/><path d="M12 9v6"/>'), 'Check an asking price') : '') +
      '<a class="lg-act" id="cmp" href="#/compare/' + esc(M.id) + '">' + I('<path d="M8 4v16M16 4v16M4 8h4M16 16h4"/>') + '<span>Compare</span></a></div>' +
      (canAsk ? K.panelHtml('condo', askData(M, TX), { id: 'lgAsk', hidden: true }) : '') +
      // Progressive payments only where the sales on show are new sales (a home still under construction); resales are paid on completion.
      // The line is filled after the page is drawn, once find.json has given the median price (afterProject); until then it is hidden.
      // V2-01: on a first-look page (no typical price) the line is still there, hidden, so an asking price typed above can be sent on.
      (T || canAsk ? '<p class="lg-run" data-lg-run-line data-typical="" hidden><span data-lg-run-what></span> ' +
        '<a href="../tools/payment-planner/" data-lg-run="payment-planner"><b>What will this home cost me?</b></a> · <a href="../tools/tdsr/" data-lg-run="tdsr">How much can I borrow?</a> · <a href="../tools/stamp-duty/" data-lg-run="stamp-duty">Stamp duty</a> · <a href="../tools/mortgage/" data-lg-run="mortgage">Mortgage (75% loan)</a>' + (M.sale && M.sale.selected === 'new' ? ' · <a href="../tools/progressive-payments/" data-lg-run="progressive">New launch payments</a>' : '') + '</p>' : '');
  }
  // 25 Oct 2026: under the answer, the evidence a visitor asked for, in order: what each home type (or, without reliable types, each size) sells
  // for; every transaction, filterable; and what homes here rent for (gw-records.js, gw-rent.js). Each part is left out when its data is missing.
  function evidenceHtml(M, ctx, BV, bedAny) {
    const REC = GLOBAL.GW_REC, RENT = GLOBAL.GW_RENT, TX = ctx && ctx.TX, f = M.focus || {}, sale = M.sale && M.sale.selected;
    let h = '';
    if (REC) {
      if (bedAny && BV.sale === 'resale') h += REC.typesHtml(BV, { label: GLOBAL.GW_BED.label, alsoText: GLOBAL.GW_BED.alsoText });
      else if (TX) h += REC.sizesHtml(TX, sale, { bin: chosen(M) ? f.bin : null });
      if (TX) h += REC.txHtml(TX, (ctx.txSt && ctx.txSt.f) || REC.startFilter({ sale }), { shown: ctx.txSt && ctx.txSt.shown });
    }
    if (RENT && ctx && ctx.RENT) h += RENT.sectionHtml(ctx.RENT, { bed: BV && BV.t ? BV.g : '', bin: chosen(M) ? f.bin : null, ask: ASKM() });
    return h;
  }
  // CX V2 (26 Oct 2026): one row of shortcuts under the answer, kept in view while scrolling. It names the development and the home type or size on
  // show (tapping it goes back to the chooser) and jumps to the parts of the report that exist here. Buttons, never "#section" links (the page routes
  // on the hash), so Back and Forward are untouched. Not tabs: every section stays on the page.
  function jumpHtml(M, ctxLabel, bedAny, items) {
    const list = items.filter((x) => x[2]); if (list.length < 2) return '';
    return '<nav class="lg-jump" aria-label="Parts of this report" data-lg-jump-bar><div class="lg-wrap lg-jump-in">' +
      '<button type="button" class="lg-jctx" data-lg-scroll="lgPick" aria-label="' + esc(M.name) + ', ' + esc(ctxLabel || (bedAny ? 'all home types' : 'all sizes')) + '. Change"><span class="lg-jn">' + esc(M.name) + '</span>' +
      '<b data-lg-jctx>' + esc(ctxLabel || (bedAny ? 'All home types' : 'All sizes')) + '</b><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>' +
      '<div class="lg-jlinks">' + list.map((x) => '<button type="button" class="lg-jl" ' + (x[0] === 'ask' ? 'data-lg-jump="ask"' : 'data-lg-scroll="' + x[0] + '"') + '>' + esc(x[1]) + '</button>').join('') + '</div></div></nav>';
  }
  // Rental Research V1: beside the chosen type's (or size's) resale price, its typical monthly rent, each with its own count and period.
  function rentLine(ctx, g, bin) { const RT = GLOBAL.GW_RENT, R0 = ctx && ctx.RENT; if (!RT || !R0) return ''; return g ? RT.typeLine(R0, g) : bin != null ? RT.sizeLine(R0, bin) : ''; }
  // ctx: { S, IN, root, TX (transactions), txSt (their filters), RENT (rents) }
  function projectHtml(M, ctx) {
    const S = (ctx && ctx.S) || {}, IN = ctx && ctx.IN, root = (ctx && ctx.root) || '../', f = M.focus || {}, A = M.answer || {}, mf = S.rawM || null;
    const BV = ctx && ctx.BED && GLOBAL.GW_BED ? ctx.BED : null, bedOn = !!(BV && BV.t) && !chosen(M), bedAny = !!(BV && BV.types && BV.types.length);
    // V2: a matched-only type chosen: its counts panel replaces the answer, and nothing priced (price movement, numbers, budget, rent) is drawn for it.
    const bedM = !!(BV && BV.m) && !chosen(M), bedAsk = bedAny || !!(BV && BV.only && BV.only.length);
    if (S.rawP && S.rawP.id === M.id && Array.isArray(S.rawP.districts)) M.districtsAll = S.rawP.districts;
    const kick = [clsOf(M) === 'condo' ? '' : CLS[clsOf(M)].label, M.street ? titleCase(M.street) : '', district(M)].filter(Boolean).join(' · ');
    const chartPts = M.history && M.history.band && M.history.band.points ? M.history.band.points : [];
    const chart = chosen(M) ? lineChart(chartPts, '#5a55d6', 'Median ' + (words(M)[0]) + ' PSF of ' + (f.label || '') + ' homes at ' + M.name + ' in each 12-month period, oldest to newest') : '';
    const ken = M.ken ? '<div class="lg-tile" style="grid-column:1/-1"><b>Ken’s Take</b><p>“' + esc(M.ken.note) + '”</p><p class="lg-fine">Ken’s judgement, not URA data.</p></div>' : '';
    // The next step follows the question the visitor came with (tab only, set by the Sell journey; nothing typed): an owner sees the "what could my unit sell for" card first, a buyer the asking-price card.
    // Without it the order is unchanged: budget, then the asking price, then the owner's. Messages are wired by the page (research/index.html) from the report's own finding.
    const forWho = ctx && (ctx.forWho === 'sell' || ctx.forWho === 'buy') ? ctx.forWho : '';
    const ICO = (d) => '<span class="lg-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg></span>';
    const stripBudget = '<div class="lg-kenstrip" data-lg-budget><div class="who">' + ICO('<path d="M4 19V9M10 19V5M16 19v-7M21 19H3"/>') + '<div><b>Thinking of buying here?</b><span>Work out your budget from your income, cash and CPF, then what a home here costs you.</span></div></div>' +
      '<a class="lg-btn" href="' + esc(root) + 'tools/tdsr/#cash" data-kpt-nav="research-to-planner">Check my budget</a></div>';
    // V2.1: ONE quiet card to ask Ken (no portrait): the visitor's question leads (asking price for a buyer, the unit's value for an owner), the other
    // message is a plain link beside it. The WhatsApp messages (ids wa, waOwn) are wired by the page from the report's own finding, as before.
    const own = forWho === 'sell', lnk = (id, t, main) => '<a class="' + (main ? 'lg-btn' : 'lg-klink') + '" id="' + id + '" href="#" target="_blank" rel="noopener">' + t + '</a>';
    const stripKen = '<div class="lg-kenstrip" data-lg-ask-ken><div class="who">' + ICO('<path d="M20 12a8 8 0 0 1-11.8 7L4 20l1-4.2A8 8 0 1 1 20 12z"/><path d="M9 11h6M9 14h4"/>') + '<div><b>Want a second opinion?</b><span>Ken can look at a particular unit, its floor and facing, and the homes competing with it.</span></div></div>' +
      '<div class="lg-kacts">' + (own ? lnk('waOwn', 'Ask Ken about my unit', true) + lnk('wa', 'or about an asking price') : lnk('wa', 'Ask Ken about an asking price', true) + lnk('waOwn', 'or about my unit')) + '</div></div>';
    const strips = forWho ? [stripKen, stripBudget] : [stripBudget, stripKen];
    const ev = evidenceHtml(M, ctx, BV, bedAny), ovOn = !bedOn && !bedM && !chosen(M);
    // Market Pulse (gw-pulse.js, or the bedroom view's own) gets an id so the shortcut row can reach it; its markup and wording are unchanged.
    let pulse = bedOn ? GLOBAL.GW_BED.trendHtml(BV, { forWho, mapHref: 'map/#p=' + encodeURIComponent(M.id) }) : chosen(M) ? (f.bin == null ? noSizeHtml(M, forWho) : ctx && ctx.PU && GLOBAL.GW_PULSE ? GLOBAL.GW_PULSE.html(ctx.PU, { forWho, mapHref: 'map/#p=' + encodeURIComponent(M.id) }) : '') : '';
    if (/^<section class="mp\b/.test(pulse) && pulse.indexOf('id="lgPulse"') < 0) pulse = pulse.replace(/^<section /, '<section id="lgPulse" ');
    const ctxLabel = (bedOn || bedM) && BV.g ? GLOBAL.GW_BED.label(BV.g) : chosen(M) && f.label ? sqft(f.label) : '';
    const canAsk = !!ASKM() && (M.bands || []).some((b) => b.recent && b.recent.n);
    const jump = jumpHtml(M, ctxLabel, bedAsk, [['lgTypes', 'Prices', ev.indexOf('id="lgTypes"') > -1], ['lgTx', 'Sales history', ev.indexOf('id="lgTx"') > -1], ['lgRent', 'Rents', ev.indexOf('id="lgRent"') > -1],
      ['lgPulse', 'Market Pulse', pulse.indexOf('id="lgPulse"') > -1], ['ask', 'Price check', canAsk], ['lgCompare', 'Compare', true]]);
    return '<div class="lg-page" data-lg="project" data-state="' + esc(A.state || '') + '">' +
      '<header class="lg-hero lg-hero--ans"><div class="lg-wrap">' +
        '<button class="kpr-back lg-back" type="button" data-act="home">← Search another development</button>' +
        '<div class="lg-id"><p class="lg-kicker lg-idline"><span class="lg-cls" data-lg-cls="' + clsOf(M) + '">' + esc(CLS[clsOf(M)].label) + '</span>' + [M.street ? esc(titleCase(M.street)) : '', esc(district(M))].filter(Boolean).join(' · ') + '</p>' +
        '<h1 class="lg-name" tabindex="-1">' + esc(M.name) + '</h1></div>' +
        sizePicker(M, S, BV) +
        (bedOn ? GLOBAL.GW_BED.answerHtml(BV, { budget: ctx.budget, fresh: freshLine(mf, undefined, 'lg-fine'), rent: rentLine(ctx, BV.g, null) }) : bedM ? GLOBAL.GW_BED.matchedHtml(BV, { tx: !!(ctx && ctx.TX && ctx.TX.rows && ctx.TX.rows.length), rows: GLOBAL.GW_REC && ctx && ctx.TX ? GLOBAL.GW_REC.matchedRowsHtml(GLOBAL.GW_REC.matchedRows(ctx.TX, BV.g, GLOBAL.GW_BED.MATCHED_ROWS)) : '' }) : chosen(M) ? answerBlock(M, mf, rentLine(ctx, null, f.bin)) : overviewHtml(M, mf, bedAny, ev.indexOf('id="lgTypes"') > -1)) +
        pulse +
        actions(M, bedOn, ctx && ctx.TX) +
        '<p class="lg-fine lg-facts" data-lg-lead>' + projectFacts(M, ovOn) + '</p>' +
        (clsOf(M) !== 'condo' ? '<p class="lg-fine lg-facts" data-lg-class="' + clsOf(M) + '">' + esc(CLS[clsOf(M)].short) + '</p>' : '') + (alsoLine(M) ? '<p class="lg-fine lg-facts" data-lg-also>' + esc(alsoLine(M)) + '</p>' : '') +
      '</div></header>' + jump + ev +
      '<section class="lg-band grey" id="lgCompare"><div class="lg-wrap" style="gap:22px"><div class="lg-head"><p class="lg-kicker">Compare</p><h2>Often compared with ' + esc(M.name) + '</h2><p class="lg-sub" data-lg-sugg-sub>Developments that share enough recent sales in the same sizes for a fair comparison.</p></div>' +
        '<div class="lg-sugg" data-lg-sugg></div><p class="lg-fine lg-center">Or <a href="#/compare/' + esc(M.id) + '" data-lg-pick>search for any other development</a>.</p></div></section>' +
      '<section class="lg-band" id="numbers"><div class="lg-wrap" style="gap:26px"><div class="lg-head"><p class="lg-kicker">The numbers</p><h2>How the price has moved.</h2>' +
        '<p class="lg-sub">' + (!chosen(M) ? 'Price per sq ft is different for every size, so how it has moved is shown for one size at a time. Past sales, not a forecast.' : chart ? 'Median ' + esc(words(M)[0]) + ' PSF of ' + esc(sqft(f.label)) + ' homes in each 12-month period, however many sold. Past sales, not a forecast.' : esc((M.history && M.history.note) || 'Historical transactions only.')) + '</p></div>' +
        '<div class="lg-g2 lg-numgrid">' +
          (bedOn ? GLOBAL.GW_BED.numbersHtml(BV) : !chosen(M) ? '<div class="lg-tile lg-pickprompt" data-lg-pickprompt><b>Choose a size to see how its price has moved</b><p>Homes of different sizes can sell at very different prices per sq ft, so there is no one chart for the whole development.</p><button type="button" class="lg-btn" data-lg-scroll="lgPick">Choose a size</button></div>' : chart ? '<div class="lg-tile" style="padding:26px 28px">' + chart + '<span class="lg-fine">Hollow dot: fewer than 3 sales. ' + esc(M.history.band.text || '') + '</span></div>' : '<div class="lg-tile">' + (M.read || []).map((r) => '<p>' + esc(r.text) + '</p>').join('') + '</div>') +
          '<div style="display:grid;gap:14px"><div class="lg-tile"><span class="lg-fine">What we know for sure</span><div data-lg-facts><span style="font-size:15.5px;line-height:1.5">' + factsFallback(M) + '</span></div></div>' +
          '<div class="lg-tile"><span class="lg-fine">Before you decide, check</span><span style="font-size:15.5px;line-height:1.5">' + (M.notMeasured || []).slice(0, 4).map(esc).join(' · ') + '</span></div>' + ken + '</div>' +
        '</div>' +
        '<div class="lg-folds"><details class="lg-fold"><summary>Every size, in a table<small>' + plural((M.bands || []).length, 'size') + '</small></summary><div class="in">' + sizesTable(M) + '</div></details>' + saleTypes(M) + methodHtml(M, IN) +
        '<details class="lg-fold" id="lgSources"><summary>Sources</summary><div class="in" data-lg-sources><p>Prices and sales: ' + esc(dataSpan(mf)) + (M.recent && M.recent.latestLabel ? ' Latest ' + esc(words(M)[0]) + ' here: ' + esc(M.recent.latestLabel) + '.' : '') + esc(newNote(M)) + ' Small numbers next to a fact link to its source.</p>' + (bedAsk ? '<p data-gwb-source>' + esc(GLOBAL.GW_BED.sourceText(BV)) + '</p>' : '') + '</div></details></div>' +
      '</div></section>' +
      '<section class="lg-band tight" style="padding-top:0"><div class="lg-wrap"><div class="lg-kenstrips" id="next" data-lg-for="' + esc(forWho) + '">' + strips.join('') + '</div><p class="lg-fine">The message names this development and what this report found, nothing you typed. You can edit it in WhatsApp before you send it.</p></div></section>' +
      '<section class="lg-band gwl-band" id="lgLoc" data-lg-loc="' + esc(M.id) + '" aria-labelledby="lgLocH"><div class="lg-wrap" style="gap:18px"><div class="lg-head"><p class="lg-kicker">Location</p><h2 id="lgLocH">Location &amp; amenities</h2>' +
        '<p class="lg-sub">MRT stations, schools, food and parks around ' + esc(M.name) + '.</p></div><div class="gwl" data-gwl></div>' +
        '<p class="lg-fine lg-center"><a href="map/#p=' + encodeURIComponent(M.id) + '" data-gwl-full>Explore the full Map ›</a></p></div></section>' +
    '</div>';
  }

  /* ---------- after the page is drawn ---------- */
  const STATE_WORD = { s: 'Enough to compare fairly', l: 'A first look' };
  const KPT = () => root.KPT || { track: function () {} };
  // hooks: { root, onCompare(otherId), track }
  function afterProject(M, app, hooks) {
    const h = hooks || {}, base = h.root || '../';
    try { const nv = document.querySelector('.gw-nav'); if (nv) document.documentElement.style.setProperty('--gw-navh', nv.offsetHeight + 'px'); } catch (e) { /* the CSS default stands */ }
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
      const T = h.bedTypical ? h.bedTypical : chosen(M) ? typicalPrice(M, F && F[M.id], h.manifest) : null, what = run.querySelector('[data-lg-run-what]');
      if (!T || !what || !run.isConnected) { if (run.isConnected && !app.querySelector('#lgAsk')) run.remove(); return; } // V2-01: kept for an asking price
      run.dataset.typical = String(T.price); what.textContent = T.text || runWhat(T, M); run.hidden = false;
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
      // "Can I afford this?": the Planner names where the price came from (the typical recent price in past sales, or the asking price typed here) until the buyer changes it
      // V3.4: the price goes into What will this home cost me?, which names where it came from (the typical recent price, or the asking price typed here) until the buyer changes it
      if (a.dataset.lgRun === 'payment-planner' || a.dataset.lgRun === 'tdsr') s.buyFrom = askedPrice() ? 'asking' : 'typical'; else delete s.buyFrom;
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
    const jp = e.target.closest ? e.target.closest('[data-lg-jump="ask"]') : null;
    if (jp) { const p = document.getElementById('lgAsk'), b = document.querySelector('[data-lg-ask]'); if (p) { p.hidden = false; if (b) b.setAttribute('aria-expanded', 'true'); p.scrollIntoView({ behavior: 'smooth', block: 'start' }); const i = p.querySelector('input'); if (i) setTimeout(() => i.focus({ preventScroll: true }), 400); } return; }
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

  return { launchRows, launchMeta, matchLaunches, findLaunches, lnorm, strong, STRONG, freshness, freshLine, dataSpan, mixedLine, emptySearch, notCoveredNote, notCoveredMatches, runWhat, district, askData, typicalPrice, landingHtml, resultRow, projectHtml, afterProject, fillFacts, lineChart, projectLead, projectPill, activitySentence, priceSentence, tenurePhrase, titleCase, sqft, esc, money, num, plural };
});
