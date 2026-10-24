#!/usr/bin/env node
/* ==========================================================================
   GROUNDWORK — URA-first bedroom classification for every development, with layout tables where they pass their checks.

   Per sale, one of three tiers (never a URA field; always labelled):
     verified      the sale's area fits a layout table that passed layout-quality.js (or one Ken approved), and URA rental evidence
                   does not contradict it
     inferred      no usable layout says otherwise, and URA rental contracts support one bedroom count for that size (rental-engine.js)
     unclassified  ambiguous layouts, mixed / sparse / unrepresentative / no rental evidence, or a CONTRADICTION between the layouts and
                   the rentals (reported, never resolved by guessing)

     node tools/market-data/bedroom-hybrid.js --raw <URA folder> --layouts <private folder> --out <private folder> [--extracted <folder>]
          [--previous <snapshot.json>] [--to YYYY-MM] [--public <file> [--allow-rental]] [--rental-quarters N --comparison]
   Rental contracts: the latest 12 quarter files in the folder, enforced (rental-window.js). Another window needs --comparison, and a
   comparison run cannot write --public.

   Output (private): hybrid-report.json (per development: tiers, groups, Market Pulse by size band and by bedroom type, bias and mix checks,
   layout-table quality, contradictions), snapshot.json (per area decisions, for the next refresh), changes.json (against --previous).
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const E = require('./bedroom-engine.js'), RW = require('./rental-window.js'), RE = require('./rental-engine.js'), Q = require('./layout-quality.js'), B = require('./bench-rental.js');
const P_ = require('../../assets/js/kpt-project.js');

const TRUSTED = ['developer', 'approved'];
function classifyDevelopment(rows, P, rentals, ctx, rule) {
  const cs = RE.contracts(rentals), cl = RE.cells(cs), sctx = RE.salesContext(rows, cl);
  const lq = P && P.layouts.length ? Q.check(P.layouts, rows, rentals) : null;
  const trusted = !!(P && P.layouts.length && (lq.verdict === 'usable' || TRUSTED.indexOf(P.status) > -1));
  const memo = new Map(), contradictions = [];
  const decide = (t) => {
    const a = String(t.areaRaw != null ? t.areaRaw : t.sqm);
    if (memo.has(a)) return memo.get(a);
    const lay = trusted ? E.classify(a, P.layouts) : null, ren = RE.classifySale(a, cl, rule, sctx);
    let d;
    if (lay && (lay.cls === 'A' || lay.cls === 'B')) {
      const beds = Array.from(new Set(P.layouts.filter((l) => lay.codes.indexOf(l.code) > -1).map((l) => l.bedrooms)));
      if (ren.cls === 'inferred' && beds.length === 1 && ren.beds !== beds[0]) {
        d = { cls: 'C', group: null, groups: [], codes: lay.codes, tier: 'unclassified', reason: 'contradiction' };
        contradictions.push({ sqm: a, layouts: beds[0], rental: ren.beds, contracts: ren.n, purity: Math.round(ren.purity * 1000) / 1000, codes: lay.codes });
      } else d = Object.assign({}, lay, { tier: 'verified', rental: ren.cls === 'inferred' ? 'agrees' : ren.cls });
    } else if (ren.cls === 'inferred') {
      d = { cls: 'B', group: String(ren.beds), codes: [], tier: 'inferred', evidence: { contracts: ren.n, purity: Math.round(ren.purity * 1000) / 1000, strength: ren.tier } };
    } else {
      d = { cls: lay && lay.cls === 'C' ? 'C' : 'D', group: null, groups: lay && lay.groups ? lay.groups : [], codes: lay ? lay.codes : [], near: lay ? lay.near : null, tier: 'unclassified',
        reason: lay ? (lay.cls === 'C' ? 'layouts with different bedroom counts' : 'no layout fits') + '; rental ' + ren.cls : 'rental ' + ren.cls };
    }
    memo.set(a, d); return d;
  };
  const Pany = P || { project: rows.length ? rows[0].project : '', layouts: [], status: 'none', publishable: false };
  const res = E.analyse(rows, Pany, ctx, { decide });
  const S = res.summary;
  S.layoutQuality = lq; S.layoutsTrusted = trusted;
  S.rental = { contracts: cs.length, dropped: cs.dropped, bandConflicts: cs.bandConflicts };
  S.contradictions = contradictions;
  S.mapping = Array.from(memo.entries()).map(([a, d]) => ({ sqm: a, tier: d.tier, group: d.group, reason: d.reason || null })).sort((x, y) => Number(x.sqm) - Number(y.sqm));
  return S;
}

/* ---------- refresh: what changed since the last accepted run ---------- */
function snapshot(report) {
  const o = { asOf: report.asOf, latestMonth: report.latestMonth, rentalWindow: report.rentalWindow ? { from: report.rentalWindow.from, to: report.rentalWindow.to, quarters: report.rentalWindow.quarters.length } : null, comparison: !!report.comparison, developments: {} };
  report.developments.forEach((d) => { o.developments[d.project] = { share: d.totals.all.share, tiers: d.totals.tiers, map: Object.fromEntries(d.mapping.map((m) => [m.sqm, m.group == null ? null : m.tier[0] + ':' + m.group])) }; });
  return o;
}
function changes(prev, next, minShift) {
  minShift = minShift || 0.05;
  const out = { contradictions: [], coverageDrops: [], coverageGains: [], newDevelopments: [], removed: [] };
  Object.keys(next.developments).forEach((p) => {
    const n = next.developments[p], q = prev.developments[p];
    if (!q) { out.newDevelopments.push(p); return; }
    Object.keys(n.map).forEach((a) => { const was = q.map[a], now = n.map[a]; if (was && now && was.split(':')[1] !== now.split(':')[1]) out.contradictions.push({ project: p, sqm: a, was, now }); });
    const d = (n.share || 0) - (q.share || 0);
    if (d <= -minShift) out.coverageDrops.push({ project: p, was: q.share, now: n.share }); else if (d >= minShift) out.coverageGains.push({ project: p, was: q.share, now: n.share });
  });
  Object.keys(prev.developments).forEach((p) => { if (!next.developments[p]) out.removed.push(p); });
  return out;
}

