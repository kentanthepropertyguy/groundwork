#!/usr/bin/env node
/* ==========================================================================
   URA-first benchmark and scale run. Private output only (it reads raw URA files and private layout tables).

     node tools/market-data/bench-rental.js --raw <folder: batch-*.json + rental-*.json> --layouts <private folder> --out <private folder>
          [--projects "A;B"] [--all] [--split YYYY-MM]

   For each development with a layout table: rental-only classification compared with the layouts (coverage, agreement, wrong sales),
   held-out rental contracts (time split and random halves), and the effect of sparse rentals (random subsets of the contracts).
   For every development (--all): rental-only coverage and held-out consistency, with no accuracy claim where no layouts exist.
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const E = require('./bedroom-engine.js'), RE = require('./rental-engine.js'), BB = require('./build-bedroom.js');
const G = require('./register.js');

function loadAll(rawDir, opt) {
  const raw = BB.readRaw(rawDir, opt), cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')), pc = JSON.parse(fs.readFileSync(path.join(__dirname, 'project-config.json'), 'utf8'));
  const tmap = G.checkConfig(cfg), screen = G.nameScreen(pc), by = new Map();
  raw.tx.forEach((t) => {
    const a = G.admit(t, t.marketSegment, tmap); if (!a.ok || !t.project || screen(t.project)) return;
    (by.get(t.project) || by.set(t.project, []).get(t.project)).push({ cls: a.cls, sale: a.sale, price: a.price, sqm: a.sqm, areaRaw: t.area, psf: a.price / (a.sqm * E.SQFT_PER_SQM), ym: a.ym, floor: t.floorRange });
  });
  const dev = new Map(); by.forEach((rows, name) => { const s = G.split(rows); dev.set(name, { cls: s.cls, rows: s.rows }); });
  return { dev, rent: raw.rent, rentalWindow: raw.rentalWindow };
}
const pct = (x) => (x == null ? '–' : (Math.round(x * 1000) / 10).toFixed(1) + '%');

function benchOne(name, D, rentals, P, opt) {
  const cs = RE.contracts(rentals), cl = RE.cells(cs), A = RE.analyse(D.rows, rentals);
  const res = { project: name, cls: D.cls, sales: D.rows.length, resales: D.rows.filter((t) => t.sale === 3).length, contracts: A.contracts, rental: A.totals, rentalResale: A.resale };
  res.timeHoldout = RE.timeHoldout(cs, opt.splitYm);
  res.randomHoldout = RE.randomHoldout(cs, 20, 7);
  if (P && (opt.usableOnly ? P.layouts.length : P.reference.length)) {
    res.layoutStatus = P.status; res.referenceRows = P.reference.length;
    res.vsLayouts = RE.compare(D.rows, cl, P.reference);
    res.sparse = RE.sparseCurve(D.rows, cs, P.reference, [0.5, 0.25, 0.1, 0.05], 20, 11);
    if (P.layouts.length) res.layoutTotals = E.analyse(D.rows, P, { latest: opt.latest }).summary.totals.all;
  }
  if (opt.ranges && opt.ranges.length) res.rangeCheck = RE.rangeCheck(A.mapping, opt.ranges);
  res.mapping = A.mapping;
  return res;
}

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  const rawDir = arg('raw'), layDir = arg('layouts'), outDir = arg('out'), all = process.argv.indexOf('--all') > -1, split = arg('split', '2026-01');
  if (!rawDir || !outDir) { console.error('Usage: node tools/market-data/bench-rental.js --raw <folder> --out <private folder> [--layouts <folder>] [--projects "A;B"] [--all] [--split YYYY-MM]'); process.exit(2); }
  const H = require('./bedroom-hybrid.js');
  let db = layDir ? E.loadLayouts(fs.readFileSync(path.join(layDir, 'layouts.csv'), 'utf8'), fs.existsSync(path.join(layDir, 'sources.csv')) ? fs.readFileSync(path.join(layDir, 'sources.csv'), 'utf8') : '') : new Map();
  if (arg('extracted')) db = H.preferCurated(db, H.loadDb([arg('extracted')]));   // checked brochure tables where no curated table exists
  const ranges = layDir && fs.existsSync(path.join(layDir, 'ranges.csv')) ? E.parseCsv(fs.readFileSync(path.join(layDir, 'ranges.csv'), 'utf8')) : [];
  const { dev, rent } = loadAll(rawDir, { comparison: true, rentalQuarters: Number(arg('rental-quarters', 0)) || undefined }), latest = Math.max.apply(null, Array.from(dev.values()).map((d) => Math.max.apply(null, d.rows.map((t) => t.ym))));
  const splitYm = Number(split.slice(0, 4)) * 12 + Number(split.slice(5, 7)) - 1;
  const usableOnly = process.argv.indexOf('--usable') > -1;
  const names = arg('projects') ? arg('projects').split(';').map((s) => s.trim()) : all ? Array.from(dev.keys()).filter((n) => dev.get(n).cls !== 'cluster') : Array.from(db.keys());
  const out = [];
  names.forEach((n) => { const D = dev.get(n); if (!D) { out.push({ project: n, missing: 'no sales' }); return; } out.push(benchOne(n, D, rent.get(n) || [], db.get(n), { latest, splitYm, usableOnly, ranges: ranges.filter((r) => r.project === n) })); });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, all ? 'rental-scale.json' : 'rental-bench.json'), JSON.stringify(out, null, 1));
  if (!all) out.forEach((r) => {
    if (r.missing) { console.log('== ' + r.project + ': ' + r.missing); return; }
    console.log('== ' + r.project + '  (' + r.sales + ' sales, ' + r.contracts.used + ' rental contracts with a bedroom count; ' + r.contracts.dropped + ' without)');
    console.log('   Rental-only: inferred ' + r.rental.inferred + ' (' + pct(r.rental.share) + ', strong ' + r.rental.strong + '), mixed ' + r.rental.mixed + ', too rare to judge ' + r.rental.unrepresented + ', sparse ' + r.rental.sparse + ', none ' + r.rental.none);
    if (r.vsLayouts) { const v = r.vsLayouts; console.log('   Against the ' + (r.layoutStatus === 'reference' ? 'PARTIAL reference list (' + r.referenceRows + ' sizes)' : 'layouts') + ': both ' + v.both + ', agree ' + v.agree + ', WRONG ' + v.wrong + (v.wrong ? ' ' + JSON.stringify(v.wrongDetail) : '') + '; rental only ' + v.rentalOnly + ', layouts only ' + v.layoutOnly + ', neither ' + v.neither + '. Coverage rental ' + pct(v.rentalCoverage) + ' vs layouts ' + pct(v.layoutCoverage)); }
    if (r.rangeCheck) console.log('   Developer size ranges: ' + r.rangeCheck.checked + ' inferred sizes checked, ' + r.rangeCheck.inside + ' inside their bedroom count\'s stated range, OUTSIDE ' + r.rangeCheck.outside.length + (r.rangeCheck.outside.length ? ' ' + JSON.stringify(r.rangeCheck.outside) : '') + ', no stated range for the count ' + r.rangeCheck.noRange);
    const th = r.timeHoldout, rh = r.randomHoldout;
    console.log('   Held-out contracts: time split (train ' + th.train + ', test ' + th.n + ') predicted ' + pct(th.coverage) + ', right ' + th.right + ', wrong ' + th.wrong + (th.wrong ? ' ' + JSON.stringify(th.wrongDetail) : '') + '; random halves x20: predicted ' + pct(rh.coverage) + ', accuracy ' + pct(rh.accuracy) + ' (' + rh.wrong + ' wrong of ' + rh.predicted + ')');
    if (r.sparse) r.sparse.forEach((s) => console.log('   Sparse ' + Math.round(s.fraction * 100) + '% of contracts (~' + s.contracts + '): rental coverage ' + pct(s.rentalCoverage) + ', agreement ' + pct(s.agreement) + ', wrong sales per run ' + s.wrongPerRun.toFixed(1) + ' (max ' + s.maxWrong + ', ' + s.runsWithWrong + '/' + s.reps + ' runs with any)'));
  });
  console.log('Wrote ' + path.join(outDir, all ? 'rental-scale.json' : 'rental-bench.json'));
}
module.exports = { loadAll, benchOne };
