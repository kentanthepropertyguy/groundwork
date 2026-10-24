'use strict';
/* Research by bedroom type (V1): the public build (tools/market-data/build-bedroom-research.js) on synthetic sales, plus its refusals.
   Run: node tools/market-data/tests/bedroom-research-tests.js */
const fs = require('fs'), os = require('os'), path = require('path');
const BR = require('../build-bedroom-research.js'), E = require('../bedroom-engine.js');
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info)); } };
const YM = (s) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1;
const latest = YM('2026-09'), ctx = { latest, periodMonths: 12, periods: 5, bin: 100 };
// a sale: sqm (as URA writes it), price, month, sale type (3 resale)
const sale = (sqm, price, ym, s) => ({ project: 'TEST', cls: 'condo', sale: s || 3, sqm: Number(sqm), areaRaw: String(sqm), price, psf: price / (sqm * E.SQFT_PER_SQM), ym: YM(ym), floor: '06-10' });
const months = (from, n) => Array.from({ length: n }, (x, k) => { const i = YM(from) + k; return Math.floor(i / 12) + '-' + String(i % 12 + 1).padStart(2, '0'); });
const run = (rows, entry) => E.analyse(rows, { project: 'TEST', layouts: [], status: 'none', publishable: false }, ctx, { decide: BR.decider(entry) });

/* ---------- the accepted decisions are used as they are ---------- */
{
  const d = BR.decider({ map: { 84: 'v:3', 94: 'i:3', 60: 'v:2', 90: null, 70: null } });
  ok(d(sale(84, 1, '2026-01')).tier === 'verified' && d(sale(84, 1, '2026-01')).group === '3', 'v:3 is a layout-verified 3-bedroom');
  ok(d(sale(94, 1, '2026-01')).tier === 'inferred' && d(sale(94, 1, '2026-01')).group === '3', 'i:3 is a rental-inferred 3-bedroom');
  ok(d(sale(90, 1, '2026-01')).group === null && d(sale(70, 1, '2026-01')).group === null, 'unclassified areas stay unclassified (what they could be is the completeness gate’s business)');
  ok(d(sale(120, 1, '2026-01')).cls === 'D' && d(sale(120, 1, '2026-01')).group === null, 'an area the accepted run never saw: unclassified, never guessed');
}

/* ---------- typical price: the shortest window that meets the rule; sizes; basis ---------- */
{
  const rows = [];
  months('2025-10', 12).forEach((m, k) => { if (k % 2 === 0) rows.push(sale(84, 1800000 + k * 1000, m)); });   // 6 sales over 6 months
  rows.push(sale(106, 2300000, '2026-08'));
  const res = run(rows, { map: { 84: 'v:3', 106: 'i:3' } });
  const t = BR.typeFigures(res.tx, '3', 'resale', latest);
  ok(t.figures && t.win === 12 && t.n === 7, 'enough in 12 months: the 12-month window', t);
  ok(t.sqft[0] === Math.floor(84 * E.SQFT_PER_SQM) && t.sqft[1] === Math.floor(106 * E.SQFT_PER_SQM), 'the size range of the sales used');
  ok(t.basis.verified === 6 && t.basis.inferred === 1, 'basis counts kept apart: verified and inferred');
  ok(t.price[2] === 1806000 && t.from === '2025-10' && t.to === '2026-09', 'median price and period');
  const few = run([sale(84, 1, '2026-01'), sale(84, 1, '2025-03'), sale(84, 1, '2024-03'), sale(84, 1, '2024-06'), sale(84, 1, '2024-09')], { map: { 84: 'v:3' } });
  const tf = BR.typeFigures(few.tx, '3', 'resale', latest);
  ok(tf.figures === false && tf.why === 'few' && BR.RULES.windows.join() === '12,24', '5 sales over 3+ months only within 3 years: no figures (the typical price never reaches beyond 24 months)', tf);
  const thin = run([sale(84, 1, '2026-01'), sale(84, 1, '2026-02'), sale(84, 1, '2026-03'), sale(84, 1, '2026-04')], { map: { 84: 'v:3' } });
  ok(BR.typeFigures(thin.tx, '3', 'resale', latest).figures === false && BR.typeFigures(thin.tx, '3', 'resale', latest).why === 'few', 'under 5 sales: no figures, named as too few');
  const sameMonth = run(Array.from({ length: 6 }, () => sale(84, 1e6, '2026-05')), { map: { 84: 'v:3' } });
  ok(BR.typeFigures(sameMonth.tx, '3', 'resale', latest).figures === false, '6 sales in one month: not a typical price (3 months needed)');
}

