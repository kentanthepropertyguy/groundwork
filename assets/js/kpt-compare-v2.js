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
  function axisOf(list) {
    let lo = Infinity, hi = -Infinity; list.forEach((d) => { if (!d) return; lo = Math.min(lo, d.min); hi = Math.max(hi, d.max); });
    if (!isFinite(lo)) return { lo: 0, hi: 1 }; const pad = (hi - lo) * 0.08 || 40; return { lo: lo - pad, hi: hi + pad };
  }
  function rangeBar(d, ax, cls, who) {
    if (!d) return '';
    const x = (v) => Math.max(0, Math.min(100, (v - ax.lo) / (ax.hi - ax.lo) * 100));
    return '<span class="v2-bar ' + cls + '" role="img" aria-label="' + esc(who) + ': middle half of sales ' + money(d.q1) + ' to ' + money(d.q3) + ' per sq ft, median ' + money(d.med) + ', approximate">' +
      '<i class="r" style="left:' + x(d.min) + '%;width:' + (x(d.max) - x(d.min)) + '%"></i><i class="q" style="left:' + x(d.q1) + '%;width:' + Math.max(1, x(d.q3) - x(d.q1)) + '%"></i><i class="d" style="left:' + x(d.med) + '%"></i></span>';
  }
  const tags = (list) => (list || []).map((t) => '<span class="v2-chip' + (t.id === 'older' || t.id === 'none-recent' ? ' warn' : '') + '">' + esc(t.text) + '</span>').join('');
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
  function subtitle(M, ev, w) {
    const sale = M.sale.label || 'transaction';
    if (ev.band && ev.state === 'stronger') return 'Median ' + sale + ' price per sq ft for ' + ev.band.label + ' homes over the ' + ev.windowLabel + ', from ' + ev.band.a.n + ' and ' + ev.band.b.n + ' sales.';
    if (ev.band) return 'A first look at ' + ev.band.label + ' ' + sale + ' sales over the ' + ev.windowLabel + '. The evidence is limited, so read the numbers as indicative.';
    if (!M.sale.selected) return 'These two have no sale type in common (for example, one has only new sales and the other only resales), so their prices are not compared. Each development’s own figures are shown instead.';
    return 'There is not enough matched evidence to compare prices fairly. Each development’s own most active size is shown instead.';
  }
  function cardHtml(side, M, ev, R, own, cls, other) {
    const nm = M[side].name, st = ev.band ? ev.band[side] : null, o = own[side];
    const hi = ev.band && ev.band.gap.dir === side && ev.band.gap.dir !== 'level', f = M.differences;
    const get = (l) => { const d = f.find((x) => x.label === l); return d ? d[side] : null; };
    const sub = [get('Street') && cap(String(get('Street')).toLowerCase()).replace(/\b\w/g, (c) => c.toUpperCase()), get('District'), get('Region'), get('Lease')].filter(Boolean).join(' · ');
    let big, small, line1, line2, line3;
    if (st) {
      big = money(st.med); small = 'psf · ' + ev.band.label;
      line1 = 'Median of ' + plural(st.n, M.sale.label === 'resale' ? 'resale' : M.sale.label) + (hi ? ' · higher median PSF' : '');
      line2 = 'Middle half of sales: ' + money(st.q1) + '–' + money(st.q3);
      line3 = plural(st.months, 'month') + ' with sales · latest ' + st.latestLabel;
    } else if (o) {
      big = money(o.psf.med); small = 'psf · ' + o.label + (o.otherSale ? ' · ' + SALE_WORD[o.sale] : ''); line1 = 'Median of ' + plural(o.n, o.otherSale ? SALE_WORD[o.sale] : 'sale') + (o.older ? ' (older evidence)' : '') + (o.otherSale ? '. Not the same sale type as the other, so not compared' : '');
      line2 = 'Middle half of sales: ' + money(o.psf.q1) + '–' + money(o.psf.q3); line3 = plural(o.months, 'month') + ' with sales · latest ' + o.latestLabel;
    } else { big = '—'; small = 'no sales in this sale type'; line1 = 'No transactions to show'; line2 = ''; line3 = ''; }
    const box = o ? '<div class="box"><i>' + (o.older ? 'Most recent sales' : 'Most active size, last 12 months') + '</i>' + (o.older ? 'No sale in the last 12 months. Latest: ' + esc(o.latestLabel) : esc(o.label) + ' · ' + o.n + ' of ' + o.total12 + ' sales') + '</div>' : '<div class="box"><i>Most active size</i>No sales found for this sale type</div>';
    return '<article class="v2-card ' + cls + '"><h2 class="n">' + esc(nm) + '</h2><p class="m">' + esc(sub) + '</p><p class="big">' + esc(big) + '<small>' + esc(small) + '</small></p><ul><li>' + esc(line1) + '</li>' + (line2 ? '<li>' + esc(line2) + '</li>' : '') + (line3 ? '<li>' + esc(line3) + '</li>' : '') + '</ul>' + box + '</article>';
  }
  // A plain heading for each reason a price comparison is not possible, instead of one general one.
  const INSUFFICIENT = {
    'no-shared-sale-type': { title: 'These two have no sale type in common.', text: 'One has sold only as new sales or sub-sales and the other only as resales (or similar), so there is no like-for-like price to compare. Each development’s own figures are shown above, labelled with their sale type.' },
    'all-history-stale': { title: 'The only like-for-like sales are more than two years old.', text: 'Both developments have sales in a shared size, but the latest of them is too old to say anything about prices today. Each development’s own recent figures are shown above instead.' },
    'no-qualifying-band': { title: 'No size has enough sales on both sides yet.', text: 'The two sell mostly in different sizes, or too few homes have changed hands in any size they share. Each development’s own most active size is shown above instead.' },
  };
  function verdictHtml(M, ev, w, aId) {
    const reasons = ev.reasons.length ? '<ul class="v2-why">' + ev.reasons.map((r) => '<li>' + esc(r.text) + '</li>').join('') + '</ul>' : '';
    const more = ev.strengthen.length ? '<p class="v2-more"><b>What would make it stronger:</b> ' + esc(ev.strengthen.join(' ')) + ' New sales are added as URA publishes them.</p>' : '';
    const strip = ev.band ? '<ul class="v2-ev" aria-label="Evidence behind this"><li><b>' + ev.band.a.n + ' and ' + ev.band.b.n + '</b><span>sales in this band</span></li><li><b>' + ev.band.a.months + ' and ' + ev.band.b.months + '</b><span>months with sales</span></li><li><b>' + esc(ev.band.a.latestLabel) + ' · ' + esc(ev.band.b.latestLabel) + '</b><span>latest sale in this band</span></li><li><b>' + Math.round(ev.coverage.a * 100) + '% · ' + Math.round(ev.coverage.b * 100) + '%</b><span>of each project’s sales covered</span></li></ul>' : '';
    if (ev.state === 'stronger') {
      return '<section class="v2-verdict strong" aria-labelledby="v2vh"><div class="t"><span class="v2-badge ok">' + esc(ev.label) + '</span><h2 id="v2vh">' + esc(w.title) + '</h2><p>' + esc(w.sub) + '</p></div><div class="act"><a class="v2-btn w" href="#v2-sizes">See every size</a><a class="v2-btn o" href="#v2-how">How we read this</a></div></section>' +
        strip + '<p class="v2-lead">' + esc(w.text) + ' <span class="v2-muted">Not adjusted for age, floor, facing or condition.</span></p>';
    }
    if (ev.state === 'limited') {
      return '<section class="v2-verdict limited" aria-labelledby="v2vh"><span class="v2-badge warn">' + esc(ev.label) + '</span><h2 id="v2vh">Read this as indicative only</h2><p>' + esc(w.text) + '</p>' + reasons + more + '</section>' + strip;
    }
    const why = INSUFFICIENT[(ev.reasons[0] || {}).id] || { title: w.title, text: w.text };
    return '<section class="v2-verdict none" aria-labelledby="v2vh"><span class="v2-badge grey">' + esc(ev.label) + '</span><h2 id="v2vh">' + esc(why.title) + '</h2><p>' + esc(why.text) + '</p>' + reasons + more + '</section>';
  }
  // "What should I consider?": a short, rule-based checklist from the facts on this page. It names differences; it never ranks.
  function considerHtml(M, ev, own) {
    const row = (l) => M.differences.find((d) => d.label === l) || {}, out = [], nA = M.a.name, nB = M.b.name;
    const lease = row('Lease'), ya = (String(lease.a).match(/from (\d{4})/) || [])[1], yb = (String(lease.b).match(/from (\d{4})/) || [])[1], fa = /freehold/i.test(lease.a || ''), fb = /freehold/i.test(lease.b || '');
    if (ya && yb && Math.abs(ya - yb) >= 3) { const newer = Number(ya) > Number(yb) ? nA : nB; out.push(['Lease age', newer + (/s$/i.test(newer) ? '’' : '’s') + ' lease started about ' + Math.abs(ya - yb) + ' years later (' + Math.max(ya, yb) + ' against ' + Math.min(ya, yb) + '). That is lease age, not building age, so check each development’s completion (TOP) date too. The prices here are not adjusted for either.']); }
    else if (fa !== fb && (ya || yb)) out.push(['Tenure', (fa ? nA : nB) + ' is freehold and ' + (fa ? nB : nA) + ' is leasehold. Tenure can affect price, financing and how long you would want to hold.']);
    const sz = row('Typical unit size'), sa = Number(String(sz.a).replace(/[^0-9]/g, '')), sb = Number(String(sz.b).replace(/[^0-9]/g, ''));
    if (sa && sb && Math.max(sa, sb) / Math.min(sa, sb) >= 1.2) out.push(['Unit sizes', 'The typical home differs in size (' + nA + ' ' + num(sa) + ' sqft, ' + nB + ' ' + num(sb) + ' sqft). Compare the layout you would actually buy rather than the overall average.']);
    const rg = row('Region'); if (rg.a && rg.b && rg.a !== rg.b) out.push(['Market segment', 'They sit in different market segments (' + rg.a + ' and ' + rg.b + '), which tend to price differently for reasons beyond the building itself.']);
    if (ev.state === 'stronger') out.push(['The unit itself', 'The headline rests on ' + ev.band.a.n + ' and ' + ev.band.b.n + ' recent sales in one size. A particular unit can still differ: floor, facing, stack and condition all move price.']);
    else if (ev.state === 'limited') out.push(['Thin evidence', 'With few matched sales, check recent sales of the exact unit type in each before relying on these figures.']);
    else out.push(['No fair price comparison yet', 'Ask for recent sales of the exact unit type in each development; that is the comparison the data here cannot make.']);
    out.push(['On the ground', 'Walk to transport at the time you would commute, and ask each MCST what the monthly fees are and what they cover.']);
    return '<section class="v2-sec v2-consider" aria-labelledby="v2ch"><div class="v2-sh"><h2 id="v2ch">What should I consider?</h2>' + layer('auto', 'Rule-based checklist · not Ken’s view') + '</div><ul class="v2-cl">' +
      out.slice(0, 5).map((x) => '<li><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></li>').join('') + '</ul></section>';
  }
  // "There's more to a property decision than PSF", with a preview of the sample detailed research.
  function moreHtml(M) {
    const S = SAMPLE.v || null, href = 'sample/?a=' + encodeURIComponent(M.a.id) + '&b=' + encodeURIComponent(M.b.id);
    const cats = ['Development characteristics and lifestyle trade-offs', 'Location, transport, amenities and accessibility', 'Layouts and project facilities', 'What could explain a price difference', 'Which buyer priorities each development may suit', 'Resale activity and market context, where supported', 'Questions worth settling before you decide'];
    const card = S ? '<a class="v2-sample" href="' + esc(href) + '" data-kpt-sample="comparison"><span class="k">Sample detailed research</span><span class="t"><i class="a">' + esc(S.a) + '</i> or <i class="b">' + esc(S.b) + '</i>?</span>' +
      '<span class="fig"><span><b>' + money(S.psf[0]) + '</b> psf · ' + plural(S.sales[0], 'sale') + '</span><span><b>' + money(S.psf[1]) + '</b> psf · ' + plural(S.sales[1], 'sale') + '</span></span><span class="m">' + esc(S.band) + ' resales, ' + esc(S.period) + '</span>' +
      '<span class="cov">' + S.covers.map((c) => '<em>' + esc(c) + '</em>').join('') + '</span><span class="note">Illustrative sample · AI-assisted, not reviewed by Ken</span><span class="go">View sample detailed research →</span></a>' : '';
    return '<section class="v2-more" aria-labelledby="v2mh"><div class="tx"><p class="k">Beyond the numbers</p><h2 id="v2mh">There’s more to a property decision than PSF.</h2><p>Detailed KPT research looks past the transaction figures. Depending on what reliable information exists for each development, it can examine:</p><ul>' +
      cats.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul><p class="v2-muted">Not every comparison can cover every point. How deep it goes depends on the information available.</p></div>' + card + '</section>';
  }
  const SAMPLE = { v: null };
  function controlsHtml(M, ctx) {
    const sale = M.sale.options.length > 1 ? '<div class="v2-ctl"><span class="v2-ctl-l">Compared on</span><div class="v2-seg" role="group" aria-label="Sale type">' + M.sale.options.map((o) => '<button type="button" data-sale="' + esc(o.id) + '" aria-pressed="' + (o.id === M.sale.selected) + '">' + esc(cap(o.label)) + '<small>' + esc(o.note) + '</small></button>').join('') + '</div></div>' : (M.sale.selected ? '<p class="v2-pillrow"><span class="v2-chip">Compared on ' + esc(M.sale.label) + ' sales · ' + esc(M.sale.options[0].note) + '</span></p>' : '');
    const lad = M.ladder.length ? '<div class="v2-ctl"><span class="v2-ctl-l">How far back</span><div class="v2-seg v2-ladder" role="group" aria-label="Time window">' + M.ladder.map((l) => '<button type="button" data-win="' + l.win + '" aria-pressed="' + (l.win === M.activeWindow) + '">' + esc(cap(l.label)) + '<small>' + (l.hasMatch ? l.bands + ' shared ' + (l.bands === 1 ? 'band' : 'bands') : 'no shared band') + '</small></button>').join('') + '</div></div>' : '';
    return '<section class="v2-controls" aria-label="Comparison options">' + sale + lad + '</section>';
  }
  function suggestHtml(M, ev, ctx) {
    const I = M.interpretation; if (!I || ev.state === 'insufficient') return '';
    const paras = I.paragraphs.filter((p) => ev.state === 'stronger' || p.id === 'lead' || p.id === 'caution');
    return '<section class="v2-sec" id="v2-read" aria-labelledby="v2rh"><div class="v2-sh"><h2 id="v2rh">What the numbers suggest</h2>' + layer('auto', 'Automated reading · rule-based, not Ken’s view') + '</div>' +
      paras.map((p) => '<p class="v2-p">' + esc(p.text) + '</p>').join('') + (ev.state === 'stronger' ? '<div class="v2-judge"><b>Still needs judgement</b><p>' + esc(I.question) + '</p></div>' : '') + '</section>';
  }
  function sizesHtml(M, ev, ctx) {
    if (!M.bands.length) return '';
    const q = new Set(ev.qualifying), nA = M.a.name, nB = M.b.name;
    const rows = M.bands.slice().sort((x, y) => x.bin - y.bin).map((b) => {
      const ax = axisOf([b.a.psf, b.b.psf]), ok = q.has(b.bin) && ev.state !== 'insufficient', head = ev.band && ev.band.bin === b.bin;
      const g = E.gapOf(b), gap = !ok ? '<span class="v2-gap muted">Too few sales on one side to compare this size.</span>' : g.dir === 'level' ? '<span class="v2-gap">About level</span>' : '<span class="v2-gap">' + esc(g.dir === 'a' ? nA : nB) + ' is ' + E.pctText(g.pct) + ' higher · ranges ' + (g.rangesOverlap ? 'overlap' : 'do not overlap') + '</span>';
      return '<div class="v2-row' + (head ? ' head' : '') + (b.isFocus ? ' focus' : '') + '"><div class="lab"><b>' + esc(b.label) + '</b>' + (head ? '<span>Headline size</span>' : '') + (b.isFocus ? '<span>Your size</span>' : '') + '</div>' +
        '<div class="viz"><div class="side"><span class="who a">' + esc(nA) + '</span>' + rangeBar(b.a.psf, ax, 'a', nA) + '<span class="num">' + money(b.a.psf.med) + ' · ' + plural(b.a.n, 'sale') + '</span><div>' + tags(b.a.evidence.tags) + '</div></div>' +
        '<div class="side"><span class="who b">' + esc(nB) + '</span>' + rangeBar(b.b.psf, ax, 'b', nB) + '<span class="num">' + money(b.b.psf.med) + ' · ' + plural(b.b.n, 'sale') + '</span><div>' + tags(b.b.evidence.tags) + '</div></div></div>' + gap + '</div>';
    }).join('');
    return '<section class="v2-sec" id="v2-sizes" aria-labelledby="v2sh"><div class="v2-sh"><h2 id="v2sh">Price by size</h2>' + layer('calc', 'Calculated from URA records') + '</div><p class="v2-p">Same sale type, same size band, same time window. Overall PSF is not the comparison, because the mix of sizes differs. Bars show the middle half of sales; the dot is the median.</p>' +
      (M.focusNote ? '<p class="v2-banner">' + esc(M.focusNote) + '</p>' : '') + '<div class="v2-rows">' + rows + '</div><p class="v2-muted">' + esc(M.notes.psf) + '</p></section>';
  }
  function timeHtml(M) {
    if (!M.history || !M.history.bands.length) return '';
    return '<details class="v2-d"><summary>Matched sizes over time</summary><div class="in">' + M.history.bands.slice(0, 3).map((h) => '<h3 class="v2-h3">' + esc(h.label) + '</h3>' + history(null, h.points, M.a.name, M.b.name) + '<p class="v2-p">' + esc(h.text) + '</p>').join('') + '<p class="v2-muted">' + esc(M.history.note) + '</p></div></details>';
  }
  function aboutHtml(M, ctx) {
    return '<section class="v2-sec" aria-labelledby="v2ab"><div class="v2-sh"><h2 id="v2ab">The two developments</h2>' + layer('fact', 'Facts from URA records') + '</div><div class="v2-scroll"><table class="v2-table"><thead><tr><th scope="col"><span class="v2-vh">Fact</span></th><th scope="col">' + esc(M.a.name) + '</th><th scope="col">' + esc(M.b.name) + '</th></tr></thead><tbody>' +
      M.differences.map((d) => (d.label === 'Sales in the data' && ctx ? { label: 'Sales on record', a: salesOnRecord(ctx.A), b: salesOnRecord(ctx.B) } : d)).map((d) => '<tr><th scope="row">' + esc(d.label) + '</th><td>' + esc(d.a) + '</td><td>' + esc(d.b) + '</td></tr>').join('') + '</tbody></table></div><div id="v2facts"></div><p class="v2-muted">These are facts from the records. They are not an explanation of any PSF gap.</p></section>';
  }
  function kenHtml(M, root) {
    return M.ken ? '<section class="v2-ken" aria-label="Ken’s Take"><img src="' + esc(root) + 'assets/img/ken-portrait.jpg" alt="Ken Tan" width="64" height="64"><div><h2>Ken’s Take <span>My judgement, not URA data</span></h2><p>“' + esc(M.ken.note) + '”</p></div></section>' : '';
  }
  function askHtml(M) {
    return '<section class="v2-ask" id="v2-request" aria-labelledby="v2ask"><div><p class="k">Request my detailed research</p><h2 id="v2ask">Get a deeper comparison for your chosen developments.</h2><p>Ken can look at ' + esc(M.a.name) + ' and ' + esc(M.b.name) + ' in more detail, based on what matters to you: the units you are considering, your timing and the trade-offs that count for you. Ken replies personally on WhatsApp, so it is a conversation rather than an instant report.</p></div><div class="act"><a class="v2-btn pri" id="wa" href="#">Message Ken on WhatsApp</a><a class="v2-btn ghost" id="cmp" href="#/compare/' + esc(M.a.id) + '">Compare a different project →</a></div><p class="v2-muted">Optional. Everything on this page stays free to read. Only the two project names go into the message, which you can edit before sending; please leave income, CPF and debt details out.</p></section>';
  }
  // The WhatsApp request names the two developments chosen here (names from our own index, never typed text).
  function requestMessage(M) {
    let seen = false; try { seen = sessionStorage.getItem('kpt_sample_seen') === '1'; } catch (e) { seen = false; }
    return 'Hi Ken, I\'ve compared ' + M.a.name + ' and ' + M.b.name + ' on Ken Property Tools' + (seen ? ' and viewed the sample research' : '') + '. I\'d like to understand these two developments in more detail.';
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
      '<h3 class="v2-h3">Data</h3><p class="v2-p">URA private residential transactions to ' + esc(ctx.m.latestMonth) + '. ' + esc(M.notes.psf) + ' ' + esc(M.notes.history) + ' ' + esc(M.notes.floor) + ' ' + esc(M.notes.substitute) + '</p>' +
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

  // Optional detail: open on wide screens, folded on phones (afterCompare folds it), so the page scans quickly.
  const fold = (html, title, sub) => (html ? '<details class="v2-fold" data-mfold open><summary><span>' + esc(title) + '</span><small>' + esc(sub) + '</small></summary>' + html + '</details>' : '');
  function render(M, ctx) {
    const R = ctx.R, P = ctx.P, ev = E.stateOf(M), w = E.wording(ev, M), root = ctx.root || '../';
    const own = { a: ownAny(R, P, ctx.A, ctx.m, M.sale.selected), b: ownAny(R, P, ctx.B, ctx.m, M.sale.selected) };
    const region = [M.sale.label ? cap(M.sale.label) + ' comparison' : 'Comparison', (M.differences.find((d) => d.label === 'Region') || {}).a === (M.differences.find((d) => d.label === 'Region') || {}).b ? (M.differences.find((d) => d.label === 'Region') || {}).a : null, (function () { const d = M.differences.find((x) => x.label === 'District'); return d ? (d.a === d.b ? d.a : d.a + ' and ' + d.b) : null; })()].filter(Boolean).join(' · ');
    ctx.last = ev;
    return '<div class="v2" data-state="' + esc(ev.state) + '" data-evidence="' + esc(ev.version) + '">' +
      '<button class="kpr-back v2-back" type="button" data-act="back">← Back to ' + esc(M.a.name) + '</button>' +
      '<header class="v2-hero"><div class="top"><span class="kick">' + esc(region) + '</span><span class="pill">' + LABEL + '</span></div>' +
      '<h1 class="v2-h1" tabindex="-1"><span class="a">' + esc(M.a.name) + '</span> or <span class="b">' + esc(M.b.name) + '</span>?</h1><p class="sub">' + esc(subtitle(M, ev, w)) + '</p><p class="disc">' + esc(DISCLAIMER) + '</p></header>' +
      '<section class="v2-cards" aria-label="The two developments">' + cardHtml('a', M, ev, R, own, 'a', 'b') + '<span class="vsm" aria-hidden="true">VS</span>' + cardHtml('b', M, ev, R, own, 'b', 'a') + '</section>' +
      verdictHtml(M, ev, w, M.a.id) + considerHtml(M, ev, own) + controlsHtml(M, ctx) +
      '<div class="v2-tools">' + (ctx.focusHtml ? ctx.focusHtml(M, 'compare') : '') + '</div>' +
      fold(ev.state === 'insufficient' ? '' : sizesHtml(M, ev, ctx), 'Price by size', 'Every size both developments sold in, side by side') + fold(suggestHtml(M, ev, ctx), 'How the sales compare across sizes', 'An automated reading of the figures') + (ev.state === 'insufficient' ? '' : timeHtml(M)) + aboutHtml(M, ctx) + kenHtml(M, root) + moreHtml(M) + askHtml(M) + evidenceHtml(M, ev, ctx) +
      '<p class="v2-fine">' + esc(DISCLAIMER) + '</p></div>';
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
    try { if (window.matchMedia && window.matchMedia('(max-width: 719px)').matches) app.querySelectorAll('details[data-mfold]').forEach((d) => { d.open = false; }); } catch (e) { /* keep open */ }
    const sl = app.querySelector('[data-kpt-sample]'); if (sl) sl.addEventListener('click', () => KPT().track('research_sample_opened', { project_a: M.a.id, project_b: M.b.id }));
    const host = app.querySelector('#v2facts'); if (!host || !root || typeof fetch !== 'function') return;
    Promise.all([M.a.id, M.b.id].map((id) => !factIds[id] ? Promise.resolve(null) : fetch(root + 'data/registry/p/' + id + '.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)))
      .then((ps) => { const list = ps.map((p, i) => (p ? { name: [M.a, M.b][i].name, facts: sourcedFacts(p) } : null)).filter(Boolean); const h = factsHtml(list); if (h) host.innerHTML = h; });
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
  const siteCard = (x, ctx) => '<div class="v2-site"><b>' + esc(x.name) + '</b><span>' + esc(x.tagline || 'Has its own site for current details.') + '</span><a class="v2-btn pri" href="' + esc(x.url) + '" target="_blank" rel="noopener" data-kpt-ms="' + esc(x.id) + '" data-placement="' + esc(ctx) + '" data-host="' + esc(x.host || '') + '">Visit the ' + esc(x.name) + ' site ↗</a></div>';
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
  function showSite(id, app, hooks) {
    const x = sites[id]; document.body.dataset.view = 'site'; document.title = x.name + ' — Ken Property Tools';
    app.innerHTML = '<button class="kpr-back" type="button" data-act="home">← Search another project</button><p class="kpt-eyebrow">' + esc(x.stage === 'new-launch' ? 'New launch' : 'Development') + '</p><h1 class="kpr-h" tabindex="-1">' + esc(x.name) + '</h1>' +
      '<p class="kpr-lead">' + (x.url ? esc(x.name) + ' keeps its own site for current details. We link to it rather than copy it, so what you read there is always up to date.' : esc(x.name) + (x.status === 'planned' ? ' is planned, with a dedicated site to follow.' : ' is a new development. Its dedicated site is not linked here yet.')) + '</p>' + (x.url ? siteCard(x, 'research-project') : '') +
      '<p class="kpr-note">There are no resale transactions to analyse yet, so there is nothing to compare here. To research another development, search below.</p><div id="sb"></div>';
    const b = app.querySelector('[data-act=home]'); if (b) b.addEventListener('click', () => { location.hash = '#/'; });
    const sb = app.querySelector('#sb'); if (sb && hooks && hooks.searchBox) sb.appendChild(hooks.searchBox(null, hooks.onPick));
    const h = app.querySelector('h1'); if (h) h.focus({ preventScroll: true });
  }

  // A comparison where one side has no transactions at all (for example a new launch with its own site): say so plainly; never imply a price gap.
  const NO_DATA = 'We don’t currently have sufficient transaction data to provide a meaningful comparison.';
  function showNoData(aId, bId, app, hooks) {
    const nm = (id) => (sites[id] ? sites[id].name : null), empty = [aId, bId].filter((id) => sites[id]), other = [aId, bId].find((id) => !sites[id]);
    document.body.dataset.view = 'compare'; document.title = 'Comparison — Research — Ken Property Tools';
    app.innerHTML = '<button class="kpr-back" type="button" data-act="home">← Search another project</button><p class="kpt-eyebrow">' + LABEL + '</p><h1 class="kpr-h" tabindex="-1">' + esc(empty.map(nm).join(' and ')) + ' has no transactions to compare yet</h1>' +
      '<section class="v2-quiet"><h2>' + esc(NO_DATA) + '</h2><p>' + esc(empty.map(nm).join(' and ')) + (empty.length > 1 ? ' have' : ' has') + ' no URA transactions in the data we hold, so there is nothing to set against ' + (other ? 'the other development' : 'each other') + '. No price gap is shown.</p>' +
      (other ? '<p><a class="kpt-cta" href="#/p/' + esc(other) + '">See the other development’s transactions →</a></p>' : '') + '</section>' +
      empty.filter((id) => sites[id].url).map((id) => siteCard(sites[id], 'research-compare')).join('') + '<div id="sb"></div>';
    const b = app.querySelector('[data-act=home]'); if (b) b.addEventListener('click', () => { location.hash = '#/'; });
    const sb = app.querySelector('#sb'); if (sb && hooks && hooks.searchBox) sb.appendChild(hooks.searchBox(null, hooks.onPick));
    const h = app.querySelector('h1'); if (h) h.focus({ preventScroll: true });
  }

  // A development with nothing recent to analyse is shown plainly, not as a page of empty sections.
  function afterProject(M, app, raw, m, hooks) {
    if (!raw || !m) return;
    const ex = E.projectExperience(raw, m);
    if (ex.experience === 'directory') {
      const R = hooks.R, last = raw.last ? R.fmtMonth(raw.last) : null, tot = raw.sale ? (raw.sale.new || 0) + (raw.sale.sub || 0) + (raw.sale.resale || 0) : 0;
      app.innerHTML = '<button class="kpr-back" type="button" data-act="home">← Search another project</button><h1 class="kpr-h" tabindex="-1">' + esc(M.name) + '</h1><p class="kpr-meta">' + esc(M.street) + ' · ' + esc(M.districtLabel) + ' · ' + esc(M.region) + ' · ' + esc(M.tenure.label) + '</p>' +
        '<section class="v2-quiet"><h2>Nothing recent to analyse</h2><p>' + (last ? 'The last recorded sale was ' + esc(last) + ', and there have been ' + plural(tot, 'sale') + ' in the data we hold, none in the last ' + E.CONFIG.project.recentMonths + ' months. ' : 'There are no transactions for this development in the data we hold. ') + 'Without recent sales we cannot give a fair read of what it transacts at, so we do not draw one.</p><p>To research another development, search below.</p></section><div id="sb"></div>';
      const b = app.querySelector('[data-act=home]'); if (b) b.addEventListener('click', () => { location.hash = '#/'; });
      const sb = app.querySelector('#sb'); if (sb && hooks.searchBox) sb.appendChild(hooks.searchBox(null, hooks.onPick));
      const h = app.querySelector('h1'); if (h) h.focus({ preventScroll: true });
      return;
    }
    if (typeof fetch !== 'function' || !ROOT) return;
    (factIds[M.id] ? fetch(ROOT + 'data/registry/p/' + M.id + '.json').then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null)).then((p) => {
      if (!p) return; const h = factsHtml([{ name: M.name, facts: sourcedFacts(p) }]); if (!h || app.querySelector('.v2-facts')) return;
      // after the transaction analysis, just before "Compare another project", so the figures stay first
      const cta = app.querySelector('#cmp'), at = cta ? cta.closest('.kpr-a-actions') || cta : null, meta = app.querySelector('.kpr-meta');
      if (at) at.insertAdjacentHTML('beforebegin', '<div class="v2-factsbar">' + h + '</div>'); else if (meta) meta.insertAdjacentHTML('afterend', '<div class="v2-factsbar">' + h + '</div>');
    });
  }

  // "Compare with…": developments that share the most evidence with this one, ranked by evidence strength (built from the same rules, ahead of time).
  const STATE_TEXT = { s: 'Stronger evidence', l: 'Limited evidence' };
  function enhancePick(aId, app, go) {
    if (typeof fetch !== 'function' || !ROOT) return;
    fetch(ROOT + 'data/research/suggest.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => {
      const list = d && d.p && d.p[aId]; if (!list || !list.length) return;
      app.querySelectorAll('.kpr-sugg-h, ul.kpr-results[role=list], .kpr-note').forEach((el) => { if (!el.closest('#sb')) el.remove(); });
      const sb = app.querySelector('#sb'); if (!sb) return;
      sb.insertAdjacentHTML('afterend', '<p class="kpr-sugg-h">Developments that share the most evidence</p><ul class="kpr-results" role="list" id="v2sugg">' + list.map((x) => '<li><button type="button" data-id="' + esc(x[0]) + '"><b>' + esc(x[1]) + '</b><span>' + esc(STATE_TEXT[x[2]]) + ' · ' + esc(x[5]) + ' · ' + x[3] + ' and ' + x[4] + ' sales</span></button></li>').join('') + '</ul><p class="kpr-note">Ranked by how much matched transaction evidence the two share. Being in the same district does not make two projects comparable, and a pair can still read as limited.</p>');
      app.querySelectorAll('#v2sugg button[data-id]').forEach((b) => b.addEventListener('click', () => go(b.dataset.id)));
    });
  }

  return { SAMPLE, considerHtml, moreHtml, requestMessage, INSUFFICIENT, LABEL, DISCLAIMER, NO_DATA, render, defaultWindow, bestSale, showNoData, ownAny, salesOnRecord, afterCompare, afterSearch, afterProject, enhancePick, showSite, ready, sites, siteMatches, siteHref, ownBand, factsHtml, sourcedFacts, norm };
});
