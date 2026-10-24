#!/usr/bin/env node
/* ==========================================================================
   GROUNDWORK — bedroom classification measures, kept APART so that one is never read as another. PRIVATE output (aggregates only).

     A. Coverage        how many sales have a bedroom type at all (verified / inferred / unclassified), by period, segment and rental
                        volume, and why the rest are unclassified. Coverage says nothing about correctness.
     B. Sales agreement rental-inferred sales compared with a developer layout table for the same development, sale by sale. The tables
                        used are those that explain at least 90% of the development's sale areas — a test that does not look at rentals,
                        so tables are not picked for agreeing with the rental engine. This is agreement with auto-extracted tables
                        (checked against URA, not certified by the developer), on the developments that have one; it is the only
                        sales-level measure, and it covers only those developments.
     C. Rental consistency  held-out URA rental CONTRACTS: the engine is built from some contracts and predicts the declared bedroom
                        count of the others (random halves x20; and a time split). It measures how consistently declarations repeat
                        for a size. It is NOT the accuracy of sales classification.

     node tools/market-data/bedroom-metrics.js --raw <URA folder> --report <hybrid-report.json> --layouts <private folder>
          [--extracted <folder>] --out <private folder> [--split YYYY-MM] [--rental-quarters N --comparison]
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const E = require('./bedroom-engine.js'), RE = require('./rental-engine.js'), Q = require('./layout-quality.js'), B = require('./bench-rental.js'), H = require('./bedroom-hybrid.js'), BB = require('./build-bedroom.js');

const WINDOW = 24;
const reasonOf = (m) => {
  const r = m.reason || '';
  if (r === 'contradiction') return 'layouts and rentals disagree (for review)';
  if (/different bedroom counts/.test(r)) return 'floor plans with different bedroom counts share this area';
  if (/rental mixed/.test(r)) return 'rented with different bedroom counts at this size';
  if (/rental sparse/.test(r)) return 'fewer than 5 rental contracts at this size';
  if (/rental unrepresented/.test(r)) return 'too few rentals for how often this exact size sells';
  if (/rental none/.test(r)) return 'no rental contract with a bedroom count at this size';
  return 'other';
};
const share = (a, b) => (b ? Math.round((a / b) * 1000) / 1000 : null);
const bucket = (n) => (n >= 200 ? '200+' : n >= 100 ? '100-199' : n >= 50 ? '50-99' : n >= 20 ? '20-49' : n > 0 ? '1-19' : '0');

function coverage(report, dev, segOf) {
  const latest = Number(report.latestMonth.slice(0, 4)) * 12 + Number(report.latestMonth.slice(5, 7)) - 1, from = latest - WINDOW + 1;
  const T = () => ({ n: 0, verified: 0, inferred: 0, unclassified: 0 }), out = { all: T(), resale: T(), recentResale: T(), newSale: T(), bySegment: {}, byRentalVolume: {}, unclassifiedRecentResale: {} };
  report.developments.forEach((d) => {
    const D = dev.get(d.project); if (!D) return;
    const map = new Map(d.mapping.map((m) => [m.sqm, m])), seg = segOf.get(d.project) || '?', vol = bucket(d.rental.contracts);
    out.bySegment[seg] = out.bySegment[seg] || T(); out.byRentalVolume[vol] = out.byRentalVolume[vol] || Object.assign(T(), { developments: 0 }); out.byRentalVolume[vol].developments++;
    D.rows.forEach((t) => {
      if (t.ym > latest) return;
      const m = map.get(String(t.areaRaw != null ? t.areaRaw : t.sqm)), tier = m && m.group != null ? m.tier : 'unclassified';
      const add = (o) => { o.n++; o[tier]++; };
      add(out.all); if (t.sale === 3) add(out.resale); if (t.sale === 1) add(out.newSale);
      if (t.sale === 3 && t.ym >= from) { add(out.recentResale); add(out.bySegment[seg]); add(out.byRentalVolume[vol]); if (tier === 'unclassified') { const k = m ? reasonOf(m) : 'other'; out.unclassifiedRecentResale[k] = (out.unclassifiedRecentResale[k] || 0) + 1; } }
    });
  });
  const shares = (o) => { o.classified = share(o.verified + o.inferred, o.n); o.verifiedShare = share(o.verified, o.n); o.inferredShare = share(o.inferred, o.n); };
  [out.all, out.resale, out.recentResale, out.newSale].forEach(shares); Object.values(out.bySegment).forEach(shares); Object.values(out.byRentalVolume).forEach(shares);
  return out;
}
// B: tables that explain >= 90% of sale areas (no rental test), compared with rental-only inference sale by sale
function salesAgreement(dev, rent, db) {
  const out = { developments: [], sales: 0, compared: 0, agree: 0, disagree: 0 };
  db.forEach((P, name) => {
    const D = dev.get(name); if (!D) return;
    const rows = P.all.filter((l) => l.iv && Number.isInteger(l.bedrooms)); if (!rows.length) return;
    const qc = Q.check(rows, D.rows, []); if (qc.explained == null || qc.explained < Q.LIMITS.explained || qc.incomplete) return;
    const cl = RE.cells(RE.contracts(rent.get(name) || [])), c = RE.compare(D.rows, cl, rows);
    out.developments.push({ project: name, table: P.status, explained: Math.round(qc.explained * 1000) / 1000, sales: c.n, compared: c.both, agree: c.agree, disagree: c.wrong, detail: c.wrongDetail, rentalCoverage: c.rentalCoverage, tableCoverage: c.layoutCoverage });
    out.sales += c.n; out.compared += c.both; out.agree += c.agree; out.disagree += c.wrong;
  });
  out.developments.sort((a, b) => b.sales - a.sales);
  out.agreement = share(out.agree, out.compared); out.disagreeShare = share(out.disagree, out.compared);
  return out;
}
// C: held-out rental contracts, every development
function rentalConsistency(dev, rent, splitYm) {
  const R = { n: 0, predicted: 0, right: 0, wrong: 0 }, Tm = { n: 0, predicted: 0, right: 0, wrong: 0 };
  let devs = 0;
  dev.forEach((D, name) => {
    if (D.cls === 'cluster') return;
    const cs = RE.contracts(rent.get(name) || []); if (!cs.length) return; devs++;
    const r = RE.randomHoldout(cs, 20, 7), t = RE.timeHoldout(cs, splitYm);
    ['n', 'predicted', 'right', 'wrong'].forEach((k) => { R[k] += r[k]; Tm[k] += t[k]; });
  });
  const fin = (o) => Object.assign(o, { predictedShare: share(o.predicted, o.n), wrongShare: share(o.wrong, o.predicted) });
  return { developments: devs, randomHalves: fin(R), timeSplit: fin(Tm) };
}

function run(o) {
  const { dev, rent } = B.loadAll(o.raw, { rentalQuarters: o.rentalQuarters, comparison: o.comparison }), report = JSON.parse(fs.readFileSync(o.report, 'utf8'));
  const raw = BB.readRaw(o.raw, { rentalQuarters: o.rentalQuarters, comparison: o.comparison }), seg = new Map(); const cnt = new Map();
  raw.tx.forEach((t) => { if (!t.project || !t.marketSegment) return; const m = cnt.get(t.project) || cnt.set(t.project, {}).get(t.project); m[t.marketSegment] = (m[t.marketSegment] || 0) + 1; });
  cnt.forEach((m, p) => seg.set(p, Object.keys(m).sort((a, b) => m[b] - m[a])[0]));
  const curated = H.loadDb([o.layouts]), db = o.extracted ? H.preferCurated(curated, H.loadDb([o.extracted])) : curated;
  const splitYm = Number((o.split || '2026-01').slice(0, 4)) * 12 + Number((o.split || '2026-01').slice(5, 7)) - 1;
  const m = { latestMonth: report.latestMonth, window: WINDOW, A_coverage: coverage(report, dev, seg), B_salesAgreement: salesAgreement(dev, rent, db), C_rentalConsistency: rentalConsistency(dev, rent, splitYm) };
  m.notes = [
    'A is coverage only: the share of sales with a bedroom type. It is not a measure of correctness.',
    'B is the only sales-level comparison: rental-inferred sales against auto-extracted developer layout tables (checked against URA areas, not certified), on ' + m.B_salesAgreement.developments.length + ' developments. It does not cover developments without a table.',
    'C measures rental CONTRACTS held out from the engine: how consistently URA bedroom declarations repeat for a size. It is not sales accuracy and must not be presented as such.',
  ];
  if (o.out) { fs.mkdirSync(o.out, { recursive: true }); fs.writeFileSync(path.join(o.out, 'metrics.json'), JSON.stringify(m, null, 1)); }
  return m;
}

module.exports = { run, coverage, salesAgreement, rentalConsistency, reasonOf };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
  if (!arg('raw') || !arg('report') || !arg('layouts')) { console.error('Usage: node tools/market-data/bedroom-metrics.js --raw <URA folder> --report <hybrid-report.json> --layouts <private folder> [--extracted <folder>] [--out <folder>] [--split YYYY-MM]'); process.exit(2); }
  let m;
  try { m = run({ raw: arg('raw'), report: arg('report'), layouts: arg('layouts'), extracted: arg('extracted'), out: arg('out'), split: arg('split'), rentalQuarters: Number(arg('rental-quarters', 0)) || undefined, comparison: process.argv.indexOf('--comparison') > -1 }); } catch (e) { console.error('Stopped: ' + e.message); process.exit(2); }
  const p = (x) => (x == null ? '–' : (Math.round(x * 1000) / 10) + '%'), A = m.A_coverage, Bm = m.B_salesAgreement, C = m.C_rentalConsistency;
  console.log('A. COVERAGE (not accuracy), data to ' + m.latestMonth);
  [['All sales', A.all], ['Resales', A.resale], ['Resales, latest 24 months', A.recentResale], ['New sales', A.newSale]].forEach(([k, o]) => console.log('   ' + k.padEnd(28) + String(o.n).padStart(7) + '  classified ' + p(o.classified).padStart(6) + '  (verified ' + p(o.verifiedShare) + ', inferred ' + p(o.inferredShare) + ')'));
  Object.keys(A.bySegment).sort().forEach((s) => console.log('   ' + ('  ' + s + ' resales, 24 months').padEnd(28) + String(A.bySegment[s].n).padStart(7) + '  classified ' + p(A.bySegment[s].classified).padStart(6)));
  ['200+', '100-199', '50-99', '20-49', '1-19', '0'].filter((k) => A.byRentalVolume[k]).forEach((k) => console.log('   ' + ('  ' + k + ' rental contracts').padEnd(28) + String(A.byRentalVolume[k].n).padStart(7) + '  classified ' + p(A.byRentalVolume[k].classified).padStart(6) + '  (' + A.byRentalVolume[k].developments + ' developments)'));
  console.log('   Unclassified recent resales by reason: ' + Object.entries(A.unclassifiedRecentResale).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join('; '));
  console.log('B. SALES AGREEMENT with developer layout tables (' + Bm.developments.length + ' developments with a table explaining 90%+ of sale areas): ' + Bm.compared + ' sales compared, ' + Bm.agree + ' agree, ' + Bm.disagree + ' disagree (' + p(Bm.disagreeShare) + ')');
  Bm.developments.forEach((d) => console.log('   ' + d.project.padEnd(28) + ' compared ' + String(d.compared).padStart(4) + '  disagree ' + d.disagree + (d.disagree ? ' ' + JSON.stringify(d.detail) : '')));
  console.log('C. RENTAL CONSISTENCY (held-out contracts; NOT sales accuracy), ' + C.developments + ' developments: random halves x20 predicted ' + p(C.randomHalves.predictedShare) + ', of which ' + p(C.randomHalves.wrongShare) + ' wrong; time split predicted ' + p(C.timeSplit.predictedShare) + ', of which ' + p(C.timeSplit.wrongShare) + ' wrong');
}
