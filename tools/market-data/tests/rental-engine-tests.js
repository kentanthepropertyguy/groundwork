// node tools/market-data/tests/rental-engine-tests.js : URA-first inference from rental contracts, the hybrid tiers, layout checks and
// positioned brochure extraction. Synthetic data only (tests, never findings).
'use strict';
const assert = require('assert');
const RE = require('../rental-engine.js'), E = require('../bedroom-engine.js'), Q = require('../layout-quality.js'), XP = require('../extract-positioned.js'), H = require('../bedroom-hybrid.js');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const rent = (sqm, sqft, beds, n, lease) => Array.from({ length: n }, () => ({ areaSqm: sqm, areaSqft: sqft, noOfBedRoom: String(beds), leaseDate: lease || '0326' }));
const sale = (area, n, sale_) => Array.from({ length: n }, (x, i) => ({ areaRaw: String(area), sqm: Number(area), sale: sale_ || 3, ym: 2026 * 12 + 8 - (i % 24), psf: 1500 + i, price: 1e6 + i * 1000, floor: '06-10' }));

console.log('Contracts and cells');
t('a contract is the intersection of its sqm and sq ft bands; NA and open bands are dropped', () => {
  const c = RE.contract({ areaSqm: '60-70', areaSqft: '600-700', noOfBedRoom: '2', leaseDate: '0326' });
  assert.strictEqual(c.lo, 60); assert.ok(Math.abs(c.hi - 700 / 10.7639) < 1e-9); assert.strictEqual(c.beds, 2);
  assert.strictEqual(RE.contract({ areaSqm: '60-70', areaSqft: '600-700', noOfBedRoom: 'NA' }), null);
  assert.strictEqual(RE.contract({ areaSqm: '>3000', areaSqft: '>30000', noOfBedRoom: '5' }), null);
  const cs = RE.contracts([{ areaSqm: '60-70', areaSqft: '900-1000', noOfBedRoom: '3' }]); assert.strictEqual(cs.bandConflicts, 1); assert.strictEqual(cs[0].lo, 60);
});
console.log('The rule');
const cells = RE.cells(RE.contracts([].concat(rent('60-70', '600-700', 2, 30), rent('60-70', '700-800', 3, 6), rent('90-100', '900-1000', 3, 3), rent('90-100', '1000-1100', 3, 9), rent('90-100', '1000-1100', 2, 3), rent('120-130', '1200-1300', 4, 4))));
t('inferred: enough contracts, at most one in ten disagreeing (strong at 20+ and one in twenty)', () => { const d = RE.classifySale('63', cells); assert.strictEqual(d.cls, 'inferred'); assert.strictEqual(d.beds, 2); assert.strictEqual(d.tier, 'strong'); });
t('a sale on a band edge is compared with both sides; disagreement there is "mixed"', () => { const d = RE.classifySale('65', cells); assert.strictEqual(d.n, 36); assert.strictEqual(d.cls, 'mixed'); });
t('mixed: 9 of 12 agree is not enough', () => { const d = RE.classifySale('97', cells); assert.strictEqual(d.cls, 'mixed'); assert.strictEqual(d.lead, 3); });
t('sparse: fewer than 5 contracts', () => { assert.strictEqual(RE.classifySale('120', cells).cls, 'sparse'); });
t('none: no contract of that size', () => { assert.strictEqual(RE.classifySale('150', cells).cls, 'none'); });
t('unrepresented: a size too rare among sales for the band to speak for it', () => {
  const cl = RE.cells(RE.contracts(rent('90-100', '1000-1100', 3, 40))), rows = sale(97, 60).concat(sale(99, 2));
  const ctx = RE.salesContext(rows, cl);
  assert.strictEqual(RE.classifySale('97', cl, null, ctx).cls, 'inferred');
  const d = RE.classifySale('99', cl, null, ctx); assert.strictEqual(d.cls, 'unrepresented'); assert.strictEqual(d.inferredBeds, 3); assert.ok(d.expected < 3);
});
console.log('Checks');
t('held-out contracts: predictions on contracts the mapping never saw', () => {
  const cs = RE.contracts(rent('60-70', '600-700', 2, 40).concat(rent('80-90', '900-1000', 3, 40)));
  const h = RE.randomHoldout(cs, 5, 3); assert.strictEqual(h.wrong, 0); assert.ok(h.coverage > 0.9);
});
t('against a layout table: agreement, wrong sales and coverage of each method', () => {
  const lay = E.loadLayouts('project,code,bedrooms,variant,sqm,sqft,source,status\nQ,B1,2,,63,,s,secondary\nQ,C1,3,,97,,s,secondary\nQ,C2,2,penthouse,99,,s,secondary', '').get('Q').layouts;
  const cl = RE.cells(RE.contracts(rent('60-70', '600-700', 2, 30).concat(rent('90-100', '1000-1100', 3, 40))));
  const rows = sale(63, 20).concat(sale(97, 40), sale(99, 10));
  const c = RE.compare(rows, cl, lay);
  assert.strictEqual(c.wrong, 10, 'the 99 sqm 2-bedroom shares a band with 40 3-bedroom contracts and enough sales to be judged: the rental reading is wrong and counted');
  assert.strictEqual(c.agree, 60);
  const c2 = RE.compare(sale(63, 20).concat(sale(97, 60), sale(99, 2)), cl, lay); assert.strictEqual(c2.wrong, 0, 'with only 2 sales at 99 sqm the size is unrepresented, so no wrong call');
});
t('refresh: a size whose inferred count changes is a contradiction', () => {
  const ch = RE.compareMappings([{ sqm: '63', cls: 'inferred', beds: 2 }, { sqm: '97', cls: 'inferred', beds: 3 }], [{ sqm: '63', cls: 'inferred', beds: 3 }, { sqm: '97', cls: 'mixed' }, { sqm: '120', cls: 'inferred', beds: 4 }]);
  assert.deepStrictEqual(ch.contradictions.map((x) => x.sqm), ['63']); assert.deepStrictEqual(ch.lost.map((x) => x.sqm), ['97']); assert.deepStrictEqual(ch.gained.map((x) => x.sqm), ['120']);
});
t('a developer size range only flags; it never classifies', () => {
  const rc = RE.rangeCheck([{ sqm: '63', cls: 'inferred', beds: 2, sales: 5 }, { sqm: '150', cls: 'inferred', beds: 2, sales: 1 }, { sqm: '97', cls: 'mixed' }], [{ bedrooms: '2', sqft_lo: '600', sqft_hi: '800' }]);
  assert.strictEqual(rc.checked, 2); assert.strictEqual(rc.inside, 1); assert.deepStrictEqual(rc.outside.map((x) => x.sqm), ['150']);
});

