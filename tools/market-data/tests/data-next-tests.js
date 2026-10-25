// node tools/market-data/tests/data-next-tests.js : transaction rows, private-home rents and HDB rents (proposed outputs for the next
// Research release). Synthetic data only; no network, no private files.
'use strict';
const assert = require('assert');
const TX = require('../build-tx-history.js'), RR = require('../build-rent-research.js'), HR = require('../build-hdb-rent.js');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const BANDS = ['B1-B5', '01-05', '06-10', '11-15'];
const ym = (y, m) => y * 12 + m - 1;

console.log('Transaction rows');
const sale = (o) => Object.assign({ ym: ym(2026, 9), sale: 3, floorRange: '06-10', sqm: 70, areaRaw: '70', price: 1400000, nett: null }, o);
t('one row per record, newest first, with the URA fields only and floor as a band index', () => {
  const rows = TX.buildRows([sale({ ym: ym(2026, 1) }), sale({ floorRange: '-' }), sale({ sale: 1, nett: 1350000, ym: ym(2026, 3) })], () => null, BANDS);
  assert.deepStrictEqual(TX.FIELDS, ['ym', 'sale', 'floor', 'sqm', 'price', 'beds', 'basis', 'flags']);
  assert.deepStrictEqual(rows.map((r) => r[0]), [202609, 202603, 202601]);
  assert.strictEqual(rows[0][2], null); assert.strictEqual(rows[2][2], 2); assert.strictEqual(rows[1][7] & TX.FLAG.NETT, TX.FLAG.NETT);
});
t('bedroom comes from the per-size decision; unknown stays unknown; the basis is kept', () => {
  const rows = TX.buildRows([sale({ areaRaw: '70', sqm: 70 }), sale({ areaRaw: '95', sqm: 95, price: 1900000 }), sale({ areaRaw: '120', sqm: 120, price: 2400000 })], (a) => ({ 70: 'i:2', 95: 'v:3' }[a] || null), BANDS);
  const by = Object.fromEntries(rows.map((r) => [r[3], r]));
  assert.deepStrictEqual([by[70][5], by[70][6]], [2, 'i']); assert.deepStrictEqual([by[95][5], by[95][6]], [3, 'v']); assert.deepStrictEqual([by[120][5], by[120][6]], [null, null]);
});
t('unusual PSF, identical records and atypical sizes are flagged, never removed', () => {
  const base = [70, 70, 70, 70, 70].map((a, i) => sale({ price: 1400000 + i * 10000 }));
  const rows = TX.buildRows(base.concat([sale({ price: 600000 }), sale({ price: 1400000 }), sale({ areaRaw: '160', sqm: 160, price: 3200000 })]), (a) => (a === '70' || a === '160' ? 'i:2' : null), BANDS);
  assert.strictEqual(rows.length, 8);
  assert.ok(rows.some((r) => r[4] === 600000 && r[7] & TX.FLAG.PSF));
  assert.strictEqual(rows.filter((r) => r[4] === 1400000 && r[7] & TX.FLAG.REPEAT).length, 2);
  const big = rows.find((r) => r[3] === 160); assert.ok(big[7] & TX.FLAG.ATYPICAL); assert.strictEqual(big[5], 2);   // kept as the aggregates keep it, flagged
});