function loadDb(dirs) {
  let csv = 'project,code,bedrooms,variant,sqm,sqft,source,status,note\n', src = 'id,project,title,url,retrieved,kind,note\n';
  dirs.filter(Boolean).forEach((d) => fs.readdirSync(d).filter((f) => /\.csv$/.test(f) && f !== 'sources.csv' && f !== 'ranges.csv').forEach((f) => { csv += fs.readFileSync(path.join(d, f), 'utf8').split(/\r?\n/).slice(1).filter((l) => l.trim()).join('\n') + '\n'; }));
  dirs.filter(Boolean).forEach((d) => { const f = path.join(d, 'sources.csv'); if (fs.existsSync(f)) src += fs.readFileSync(f, 'utf8').split(/\r?\n/).slice(1).filter((l) => l.trim()).join('\n') + '\n'; });
  return E.loadLayouts(csv, src);
}
// A development with a curated table (layouts.csv) keeps it; an extracted table is used only where there is no curated one.
function preferCurated(curated, extracted) {
  const out = new Map(curated);
  extracted.forEach((P, name) => { const c = out.get(name); if (!c || !c.layouts.length) out.set(name, P); });
  return out;
}

function run(o) {
  if (o.public && o.comparison) throw new Error('a comparison run (non-standard rental window) cannot write public output');
  const { dev, rent, rentalWindow } = B.loadAll(o.raw, { rentalQuarters: o.rentalQuarters, comparison: o.comparison });
  const cap = o.to ? Number(o.to.slice(0, 4)) * 12 + Number(o.to.slice(5, 7)) - 1 : Infinity;
  let latest = 0; dev.forEach((d) => { d.rows = d.rows.filter((t) => t.ym <= cap); d.rows.forEach((t) => { if (t.ym > latest) latest = t.ym; }); });
  const curated = loadDb([o.layouts]), db = o.extracted ? preferCurated(curated, loadDb([o.extracted])) : curated;
  const ctx = { latest, periodMonths: 12, periods: 5, bin: 100 }, ymS = (ym) => Math.floor(ym / 12) + '-' + String(ym % 12 + 1).padStart(2, '0');
  const report = { asOf: o.asOf || null, latestMonth: ymS(latest), rule: RE.RULE, rentalWindow: { wanted: rentalWindow.wanted, standard: rentalWindow.wanted === RW.WINDOW_QUARTERS, from: rentalWindow.from, to: rentalWindow.to, quarters: rentalWindow.quarters, missing: rentalWindow.missing, complete: rentalWindow.complete, behindSales: RW.lag(rentalWindow, latest) }, comparison: !!o.comparison, developments: [] };
  dev.forEach((D, name) => {
    if (D.cls === 'cluster' || !D.rows.length) return;
    const S = classifyDevelopment(D.rows.map((t) => Object.assign({ project: name }, t)), db.get(name), rent.get(name) || [], ctx);
    S.project = name; S.id = P_.slugify(name); S.cls = D.cls; S.layoutSource = db.get(name) ? db.get(name).status : 'none';
    report.developments.push(S);
  });
  fs.mkdirSync(o.out, { recursive: true });
  fs.writeFileSync(path.join(o.out, 'hybrid-report.json'), JSON.stringify(report));
  const snap = snapshot(report); fs.writeFileSync(path.join(o.out, 'snapshot.json'), JSON.stringify(snap));
  if (o.public) { fs.mkdirSync(path.dirname(o.public), { recursive: true }); fs.writeFileSync(o.public, JSON.stringify(publicView(report, { allowRental: !!o.allowRental }))); }
  let ch = null; if (o.previous && fs.existsSync(o.previous)) { ch = changes(JSON.parse(fs.readFileSync(o.previous, 'utf8')), snap); fs.writeFileSync(path.join(o.out, 'changes.json'), JSON.stringify(ch, null, 1)); }
  return { report, changes: ch };
}