/* ---------- the completeness gate (Claude C): what an unclassified size could be, and the type withheld when too many of those are unclassified ---------- */
{
  const H = require('../bedroom-hybrid.js');
  // URA rental contracts: [{areaSqm, areaSqft, noOfBedRoom, leaseDate}] like the private files
  const rent = (sqm, sqft, beds, n) => Array.from({ length: n }, (x, k) => ({ areaSqm: sqm, areaSqft: sqft, noOfBedRoom: String(beds), leaseDate: '0126', rent: 4000 + k }));
  // 63 sqm 2BR and 115 sqm 3BR (accepted); 97 sqm unclassified with mixed rentals (6 x 3BR, 4 x 2BR); 80 sqm unclassified with no rentals
  const entry = { map: { 63: 'i:2', 115: 'i:3', 97: null, 80: null } };
  const rentals = rent('60-70', '600-700', 2, 30).concat(rent('90-100', '1000-1100', 3, 6), rent('90-100', '1000-1100', 2, 4), rent('110-120', '1200-1300', 3, 30));
  const rows = [];
  months('2024-10', 24).forEach((m, k) => { if (k < 20) rows.push(sale(63, 1.2e6, m)); rows.push(sale(115, 2.4e6, m)); });
  months('2025-10', 6).forEach((m) => rows.push(sale(97, 2e6, m)));
  rows.push(sale(80, 1.5e6, '2026-03'), sale(80, 1.5e6, '2026-04'));
  const map = BR.possibleFor(entry, rows, rentals), at = (a) => map.find((x) => x.sqm === a);
  ok(at('97').possible.sort().join() === '2,3', 'mixed rental declarations: the size could be either count (10%+ of contracts)', at('97'));
  ok(at('80').possible.sort().join() === '2,3', 'no rental contract: the counts of the nearest classified sizes below and above', at('80'));
  ok(at('63').group === '2' && !('possible' in at('63')), 'a classified size keeps its accepted type');
  const gate = H.completeness({ mapping: map }, rows, latest);
  ok(gate.types['2'].kept === 20 && gate.types['2'].ambiguous === 8 && gate.types['2'].ok === false, '2-bedroom: 8 of 28 possible resales unclassified (29%): withheld', gate.types['2']);
  ok(gate.types['3'].kept === 24 && gate.types['3'].ambiguous === 8 && gate.types['3'].ok === false, '3-bedroom: 8 of 32 (25%): withheld, although the unclassified sizes lie outside its own size range', gate.types['3']);
  const res = run(rows, entry);
  const t = BR.typeFigures(res.tx, '3', 'resale', latest, gate.types['3']);
  ok(t.figures === false && t.why === 'ambiguous', 'the build follows the gate: no figures', t);
  const fine = H.completeness({ mapping: map }, rows.filter((r) => r.sqm !== 97 || r.ym > YM('2026-08')), latest);
  ok(fine.types['3'].ok === true && BR.typeFigures(res.tx, '3', 'resale', latest, fine.types['3']).figures === true, 'with few unclassified resales the type is shown', fine.types['3']);
  const thin = H.completeness({ mapping: [{ sqm: '63', group: '2', tier: 'inferred' }] }, rows.filter((r) => r.sqm === 63).slice(0, 4), latest);
  ok(thin.types['2'].ok === false && BR.typeFigures(run(rows.filter((r) => r.sqm === 63).slice(0, 4), { map: { 63: 'i:2' } }).tx, '2', 'resale', latest, thin.types['2']).why === 'few', 'under 5 classified recent resales: named as too few');
}