console.log('Layout table checks');
t('a table that explains the sales and agrees with rentals is usable; incomplete rows and gaps are named', () => {
  const ok = E.loadLayouts('project,code,bedrooms,variant,sqm,sqft,source,status\nQ,B1,2,,63,,s,draft\nQ,C1,3,,97,,s,draft', '').get('Q').all;
  const rentals = rent('60-70', '600-700', 2, 30).concat(rent('90-100', '1000-1100', 3, 30));
  const q = Q.check(ok, sale(63, 50).concat(sale(97, 50)), rentals); assert.strictEqual(q.verdict, 'usable'); assert.strictEqual(q.explained, 1); assert.strictEqual(q.rental.agree, 1);
  const bad = E.loadLayouts('project,code,bedrooms,variant,sqm,sqft,source,status\nQ,B1,1,,63,,s,draft\nQ,C1,3,,97,,s,draft\nQ,X,,,70,,s,draft', '').get('Q').all;
  const q2 = Q.check(bad, sale(63, 50).concat(sale(97, 50), sale(80, 5)), rentals);
  assert.strictEqual(q2.verdict, 'review'); assert.ok(q2.reasons.some((r) => /rental contracts agree/.test(r)) && q2.reasons.some((r) => /repeated sale area/.test(r)));
});
t('merging two documents: identical rows once, a conflicting code is left out and reported', () => {
  const m = Q.merge([[{ code: 'A1', bedrooms: 1, sqm: '45' }, { code: 'B1', bedrooms: 2, sqm: '63' }], [{ code: 'A1', bedrooms: 1, sqm: '45' }, { code: 'B1', bedrooms: 3, sqm: '63' }, { code: 'C1', bedrooms: 3, sqm: '97' }]]);
  assert.deepStrictEqual(m.rows.map((r) => r.code), ['A1', 'C1']); assert.deepStrictEqual(m.conflicts.map((c) => c.code), ['B1']);
});

