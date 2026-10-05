#!/usr/bin/env node
/* CALIBRATION ONLY (not the product engine). Applies the approved V1 engine spec rules, with ONE set of thresholds
   (engine-config.json), to the real URA transactions at several budgets, and reports what the engine would select.
   Usage: node calibrate.js --raw raw --out out [--budgets 900000,1000000,1320000,1600000,2000000,2500000,3500000]
   Output: out/calibration-report.txt (aggregates only: no project names, no individual deals). */
const fs = require('fs'), path = require('path');
const { quantile, flatten } = require('./build-bands.js');
const { prepare } = require('./budget-window.js');
const LEVEL = ['Insufficient', 'Concentrated', 'Usable', 'Solid'];
const FH = 'Freehold / 999-yr', REGION = { OCR: 0, RCR: 1, CCR: 2 }, AGE = { '0–10': 0, '10–25': 1, '25+': 2 };
const r10 = (v) => Math.round(v / 10000) * 10000;
const sz = (v, E) => Math.round(v / E.size_rounding) * E.size_rounding;
const pc = (v) => Math.round(v * 100) + '%', mm = (v) => '$' + (v / 1e6).toFixed(2) + 'm';
const key = (r) => [r.region, r.status, r.tenure].join('|');
const rid = (r) => r.region + ' ' + (r.status === 'New' ? 'new' : r.tenure === FH ? 'FH/999' : 'resale ' + r.tenure);

function stat(g) {
  const p = g.map((x) => x.price).sort((a, b) => a - b), s = g.map((x) => x.sqft).sort((a, b) => a - b), c = {};
  g.forEach((x) => { c[x.project] = (c[x.project] || 0) + 1; });
  return { n: g.length, projects: Object.keys(c).length, top: Math.max.apply(null, Object.values(c)) / g.length, medPrice: quantile(p, 0.5), med: quantile(s, 0.5), lo: quantile(s, 0.25), hi: quantile(s, 0.75) };
}
function byRoute(rows, lo, hi) { const g = {}; rows.forEach((r) => { if (r.price >= lo && r.price <= hi) (g[key(r)] = g[key(r)] || []).push(r); }); const o = {}; Object.keys(g).forEach((k) => { o[k] = stat(g[k]); }); return o; }
function broad(rows) { const g = {}; rows.forEach((r) => { (g[key(r)] = g[key(r)] || []).push(r.price); }); const o = {}; Object.keys(g).forEach((k) => { const p = g[k].sort((a, b) => a - b); o[k] = { p25: quantile(p, 0.25), p75: quantile(p, 0.75), n: p.length }; }); return o; }
function gradeOf(st, isNew, E) {
  if (!st || st.n < E.discovery_min_n) return 'Insufficient';
  let g = (st.n >= E.solid_min_n && st.projects >= E.solid_min_projects && st.top < E.solid_max_top) ? 'Solid'
    : (st.n >= E.usable_min_n && st.projects >= E.usable_min_projects && st.top < E.usable_max_top) ? 'Usable' : 'Concentrated';
  if (isNew && LEVEL.indexOf(g) > LEVEL.indexOf(E.new_launch_grade_cap)) g = E.new_launch_grade_cap;
  return g;
}
function direction(attr, hi, lo) {
  if (attr === 'region') return REGION[hi.region] < REGION[lo.region] ? 'outer-larger' : 'inner-larger';
  if (attr === 'status') return hi.status === 'Resale' ? 'resale-larger' : 'new-larger';
  if (attr === 'tenure type') return hi.tenure === FH ? 'freehold-larger' : 'leasehold-larger';
  return AGE[hi.tenure] > AGE[lo.tenure] ? 'older-larger' : 'newer-larger';
}
function testPair(a, b, E, attr) {
  const [hi, lo] = a.st.med >= b.st.med ? [a, b] : [b, a];
  const ratio = hi.st.med / lo.st.med, diff = hi.st.med - lo.st.med, reasons = [];
  if (ratio < E.min_ratio || diff < E.min_abs_diff_sqft) reasons.push('NOT_MATERIAL');
  const overlap = Math.min(hi.st.hi, lo.st.hi) - Math.max(hi.st.lo, lo.st.lo);
  if (E.require_iqr_separation && !(hi.st.lo > lo.st.hi)) reasons.push('IQR_OVERLAP');
  if (hi.w && lo.w) { const rw = hi.w.med / lo.w.med; if (rw < 1) reasons.push('REVERSED_WIDE'); else if (rw < E.stability_min_ratio_wide) reasons.push('UNSTABLE_PAIR'); } else reasons.push('UNSTABLE_PAIR');
  const narrowW = Math.min(hi.st.hi - hi.st.lo, lo.st.hi - lo.st.lo);
  return { attr, hi, lo, ratio, reasons, ok: !reasons.length, overlap: Math.max(0, overlap), overlapShare: narrowW > 0 ? Math.max(0, overlap) / narrowW : 9 };
}

