#!/usr/bin/env node
/* ==========================================================================
   GROUNDWORK — Research by bedroom type (V1, 25 Oct 2026): public aggregates from the ACCEPTED bedroom classification.

     node tools/market-data/build-bedroom-research.js --raw <private URA folder (batch-*.json)> --snapshot <private accepted snapshot.json>
          --site . --report <private folder> [--to YYYY-MM]

   Classification is NOT redone here. Each sale takes the decision the accepted 12-quarter run made for its area (bedroom-hybrid.js
   snapshot.json: "v:3" layout-verified, "i:3" inferred from URA rental contracts, null unclassified). The statistics are bedroom-engine.js's
   own (analyse, cell, reading: the Market Pulse rules imported from assets/js/gw-pulse.js).

   Refuses: a snapshot that is a comparison run or not the standard 12-quarter rental window; a snapshot, --to or URA data month that differs
   from the site's Research data (data/projects/manifest.json latestMonth); a --report folder inside the site.

   Public output (data/projects/bedroom/manifest.json + sNN.json, sharded like data/projects/detail): aggregates only. No areas, no
   layout codes, no per-sale rows, no rental figures, no snapshot. Resales only in V1 (the completeness gate is defined on resales):
     - the completeness gate is bedroom-hybrid.js completeness() (Claude C, 24 Oct 2026), applied unchanged: a type is shown only when the
       development has at least 70% of its latest-24-month resales classified, the type has at least 5 classified resales in that window, and
       at most 20% of the type's POSSIBLE recent resales are unclassified. "Possible" is the private per-size field Claude C added: the counts
       declared by at least 10% of the URA rental contracts touching an unclassified size (all declared counts under 5 contracts), else the
       counts of the nearest classified sizes below and above. Here it is worked out from the accepted snapshot and the same 12 rental
       quarters (the layout tables are not needed for it; see possibleFor);
     - a shown type also meets the typical-price rule (RULES.typical: 5 sales over 3 months) within 12 or 24 months (the completeness gate's window), the shortest window
       that does. Types with classified resales that fail either test are named only ("too few") when they have under 5, otherwise left out;
     - price movement is NEVER a bedroom-wide median (sizes and mix differ): it is the Market Pulse reading for the type's most-sold
       100 sq ft band, resales of that type in that band only, latest 12 months against the 12 before; and only when the development's
       classified share is at least RULES.minCoverage in both periods and differs by at most RULES.maxCoverageGap between them.
   The private report (--report) lists every development, what was published or withheld, and why.
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const E = require('./bedroom-engine.js'), RW = require('./rental-window.js'), B = require('./bench-rental.js'), RE = require('./rental-engine.js'), H = require('./bedroom-hybrid.js');
const P = require('../../assets/js/kpt-project.js');

const VERSION = 'bedroom-research-v1.3';   // v1.1: Claude C's completeness gate; v1.2: "matched sales only" counts (resale.matched, of, unknown); v1.3: pricing tiers (Claude C r2: groups, other, range; unknown as Transactions)
const RULES = { minCoverage: 0.7, maxAmbiguousShare: 0.2, minSales: 5, gateMonths: 24, maxCoverageGap: 0.15, typical: { n: 5, months: 3 }, windows: [12, 24] };   // never beyond the gate's 24 months
const SALES = ['resale'], SALE_CODE = { new: 1, sub: 2, resale: 3 };   // V1: resales (the completeness gate is defined on resales)
const SQFT = E.SQFT_PER_SQM;
// "Matched sales only" (Ken, 27 Oct 2026): a bedroom type withheld from the figures is still named, with counts only, when at least this many
// resales in the last 24 months already have a decision in the accepted snapshot. The development must meet RULES.minCoverage. No new
// classification: the counts are the tx rows the figures already use. Never a price, size, trend or budget for such a type.
const MIN_MATCHED = 3;
const MATCHED_GROUPS = ['1', '2', '3', '4', '5'];   // bedroom counts only: never Penthouse, never a studio
// Bedroom pricing tiers (Claude C r2, approved 29 Oct 2026): a matched-only type may show a median for a size group whose sizes are within 10%
// and which passes RULES.typical (5 sales over 3 months, RULES.windows); at most two groups. Tier B: one or two groups; Tier C: none (its
// historical matched transactions only). The group test reuses RULES.typical and RULES.windows; never copied.
const GROUP = { span: 1.10, maxGroups: 2 };
const sqftOf = (sqm) => Math.round(sqm * SQFT);   // as the Transactions list shows it (≈), never the bands' floor
const cmpKey = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1; } return 0; };
// The first of RULES.windows in which the rows meet the typical-price test, or null.
function firstWindow(rows, latest) {
  for (const m of RULES.windows) { const l = rows.filter((t) => t.ym > latest - m), c = E.cell(l); if (c.n >= RULES.typical.n && c.act >= RULES.typical.months) return { rows: l, win: m }; }
  return null;
}
const spanOf = (rows) => { const s = rows.map((t) => t.sqm); return [sqftOf(Math.min.apply(null, s)), sqftOf(Math.max.apply(null, s))]; };
const minmax = (rows) => { const p = rows.map((t) => t.price); return { n: rows.length, lo: Math.min.apply(null, p), hi: Math.max.apply(null, p), sqft: spanOf(rows), from: ymToS(Math.min.apply(null, rows.map((t) => t.ym))), to: ymToS(Math.max.apply(null, rows.map((t) => t.ym))) }; };
// sales: this type's matched resales in the latest 24 months (exactly the rows Transactions lists for bed = g, resale, last 2 years).
// tx: all of the development's rows (for the same-size comparison). At most GROUP.maxGroups attempts, passing or not (spec r2 §2, §7).
function sizeGroups(sales, latest, tx, g) {
  let left = sales.slice(); const out = [];
  for (let k = 0; k < GROUP.maxGroups && left.length; k++) {
    const sizes = Array.from(new Set(left.map((t) => t.sqm))).sort((a, b) => a - b);
    let best = null;
    sizes.forEach((a) => {
      const win = sizes.filter((x) => x >= a && x <= a * GROUP.span), l = left.filter((t) => win.indexOf(t.sqm) > -1);
      const key = [l.length, l.filter((t) => t.ym > latest - 12).length, -a];   // most sales; then most in 12 months; then smaller sizes
      if (!best || cmpKey(key, best.key) > 0) best = { key, win, l };
    });
    left = left.filter((t) => best.win.indexOf(t.sqm) < 0);
    const pass = firstWindow(best.l, latest);
    if (pass) {
      const c = E.cell(pass.rows), at = (p) => tx.filter((t) => t.group === g && t.sale === SALE_CODE.resale && t.period === p && best.win.indexOf(t.sqm) > -1);
      const A = E.cell(at(0)), Bc = E.cell(at(1)), r = E.reading(A, Bc, latest);
      out.push({ sqft: spanOf(pass.rows), win: pass.win, from: ymToS(latest - pass.win + 1), to: ymToS(latest), n: c.n, act: c.act, med: c.price[2], lo: c.price[0], hi: c.price[4],
        cmp: r.evidence === 'none' ? { evidence: 'none', a: A.n, b: Bc.n } : { evidence: r.evidence, dir: r.dir, pct: r.pct, a: A.n, b: Bc.n }, sizes: best.win });
    }
  }
  return out;
}
const ymToInt = (ym) => (ym == null ? null : Math.floor(ym / 12) * 100 + (ym % 12) + 1);
const ymToS = (ym) => Math.floor(ym / 12) + '-' + String((ym % 12) + 1).padStart(2, '0');
const sToYm = (s) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;
const round = (v, k) => Math.round(v * Math.pow(10, k || 0)) / Math.pow(10, k || 0);

// The accepted decision for an area: {cls, tier, group} as bedroom-engine.js expects. Unclassified areas are class D here; what they could be
// is the completeness gate's business (possibleFor, then bedroom-hybrid.js completeness()).
function decider(entry) {
  const map = (entry && entry.map) || {};
  return (t) => {
    const a = String(t.areaRaw != null ? t.areaRaw : t.sqm), v = map[a];
    if (v) { const p = v.split(':'), g = p[1]; return p[0] === 'v' ? { cls: 'A', tier: 'verified', group: g, codes: [] } : { cls: 'B', tier: 'inferred', group: g, codes: [] }; }
    return { cls: 'D', tier: 'unclassified', group: null, groups: [], codes: [] };
  };
}
// Claude C's `possible` for every unclassified size of a development, from the accepted snapshot and the URA rental contracts (the same 12
// quarters): rentals first (H.rentalPossible), and where no contract declares a count, the nearest classified sizes below and above. A size the
// accepted run left unclassified although its rentals agree (a layout ambiguity or a layout/rental contradiction) gets the rental count;
// the layout side of those few sizes needs the private layout tables, which this build does not read.
function possibleFor(entry, rows, rentals) {
  const map = (entry && entry.map) || {}, cl = RE.cells(RE.contracts(rentals || [])), sctx = RE.salesContext(rows, cl);
  const decided = Object.keys(map).filter((a) => map[a]).map((a) => ({ a: Number(a), g: map[a].split(':')[1] })).sort((x, y) => x.a - y.a);
  const areas = Array.from(new Set(rows.map((t) => String(t.areaRaw != null ? t.areaRaw : t.sqm)).concat(Object.keys(map))));
  return areas.sort((x, y) => Number(x) - Number(y)).map((a) => {
    const v = map[a];
    if (v) return { sqm: a, tier: v[0] === 'v' ? 'verified' : 'inferred', group: v.split(':')[1] };
    const ren = RE.classifySale(a, cl, RE.RULE, sctx);
    let possible = ren.cls === 'inferred' ? [String(ren.beds)] : H.rentalPossible(ren);
    if (!possible.length) { const lo = decided.filter((x) => x.a < Number(a)).pop(), hi = decided.find((x) => x.a > Number(a)); possible = Array.from(new Set([lo && lo.g, hi && hi.g].filter(Boolean))); }
    return { sqm: a, tier: 'unclassified', group: null, possible };
  });
}

// Figures for one bedroom type and sale type, from the engine's classified rows (tx). latest: ym index of the data month.
// gate: completeness() result for this type ({kept, ambiguous, share, ok}); without it (tests of the figures alone) the type is let through.
function typeFigures(tx, g, sale, latest, gate) {
  const code = SALE_CODE[sale], mine = tx.filter((t) => t.group === g && t.sale === code);
  if (!mine.length) return null;
  const inWin = (t, m) => t.ym > latest - m;
  const ambiguous = gate && gate.share != null ? gate.share : 0;
  let win = null, rows = [];
  for (const m of RULES.windows) { const l = mine.filter((t) => inWin(t, m)), c = E.cell(l); if (c.n >= RULES.typical.n && c.act >= RULES.typical.months) { win = m; rows = l; break; } }
  const n36 = mine.filter((t) => inWin(t, 36)).length;
  const basis = { verified: mine.filter((t) => t.tier === 'verified').length, inferred: mine.filter((t) => t.tier === 'inferred').length };
  const out = { g, label: E.groupLabel(g), n36, ambiguous: round(ambiguous, 3), basis, kept24: gate ? gate.kept : null };
  if (gate && !gate.ok) { out.figures = false; out.why = gate.kept < RULES.minSales ? 'few' : gate.share > RULES.maxAmbiguousShare ? 'ambiguous' : 'coverage'; return out; }
  if (win == null) { out.figures = false; out.why = 'few'; return out; }
  const c = E.cell(rows), sq = rows.map((t) => Math.floor(t.sqm * SQFT)).sort((x, y) => x - y);   // floor, as the 100 sq ft bands do (65 sqm = 699 sq ft, in 600–699)
  const wb = { verified: rows.filter((t) => t.tier === 'verified').length, inferred: rows.filter((t) => t.tier === 'inferred').length };
  Object.assign(out, { figures: true, win, n: c.n, act: c.act, last: ymToInt(c.last), from: ymToS(latest - win + 1), to: ymToS(latest), price: c.price, psf: c.psf, sqft: [sq[0], sq[sq.length - 1]], basis: wb });
  return out;
}

// The "matched" list for one development's resales: every bedroom type with at least MIN_MATCHED matched resales in the last 24 months,
// figured or not. types: the typeFigures results (figures / why); gate: completeness() for the development; coverage: the share of its resales
// in the gate's 24 months matched to a bedroom count (none below RULES.minCoverage). Counts only for figures:false.
function matchedTypes(tx, latest, types, gate, coverage) {
  if (!(coverage >= RULES.minCoverage)) return [];
  const byG = {}; types.forEach((x) => { byG[x.g] = x; });
  return MATCHED_GROUPS.map((g) => {
    const mine = tx.filter((t) => t.group === g && t.sale === SALE_CODE.resale && t.ym > latest - 24);
    if (mine.length < MIN_MATCHED) return null;
    const x = byG[g] || {}, figures = !!x.figures, gt = (gate.types || {})[g] || { ambiguous: 0 };
    const o = { g, label: E.groupLabel(g), n12: mine.filter((t) => t.ym > latest - 12).length, n24: mine.length, last: ymToInt(Math.max.apply(null, mine.map((t) => t.ym))),
      basis: { verified: mine.filter((t) => t.tier === 'verified').length, inferred: mine.filter((t) => t.tier === 'inferred').length },
      figures, why: figures ? null : x.why === 'ambiguous' ? 'ambiguous' : 'few', couldBe: gt.ambiguous };
    if (!figures) {   // pricing tiers (r2): groups (Tier B), other, range; prices of past matched resales only, never per-sale rows
      const gs = sizeGroups(mine, latest, tx, g), inG = (t) => gs.some((q) => q.sizes.indexOf(t.sqm) > -1), rest = mine.filter((t) => !inG(t));
      o.groups = gs.map((q) => { const c = Object.assign({}, q); delete c.sizes; return c; });
      o.other = gs.length && rest.length ? minmax(rest) : null;
      o.range = minmax(mine);
    }
    return o;
  }).filter(Boolean);
}

// Price movement for a type: the Market Pulse reading on the type's most-sold 100 sq ft band (resales of that type only).
// range: the sizes shown with the typical price; the band is taken from inside it where it can be, so the two never disagree.
function typeTrend(tx, g, latest, coverageOk, range) {
  const rs = tx.filter((t) => t.group === g && t.sale === 3 && t.period <= 1);
  if (!rs.length) return { why: 'few' };
  const counts = {}; rs.forEach((t) => { counts[t.bin] = (counts[t.bin] || 0) + 1; });
  const all = Object.keys(counts).map(Number), inside = range ? all.filter((b) => b + 99 >= range[0] && b <= range[1]) : all;
  const bin = (inside.length ? inside : all).sort((x, y) => counts[y] - counts[x] || x - y)[0];
  const inBin = rs.filter((t) => t.bin === bin), A = E.cell(inBin.filter((t) => t.period === 0)), Bc = E.cell(inBin.filter((t) => t.period === 1));
  const base = { bin, a: A.n, b: Bc.n, other: rs.length - inBin.length };
  if (!coverageOk) return Object.assign(base, { evidence: 'none', why: 'coverage' });
  const r = E.reading(A, Bc, latest);
  return Object.assign(base, r.evidence === 'none' ? { evidence: 'none', why: 'few' } : { evidence: r.evidence, dir: r.dir, pct: r.pct, withinNoise: r.withinNoise });
}

function build(o) {
  const site = path.resolve(o.site || '.');
  if (o.report && path.resolve(o.report).startsWith(site + path.sep)) throw new Error('--report must be a private folder outside the site');
  const snap = JSON.parse(fs.readFileSync(o.snapshot, 'utf8'));
  if (snap.comparison) throw new Error('the snapshot is a comparison run: it can never feed public output');
  if (!snap.rentalWindow || snap.rentalWindow.quarters !== RW.WINDOW_QUARTERS) throw new Error('the snapshot must come from the standard ' + RW.WINDOW_QUARTERS + '-quarter rental window');
  const man = JSON.parse(fs.readFileSync(path.join(site, 'data/projects/manifest.json'), 'utf8'));
  const to = o.to || man.latestMonth;
  if (to !== man.latestMonth || snap.latestMonth !== man.latestMonth) throw new Error('data months differ: Research ' + man.latestMonth + ', snapshot ' + snap.latestMonth + ', --to ' + to + '. Rebuild the classification for the same URA download first.');
  const { dev, rent, rentalWindow } = B.loadAll(o.raw, {});
  if (!rentalWindow || rentalWindow.quarters.length !== RW.WINDOW_QUARTERS || rentalWindow.to !== snap.rentalWindow.to) throw new Error('the URA folder must hold the same ' + RW.WINDOW_QUARTERS + ' rental quarters as the snapshot (' + snap.rentalWindow.from + '–' + snap.rentalWindow.to + ')');
  const cap = sToYm(to); let latest = 0;
  dev.forEach((d) => { d.rows = d.rows.filter((t) => t.ym <= cap); d.rows.forEach((t) => { if (t.ym > latest) latest = t.ym; }); });
  if (ymToS(latest) !== to) throw new Error('the URA folder ends at ' + ymToS(latest) + ', not ' + to);
  const ctx = { latest, periodMonths: 12, periods: 5, bin: 100 };
  const shards = {}, report = [];
  let devs = 0, withTypes = 0;
  dev.forEach((D, name) => {
    if (D.cls === 'cluster' || !D.rows.length) return;
    const id = P.slugify(name), entry = snap.developments[name], rec = { id, name, published: false, sale: {} };
    if (!entry) { rec.why = 'not in the accepted classification'; report.push(rec); return; }
    const res = E.analyse(D.rows.map((t) => Object.assign({ project: name }, t)), { project: name, layouts: [], status: 'none', publishable: false }, ctx, { decide: decider(entry) });
    const tx = res.tx, S = res.summary, groups = Object.keys(S.groups);
    const rows = D.rows.map((t) => Object.assign({ project: name }, t));
    const gate = H.completeness({ mapping: possibleFor(entry, rows, rent.get(name) || []) }, rows, latest, { months: RULES.gateMonths, minCoverage: RULES.minCoverage, maxAmbiguousShare: RULES.maxAmbiguousShare, minSales: RULES.minSales });
    rec.gate = { coverage: gate.coverage == null ? null : round(gate.coverage, 3), recent: gate.recent, unclassified: gate.unclassified, types: gate.types };
    const pub = {};
    SALES.forEach((sale) => {
      const code = SALE_CODE[sale], l24 = tx.filter((t) => t.sale === code && t.ym > latest - 24);
      if (!l24.length) return;
      const cov = l24.filter((t) => t.cls === 'A' || t.cls === 'B').length / l24.length;
      const r = { coverage: round(cov, 3), n24: l24.length };
      if (cov < RULES.minCoverage) { r.why = 'coverage'; rec.sale[sale] = r; return; }
      // coverage in each of the two Pulse periods, for the price movement
      const per = [0, 1].map((p) => { const l = tx.filter((t) => t.sale === code && t.period === p); return l.length ? l.filter((t) => t.cls === 'A' || t.cls === 'B').length / l.length : null; });
      const covOk = sale === 'resale' && per[0] != null && per[1] != null && per[0] >= RULES.minCoverage && per[1] >= RULES.minCoverage && Math.abs(per[0] - per[1]) <= RULES.maxCoverageGap;
      const types = groups.map((g) => typeFigures(tx, g, sale, latest, gate.types[g] || { kept: 0, ambiguous: 0, share: null, ok: false })).filter(Boolean).filter((x) => x.n36 > 0);
      types.forEach((x) => { if (x.figures && sale === 'resale') x.trend = typeTrend(tx, x.g, latest, covOk, x.sqft); });
      r.periodCoverage = per.map((v) => (v == null ? null : round(v, 3)));
      r.types = types.map((x) => ({ g: x.g, figures: x.figures, why: x.why || null, ambiguous: x.ambiguous, n36: x.n36 }));
      rec.sale[sale] = r;
      const shown = types.filter((x) => x.figures), matched = sale === 'resale' ? matchedTypes(tx, latest, types, gate, cov) : [];
      r.matched = matched.map((m) => ({ g: m.g, n24: m.n24, figures: m.figures, why: m.why, couldBe: m.couldBe }));
      if (!shown.length && !matched.length) return;
      pub[sale] = { coverage: round(cov, 3) };
      // r2 (R2): unknown = the 24-month resales with no bedroom count, exactly Transactions' "Type unknown" rows (a penthouse-layout sale counts as unknown)
      if (matched.length) Object.assign(pub[sale], { of: gate.recent, unknown: gate.recent - tx.filter((t) => t.sale === SALE_CODE.resale && t.ym > latest - 24 && /^\d+$/.test(String(t.group))).length });
      Object.assign(pub[sale], { types: shown.map((x) => { const o = Object.assign({}, x); delete o.figures; delete o.why; delete o.ambiguous; delete o.n36; delete o.kept24; return o; }), few: types.filter((x) => !x.figures && x.why === 'few').map((x) => x.g) });   // named only (no figures); a type withheld as ambiguous is not named here (matched names it, counts only)
      if (matched.length) pub[sale].matched = matched;
    });
    devs++;
    if (Object.keys(pub).length) {
      withTypes++; rec.published = true;
      const k = P.shardName(P.shardOf(id, man.shards));
      (shards[k] = shards[k] || {})[id] = Object.assign({ name }, pub);
    }
    report.push(rec);
  });
  const meta = { v: 1, kind: 'gw-bedroom-research', version: VERSION, asOf: man.asOf, latestMonth: man.latestMonth, classifiedAsOf: snap.asOf, rentalWindow: snap.rentalWindow, shards: man.shards, rules: Object.assign({}, RULES, { minMatched: MIN_MATCHED, groupSpan: GROUP.span, maxGroups: GROUP.maxGroups }),
    basis: 'Bedroom type is inferred by Groundwork, never recorded by URA: from the developer\'s floor-plan areas where a checked layout table exists ("floor plans"), otherwise from the bedroom counts declared in URA rental contracts for homes of the same size in the latest 12 quarters ("rental records"). Sales whose size fits more than one bedroom count are left out. Prices are URA caveated transaction prices.',
    counts: { developments: devs, withTypes } };
  return { meta, shards, report };
}

function write(o, r) {
  const out = path.join(path.resolve(o.site || '.'), 'data/projects/bedroom');
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(r.meta));
  Object.keys(r.shards).sort().forEach((k) => fs.writeFileSync(path.join(out, k + '.json'), JSON.stringify({ v: 1, shard: k, projects: r.shards[k] })));
  if (o.report) { fs.mkdirSync(o.report, { recursive: true }); fs.writeFileSync(path.join(o.report, 'bedroom-research-report.json'), JSON.stringify({ meta: r.meta, developments: r.report }, null, 1)); }
}

module.exports = { VERSION, RULES, MIN_MATCHED, GROUP, decider, matchedTypes, sizeGroups, firstWindow, possibleFor, typeFigures, typeTrend, build };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const o = { raw: arg('raw'), snapshot: arg('snapshot'), site: arg('site', '.'), report: arg('report'), to: arg('to') };
  if (!o.raw || !o.snapshot || !o.report) { console.error('Usage: node tools/market-data/build-bedroom-research.js --raw <private URA folder> --snapshot <accepted snapshot.json> --site . --report <private folder> [--to YYYY-MM]'); process.exit(2); }
  let r; try { r = build(o); } catch (e) { console.error(e.message); process.exit(2); }
  write(o, r);
  const pubN = r.report.filter((x) => x.published).length;
  console.log('Bedroom research: ' + r.meta.counts.developments + ' developments read, ' + pubN + ' with bedroom figures (data ' + r.meta.latestMonth + ', classification ' + r.meta.classifiedAsOf + ', rental window ' + r.meta.rentalWindow.from + '–' + r.meta.rentalWindow.to + ').');
}
