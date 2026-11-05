'use strict';
/* Floor-aware layout matching (levels column, 5 Nov 2026), on SYNTHETIC developments only: no real floor-plan table, sale or rental
   contract is used or kept in the repository.
   Run from the site folder: node tools/market-data/tests/bedroom-levels-tests.js */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const E = require('../bedroom-engine.js'), H = require('../bedroom-hybrid.js'), BR = require('../build-bedroom-research.js'), TX = require('../build-tx-history.js');
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
const rent = (sqm, sqft, beds, n) => Array.from({ length: n }, () => ({ areaSqm: sqm, areaSqft: sqft, noOfBedRoom: String(beds), leaseDate: '0326' }));
const LATEST = 2026 * 12 + 8, CTX = { latest: LATEST, periodMonths: 12, periods: 5, bin: 100 };
const sale = (area, n, floor) => Array.from({ length: n }, (x, i) => ({ project: 'SYNTH', areaRaw: String(area), sqm: Number(area), sale: 3, ym: LATEST - (i % 24), psf: 1500 + i, price: 1e6 + i * 1000, floor }));
const HEAD = 'project,code,bedrooms,variant,sqm,sqft,levels,source,status,note';
const TABLE = [HEAD,
  'SYNTH,A1,1,,45,,1-15,s,developer,',
  'SYNTH,B1,2,,63,,1-15,s,developer,',
  'SYNTH,T1-PH,1,penthouse,63,,16,s,developer,top storey',
  'SYNTH,C1,3,,96,,1-15,s,developer,',
  'SYNTH,D1,4,,96,,1-15,s,developer,',
  'SYNTH,T4-PH,4,penthouse,96,,16,s,developer,top storey'].join('\n');
const P = () => E.loadLayouts(TABLE, '').get('SYNTH');
const map = (S) => Object.fromEntries(S.mapping.map((m) => [m.sqm, m.group == null ? null : m.tier[0] + ':' + m.group]));

console.log('Levels: parsing and floor bands');
t('levels: a storey, a range, blank; anything else is an issue and ignored', () => {
  assert.deepStrictEqual([E.parseLevels('16'), E.parseLevels('1-15'), E.parseLevels(' 2 - 3 '), E.parseLevels('')], [[16, 16], [1, 15], [2, 3], null]);
  assert.strictEqual(E.parseLevels('16+'), undefined); assert.strictEqual(E.parseLevels('15-1'), undefined); assert.strictEqual(E.parseLevels('0'), undefined);
  const Q = E.loadLayouts(HEAD + '\nSYNTH,A1,1,,45,,top,s,developer,', '').get('SYNTH');
  assert.ok(Q.issues.some((s) => /levels "top" not understood/.test(s))); assert.strictEqual(Q.layouts[0].levels, null); assert.strictEqual(Q.hasLevels, false);
});
t('URA floor bands: numeric bands only; "-" and basement bands never filter', () => {
  assert.deepStrictEqual([E.floorBand('16-20'), E.floorBand('01-05')], [[16, 20], [1, 5]]);
  assert.strictEqual(E.floorBand('-'), null); assert.strictEqual(E.floorBand('B1-B5'), null); assert.strictEqual(E.floorBand(null), null);
});
t('a band keeps every layout whose storeys overlap it, and every layout without levels; it never picks one floor', () => {
  const L = P().layouts.concat([{ code: 'Z', bedrooms: 2, variant: '', levels: null, iv: [62.5, 63.5] }]);
  assert.deepStrictEqual(E.layoutsOnFloor(L, '16-20').map((l) => l.code), ['T1-PH', 'T4-PH', 'Z']);
  assert.deepStrictEqual(E.layoutsOnFloor(L, '11-15').map((l) => l.code), ['A1', 'B1', 'C1', 'D1', 'Z']);
  assert.strictEqual(E.layoutsOnFloor(L, '-').length, L.length);
  assert.strictEqual(E.layoutsOnFloor([{ code: 'M', levels: [14, 17] }], '11-15').length, 1);   // a layout on 14 to 17 stays on both bands
});