/* ---------- public aggregates (for a later, approved release; nothing reads this file yet) ---------- */
// Same shape as data/projects/bedroom.json v1 (gw-bedroom.js), plus each type's basis: how many of its sales are layout-verified and how
// many rental-inferred. Rules: a development needs at least RULES.minCoverage of its resales classified; a type is left out when more than
// RULES.maxAmbiguousShare of its possible resales were ambiguous; a type whose layout mix alone moves its median keeps counts, not a direction.
// opt.allowRental=false publishes layout-verified figures only (the approved scope so far); true adds rental-inferred types.
const RULES = { minCoverage: 0.7, maxAmbiguousShare: 0.2, typical: { n: 5, months: 3 } };
function publicView(report, opt) {
  opt = opt || {};
  if (report.comparison || (report.rentalWindow && report.rentalWindow.standard === false)) throw new Error('public output needs the standard rental window (' + RW.WINDOW_QUARTERS + ' quarters); this report is a comparison');
  const ymToInt = (ym) => (ym == null ? null : Math.floor(ym / 12) * 100 + (ym % 12) + 1);
  const pub = { v: 2, kind: 'gw-bedroom', asOf: report.asOf, latestMonth: report.latestMonth, rules: RULES,
    basis: 'Bedroom type is inferred by Groundwork, never a URA field: from the developer\'s floor-plan areas where a checked layout table exists, otherwise from the bedroom counts declared in URA rental contracts for homes of the same size. Sales that could be more than one type are left out.', developments: {} };
  report.developments.forEach((d) => {
    const cov = d.totals.resale ? d.totals.resale.share : null; if (cov == null || cov < RULES.minCoverage) return;
    const groups = [];
    Object.keys(d.groups).forEach((g) => {
      const G = d.groups[g], rs = G.sales.resale, tiers = G.tiers || {};
      if (!opt.allowRental && (tiers.inferred || 0) > 0) return;
      if (rs && rs.ambiguousShare != null && rs.ambiguousShare > RULES.maxAmbiguousShare) return;
      const sales = {}; Object.keys(G.sales).forEach((k) => { const X = G.sales[k], c = (q) => ({ n: q.n, act: q.act, last: ymToInt(q.last), psf: q.psf, price: q.price, typical: q.n >= RULES.typical.n && q.act >= RULES.typical.months }); sales[k] = { all: c(X.all), p0: c(X.periods[0]), p1: c(X.periods[1]) }; });
      const pr = d.pulse.byGroup[g] || { evidence: 'none' }, mix = d.mix[g];
      groups.push({ g, label: G.label, sqft: G.sqm.map((v) => Math.round(v * 10.7639 / 10) * 10), n: G.n, basis: { verified: tiers.verified || 0, inferred: tiers.inferred || 0 }, sales,
        pulse: pr.evidence === 'none' ? { evidence: 'none' } : mix && mix.flag ? { evidence: pr.evidence, dir: null, mixShift: true } : { evidence: pr.evidence, dir: pr.dir, pct: pr.pct, withinNoise: pr.withinNoise } });
    });
    if (groups.length) pub.developments[d.id] = { name: d.project, cls: d.cls, coverage: { resale: cov, all: d.totals.all.share }, groups };
  });
  return pub;
}