/* ---------- price movement: one size band of one type, Market Pulse rules ---------- */
{
  const rows = [];
  months('2024-10', 24).forEach((m, k) => { rows.push(sale(84, (k < 12 ? 1.8e6 : 1.9e6) + (k % 3) * 5000, m)); });   // 904 sq ft, 24 months
  months('2025-10', 12).forEach((m) => { rows.push(sale(120, 3.5e6, m)); });   // a bigger 3-bedroom selling only recently (a mix shift)
  const res = run(rows, { map: { 84: 'v:3', 120: 'v:3' } });
  const tr = BR.typeTrend(res.tx, '3', latest, true);
  ok(tr.bin === 900 && tr.a === 12 && tr.b === 12, 'the most-sold band of the type, both periods', tr);
  ok(tr.evidence === 'strong' && tr.dir === 'higher' && tr.pct > 4 && tr.pct < 7, 'the reading is the band’s, not moved by the bigger units now selling', tr);
  ok(tr.other === 12, 'sales of other sizes are counted as left out of the reading');
  const off = BR.typeTrend(res.tx, '3', latest, false);
  ok(off.evidence === 'none' && off.why === 'coverage', 'uneven classification between the two years: no reading');
  const thin = run(months('2025-10', 4).map((m) => sale(84, 1.8e6, m)), { map: { 84: 'v:3' } });
  ok(BR.typeTrend(thin.tx, '3', latest, true).evidence === 'none', 'no earlier year: no reading');
}

/* ---------- the build refuses what it must ---------- */
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gwbr-')), site = path.join(tmp, 'site');
  fs.mkdirSync(path.join(site, 'data/projects'), { recursive: true });
  fs.writeFileSync(path.join(site, 'data/projects/manifest.json'), JSON.stringify({ latestMonth: '2026-09', asOf: '2026-10-05', shards: 64 }));
  const snap = (o) => { const f = path.join(tmp, 'snap' + Math.random() + '.json'); fs.writeFileSync(f, JSON.stringify(Object.assign({ asOf: '2026-10-24', latestMonth: '2026-09', rentalWindow: { from: '23q4', to: '26q3', quarters: 12 }, comparison: false, developments: {} }, o))); return f; };
  const err = (o) => { try { BR.build(o); return ''; } catch (e) { return e.message; } };
  ok(/comparison/.test(err({ snapshot: snap({ comparison: true }), site, raw: tmp, report: path.join(tmp, 'r') })), 'a comparison snapshot is refused');
  ok(/12-quarter/.test(err({ snapshot: snap({ rentalWindow: { from: '22q4', to: '26q3', quarters: 16 } }), site, raw: tmp, report: path.join(tmp, 'r') })), 'a 16-quarter snapshot is refused');
  ok(/data months differ/.test(err({ snapshot: snap({ latestMonth: '2026-06' }), site, raw: tmp, report: path.join(tmp, 'r') })), 'a snapshot from another data month is refused');
  ok(/outside the site/.test(err({ snapshot: snap({}), site, raw: tmp, report: path.join(site, 'private') })), 'a report folder inside the site is refused');
  fs.rmSync(tmp, { recursive: true, force: true });
}

/* ---------- the published files (when built) carry aggregates only ---------- */
{
  const dir = path.join(__dirname, '..', '..', '..', 'data/projects/bedroom');
  if (fs.existsSync(dir)) {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')), man = JSON.parse(fs.readFileSync(path.join(dir, '..', 'manifest.json'), 'utf8'));
    ok(meta.latestMonth === man.latestMonth && meta.rentalWindow.quarters === 12, 'published data: same month as Research, 12-quarter window');
    const bad = [];
    fs.readdirSync(dir).filter((f) => /^s\d+\.json$/.test(f)).forEach((f) => {
      const txt = fs.readFileSync(path.join(dir, f), 'utf8');
      if (/"map"|"codes"|"areas?"|"sqm"|"tiers"|"rental"|"contracts"|"unit"/.test(txt)) bad.push(f);
      Object.values(JSON.parse(txt).projects).forEach((p) => ['resale', 'new', 'sub'].forEach((s) => (p[s] ? p[s].types : []).forEach((t) => { if (!(t.n >= 5 && t.act >= 3)) bad.push(f + ' ' + t.g); })));
    });
    ok(bad.length === 0, 'published shards: no areas, layout codes, tiers, rental figures or unit numbers; every type meets the typical-price rule', bad.slice(0, 3));
  }
}

console.log('bedroom-research-tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