console.log('Import: tables read by their own header');
t('the folder loads an old-format table and a table with levels, other column order and a quoted note', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-levels-'));
  fs.writeFileSync(path.join(d, 'layouts.csv'), 'project,code,bedrooms,variant,sqm,sqft,source,status,note\nOLD,B1,2,,63,,s,approved,\nOLD,C1,3,,97,,s,approved,"note, with comma"\n');
  fs.writeFileSync(path.join(d, 'synth.csv'), 'code,project,bedrooms,variant,sqm,sqft,source,status,note,levels\nA1,SYNTH,1,,45,,s,developer,"page 4, left",1-15\nT1-PH,SYNTH,1,penthouse,63,,s,developer,,16\n');
  fs.writeFileSync(path.join(d, 'sources.csv'), 'id,project,title,url,retrieved,kind,note\ns,*,Synthetic,,2026-11-05,developer,\n');
  const db = H.loadDb([d]);
  assert.deepStrictEqual(db.get('OLD').layouts.map((l) => [l.code, l.levels, l.note]), [['B1', null, ''], ['C1', null, 'note, with comma']]);
  assert.deepStrictEqual(db.get('SYNTH').layouts.map((l) => [l.code, l.levels, l.note]), [['A1', [1, 15], 'page 4, left'], ['T1-PH', [16, 16], '']]);
  assert.deepStrictEqual(db.get('SYNTH').issues.concat(db.get('OLD').issues), []);
  assert.strictEqual(db.get('OLD').hasLevels, false); assert.strictEqual(db.get('SYNTH').hasLevels, true);
});

console.log('Floor-dependent decisions');
const R1 = rent('60-70', '600-700', 2, 28).concat(rent('60-70', '600-700', 1, 2), rent('40-50', '400-500', 1, 20));
t('default rule A (safeguard kept): a floor-dependent size is decided per band, and where the pooled rental count differs from the floor\'s layout it is a contradiction', () => {
  assert.strictEqual(H.FLOOR_RULE, 'A');
  const S = H.classifyDevelopment(sale(45, 10, '06-10').concat(sale(63, 10, '06-10'), sale(63, 2, '16-20')), P(), R1, CTX);
  assert.deepStrictEqual(map(S), { '45': 'v:1', '63@06-10': 'v:2', '63@16-20': null });
  assert.deepStrictEqual(S.contradictions.map((c) => [c.sqm, c.floor, c.layouts, c.rental]), [['63', '16-20', 1, 2]]);
  assert.deepStrictEqual(S.mapping.find((m) => m.sqm === '63@16-20').possible.sort(), ['2', 'PH']);
});
t('rule B (proposed, only when a caller sets it): the floor\'s layout decides when a contract at that size declares its count', () => {
  const S = H.classifyDevelopment(sale(45, 10, '06-10').concat(sale(63, 10, '06-10'), sale(63, 2, '16-20')), P(), R1, Object.assign({ floorRule: 'B' }, CTX));
  assert.deepStrictEqual(map(S), { '45': 'v:1', '63@06-10': 'v:2', '63@16-20': 'v:PH' });
  assert.deepStrictEqual(S.contradictions, []);
  assert.deepStrictEqual(S.floorDependent.map((f) => [f.key, f.group]).sort(), [['63@06-10', '2'], ['63@16-20', 'PH']]);
  assert.ok(/pooled across floors/.test(S.floorDependent.find((f) => f.key === '63@16-20').rental));
});
t('rule B: if no contract at that size declares the floor\'s layout count, it is still a contradiction (could be the penthouse group or 2)', () => {
  const R = rent('60-70', '600-700', 2, 30).concat(rent('40-50', '400-500', 1, 20));
  const S = H.classifyDevelopment(sale(45, 10, '06-10').concat(sale(63, 10, '06-10'), sale(63, 2, '16-20')), P(), R, Object.assign({ floorRule: 'B' }, CTX));
  assert.strictEqual(map(S)['63@16-20'], null);
  assert.deepStrictEqual(S.contradictions.map((c) => [c.sqm, c.floor, c.layouts, c.rental]), [['63', '16-20', 1, 2]]);
  assert.deepStrictEqual(S.mapping.find((m) => m.sqm === '63@16-20').possible.sort(), ['2', 'PH']);
});
t('a sale with no usable band ("-") is matched to every layout, exactly as before', () => {
  const S = H.classifyDevelopment(sale(63, 6, '-').concat(sale(45, 6, '-')), P(), R1, CTX);
  assert.deepStrictEqual(map(S), { '45': 'v:1', '63': 'i:2' });
});
t('on a band that still has several bedroom groups, the rental count is used only if a layout on that band has it', () => {
  const S3 = H.classifyDevelopment(sale(96, 8, '06-10'), P(), rent('90-100', '1000-1100', 3, 30), CTX);
  assert.deepStrictEqual(map(S3), { '96@06-10': 'i:3' });
  const S2 = H.classifyDevelopment(sale(96, 8, '06-10'), P(), rent('90-100', '1000-1100', 2, 30), CTX);
  assert.deepStrictEqual(map(S2), { '96@06-10': null });
});
t('the same table without levels behaves exactly as the engine did before (one decision per size, rental fallback at 63)', () => {
  const noLev = E.loadLayouts(TABLE.replace(',levels', '').replace(/,(1-15|16),s,/g, ',s,'), '').get('SYNTH');
  assert.strictEqual(noLev.hasLevels, false);
  const rows = sale(45, 10, '06-10').concat(sale(63, 10, '06-10'), sale(63, 2, '16-20'));
  const S = H.classifyDevelopment(rows, noLev, R1, CTX);
  assert.deepStrictEqual(map(S), { '45': 'v:1', '63': 'i:2' }); assert.strictEqual(S.floorDependent, undefined);
});
t('the completeness gate (unchanged) reads the floor-band decisions through floorKeyed()', () => {
  const rows = sale(45, 10, '06-10').concat(sale(63, 10, '06-10'), sale(63, 6, '16-20'));
  const S = H.classifyDevelopment(rows, P(), R1, CTX), c = H.completeness(S, H.floorKeyed(S.mapping, rows), LATEST);
  assert.strictEqual(H.floorKeyed([{ sqm: '63' }], rows), rows);   // no band keys: the very same rows
  // rule A: the 6 top-storey sales are unclassified and count as "could be" 2-bedroom or penthouse
  assert.strictEqual(Math.round(c.coverage * 1000), 769); assert.deepStrictEqual([c.types['2'].kept, c.types['2'].ambiguous, c.types['2'].ok, c.types['1'].kept], [10, 6, false, 10]);
  const SB = H.classifyDevelopment(rows, P(), R1, Object.assign({ floorRule: 'B' }, CTX)), cb = H.completeness(SB, H.floorKeyed(SB.mapping, rows), LATEST);
  assert.strictEqual(cb.coverage, 1); assert.deepStrictEqual([cb.types['2'].kept, cb.types.PH.kept, cb.types['1'].kept], [10, 6, 10]);
});