module.exports = { RULES, publicView, classifyDevelopment, snapshot, changes, run, loadDb, preferCurated };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  if (!arg('raw') || !arg('layouts') || !arg('out')) { console.error('Usage: node tools/market-data/bedroom-hybrid.js --raw <URA folder> --layouts <private folder> --out <private folder> [--extracted <folder>] [--previous <snapshot.json>] [--to YYYY-MM]'); process.exit(2); }
  let r;
  try { r = run({ raw: arg('raw'), layouts: arg('layouts'), extracted: arg('extracted'), out: arg('out'), previous: arg('previous'), to: arg('to'), asOf: arg('as-of'), public: arg('public'), allowRental: process.argv.indexOf('--allow-rental') > -1, rentalQuarters: Number(arg('rental-quarters', 0)) || undefined, comparison: process.argv.indexOf('--comparison') > -1 }); } catch (e) { console.error('Stopped: ' + e.message); process.exit(2); }
  const W = r.report.rentalWindow;
  console.log((r.report.comparison ? 'COMPARISON RUN (not for refresh or publication). ' : '') + 'Rental contracts: ' + W.quarters.length + ' of ' + W.wanted + ' quarters (' + W.from + '–' + W.to + ')' + (W.complete ? '' : '; MISSING ' + W.missing.join(', ') + ' (coverage will be lower until fetched)') + (W.behindSales > 1 ? '; the newest rental quarter is ' + W.behindSales + ' quarters behind the sales data: run fetch-ura-rental.js' : ''));
  const D = r.report.developments, sum = (f) => D.reduce((s, d) => s + f(d), 0);
  const tot = sum((d) => d.totals.all.n), t = (k) => sum((d) => d.totals.tiers[k] || 0);
  console.log('Developments ' + D.length + ', sales ' + tot + ' (data to ' + r.report.latestMonth + '): verified ' + t('verified') + ', inferred ' + t('inferred') + ', unclassified ' + t('unclassified') + '; contradictions ' + sum((d) => d.contradictions.length) + ' sizes.');
  if (r.changes) console.log('Against the previous snapshot: ' + r.changes.contradictions.length + ' size(s) changed bedroom count, ' + r.changes.coverageDrops.length + ' coverage drop(s), ' + r.changes.newDevelopments.length + ' new development(s).');
}
