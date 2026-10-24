/* ==========================================================================
   GROUNDWORK — Market pulse (V1). One short, rule-built reading of a development's recent transactions.
   Pure functions over the project's EXISTING detail record (data/projects/detail) and manifest. No new data, no estimates,
   no live AI: every sentence is assembled from counts, medians and months the generated cells already hold.

   What it says, in order: whether recent prices (same size band) are higher, lower or broadly the same as the 12 months
   before; how many sales there were, against the year before; and the date of the latest sale. It never says what a particular
   home is worth, never forecasts, never calls a change appreciation, and never reads a price direction into developer (new-sale)
   prices or sub-sales, whose prices move with each release or each owner's purchase date.

   One module serves Research (full report), the Map (one-line snapshot, from data/map/pulse.json built by
   tools/market-data/build-pulse.js with THIS file) and the WhatsApp message, so the three always agree.
   UMD: window.GW_PULSE and Node.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GW_PULSE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = 'pulse-v1';
  /* The rules: edit here only. Evidence thresholds follow the Research page's own "recent vs previous 12 months" rule (kpt-intel.js S5). */
  const CFG = {
    strong: { n: 8, months: 4, maxMonthsSinceLatest: 6 },   // both 12-month periods, same size band
    limited: { n: 3, months: 2 },                           // enough for "a first look", not for a reading
    stablePct: 3,                                           // a median within this many per cent of the earlier one is "broadly the same"
    noiseZ: 1.645,                                          // and so is a bigger move that is still within the spread of the prices paid (1.645 standard errors of the two medians, from each period's middle half)
    thinVolume: 10,                                         // fewer sales than this in the project in 12 months: volume is called limited
  };
  const SALE = { new: 1, sub: 2, resale: 3 };
  const WORD = { resale: ['resale', 'resales'], sub: ['sub-sale', 'sub-sales'], new: ['new sale', 'new sales'] };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const usd = (n) => '$' + num(n);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mIdx = (s) => { const a = String(s).split('-').map(Number); return a[0] * 12 + a[1] - 1; };
  const idxToYm = (i) => Math.floor(i / 12) + '-' + String((i % 12) + 1).padStart(2, '0');
  const intToYm = (v) => Math.floor(v / 100) + '-' + String(v % 100).padStart(2, '0');
  const asYm = (v) => (typeof v === 'number' ? intToYm(v) : String(v));
  const monthLabel = (v) => { const a = asYm(v).split('-').map(Number); return MON[a[1] - 1] + ' ' + a[0]; };
  const bandLabel = (bin, w) => num(bin) + '–' + num(bin + (w || 100) - 1) + ' sq ft';
  const wordOf = (sale, n) => WORD[sale][n === 1 ? 0 : 1];
  const pct1 = (x) => (Math.round(Math.abs(x) * 10) / 10).toFixed(1).replace(/\.0$/, '');

  /* ---------- reading the detail record ---------- */
  function fieldIdx(m) { const f = (m && m.fields && m.fields.cell) || ['sale', 'bin', 'win', 'n', 'act', 'top', 'last', 'min', 'q1', 'med', 'q3', 'max'], o = {}; f.forEach((k, i) => { o[k] = i; }); return o; }
  const cellOf = (r, F) => ({ bin: r[F.bin], win: r[F.win], n: r[F.n], act: r[F.act], last: r[F.last], min: r[F.min], q1: r[F.q1], med: r[F.med], q3: r[F.q3], max: r[F.max] });
  // Counts per month for one sale type: [{month:'YYYY-MM', n}], oldest first.
  function monthly(p, m, sale) {
    const a = (p.monthly && p.monthly[sale]) || [], out = [], base = mIdx(m.monthStart);
    for (let i = 0; i + 1 < a.length; i += 2) out.push({ idx: base + a[i], n: a[i + 1] });
    return out;
  }
  const firstSale = (p) => ['resale', 'sub', 'new'].filter((s) => (p.sale && p.sale[s]) > 0)[0] || null;

  /* ---------- compute ---------- */
  // o.sale: 'resale' | 'sub' | 'new' (Research passes the sale type on show). o.bin: the size band on show (Research passes its focus band);
  // without them the sale type with sales and the size band with the most recent sales are used.
  function compute(p, m, o) {
    o = o || {};
    const sale = o.sale && p.sale && p.sale[o.sale] > 0 ? o.sale : firstSale(p);
    const out = { v: VERSION, id: p.id, sale, state: 'nosales', evidence: 'none', dir: null, pct: null, band: null, a: null, b: null, n12: 0, nPrev: 0, latest: null, latestLabel: null, asOf: m.latestMonth, asOfLabel: monthLabel(m.latestMonth), total: 0, first: null, periods: [], head: '', sub: '', figs: [], limited: false, sized: null };
    if (!sale) { out.head = 'No transactions recorded'; out.sub = 'URA has no transaction for this development in the period we hold.'; return out; }
    const F = fieldIdx(m), code = SALE[sale], lastIdx = mIdx(m.latestMonth);
    const mo = monthly(p, m, sale);
    out.total = (p.sale && p.sale[sale]) || 0;
    out.first = mo.length ? idxToYm(mo[0].idx) : null;
    out.latest = mo.length ? idxToYm(mo[mo.length - 1].idx) : null; out.latestLabel = out.latest ? monthLabel(out.latest) : null;
    mo.forEach((x) => { if (x.idx > lastIdx - 12) out.n12 += x.n; else if (x.idx > lastIdx - 24) out.nPrev += x.n; });
    const w = wordOf(sale, 2), w1 = wordOf(sale, 1);
    const stub = (m.periods ? m.periods.length : 1) - 1;
    const pc = (p.periodCells || []).filter((r) => r[F.sale] === code).map((r) => cellOf(r, F));
    // the size band
    let bin = o.bin != null && pc.some((c) => c.bin === o.bin) ? o.bin : null;
    if (bin == null) {
      const c0 = pc.filter((c) => c.win === 0).sort((x, y) => y.n - x.n || x.bin - y.bin)[0] || null;
      const all = {}; pc.forEach((c) => { all[c.bin] = (all[c.bin] || 0) + c.n; });
      const best = Object.keys(all).map(Number).sort((x, y) => all[y] - all[x] || x - y)[0];
      bin = c0 ? c0.bin : best != null ? best : null;
    }
    const at = (win) => pc.find((c) => c.bin === bin && c.win === win) || null;
    const A = bin != null ? at(0) : null, B = bin != null ? at(1) : null, bw = m.bin || 100;
    if (bin != null) out.band = { bin, label: bandLabel(bin, bw), short: num(bin) + 's' };
    out.periods = bin == null ? [] : pc.filter((c) => c.bin === bin && c.win < stub).sort((x, y) => x.win - y.win).map((c) => ({ win: c.win, label: monthLabel(m.periods[c.win].from) + ' – ' + monthLabel(m.periods[c.win].to), n: c.n, med: c.med, q1: c.q1, q3: c.q3 }));
    // The size on show, in its own words (24 Oct 2026): counts of THIS size, used when the visitor chose a size and the evidence is too thin for a reading.
    if (bin != null) { const bl = pc.filter((c) => c.bin === bin && c.last).map((c) => asYm(c.last)).sort().pop() || null; out.sized = { n12: A ? A.n : 0, nPrev: B ? B.n : 0, act12: A ? A.act : 0, actPrev: B ? B.act : 0, latest: bl, latestLabel: bl ? monthLabel(bl) : null }; }
    if (A) out.a = { n: A.n, act: A.act, med: A.med, q1: A.q1, q3: A.q3, last: asYm(A.last) };
    if (B) out.b = { n: B.n, act: B.act, med: B.med, q1: B.q1, q3: B.q3, last: asYm(B.last) };
    const since = (ym) => lastIdx - mIdx(ym);

    // 1. nothing in the last 12 months
    if (out.n12 === 0) {
      out.state = 'stale';
      out.head = 'No ' + w + ' in the last 12 months';
      out.sub = 'The latest was ' + out.latestLabel + '. There ' + (out.total === 1 ? 'is 1' : 'are ' + num(out.total)) + ' on record since ' + monthLabel(out.first) + ', so recent prices cannot be read here.';
      return finish(out, sale);
    }
    // 2. a price reading: resales only, same size band, both periods
    if (sale === 'resale' && A && B) {
      const strong = A.n >= CFG.strong.n && A.act >= CFG.strong.months && B.n >= CFG.strong.n && B.act >= CFG.strong.months && since(asYm(A.last)) <= CFG.strong.maxMonthsSinceLatest;
      const limited = !strong && A.n >= CFG.limited.n && B.n >= CFG.limited.n && A.act >= CFG.limited.months && B.act >= CFG.limited.months;
      if ((strong || limited) && B.med > 0) {
        const pct = Math.round((A.med - B.med) / B.med * 1000) / 10;   // one decimal first: the words, the figure and the Map then use the same number
        // Noise allowance (strong readings): with 8 to 20 sales a 3 to 4% move in the median can be down to which units happened to sell. The middle half of each
        // period gives the spread; a move smaller than 1.645 standard errors of the difference of the two medians is not called a direction.
        const sd = (c) => (c.q3 - c.q1) / 1.349, se = strong ? Math.sqrt(Math.pow(1.2533 * sd(A) / Math.sqrt(A.n), 2) + Math.pow(1.2533 * sd(B) / Math.sqrt(B.n), 2)) / B.med * 100 : 0;
        const withinNoise = strong && Math.abs(pct) >= CFG.stablePct && Math.abs(pct) < CFG.noiseZ * se;
        const dir = Math.abs(pct) < CFG.stablePct || withinNoise ? 'stable' : pct > 0 ? 'higher' : 'lower';
        out.state = 'trend'; out.evidence = strong ? 'strong' : 'limited'; out.dir = dir; out.pct = pct; out.limited = !strong; out.withinNoise = withinNoise;
        const rel = dir === 'higher' ? 'higher than' : dir === 'lower' ? 'lower than' : 'broadly the same as';
        if (strong) {
          out.head = 'Resale prices for this size are ' + rel + ' a year earlier';
          const move = pct === 0 ? 'level with' : pct1(pct) + '% ' + (pct > 0 ? 'above' : 'below');
          const why = dir !== 'stable' ? '' : withinNoise ? ', a difference within the spread of what those homes fetched' : pct === 0 ? '' : ', a small difference';
          out.sub = 'Median psf for ' + out.band.label + ' ' + w + ' is ' + move + ' the 12 months before' + why + ', based on ' + A.n + ' recent and ' + B.n + ' earlier sales.';
        } else {
          out.head = 'A first look: prices for this size appear ' + rel + ' a year earlier';   // the kicker already says Resales
          out.sub = 'Only ' + A.n + ' and ' + B.n + ' ' + w + ' in this size over the two periods, so this is not a reliable measure of price growth.';
        }
        return finish(out, sale);
      }
    }
    // 3. counts only
    out.state = 'activity';
    out.head = num(out.n12) + ' ' + wordOf(sale, out.n12) + ' in the last 12 months';
    if (sale === 'resale' && out.nPrev === 0 && out.first && mIdx(out.first) > lastIdx - 12) {
      out.sub = 'The first resale on record was in ' + monthLabel(out.first) + ', so there is no earlier 12 months to compare.';
    } else if (sale === 'resale') {
      out.sub = bin == null ? 'No size has enough ' + w + ' to compare with the year before.'
        : 'Too few ' + out.band.label + ' ' + w + ' in one or both of the last two 12-month periods to compare prices.';
    } else if (sale === 'new') out.sub = 'Developer prices step up with each release, floor and stack, so a price direction is not shown for new sales.';
    else out.sub = 'Sub-sale prices follow each owner’s original purchase, so a price direction is not shown.';
    return finish(out, sale);
  }

  function finish(out, sale) {
    const w = wordOf(sale, 2);
    const volSub = out.state === 'stale' ? 'None in the last 12 months' : out.nPrev ? num(out.nPrev) + ' the year before' : 'None the year before';
    const f = [];
    if (out.state === 'trend') {
      const sign = out.pct > 0 ? '+' : out.pct < 0 ? '−' : '';
      f.push({ id: 'change', label: 'Median psf vs a year earlier', value: out.limited ? '≈ ' + sign + Math.round(Math.abs(out.pct)) + '%' : sign + pct1(out.pct) + '%', sub: usd(out.b.med) + ' → ' + usd(out.a.med) + ' · ' + out.band.label });
    }
    if (out.state === 'stale') {   // nothing in the last 12 months: the last sale and what is on record say it all, without a zero
      f.push({ id: 'latest', label: 'Latest sale', value: out.latestLabel || '—', sub: 'Data to ' + out.asOfLabel });
      f.push({ id: 'record', label: wordCap(w) + ' on record', value: num(out.total), sub: 'Since ' + monthLabel(out.first) });
    } else {
      f.push({ id: 'volume', label: 'All ' + w + ', last 12 months', value: num(out.n12), sub: volSub + (out.n12 > 0 && out.n12 < CFG.thinVolume ? ' · limited volume' : '') });
      f.push({ id: 'latest', label: 'Latest sale', value: out.latestLabel || '—', sub: 'Data to ' + out.asOfLabel });
    }
    out.figs = f;
    return out;
  }
  const wordCap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- the Map's one line, from the compact record ---------- */
  function compact(p) {
    if (!p || p.state === 'nosales') return null;
    const c = { s: p.sale, a: p.n12, b: p.nPrev, l: p.latest };   // empty parts are left out (e: evidence s|l, d: direction h|l|s, c: median change %, z: size band)
    if (p.evidence !== 'none') { c.e = p.evidence === 'strong' ? 's' : 'l'; c.d = p.dir === 'higher' ? 'h' : p.dir === 'lower' ? 'l' : 's'; c.c = p.pct; c.z = p.band.bin; }
    return c;
  }
  function snapshot(c) {
    if (!c) return null;
    const w = wordOf(c.s, 2), rel = c.d === 'h' ? 'higher than' : c.d === 'l' ? 'lower than' : c.d === 's' ? 'broadly the same as' : '';
    if (c.a === 0) return { text: 'No ' + w + ' in the last 12 months', tone: 'none', sale: c.s, n: 0 };
    // A reading is the line on its own (the panel is short, above all on a phone; the sale counts are in the full report). Without a reading, the counts are the line.
    const vol = num(c.a) + ' ' + wordOf(c.s, c.a) + ' in 12 months' + (c.b ? ' (' + num(c.b) + ' the year before)' : '');
    const band = c.z != null ? bandLabel(c.z) : 'this size';
    if (rel && c.e === 's') return { text: 'Resale prices for ' + band + ' are ' + rel + ' a year earlier', tone: c.d, sale: c.s, n: c.a };
    if (rel && c.e === 'l') return { text: 'A first look (few sales): ' + band + ' resale prices appear ' + rel + ' a year earlier', tone: 'limited', sale: c.s, n: c.a };
    return { text: vol, tone: 'count', sale: c.s, n: c.a };
  }

  /* ---------- the report block ---------- */
  function detailHtml(p) {
    const rows = p.periods.length ? '<div class="mp-scroll"><table class="mp-t"><thead><tr><th scope="col">12 months</th><th scope="col">Sales</th><th scope="col">Median psf</th><th scope="col">Middle half</th></tr></thead><tbody>' +
      p.periods.map((r) => '<tr><th scope="row">' + esc(r.label) + '</th><td>' + r.n + '</td><td>' + usd(r.med) + '</td><td>' + usd(r.q1) + '–' + usd(r.q3) + '</td></tr>').join('') + '</tbody></table></div>' : '';
    const lead = p.band ? '<p class="mp-fine">' + wordCap(wordOf(p.sale, 2)) + ' of ' + esc(p.band.label) + ', in disjoint 12-month periods ending ' + esc(p.asOfLabel) + '.</p>' : '';
    return '<details class="mp-d" data-mp-d><summary>How this was worked out</summary><div class="mp-in">' + lead + rows +
      '<ul class="mp-list"><li>Past recorded sales from URA, one sale type at a time: resales, sub-sales and developer (new-sale) transactions are never mixed.</li>' +
      '<li>Prices are compared within one size band, so a change in the mix of sizes sold does not move the figure. Floor, facing, condition and the date of each sale still differ.</li>' +
      '<li>A reading needs at least ' + CFG.strong.n + ' sales over ' + CFG.strong.months + ' months in each period. With ' + CFG.limited.n + ' or more it is shown as a first look; with fewer, only counts are shown.</li>' +
      '<li>A median change of under ' + CFG.stablePct + '%, or one small enough to be down to which units happened to sell (judged from the middle half of prices in each period), is called broadly the same. ' + esc(p.asOfLabel) + ' may be incomplete.</li></ul></div></details>';
  }
  // The three next steps when a size has too little evidence: the individual sales, similar developments (the page's own comparison rules), and Ken.
  function sizedActs(o) {
    return '<p class="mp-acts" data-mp-acts>' + (o.mapHref ? '<a href="' + esc(o.mapHref) + '" data-mp-sales>See the individual sales on the Map ›</a>' : '') +
      '<a href="#lgCompare" data-lg-scroll="lgCompare" data-mp-similar>Compare with similar developments ›</a>' +
      '<a href="#next" data-lg-scroll="next" data-mp-next="' + esc(o.forWho || '') + '">Ask Ken about a particular unit ›</a></p>';
  }
  // o.forWho: 'sell' | 'buy' | '' (the question the visitor came with). The link goes to the next-step cards on the page (id "next"), not straight to WhatsApp.
  function nextLink(forWho) {
    const t = forWho === 'sell' ? 'What could my unit sell for?' : forWho === 'buy' ? 'Is an asking price reasonable?' : 'What this means for buying or selling here';
    return '<a href="#next" data-lg-scroll="next" data-mp-next="' + esc(forWho || '') + '">' + t + ' ›</a>';
  }
  // A visitor who chose a size and whose size has too little evidence for a reading: say that about THAT size, then three useful next steps.
  // (p.userSized is set by the Research page; the rules above are untouched.)
  function sizedView(p) {
    const s = p.sized, L = p.band.label, w = wordOf(p.sale, 2), n = s.n12, q = s.nPrev, o = {};
    o.head = n === 0 ? 'No ' + w + ' of ' + L + ' in the last 12 months' : p.sale === 'resale' ? 'Too few sales of this size to show a trend' : n + ' ' + wordOf(p.sale, n) + ' of ' + L + ' in the last 12 months';
    if (p.sale !== 'resale') o.sub = p.sub;   // new sales and sub-sales: the reason a direction is never shown
    else if (n === 0) o.sub = (s.latestLabel ? 'The latest was ' + s.latestLabel + '. ' : '') + 'With no recent sales of this size there is no recent price or trend to read.';
    else if (p.nPrev === 0 && p.first && mIdx(p.first) > mIdx(p.asOf) - 12) o.sub = 'Only ' + n + ' ' + wordOf(p.sale, n) + ' of ' + L + ' in the last 12 months. The first resale on record here was in ' + monthLabel(p.first) + ', so there is no earlier 12 months to compare.';
    else if (n >= CFG.limited.n && q >= CFG.limited.n) o.sub = n + ' ' + wordOf(p.sale, n) + ' of ' + L + ' in the last 12 months and ' + q + ' the year before, but spread over too few months to compare prices reliably.';
    else o.sub = 'Only ' + n + ' ' + wordOf(p.sale, n) + ' of ' + L + ' in the last 12 months' + (q ? ' and ' + q + ' the year before' : ', none the year before') + ', so there isn’t enough evidence to establish a reliable price trend for this size.';
    o.figs = [
      { id: 'size', label: 'This size, last 12 months', value: num(n), sub: q ? num(q) + ' the year before' : 'None the year before' },
      { id: 'volume', label: 'All sizes, last 12 months', value: num(p.n12), sub: p.nPrev ? num(p.nPrev) + ' the year before' : 'None the year before' },
      { id: 'latest', label: 'Latest sale of this size', value: s.latestLabel || '—', sub: 'Data to ' + p.asOfLabel }];
    return o;
  }
  function html(p, o) {
    o = o || {};
    if (!p || p.state === 'nosales') return '';
    const sv = p.userSized && p.state === 'activity' && p.sized && p.band ? sizedView(p) : null;   // a project with no resale at all in 12 months keeps its own (project-level) wording
    const k = [wordCap(wordOf(p.sale, 2)), p.band && (p.state === 'trend' || sv) ? p.band.label : ''   /* the size is named only where prices are compared */].filter(Boolean).join(' · ');
    if (sv) {
      const f = '<dl class="mp-f">' + sv.figs.map((x) => '<div data-mp-fig="' + x.id + '"><dt>' + esc(x.label) + '</dt><dd class="mp-v">' + esc(x.value) + '</dd><dd class="mp-n">' + esc(x.sub) + '</dd></div>').join('') + '</dl>';
      return '<section class="mp" data-mp data-mp-state="' + p.state + '" data-mp-sized="1" data-mp-dir="" data-mp-evidence="' + p.evidence + '" aria-label="Market pulse">' +
        '<p class="mp-k">Market pulse<span> · ' + esc(k) + '</span></p><h2 class="mp-h" data-mp-head>' + esc(sv.head) + '</h2><p class="mp-s" data-mp-sub>' + esc(sv.sub) + '</p>' + f +
        '<p class="mp-fine" data-mp-fine>Past sales only. Not a valuation or a forecast. Other developments are context, not a price trend for this one.</p>' + sizedActs(o) + detailHtml(p) + '</section>';
    }
    const figs = '<dl class="mp-f">' + p.figs.map((f) => '<div data-mp-fig="' + f.id + '"><dt>' + esc(f.label) + '</dt><dd class="mp-v">' + esc(f.value) + '</dd><dd class="mp-n">' + esc(f.sub) + '</dd></div>').join('') + '</dl>';
    const fine = p.state === 'trend' ? 'Same size band, past sales only. Not a valuation or a forecast.' : 'Past sales only. Not a valuation or a forecast.';
    return '<section class="mp" data-mp data-mp-state="' + p.state + '" data-mp-dir="' + (p.dir || '') + '" data-mp-evidence="' + p.evidence + '" aria-label="Market pulse">' +
      '<p class="mp-k">Market pulse<span>' + (k ? ' · ' + esc(k) : '') + '</span></p>' +
      '<h2 class="mp-h" data-mp-head>' + esc(p.head) + '</h2><p class="mp-s" data-mp-sub>' + esc(p.sub) + '</p>' + figs +
      '<p class="mp-fine" data-mp-fine>' + fine + '</p>' +
      '<p class="mp-acts"><a href="#numbers" data-lg-scroll="numbers" data-mp-trend>See the trend</a><button type="button" class="mp-share" data-mp-share>Copy link to this report</button>' + nextLink(o.forWho) + '<span class="mp-copied" data-mp-copied role="status" aria-live="polite" hidden>Link copied</span></p>' +
      detailHtml(p) + '</section>';
  }

  /* ---------- the next step: who is asking decides the question; the message carries the development and the finding ---------- */
  function finding(p) {
    if (!p) return '';
    const rel = p.dir === 'higher' ? 'higher than' : p.dir === 'lower' ? 'lower than' : 'broadly the same as';
    if (p.state === 'trend' && p.evidence === 'strong') return 'resale prices for ' + p.band.label + ' ' + rel + ' a year earlier';
    if (p.state === 'trend') return 'a first look, on few sales, with resale prices for ' + p.band.label + ' ' + rel + ' a year earlier';
    if (p.userSized && p.sized && p.band && p.state === 'activity') return (p.sized.n12 === 0 ? 'no ' + wordOf(p.sale, 2) + ' of ' + p.band.label + ' in the last 12 months' : 'only ' + p.sized.n12 + ' ' + wordOf(p.sale, p.sized.n12) + ' of ' + p.band.label + ' in the last 12 months, too few to show a price trend');
    if (p.state === 'stale') return 'no ' + wordOf(p.sale, 2) + ' in the last 12 months';
    return num(p.n12) + ' ' + wordOf(p.sale, p.n12) + ' in the last 12 months';
  }
  // intent: 'sell' (owner) | 'buy'. url: the shareable report address (development id only). No figures the visitor typed, ever.
  function waMessage(p, name, url, intent) {
    const f = finding(p), seen = f ? ' It shows ' + f + '.' : '';
    if (intent === 'sell') return 'Hi Ken, I own a home at ' + name + '. I read Groundwork’s market report for it.' + seen + ' I’d like to know what my unit could sell for, given its floor, facing, size and condition. ' + (url || '') + ' (Ref KPT-PULSE-SELL)';
    return 'Hi Ken, I’m considering a property at ' + name + '. I read Groundwork’s market report for it.' + seen + ' I’d like your view on whether the asking price of a unit there makes sense. ' + (url || '') + ' (Ref KPT-PULSE-BUY)';
  }
  // Analytics: allow-listed words only. No names, sizes, prices or figures.
  function trackParams(p) {
    if (!p) return {};
    return { trend: p.dir || 'none', evidence: p.evidence, sale_type: p.sale && SALE[p.sale] ? p.sale : undefined };
  }

  return { VERSION, CFG, compute, compact, snapshot, html, detailHtml, sizedActs, finding, waMessage, trackParams, monthLabel, bandLabel };
});