console.log('Published builds read the floor-band keys');
const entry = { map: { '45': 'v:1', '63@06-10': 'v:2', '63@16-20': 'v:PH', '96@06-10': null } };
t('Research: decider and possibleFor use the band key first, then the size', () => {
  const d = BR.decider(entry);
  assert.deepStrictEqual([d({ areaRaw: '63', floor: '16-20' }).group, d({ areaRaw: '63', floor: '06-10' }).group, d({ areaRaw: '45', floor: '16-20' }).group, d({ areaRaw: '63', floor: '-' }).group], ['PH', '2', '1', null]);
  const pf = BR.possibleFor(entry, sale(96, 3, '06-10'), rent('90-100', '1000-1100', 3, 4).concat(rent('90-100', '1000-1100', 4, 4)));
  assert.deepStrictEqual(pf.find((m) => m.sqm === '96@06-10').possible.sort(), ['3', '4']);
  assert.deepStrictEqual(pf.map((m) => m.sqm), ['45', '63@06-10', '63@16-20', '96', '96@06-10']);
});
t('Transactions: a row takes its band\'s label; a penthouse group is not a bedroom count (shown as unknown)', () => {
  const own = (k) => Object.prototype.hasOwnProperty.call(entry.map, k), dec = (a, fr) => (fr && own(a + '@' + fr) ? entry.map[a + '@' + fr] : entry.map[a]) || null;
  const rows = [{ ym: LATEST, sale: 3, floorRange: '06-10', sqm: 63, areaRaw: '63', price: 1e6 }, { ym: LATEST, sale: 3, floorRange: '16-20', sqm: 63, areaRaw: '63', price: 9e5 }];
  const out = TX.buildRows(rows, dec, ['01-05', '06-10', '11-15', '16-20']);
  assert.deepStrictEqual(out.map((r) => [r[2], r[5], r[6]]), [[1, 2, 'v'], [3, null, null]]);
});
t('refresh comparison: a band key that split from a size is compared with that size', () => {
  const c = H.changes({ developments: { SYNTH: { share: 0.6, map: { '45': 'i:1', '63': 'i:2' } } } }, { developments: { SYNTH: { share: 1, map: { '45': 'v:1', '63@06-10': 'v:2', '63@16-20': 'v:PH' } } } });
  assert.deepStrictEqual(c.contradictions, [{ project: 'SYNTH', sqm: '63@16-20', was: 'i:2', now: 'v:PH' }]);
});
t('the repository holds no real floor-plan table (only the empty template)', () => {
  const dir = path.join(__dirname, '..'), csvs = fs.readdirSync(dir).filter((f) => /\.csv$/i.test(f));
  assert.deepStrictEqual(csvs, ['floorplan-template.csv']); assert.strictEqual(fs.readFileSync(path.join(dir, 'floorplan-template.csv'), 'utf8').trim(), HEAD);
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