function evaluate(B, priv, ec, privBroad, E) {
  const lo = r10(B * (1 - E.narrow_pct / 100)), hi = r10(B * (1 + E.narrow_pct / 100)), loW = r10(B * (1 - E.wide_pct / 100)), hiW = r10(B * (1 + E.wide_pct / 100));
  const nar = byRoute(priv, lo, hi), wid = byRoute(priv, loW, hiW);
  const sum = (o) => Object.keys(o).reduce((a, k) => a + o[k].n, 0);
  const out = { B, lo, hi, loW, hiW, nDeals: sum(nar), wDeals: sum(wid), routes: [], pairs: { total: 0, confounded: 0, single: 0, pass: 0 }, insights: [], selected: [], absorbed: [], skipped: [], fallback: [], ec: null, nearPass: [], gradeCount: {}, insufficient: { routes: 0, deals: 0 } };
  Object.keys(nar).forEach((k) => {
    const [region, status, tenure] = k.split('|'), st = nar[k], w = wid[k];
    if (st.n < E.discovery_min_n) { out.insufficient.routes++; out.insufficient.deals += st.n; return; }
    const isNew = status === 'New', grade = gradeOf(st, isNew, E), wg = gradeOf(w, isNew, E);
    const unstable = !!w && (LEVEL.indexOf(grade) - LEVEL.indexOf(wg) > 1 || Math.abs(w.med / st.med - 1) > E.stability_median_shift);
    const b = privBroad[k], low = !!b && B < b.p25;
    const weight = unstable ? E.grade_weight.Concentrated : E.grade_weight[grade];
    out.routes.push({ key: k, region, status, tenure, st, w, grade, wg, unstable, weight, low, broad: b });
    out.gradeCount[grade] = (out.gradeCount[grade] || 0) + 1;
  });
  const totalN = out.routes.reduce((a, r) => a + r.st.n, 0);
  // fallback: thin market
  if (out.wDeals < E.thin_market_wide_deals || out.routes.length < 2) out.fallback.push('THIN_MARKET');
  // discovery
  const pairs = [];
  for (let i = 0; i < out.routes.length; i++) for (let j = i + 1; j < out.routes.length; j++) {
    const a = out.routes[i], b = out.routes[j]; out.pairs.total++;
    const diff = []; if (a.region !== b.region) diff.push('region'); if (a.status !== b.status) diff.push('status');
    if (a.status === 'Resale' && b.status === 'Resale' && a.tenure !== b.tenure) diff.push((a.tenure === FH || b.tenure === FH) ? 'tenure type' : 'age');
    if (diff.length !== 1) { out.pairs.confounded++; continue; }
    out.pairs.single++;
    const p = testPair(a, b, E, diff[0]); p.dir = direction(diff[0], p.hi, p.lo);
    p.conf = Math.min(a.weight, b.weight); p.nLow = (a.low ? 1 : 0) + (b.low ? 1 : 0); p.ctx = E.context_factor[p.nLow];
    p.cov = (a.st.n + b.st.n) / totalN; p.score = Math.log(p.ratio) * p.conf * p.ctx * (E.coverage_base + p.cov);
    pairs.push(p);
  }
  // conflict
  const attrs = Array.from(new Set(pairs.map((p) => p.attr))), conflicted = [];
  attrs.forEach((at) => {
    const ok = pairs.filter((p) => p.attr === at && p.ok), dirs = Array.from(new Set(ok.map((p) => p.dir)));
    if (dirs.length < 2) return;
    const w = dirs.map((d) => ({ d, s: ok.filter((p) => p.dir === d).reduce((a, p) => a + p.score, 0) })).sort((x, y) => y.s - x.s);
    if (w[0].s >= E.conflict_dominance * w[1].s) ok.filter((p) => p.dir !== w[0].d).forEach((p) => { p.ok = false; p.reasons.push('CONFLICT_LOSER'); });
    else { ok.forEach((p) => { p.ok = false; p.reasons.push('CONFLICTED'); }); conflicted.push(at); }
  });
  out.pairs.pass = pairs.filter((p) => p.ok).length;
  // near-pass (fail only on IQR overlap)
  const insightKeys = {};
  pairs.filter((p) => p.ok).forEach((p) => { insightKeys[p.attr + ':' + p.dir] = true; });
  out.nearPass = pairs.filter((p) => p.reasons.length === 1 && p.reasons[0] === 'IQR_OVERLAP' && p.conf >= E.support_min_conf)
    .map((p) => ({ attr: p.attr, dir: p.dir, hi: rid(p.hi), lo: rid(p.lo), ratio: p.ratio, overlap: p.overlap, overlapShare: p.overlapShare, clusterAlreadyShown: !!insightKeys[p.attr + ':' + p.dir] }));
  // insights
  const groups = {};
  pairs.filter((p) => p.ok).forEach((p) => { (groups[p.attr + ':' + p.dir] = groups[p.attr + ':' + p.dir] || []).push(p); });
  Object.keys(groups).forEach((k) => {
    const g = groups[k].sort((x, y) => y.score - x.score || y.conf - x.conf || y.cov - x.cov), head = g[0];
    const kSup = Math.min(E.support_cap, g.slice(1).filter((p) => p.conf >= E.support_min_conf).length);
    const involvesNew = head.hi.status === 'New' || head.lo.status === 'New';
    const label = head.conf >= 1 ? 'Solid' : head.conf >= E.support_min_conf ? 'Indicative' : 'Weak';
    out.insights.push({ key: k, head, pairs: g.length, support: g.slice(1).filter((p) => p.conf >= E.support_min_conf).length, score: head.score * (1 + E.support_bonus * kSup), label, involvesNew, status: 'candidate' });
  });
  out.insights.sort((a, b) => b.score - a.score || b.head.conf - a.head.conf || b.head.cov - a.head.cov || (a.key < b.key ? -1 : 1));
  // selection
  let concUsed = 0;
  out.insights.forEach((ins) => {
    if (conflicted.indexOf(ins.key.split(':')[0]) > -1) { ins.status = 'CONFLICTED'; return; }
    if (ins.score < E.min_insight_score) { ins.status = 'BELOW_MIN_SCORE'; return; }
    if (out.selected.length >= E.max_insights) { ins.status = 'MAX_INSIGHTS'; return; }
    const dup = out.selected.find((s) => s.head.hi.key === ins.head.hi.key && s.head.lo.region === ins.head.lo.region);
    if (dup) { ins.status = 'ABSORBED by ' + dup.key; out.absorbed.push(ins); return; }
    const conc = ins.head.hi.weight <= E.grade_weight.Concentrated || ins.head.lo.weight <= E.grade_weight.Concentrated;
    if (conc && concUsed >= E.max_indicative_insights) { ins.status = 'CONC_CAP'; return; }
    if (conc) concUsed++;
    ins.status = 'SELECTED'; out.selected.push(ins);
  });
  const selectable = out.insights.filter((i) => i.status === 'SELECTED' || i.status === 'CONC_CAP' || i.status === 'MAX_INSIGHTS');
  if (selectable.length && selectable.every((i) => i.head.conf <= E.grade_weight.Concentrated)) out.fallback.push('ONLY_CONCENTRATED');
  if (!out.insights.length && out.pairs.single > 0) out.fallback.push('NO_MEANINGFUL_DIFFERENCE');
  if (out.fallback.indexOf('THIN_MARKET') > -1) out.selected = [];
  else if (out.selected.length < E.min_insights) out.fallback.push('FEWER_THAN_' + E.min_insights + '_INSIGHTS');
  // flags per selected
  out.selected.forEach((i) => {
    const f = [], R = [i.head.hi, i.head.lo];
    R.forEach((r) => { if (r.low) f.push('LOW-END(' + rid(r) + ')'); if (r.grade === 'Concentrated') f.push('CONCENTRATED(' + rid(r) + ' top ' + pc(r.st.top) + ', ' + r.st.projects + ' proj)'); if (r.unstable) f.push('UNSTABLE(' + rid(r) + ')'); if (r.st.projects < E.few_projects_flag) f.push('FEW-PROJECTS(' + rid(r) + ' ' + r.st.projects + ')'); if ((r.st.hi - r.st.lo) / r.st.med < 0.08) f.push('TIGHT-IQR(' + rid(r) + ')'); });
    if (i.involvesNew) f.push('NEW-CAPPED'); if (i.support === 0) f.push('NO-SUPPORT'); if (i.head.cov < 0.05) f.push('LOW-COVERAGE'); if (i.head.ratio < 1.25) f.push('SMALL-EFFECT');
    i.flags = f;
  });
  out.visitor = visitorDraft(out, E);
  // EC
  const ecNar = byRoute(ec, lo, hi), ecWid = byRoute(ec, loW, hiW), ecRows = ec.filter((r) => r.price >= lo && r.price <= hi);
  const ecTotal = ecRows.length ? stat(ecRows) : null, newShare = ecRows.length ? ecRows.filter((r) => r.status === 'New').length / ecRows.length : 0;
  const ecGrade = ecTotal ? gradeOf(ecTotal, newShare >= 0.5, E) : 'Insufficient';
  const cross = [];
  Object.keys(ecNar).forEach((k) => {
    if (ecNar[k].n < E.discovery_min_n) return;
    const [region, status, tenure] = k.split('|'), pr = out.routes.find((r) => r.key === k);
    const ecr = { st: ecNar[k], w: ecWid[k], weight: E.grade_weight[gradeOf(ecNar[k], status === 'New', E)], tenure, status, region, key: 'EC ' + k };
    ecr.grade = gradeOf(ecNar[k], status === 'New', E);
    const row = { route: 'EC ' + rid({ region, status, tenure }), n: ecNar[k].n, projects: ecNar[k].projects, top: ecNar[k].top, med: ecNar[k].med, lo: ecNar[k].lo, hi: ecNar[k].hi, grade: ecr.grade };
    if (pr) { const t = testPair(ecr, pr, E, 'product'); row.cross = { vs: rid(pr), privMed: pr.st.med, ratio: t.ratio, ok: t.ok, reasons: t.reasons }; }
    cross.push(row);
  });
  out.ec = { total: ecTotal, grade: ecGrade, line: LEVEL.indexOf(ecGrade) >= LEVEL.indexOf(E.ec_min_grade), routes: cross, allDeals: ecRows.length };
  return out;
}
function visitorDraft(o, E) {
  if (o.fallback.indexOf('THIN_MARKET') > -1) return ['Few transactions at this budget in the last 12 months (' + o.wDeals + ' in the wide window): too few to compare reliably. Get Ken\'s view.'];
  const phrase = { 'age:older-larger': 'older homes gave more space', 'age:newer-larger': 'newer homes gave more space', 'status:resale-larger': 'resale homes were larger than new launches', 'status:new-larger': 'new launches were larger than resale', 'region:outer-larger': 'moving closer in meant less space', 'region:inner-larger': 'moving closer in meant more space', 'tenure type:freehold-larger': 'freehold/999-year homes were larger than leasehold', 'tenure type:leasehold-larger': 'leasehold homes were larger than freehold/999-year' };
  const L = [];
  if (o.selected.length && o.fallback.indexOf('ONLY_CONCENTRATED') < 0 && o.selected[0].label !== 'Weak') L.push('Lead: At around ' + mm(o.B) + ', the biggest difference was that ' + (phrase[o.selected[0].key] || o.selected[0].key) + '.');
  o.selected.forEach((i) => {
    const h = i.head, quals = [];
    if (h.hi.low || h.lo.low) quals.push('at this budget, ' + [h.hi, h.lo].filter((r) => r.low).map(rid).join(' and ') + ' are at the low end of what they normally cost, so these are entry-level homes');
    if (i.involvesNew) quals.push('indicative; ' + [h.hi, h.lo].filter((r) => r.status === 'New').map((r) => 'from only ' + r.st.projects + ' projects' + (r.st.top >= 0.5 ? ' (' + pc(r.st.top) + ' from one)' : '')).join(', '));
    L.push('[' + i.label + '] ' + rid(h.hi) + ' about ' + sz(h.hi.st.med, E) + ' sqft vs ' + rid(h.lo) + ' about ' + sz(h.lo.st.med, E) + ' sqft' + (quals.length ? ' (' + quals.join('; ') + ')' : '') + '.');
  });
  if (!L.length) L.push('No finding strong enough to show. Descriptive fallback or Get Ken\'s view.');
  return L;
}