console.log('Positioned brochure pages');
const word = (t, x0, y0, w, h) => ({ t, x0, y0, x1: x0 + (w || t.length * 8), y1: y0 + (h || 12) });
t('side-by-side plans: each label takes the area beneath it in its own column, and its column heading', () => {
  const page = { w: 1000, h: 1400, words: [word('2', 80, 100, 14, 28), word('BEDROOM', 100, 101, 120, 26), word('3', 580, 100, 14, 28), word('BEDROOM', 600, 101, 120, 26),
    word('TYPE', 90, 160), word('B1', 130, 160), word('TYPE', 590, 160), word('ClP', 630, 160),
    word('63', 90, 190), word('sqm', 112, 190), word('/', 140, 190), word('678', 150, 190), word('sqft', 180, 190), word('97', 590, 190), word('sqm', 612, 190),
    word('Incl.', 590, 210), word('of', 630, 210), word('12', 650, 210), word('sqm', 672, 210), word('PES', 700, 210)] };
  const rows = XP.pairPage(page);
  assert.deepStrictEqual(rows.map((r) => [r.code, r.bedrooms, r.sqm, r.sqft]), [['B1', 2, '63', '678'], ['C1P', 3, '97', '']]);
  assert.ok(/read as "ClP"/.test(rows[1].note));
});
t('a plan shared by several codes gives each code the same area', () => {
  const page = { w: 1000, h: 1400, words: [word('1', 80, 100), word('BEDROOM', 95, 100), word('TYPE', 90, 160), word('A1/A2', 130, 160), word('45', 90, 190), word('sqm', 112, 190)] };
  assert.deepStrictEqual(XP.pairPage(page).map((r) => [r.code, r.bedrooms, r.sqm]), [['A1', 1, '45'], ['A2', 1, '45']]);
});
t('OCR code slips are repaired only between letters and digits', () => { assert.strictEqual(XP.fixCode('AlP'), 'A1P'); assert.strictEqual(XP.fixCode('ClaG'), 'C1aG'); assert.strictEqual(XP.fixCode('PH'), 'PH'); assert.strictEqual(XP.fixCode('DlO'), 'D10'); });
t('a page with no bedroom words leaves the count blank (never guessed)', () => {
  const r = XP.pairPage({ w: 1000, h: 1400, words: [word('TYPE', 90, 160), word('B1', 130, 160), word('63', 90, 190), word('sqm', 112, 190)] });
  assert.strictEqual(r[0].bedrooms, null); assert.ok(/bedrooms not found/.test(r[0].note));
});

console.log('Hybrid tiers');
t('verified where a checked table fits; inferred from rentals elsewhere; a disagreement is unclassified and reported', () => {
  const P = E.loadLayouts('project,code,bedrooms,variant,sqm,sqft,source,status\nQ,B1,2,,63,,s,approved\nQ,C1,3,,97,,s,approved\nQ,A1,1,,60,,s,approved', '').get('Q');
  const rentals = rent('60-70', '600-700', 2, 60).concat(rent('90-100', '1000-1100', 3, 30), rent('110-120', '1200-1300', 4, 10));
  const rows = sale(63, 30).concat(sale(97, 20), sale(60, 10), sale(115, 6)).map((x) => Object.assign({ project: 'Q' }, x));
  const S = H.classifyDevelopment(rows, P, rentals, { latest: 2026 * 12 + 8, periodMonths: 12, periods: 5, bin: 100 });
  assert.strictEqual(S.totals.tiers.verified, 50); assert.strictEqual(S.totals.tiers.inferred, 6); assert.strictEqual(S.totals.tiers.unclassified, 10);
  assert.deepStrictEqual(S.contradictions.map((c) => [c.sqm, c.layouts, c.rental]), [['60', 1, 2]]);
  assert.ok(S.groups['4'] && S.groups['4'].tiers.inferred === 6);
});
t('refresh snapshot: a size that changes bedroom count is reported, and coverage moves are listed', () => {
  const a = { developments: { Q: { share: 0.9, map: { '63': 'v:2', '97': 'i:3' } } } }, b = { developments: { Q: { share: 0.8, map: { '63': 'v:2', '97': 'i:2' } }, R: { share: 1, map: {} } } };
  const c = H.changes(a, b); assert.deepStrictEqual(c.contradictions.map((x) => x.sqm), ['97']); assert.strictEqual(c.coverageDrops.length, 1); assert.deepStrictEqual(c.newDevelopments, ['R']);
});

