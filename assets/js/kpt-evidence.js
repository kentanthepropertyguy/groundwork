/* ==========================================================================
   KPT evidence rules ("how much weight can this comparison carry?") and project experiences.
   Pure functions: no DOM, no network, no storage. UMD: window.KPT_EVIDENCE and Node.
   It READS the output of kpt-research.js (analyseComparison) and the project data layer. It calculates no market statistics of its own:
   every figure it states is a median, count or month that the generated cells already hold.

   Three evidence states for a comparison, decided by one visible rule set (CONFIG below, changeable in one place):
     stronger      last 12 months, at least 5 sales and 3 active months on each side, each side's latest sale within 6 months of the data end,
                   and the matched sizes cover more than half of each project's sales in that window.
     limited       meets the minimum (2 sales and 2 months on each side in a shared size band) but not the stronger rule, or rests on older evidence.
     insufficient  no shared size band meets the minimum in any window, no shared sale type, or full-history evidence whose latest sale is over 24 months old.
   Limited and insufficient evidence never produce a verdict. Wording never says cheaper, better, value, winner or recommend.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KPT_EVIDENCE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- the rules: edit here only ---------- */
  const CONFIG = {
    version: 'evidence-v1',
    // A shared size band qualifies for any comparison at all (the V11 minimum).
    minimum: { sales: 2, months: 2 },
    // Stronger evidence needs every one of these.
    stronger: { window: 0, sales: 5, months: 3, maxMonthsSinceLatest: 6, minCoverage: 0.5 /* exclusive */ },
    // Full-history evidence is only usable while both sides still trade.
    allHistoryMaxMonthsSinceLatest: 24,
    // A gap under this, with overlapping middle ranges, is described as close.
    closeGapPct: 5,
    // A development's page: how much transaction analysis it can carry on its own.
    project: { analysis: { sales12: 6, months12: 3, bandSales: 3, maxMonthsSinceLatest: 6 }, recentMonths: 24 },
  };

  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const mIdx = (s) => { const a = String(s).split('-').map(Number); return a[0] * 12 + a[1] - 1; };
  const cfgOf = (o) => (o && o.cfg) || CONFIG;
  const pctText = (p) => (p < 10 ? String(Math.round(p * 10) / 10) : String(Math.round(p))) + '%';

  /* ---------- the qualifying shared bands of one view (one window) ---------- */
  function qualifyingBands(M, cfg) {
    const mn = cfg.minimum;
    return (M.bands || []).filter((b) => b.a.n >= mn.sales && b.b.n >= mn.sales && b.a.evidence.months >= mn.months && b.b.evidence.months >= mn.months);
  }
  // The headline band: most sales on the weaker side, then most sales overall, then the smaller size.
  function pickHeadline(q) {
    return q.slice().sort((x, y) => Math.min(y.a.n, y.b.n) - Math.min(x.a.n, x.b.n) || (y.a.n + y.b.n) - (x.a.n + x.b.n) || x.bin - y.bin)[0] || null;
  }
  function sideOf(s) {
    return { n: s.n, months: s.evidence.months, monthsAgo: s.evidence.monthsAgo, latest: s.evidence.latest, latestLabel: s.evidence.latestLabel, med: s.psf.med, q1: s.psf.q1, q3: s.psf.q3 };
  }
  function gapOf(b) {
    const ma = b.a.psf.med, mb = b.b.psf.med, lo = Math.min(ma, mb), abs = Math.abs(ma - mb);
    return { abs, pct: lo ? abs / lo * 100 : 0, dir: abs === 0 ? 'level' : mb > ma ? 'b' : 'a', rangesOverlap: b.gap.rangesOverlap };
  }

  /* ---------- the state of one view ---------- */
  // M: result of analyseComparison for ONE window. Returns the state and every reason behind it.
  function stateOf(M, opts) {
    const cfg = cfgOf(opts), names = { a: M.a.name, b: M.b.name };
    const out = { version: cfg.version, state: 'insufficient', label: 'Insufficient evidence', windowIndex: M.activeWindow, windowLabel: M.windowLabel, older: !!M.older, band: null, qualifying: [], coverage: { a: 0, b: 0 }, mixed: false, close: false, reasons: [], strengthen: [], names };
    if (!M.sale || !M.sale.selected) { out.reasons.push({ id: 'no-shared-sale-type', text: 'The two developments have no sale type in common, so there is nothing to match.' }); out.strengthen.push('A sale type both developments have transactions in.'); return out; }
    const lad = M.ladder && M.ladder[M.activeWindow], q = qualifyingBands(M, cfg);
    if (!q.length) {
      out.reasons.push({ id: 'no-qualifying-band', text: lad && lad.hasMatch ? 'The size bands both developments sold in were too thin in this window: each side needs at least ' + cfg.minimum.sales + ' sales over ' + cfg.minimum.months + ' months in the same size band.' : 'No size band has sales on both sides in the ' + (M.windowLabel || 'this window') + '.' });
      out.strengthen.push('Sales on both sides in the same size band, over at least ' + cfg.minimum.months + ' months.');
      return out;
    }
    const h = pickHeadline(q), g = gapOf(h), all = M.ladder.length - 1;
    const aN = q.reduce((t, b) => t + b.a.n, 0), bN = q.reduce((t, b) => t + b.b.n, 0);
    const cov = { a: lad && lad.coverage.aOf ? aN / lad.coverage.aOf : 0, b: lad && lad.coverage.bOf ? bN / lad.coverage.bOf : 0 };
    const age = Math.max(h.a.evidence.monthsAgo, h.b.evidence.monthsAgo);
    out.qualifying = q.map((b) => b.bin); out.coverage = cov;
    out.band = { bin: h.bin, label: h.label, short: h.short, a: sideOf(h.a), b: sideOf(h.b), gap: g };
    const dirs = q.map((b) => gapOf(b).dir); out.mixed = dirs.indexOf('a') > -1 && dirs.indexOf('b') > -1;
    out.close = g.dir !== 'level' && g.pct < cfg.closeGapPct && g.rangesOverlap;
    if (M.activeWindow === all && age > cfg.allHistoryMaxMonthsSinceLatest) {
      out.band = null; out.reasons.push({ id: 'all-history-stale', text: 'The only shared evidence is from the full history, and the latest matched sale on one side is over ' + cfg.allHistoryMaxMonthsSinceLatest + ' months old. Old sales do not support a price comparison today.' });
      out.strengthen.push('A more recent sale in a shared size band on both sides.'); return out;
    }
    // reasons the evidence is not stronger
    const s = cfg.stronger, r = out.reasons, minN = Math.min(h.a.n, h.b.n), minMo = Math.min(h.a.evidence.months, h.b.evidence.months);
    if (M.activeWindow !== s.window) r.push({ id: 'older-window', text: 'This rests on the ' + M.windowLabel + ', not the last 12 months.' });
    if (minN < s.sales) { const w = h.a.n <= h.b.n ? names.a : names.b; r.push({ id: 'few-sales', text: w + ' has ' + plural(minN, 'sale') + ' in the ' + h.label + ' band. Stronger evidence needs at least ' + s.sales + ' on each side.' }); }
    if (minMo < s.months) { const w = h.a.evidence.months <= h.b.evidence.months ? names.a : names.b; r.push({ id: 'few-months', text: w + '’s sales in this band fall in only ' + plural(minMo, 'month') + '. Stronger evidence needs at least ' + s.months + '.' }); }
    if (age > s.maxMonthsSinceLatest) { const w = h.a.evidence.monthsAgo >= h.b.evidence.monthsAgo ? [names.a, h.a.evidence.latestLabel] : [names.b, h.b.evidence.latestLabel]; r.push({ id: 'stale', text: w[0] + '’s latest sale in this band was ' + w[1] + ', more than ' + s.maxMonthsSinceLatest + ' months before the data ends.' }); }
    if (!(cov.a > s.minCoverage && cov.b > s.minCoverage)) r.push({ id: 'coverage', text: 'The matched sizes cover ' + Math.round(cov.a * 100) + '% of ' + names.a + '’s and ' + Math.round(cov.b * 100) + '% of ' + names.b + '’s sales in this window. Stronger evidence needs more than half of each.' });
    if (!r.length) { out.state = 'stronger'; out.label = 'Stronger evidence'; }
    else {
      out.state = 'limited'; out.label = 'Limited evidence';
      const ids = r.map((x) => x.id);
      if (ids.indexOf('older-window') > -1 || ids.indexOf('stale') > -1) out.strengthen.push('A recent sale (within 6 months) in a shared size band on both sides.');
      if (ids.indexOf('few-sales') > -1 || ids.indexOf('few-months') > -1) out.strengthen.push('More sales, spread over more months, in the same size band on both sides.');
      if (ids.indexOf('coverage') > -1) out.strengthen.push('Sales in more of the same size bands on both sides.');
    }
    return out;
  }

  /* ---------- the window to open on: the first one that gives anything usable ---------- */
  // analyse(windowIndex) must return analyseComparison output for that window. Returns {windowIndex, state} or null when no window qualifies.
  function defaultWindow(analyse, windows, opts) {
    for (let i = 0; i < windows; i++) { const M = analyse(i), s = stateOf(M, opts); if (s.state !== 'insufficient') return { windowIndex: i, state: s }; }
    return null;
  }

  /* ---------- wording: deterministic, descriptive, never a verdict ---------- */
  function wording(ev, M) {
    const A = ev.names.a, B = ev.names.b, sale = M.sale && M.sale.label ? M.sale.label : 'transaction';
    if (!ev.band) return { kind: 'none', title: 'Not enough matched evidence to compare prices.', figure: null, sub: '', text: 'The sales on record do not give both developments enough transactions in the same size band to compare prices fairly. Each development’s own numbers are shown instead.' };
    const g = ev.band.gap, hi = g.dir === 'a' ? A : B, lo = g.dir === 'a' ? B : A, p = pctText(g.pct), amt = '$' + num(g.abs);
    const where = 'in the ' + ev.band.label + ' band (' + sale + ' sales, ' + (ev.windowLabel || 'this window') + ')';
    if (ev.state === 'stronger') {
      let text, title, sub;
      if (g.dir === 'level') { title = 'The middle PSF is the same'; sub = 'In the ' + ev.band.label + ' band both developments have the same median.'; text = 'The two developments have the same median PSF ' + where + '.'; }
      else if (ev.close) { title = amt + ' psf apart'; sub = p + ' · close: the middle ranges overlap'; text = hi + ' has the higher median PSF ' + where + ', by ' + amt + ' (' + p + '). The middle ranges overlap, so the sales are close.'; }
      else { title = amt + ' psf apart'; sub = hi + ' is ' + p + ' higher'; text = hi + ' has the higher median PSF ' + where + ', by ' + amt + ' (' + p + '). The middle ranges ' + (g.rangesOverlap ? 'overlap' : 'do not overlap') + '.'; }
      if (ev.mixed) text += ' Other sizes point the other way, so this is not a pattern across the whole project.';
      return { kind: g.dir === 'level' ? 'level' : ev.close ? 'close' : 'gap', title, figure: amt, sub, text };
    }
    // limited: indicative, small, always with the sample sizes
    const n = A + ' ' + plural(ev.band.a.n, 'sale') + ', ' + B + ' ' + ev.band.b.n;
    const t = g.dir === 'level' ? 'Indicative only: the median PSF is the same ' + where + '. Sample sizes: ' + n + '.' : 'Indicative only: ' + hi + ' has the higher median PSF ' + where + ', by ' + p + ' (' + amt + ' psf). Sample sizes: ' + n + '. This is a first look, not a conclusion.';
    return { kind: 'indicative', title: 'Limited evidence', figure: g.dir === 'level' ? null : p, sub: n, text: t };
  }

  /* ---------- a development's page: what it can carry ---------- */
  // project: one entry from the generated detail shards; m: the manifest. Returns 'analysis' | 'summary' | 'directory' with the facts behind it.
  function projectExperience(project, m, opts) {
    const cfg = cfgOf(opts), pc = cfg.project, a = pc.analysis;
    const total = project.sale ? (project.sale.new || 0) + (project.sale.sub || 0) + (project.sale.resale || 0) : 0;
    const out = { experience: 'directory', reason: 'no-transactions', lead: null };
    if (!total) return out;
    const lastAll = project.last ? mIdx(m.latestMonth) - mIdx(project.last) : 999;
    const w12 = m.windows.indexOf(12), codes = { resale: 3, new: 1, sub: 2 };
    const monthly = (s) => { const mo = (project.monthly && project.monthly[s]) || [], o = []; for (let i = 0; i < mo.length; i += 2) o.push(mo[i]); return o; };
    const st = {};
    ['resale', 'new', 'sub'].forEach((s) => {
      const per = project.periods && project.periods[s], n12 = per && per[0] ? per[0][0] : 0;
      const act12 = monthly(s).filter((o) => o >= m.months - 12).length;
      const cells = (project.cells || []).filter((c) => c[0] === codes[s] && c[2] === w12);
      const maxBand = cells.reduce((t, c) => Math.max(t, c[3]), 0), last = cells.reduce((t, c) => Math.max(t, c[6]), 0);
      const sinceLatest = last ? mIdx(m.latestMonth) - ((Math.floor(last / 100)) * 12 + (last % 100 - 1)) : 999;
      st[s] = { n12, act12, maxBand, sinceLatest };
    });
    // the leading sale type: most sales in the last 12 months, resale on a tie
    const lead = ['resale', 'new', 'sub'].sort((x, y) => st[y].n12 - st[x].n12 || (x === 'resale' ? -1 : y === 'resale' ? 1 : 0))[0], L = st[lead];
    out.lead = lead; out.facts = { saleType: lead, sales12: L.n12, months12: L.act12, bandMax: L.maxBand, monthsSinceLatest: L.sinceLatest, monthsSinceAny: lastAll };
    if (L.n12 >= a.sales12 && L.act12 >= a.months12 && L.maxBand >= a.bandSales && L.sinceLatest <= a.maxMonthsSinceLatest) { out.experience = 'analysis'; out.reason = 'enough-recent-evidence'; return out; }
    if (lastAll <= pc.recentMonths - 1) { out.experience = 'summary'; out.reason = L.n12 < a.sales12 ? 'few-recent-sales' : L.act12 < a.months12 ? 'few-active-months' : L.maxBand < a.bandSales ? 'no-size-band-with-enough-sales' : 'latest-sale-not-recent'; return out; }
    out.experience = 'directory'; out.reason = 'no-sale-in-' + pc.recentMonths + '-months'; return out;
  }

  return { CONFIG, qualifyingBands, pickHeadline, stateOf, defaultWindow, wording, projectExperience, gapOf, pctText, num };
});