function report(results, E, period) {
  const L = ['V1 engine calibration (one set of thresholds, all budgets)', 'Period: ' + period + '   Windows: narrow +/-' + E.narrow_pct + '%, wide +/-' + E.wide_pct + '% (edges rounded to $10k)', ''];
  results.forEach((o) => {
    L.push('==== ' + mm(o.B) + '   narrow ' + mm(o.lo) + '-' + mm(o.hi) + '   wide ' + mm(o.loW) + '-' + mm(o.hiW) + ' ====');
    L.push('Private deals: narrow ' + o.nDeals + ', wide ' + o.wDeals + '. Routes qualifying (n>=' + E.discovery_min_n + '): ' + o.routes.length + '   (' + Object.keys(o.gradeCount).map((g) => o.gradeCount[g] + ' ' + g).join(', ') + '); below-minimum routes: ' + o.insufficient.routes + ' holding ' + o.insufficient.deals + ' deals');
    o.routes.sort((a, b) => b.st.n - a.st.n).forEach((r) => L.push('   ' + rid(r).padEnd(18) + r.grade.padEnd(13) + 'n=' + String(r.st.n).padEnd(4) + 'proj=' + String(r.st.projects).padEnd(3) + 'top=' + pc(r.st.top).padEnd(5) + 'med=' + Math.round(r.st.med) + ' (' + Math.round(r.st.lo) + '-' + Math.round(r.st.hi) + ')  wide med=' + (r.w ? Math.round(r.w.med) : '-') + (r.low ? '  LOW-END' : '') + (r.unstable ? '  UNSTABLE' : '')));
    L.push('Pairs: ' + o.pairs.total + ' total, ' + o.pairs.confounded + ' confounded, ' + o.pairs.single + ' single-attribute, ' + o.pairs.pass + ' pass.');
    L.push('Insights found (score order): ' + (o.insights.length ? '' : 'none'));
    o.insights.forEach((i) => L.push('   ' + i.key.padEnd(28) + 'score ' + i.score.toFixed(3) + '  ' + i.label.padEnd(10) + 'headline ' + rid(i.head.hi) + ' (' + Math.round(i.head.hi.st.med) + ') > ' + rid(i.head.lo) + ' (' + Math.round(i.head.lo.st.med) + ')  ratio ' + i.head.ratio.toFixed(2) + '  support ' + i.support + '  => ' + i.status));
    L.push('Selected:'); if (!o.selected.length) L.push('   none');
    o.selected.forEach((i, n) => L.push('   #' + (n + 1) + ' ' + i.key + '  score ' + i.score.toFixed(3) + '  ' + i.label + '  flags: ' + (i.flags.length ? i.flags.join(', ') : 'none')));
    const e = o.ec;
    L.push('EC: ' + (e.total ? e.allDeals + ' deals, ' + e.total.projects + ' projects, top ' + pc(e.total.top) + ', median ' + Math.round(e.total.med) + ' sqft (' + Math.round(e.total.lo) + '-' + Math.round(e.total.hi) + '), grade ' + e.grade + (e.line ? ' -> EC line shown' : ' -> no EC line') : 'no EC deals in window'));
    e.routes.forEach((r) => L.push('   ' + r.route.padEnd(22) + 'n=' + r.n + ' proj=' + r.projects + ' top=' + pc(r.top) + ' med=' + Math.round(r.med) + ' (' + Math.round(r.lo) + '-' + Math.round(r.hi) + ') ' + r.grade + (r.cross ? '   vs private ' + r.cross.vs + ' (' + Math.round(r.cross.privMed) + '): ratio ' + r.cross.ratio.toFixed(2) + ' ' + (r.cross.ok ? 'PASS' : 'FAIL ' + r.cross.reasons.join('+')) : '   (no private counterpart)')));
    L.push('Fallback: ' + (o.fallback.length ? o.fallback.join(', ') : 'none'));
    L.push('Visitor draft:'); o.visitor.forEach((v) => L.push('   ' + v)); L.push('');
  });
  // cross-budget
  L.push('==== CROSS-BUDGET: selected insights ====');
  L.push('Budget'.padEnd(9) + '| #1'.padEnd(46) + '| #2'.padEnd(46) + '| #3');
  results.forEach((o) => { const c = [0, 1, 2].map((n) => o.selected[n] ? (o.selected[n].key + ' ' + o.selected[n].score.toFixed(2) + ' ' + o.selected[n].label[0]) : '-'); L.push(mm(o.B).padEnd(9) + '| ' + c[0].padEnd(44) + '| ' + c[1].padEnd(44) + '| ' + c[2]); });
  L.push('(S=Solid, I=Indicative, W=Weak)', '');
  // diagnostics
  L.push('==== DIAGNOSTICS ====');
  const all = []; results.forEach((o) => o.insights.forEach((i) => all.push({ B: o.B, key: i.key, score: i.score, status: i.status })));
  L.push('1. Insight scores across all budgets (' + all.length + ' insights):');
  all.sort((a, b) => b.score - a.score).forEach((a) => L.push('   ' + a.score.toFixed(3) + '  ' + mm(a.B) + '  ' + a.key + '  ' + a.status));
  const sel = all.filter((a) => a.status === 'SELECTED').map((a) => a.score), below = all.filter((a) => a.status === 'BELOW_MIN_SCORE').map((a) => a.score);
  L.push('   lowest selected: ' + (sel.length ? Math.min.apply(null, sel).toFixed(3) : '-') + '; highest below threshold: ' + (below.length ? Math.max.apply(null, below).toFixed(3) : '-'), '');
  L.push('2. Grades and borderline routes (within 3pp of a top-share limit, or n within 5 of 15/30, or projects within 1 of 4/8):');
  results.forEach((o) => { const bl = o.routes.filter((r) => Math.abs(r.st.top - E.solid_max_top) <= 0.03 || Math.abs(r.st.top - E.usable_max_top) <= 0.03 || Math.abs(r.st.n - 30) <= 5 || Math.abs(r.st.n - 15) <= 5 || Math.abs(r.st.projects - 8) <= 1 || Math.abs(r.st.projects - 4) <= 1); const cd = o.routes.filter((r) => r.grade === 'Concentrated').reduce((a, r) => a + r.st.n, 0), tot = o.routes.reduce((a, r) => a + r.st.n, 0); L.push('   ' + mm(o.B) + ': ' + o.routes.length + ' routes, ' + bl.length + ' borderline, ' + pc(tot ? cd / tot : 0) + ' of qualifying deals in Concentrated routes'); });
  L.push('', '3. Near-passes lost ONLY to strict IQR separation (conf>=0.7 pairs; overlap as % of the narrower IQR):');
  results.forEach((o) => { const np = o.nearPass.sort((a, b) => a.overlapShare - b.overlapShare); L.push('   ' + mm(o.B) + ': ' + np.length + ' near-passes; ' + np.filter((x) => x.overlapShare <= 0.25).length + ' overlap <=25%; ' + np.filter((x) => !x.clusterAlreadyShown).length + ' would be in a cluster NOT otherwise present'); np.slice(0, 3).forEach((x) => L.push('      ' + x.attr + ' ' + x.hi + ' > ' + x.lo + ' ratio ' + x.ratio.toFixed(2) + ' overlap ' + Math.round(x.overlap) + ' sqft (' + pc(x.overlapShare) + ')' + (x.clusterAlreadyShown ? '' : '  [cluster otherwise absent]'))); });
  const states = { THIN_MARKET: 0, ONLY_CONCENTRATED: 0, NO_MEANINGFUL_DIFFERENCE: 0, FEWER: 0 };
  results.forEach((o) => o.fallback.forEach((f) => { if (/FEWER/.test(f)) states.FEWER++; else states[f] = (states[f] || 0) + 1; }));
  L.push('', '4. Fallback frequency over ' + results.length + ' budgets: ' + Object.keys(states).map((k) => k + ' ' + states[k]).join(', '));
  L.push('', '5. Flags on selected insights (possible misleading results):'); results.forEach((o) => o.selected.forEach((i, n) => { if (i.flags.length) L.push('   ' + mm(o.B) + ' #' + (n + 1) + ' ' + i.key + ': ' + i.flags.join(', ')); }));
  return L.join('\n') + '\n';
}
module.exports = { evaluate, gradeOf, testPair, broad, byRoute, report, stat };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const rawDir = arg('raw', path.join(__dirname, 'raw')), outDir = arg('out', path.join(__dirname, 'out'));
  const budgets = arg('budgets', '900000,1000000,1320000,1600000,2000000,2500000,3500000').split(',').map(Number);
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')), E = JSON.parse(fs.readFileSync(path.join(__dirname, 'engine-config.json'), 'utf8'));
  const files = fs.readdirSync(rawDir).filter((x) => x.endsWith('.json')).map((x) => JSON.parse(fs.readFileSync(path.join(rawDir, x), 'utf8')));
  const d = prepare(flatten(files), cfg), pb = broad(d.private);
  const res = budgets.map((b) => evaluate(b, d.private, d.ec, pb, E));
  const text = report(res, E, d.period);
  fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, 'calibration-report.txt'), text); console.log(text);
}