t('public view: layout-verified types only unless rental inference is allowed; low coverage is left out', () => {
  const P = E.loadLayouts('project,code,bedrooms,variant,sqm,sqft,source,status\nQ,B1,2,,63,,s,approved\nQ,C1,3,,97,,s,approved', '').get('Q');
  const rentals = rent('60-70', '600-700', 2, 60).concat(rent('90-100', '1000-1100', 3, 30), rent('110-120', '1200-1300', 4, 10));
  const rows = sale(63, 30).concat(sale(97, 20), sale(115, 6)).map((x) => Object.assign({ project: 'Q' }, x));
  const S = Object.assign(H.classifyDevelopment(rows, P, rentals, { latest: 2026 * 12 + 8, periodMonths: 12, periods: 5, bin: 100 }), { project: 'Q', id: 'q', cls: 'condo' });
  const rep = { asOf: 'x', latestMonth: '2026-09', developments: [S] };
  assert.deepStrictEqual(H.publicView(rep).developments.q.groups.map((g) => g.g), ['2', '3']);
  const all = H.publicView(rep, { allowRental: true }).developments.q.groups; assert.deepStrictEqual(all.map((g) => [g.g, g.basis.verified, g.basis.inferred]), [['2', 30, 0], ['3', 20, 0], ['4', 0, 6]]);
  const low = Object.assign({}, S, { totals: Object.assign({}, S.totals, { resale: Object.assign({}, S.totals.resale, { share: 0.5 }) }) });
  assert.deepStrictEqual(H.publicView({ developments: [low] }).developments, {});
});
t('completeness gate: unclassified sizes carry their possible bedroom counts; a type is withheld when too many of its possible resales are unclassified', () => {
  // 63 sqm: 2BR by rentals; 97 sqm: rentals 6 x 3BR + 4 x 2BR (mixed: could be 2 or 3); 80 sqm: no rentals (could be its neighbours, 2 or 3); 110 sqm: 3BR
  const rentals = rent('60-70', '600-700', 2, 30).concat(rent('90-100', '1000-1100', 3, 6), rent('90-100', '1000-1100', 2, 4), rent('110-120', '1200-1300', 3, 30));
  const rows = sale(63, 20).concat(sale(97, 6), sale(80, 2), sale(115, 24)).map((x) => Object.assign({ project: 'Q' }, x));
  const S = H.classifyDevelopment(rows, null, rentals, { latest: 2026 * 12 + 8, periodMonths: 12, periods: 5, bin: 100 });
  const m = new Map(S.mapping.map((x) => [x.sqm, x]));
  assert.deepStrictEqual(m.get('97').possible.sort(), ['2', '3']); assert.deepStrictEqual(m.get('80').possible.sort(), ['2', '3']); assert.ok(!('possible' in m.get('63')));
  const c = H.completeness(S, rows, 2026 * 12 + 8);
  assert.strictEqual(c.unclassified, 8); assert.strictEqual(c.coverage, 44 / 52);
  assert.deepStrictEqual([c.types['2'].kept, c.types['2'].ambiguous, c.types['2'].ok], [20, 8, false]);   // 8 / 28 = 29% > 20%: withheld
  assert.deepStrictEqual([c.types['3'].kept, c.types['3'].ambiguous, c.types['3'].ok], [24, 8, false]);   // 8 / 32 = 25%: withheld
  assert.strictEqual(H.completeness(S, rows, 2026 * 12 + 8, { maxAmbiguousShare: 0.3 }).types['3'].ok, true);
  assert.deepStrictEqual(H.rentalPossible({ counts: { 2: 19, 3: 1 } }), ['2']); assert.deepStrictEqual(H.rentalPossible({ counts: { 2: 3, 3: 1 } }).sort(), ['2', '3']);
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