console.log('Private-home rents');
const R = (o) => Object.assign({ ym: ym(2026, 6), beds: 2, lo: 700, hi: 800, rent: 4000 }, o);
const many = (n, o, step) => Array.from({ length: n }, (x, i) => R(Object.assign({ ym: ym(2026, 9) - (i % 6), rent: (o && o.rent ? o.rent : 4000) + i * (step == null ? 10 : step) }, o, { rent: (o && o.rent ? o.rent : 4000) + i * (step == null ? 10 : step) })));
t('a URA rental record: lease commencement month, declared bedrooms (NA is unknown), 100 sq ft band', () => {
  assert.deepStrictEqual(RR.contract({ leaseDate: '0926', noOfBedRoom: '3', areaSqft: '1000-1100', rent: 5200 }), { ym: ym(2026, 9), beds: 3, lo: 1000, hi: 1100, rent: 5200 });
  assert.strictEqual(RR.contract({ leaseDate: '0926', noOfBedRoom: 'NA', areaSqft: '1000-1100', rent: 5200 }).beds, null);
  assert.strictEqual(RR.contract({ leaseDate: '0926', noOfBedRoom: '3', areaSqft: '>5000', rent: 5200 }), null);
});
t('typical rent needs 5 contracts over 3 months in the latest 12; fewer gives limited or counts only', () => {
  const d = RR.development(many(6).concat([R({ beds: 3, ym: ym(2026, 9) }), R({ beds: 3, ym: ym(2026, 8) }), R({ beds: 3, ym: ym(2026, 7) }), R({ beds: 4, ym: ym(2026, 9) }), R({ beds: 1, ym: ym(2024, 9) })]), ym(2026, 9), [], {});
  const by = Object.fromEntries(d.types.map((x) => [x.beds, x]));
  assert.strictEqual(by[2].evidence, 'typical'); assert.ok(by[2].rent); assert.strictEqual(by[4].evidence, 'counts'); assert.ok(!by[4].rent);
  // 25 Oct 2026: fewer than 5 contracts is a count only (no amount); 5+ in fewer than 3 months is "limited", with its amounts
  assert.strictEqual(by[3].evidence, 'counts'); assert.ok(!by[3].rent, '3 contracts: no rent amount');
  const l = RR.development([0, 0, 0, 1, 1].map((k, i) => R({ beds: 3, ym: ym(2026, 9) - k, rent: 5000 + i })), ym(2026, 9), [], {}).types[0];
  assert.strictEqual(l.evidence, 'limited'); assert.ok(l.rent && l.n === 5);
  assert.ok(!by[1]);   // older than 12 months: in the trend only
  assert.strictEqual(d.rows.length, 10);
});
t('an asking-rent band needs 10 contracts of the same bedrooms and size band', () => {
  const d = RR.development(many(10).concat(many(9, { lo: 800, hi: 900 })), ym(2026, 9), [], {});
  assert.deepStrictEqual(d.bands.map((b) => [b.beds, b.sqft[0], b.n]), [[2, 700, 10]]);
});
t('gross yield: same bedrooms, same size band (sizes strictly inside), 5+ each side, 24 months only if 12 are too few', () => {
  const rents = many(6, { rent: 4000 }, 0), s = (sqm, m, beds) => ({ ym: ym(2026, m), sale: 3, sqm, price: 1200000, beds });
  const sales = [s(70, 9, 2), s(71, 8, 2), s(72, 7, 2), s(73, 6, 2), s(74, 5, 2), s(65, 9, 2), s(70, 9, 3), s(74.4, 1, 2)];   // 65 sqm = 700 sq ft: on the edge, not inside
  const y = RR.development(rents, ym(2026, 9), sales, { yield: true }).yield;
  assert.strictEqual(y.length, 1); assert.deepStrictEqual([y[0].saleN, y[0].saleMonths, y[0].gross], [5, 12, 4]);
  const y24 = RR.development(rents, ym(2026, 9), sales.slice(0, 4).concat([s(72, 1, 2)]).map((x, i) => (i === 4 ? Object.assign({}, x, { ym: ym(2025, 1) }) : x)), { yield: true }).yield;
  assert.strictEqual(y24[0].saleMonths, 24);
  assert.deepStrictEqual(RR.development(rents, ym(2026, 9), sales.slice(0, 4), { yield: true }).yield, []);
});

console.log('HDB rents');
const csv = 'rent_approval_date,town,block,street_name,flat_type,monthly_rent\n2026-09,ANG MO KIO,105,ANG MO KIO AVE 4,4-ROOM,3200\n2026-08,CENTRAL,1,ROWELL RD,3-ROOM,2900\n2026-07,ANG MO KIO,111,ANG MO KIO AVE 9,3-ROOM,2600\n2021-01,ANG MO KIO,105,ANG MO KIO AVE 4,4-ROOM,2000\nbad,line\n';
t('parse: flat types as the resale files write them, the CENTRAL town name aligned, bad lines counted', () => {
  const p = HR.parseCsv(csv);
  assert.strictEqual(p.rows.length, 4); assert.strictEqual(p.bad.length, 1);
  assert.strictEqual(p.rows[0].type, '4 ROOM'); assert.strictEqual(p.rows[1].town, 'CENTRAL AREA');
});
t('blocks match the resale files and positions only on the exact town + block + street; history kept for the trend', () => {
  const p = HR.parseCsv(csv);
  const resale = { index: { types: ['3 ROOM', '4 ROOM'] }, towns: { 'ang-mo-kio': { streets: ['ANG MO KIO AVE 4', 'ANG MO KIO AVE 3'], rows: [[202609, '105', 0, 1, 1, 3, 90, 1980, 600, 500000], [202609, '111', 1, 0, 1, 3, 70, 1980, 600, 400000]] } } };
  const pos = { rows: { 'ang-mo-kio': { 'ANG MO KIO AVE 4': { 105: [1.3, 103.8] } } } };
  const r = HR.build(p.rows, null, resale, pos, { months: 24 });
  assert.strictEqual(r.report.rowsInWindow, 3); assert.strictEqual(r.report.rowsWhoseBlockHasResales, 1); assert.strictEqual(r.report.rowsWithMapPosition, 1);
  assert.strictEqual(r.report.rentalOnlyBlocks, 1);   // 111 AVE 9 is not 111 AVE 3
  assert.deepStrictEqual(r.report.unknownTowns, ['CENTRAL AREA']);
  assert.deepStrictEqual(r.towns['ang-mo-kio'].rows.map((x) => x[0]), [202609, 202607]);
  // 25 Oct 2026: a month with fewer than 5 rentals is left out of the published trend (here each month has 1), never a median of 1–4
  assert.strictEqual(r.index.trend['ang-mo-kio|4 ROOM'].length, 0); assert.strictEqual(r.index.historyFrom, 202101);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
