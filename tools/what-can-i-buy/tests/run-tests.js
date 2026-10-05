// node tools/what-can-i-buy/tests/run-tests.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const M = require('../../../assets/js/kpt-market.js');
const root = path.join(__dirname, '../../../data/market/test/');
const read = (sc, f) => fs.readFileSync(path.join(root, sc, f), 'utf8');
const dataset = (sc) => ({
  bands: M.normaliseBands(M.parseCSV(read(sc, 'bands.csv'))),
  shortlist: M.normaliseShortlist(M.parseCSV(read(sc, 'shortlist.csv'))),
  settings: M.normaliseSettings(M.parseCSV(read(sc, 'settings.csv'))),
});
const TODAY = new Date(Date.UTC(2026, 9, 5));
const single = (v) => ({ low: v, high: v });
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

console.log('Parsing');
t('CSV handles quotes, commas, CRLF, BOM', () => {
  const r = M.parseCSV('﻿a,b\r\n"x, y","he said ""hi"""\r\n');
  assert.deepStrictEqual(r, [{ a: 'x, y', b: 'he said "hi"' }]);
});
t('numbers accept $ and thousands separators', () => {
  const b = M.normaliseBands(M.parseCSV('region,status,age_band,bedroom,p25,p75,as_of\nOCR,Resale,10-25 yrs,3,"$1,050,000","1,450,000",2026-10-01'));
  assert.strictEqual(b[0].p25, 1050000); assert.strictEqual(b[0].ageBand, '10–25');
});
t('rows with missing or inverted bands are dropped', () => {
  const b = M.normaliseBands(M.parseCSV('region,status,age_band,bedroom,p25,p75,as_of\nOCR,Resale,x,3,2000000,1000000,2026-10-01\nOCR,Resale,x,3,,,2026-10-01'));
  assert.strictEqual(b.length, 0);
});
t('settings override defaults; unknown keys ignored', () => {
  const s = M.normaliseSettings(M.parseCSV('key,value\nstale_days,90\nbogus,1'));
  assert.strictEqual(s.stale_days, 90); assert.strictEqual(s.expired_days, 270); assert.ok(!('bogus' in s));
});

console.log('Market evidence');
const D = dataset('default');
t('verdict thresholds (P25–P75 only)', () => {
  assert.strictEqual(M.verdict(single(1500000), 1050000, 1450000, 10), 'works-well');
  assert.strictEqual(M.verdict(single(1320000), 1050000, 1450000, 10), 'works-part');
  assert.strictEqual(M.verdict(single(960000), 1050000, 1450000, 10), 'near-miss');
  assert.strictEqual(M.verdict(single(900000), 1050000, 1450000, 10), 'unusual');
});
t('range: low end decides "works well", high end decides reach', () => {
  assert.strictEqual(M.verdict({ low: 1400000, high: 1700000 }, 1050000, 1450000, 10), 'works-part');
  assert.strictEqual(M.verdict({ low: 1000000, high: 1100000 }, 1200000, 1500000, 10), 'near-miss');
});
t('freshness: ok / stale / expired', () => {
  const s = M.DEFAULT_SETTINGS;
  assert.strictEqual(M.freshness(new Date(Date.UTC(2026, 9, 1)), TODAY, s), 'ok');
  assert.strictEqual(M.freshness(new Date(Date.UTC(2026, 3, 20)), TODAY, s), 'stale');
  assert.strictEqual(M.freshness(new Date(Date.UTC(2025, 11, 1)), TODAY, s), 'expired');
  assert.strictEqual(M.freshness(null, TODAY, s), 'expired');
});
t('only the chosen bedroom size is used; missing sizes are omitted, not guessed', () => {
  const a3 = M.bands({ bands: D.bands, settings: D.settings, budget: single(1320000), bedroom: 3, today: TODAY });
  const a4 = M.bands({ bands: D.bands, settings: D.settings, budget: single(1320000), bedroom: 4, today: TODAY });
  assert.strictEqual(a3.segments.length, 9); assert.strictEqual(a4.segments.length, 8);
  assert.ok(!a4.segments.some((s) => s.region === 'RCR' && s.ageBand === '25+'));
});
const A = M.bands({ bands: D.bands, settings: D.settings, budget: single(1320000), bedroom: 3, today: TODAY });
t('~$1.32m, 3-bed: OCR resale is best group, ordered OCR → RCR → CCR', () => {
  assert.strictEqual(A.best.region, 'OCR'); assert.strictEqual(A.best.status, 'Resale');
  assert.deepStrictEqual(A.segments.map((s) => s.region).filter((r, i, a) => a.indexOf(r) === i), ['OCR', 'RCR', 'CCR']);
});
t('headline avoids absolutes and explains what is harder', () => {
  const h = M.headline(A, 3, single(1320000));
  assert.strictEqual(h.title, 'At ~$1.32m, 3-bedroom resale options are strongest in the OCR.');
  assert.ok(/harder/.test(h.body) && /RCR resale/.test(h.body) && /start above your range/.test(h.body));
});
t('headline for a range uses both ends', () => {
  const r = { low: 1480000, high: 1640000 };
  const h = M.headline(M.bands({ bands: D.bands, settings: D.settings, budget: r, bedroom: 3, today: TODAY }), 3, r);
  assert.ok(h.title.startsWith('At $1.48m–$1.64m, 3-bedroom'));
});
t('very low budget: honest "limited" headline, no best group', () => {
  const b = single(700000), a = M.bands({ bands: D.bands, settings: D.settings, budget: b, bedroom: 3, today: TODAY });
  assert.strictEqual(a.best, null); assert.ok(/limited/.test(M.headline(a, 3, b).title));
});
t('no data → neutral headline, hasData false', () => {
  const a = M.bands({ bands: [], budget: single(1320000), bedroom: 3, today: TODAY });
  assert.strictEqual(a.hasData, false); assert.ok(/What can/.test(M.headline(a, 3, single(1320000)).title));
});

console.log('Stale / expired safeguards');
const S = dataset('stale');
t('stale row: numbers kept, flagged; headline softened', () => {
  const a = M.bands({ bands: S.bands, settings: S.settings, budget: single(1320000), bedroom: 3, today: TODAY });
  const seg = a.segments.find((x) => x.region === 'OCR' && x.ageBand === '10–25');
  assert.strictEqual(seg.freshness, 'stale'); assert.notStrictEqual(seg.verdict, 'no-data');
  assert.ok(/appear strongest/.test(M.headline(a, 3, single(1320000)).title));
});
t('expired row: no verdict', () => {
  const a = M.bands({ bands: S.bands, settings: S.settings, budget: single(1320000), bedroom: 3, today: TODAY });
  assert.strictEqual(a.segments.find((x) => x.ageBand === '25+' && x.region === 'OCR').verdict, 'no-data');
});

console.log('Trade-offs');
t('space vs newness uses sheet sizes and computed difference', () => {
  const to = M.tradeoffs({ analysis: A, bedroom: 3, budget: single(1320000), handoff: {} });
  const x = to.find((y) => y.id === 'space-newness');
  assert.ok(x && /sq ft/.test(x.a.text) && /more space/.test(x.a.text));
});
t('location vs size needs two reachable regions', () => {
  const to = M.tradeoffs({ analysis: A, bedroom: 3, budget: single(1320000), handoff: {} });
  const x = to.find((y) => y.id === 'location-size');
  assert.ok(x && /RCR/.test(x.a.head) && /OCR/.test(x.b.head));
  const low = single(1000000), a0 = M.bands({ bands: D.bands, settings: D.settings, budget: low, bedroom: 3, today: TODAY });
  assert.ok(!M.tradeoffs({ analysis: a0, bedroom: 3, budget: low, handoff: {} }).find((y) => y.id === 'location-size'));
});
t('monthly row only for a range, only with handoff data', () => {
  const r = { low: 1480000, high: 1640000 }, a = M.bands({ bands: D.bands, settings: D.settings, budget: r, bedroom: 3, today: TODAY });
  const h = { monthly: { low: { monthly: 2800, pct: 0.35 }, high: { monthly: 3600, pct: 0.45 } } };
  assert.ok(M.tradeoffs({ analysis: a, bedroom: 3, budget: r, handoff: h }).find((y) => y.id === 'price-monthly'));
  assert.ok(!M.tradeoffs({ analysis: a, bedroom: 3, budget: r, handoff: {} }).find((y) => y.id === 'price-monthly'));
  assert.ok(!M.tradeoffs({ analysis: A, bedroom: 3, budget: single(1320000), handoff: h }).find((y) => y.id === 'price-monthly'));
});
t('lease row appears only for older buyers', () => {
  const a = M.bands({ bands: D.bands, settings: D.settings, budget: { low: 1400000, high: 1700000 }, bedroom: 3, today: TODAY });
  assert.ok(!M.tradeoffs({ analysis: a, bedroom: 3, budget: { low: 1400000, high: 1700000 }, handoff: { maxAge: 36 } }).find((y) => y.id === 'lease'));
  assert.ok(M.tradeoffs({ analysis: a, bedroom: 3, budget: { low: 1400000, high: 1700000 }, handoff: { maxAge: 47 } }).find((y) => y.id === 'lease'));
});

console.log("Ken's shortlist");
const sel = (d, b, bed, extra) => M.shortlistSelect(Object.assign({ shortlist: d.shortlist, settings: d.settings, budget: b, bedroom: bed, today: TODAY }, extra));
t('shows matching Active entries; retired never shown', () => {
  const r = sel(D, single(1320000), 3);
  assert.deepStrictEqual(r.shown.map((x) => x.entryId).sort(), ['T01', 'T04', 'T06']);
  assert.ok(!r.shown.some((x) => x.entryId === 'T07'));
});
t('priority ordering, max 3', () => {
  const r = sel(D, single(1320000), 3);
  assert.strictEqual(r.shown[0].entryId, 'T01'); assert.ok(r.shown.length <= 3);
});
t('bedroom must match', () => {
  assert.deepStrictEqual(sel(D, single(1700000), 4).shown.map((x) => x.entryId), ['T05']);
});
t('review due: flagged for Ken but still shown', () => {
  const r = sel(D, single(1320000), 3);
  assert.ok(r.reviewDue.some((x) => x.entryId === 'T04')); assert.ok(r.shown.find((x) => x.entryId === 'T04').reviewDue);
});
t('held: pricing moved above the window → hidden, reported', () => {
  const H = dataset('held'), r = sel(H, single(1320000), 3);
  assert.ok(!r.shown.some((x) => x.entryId === 'T01')); assert.ok(r.held.some((x) => x.entryId === 'T01'));
});
t('held tolerance: within 5% is not held', () => {
  const e = D.shortlist.map((x) => Object.assign({}, x, x.entryId === 'T01' ? { indicativeLow: 1450000 * 1.04 } : {}));
  assert.ok(M.shortlistSelect({ shortlist: e, budget: single(1600000), bedroom: 3, today: TODAY }).held.length === 0);
});
t('budget outside every window → nothing available', () => {
  const r = sel(D, single(3000000), 3); assert.strictEqual(r.available, false);
});
t('empty shortlist → not available (page shows the "more specific shortlist" block)', () => {
  const r = sel(dataset('none'), single(1320000), 3); assert.strictEqual(r.available, false); assert.strictEqual(r.shown.length, 0);
});
t("'Ken's view as of' = oldest reviewed date among shown", () => {
  const r = sel(D, single(1320000), 3); assert.strictEqual(M.monthYear(r.viewAsOf), 'Jun 2026');
});
t('purpose: investment-only entries are not shown to own-stay buyers', () => {
  const e = D.shortlist.map((x) => Object.assign({}, x, x.entryId === 'T01' ? { purpose: 'investment' } : {}));
  assert.ok(!M.shortlistSelect({ shortlist: e, budget: single(1320000), bedroom: 3, today: TODAY }).shown.some((x) => x.entryId === 'T01'));
});

console.log('Comparison handoff');
t('handoff carries ids and ranges only', () => {
  const r = sel(D, single(1320000), 3), h = M.compareHandoff({ budget: single(1320000), bedroom: 3, selected: r.shown });
  assert.strictEqual(h.v, 1); assert.strictEqual(h.items.length, r.shown.length);
  assert.deepStrictEqual(Object.keys(h.items[0]).sort(), ['bedroom', 'entryId', 'indicative', 'label', 'name', 'projectId', 'segment']);
});

console.log('Analytics privacy');
t('budget bands are 200k buckets', () => {
  assert.strictEqual(M.budgetBand(single(1320000)), '1.2-1.4m');
  assert.strictEqual(M.budgetBand({ low: 1480000, high: 1640000 }), '1.4-1.6m');
  assert.strictEqual(M.budgetBand(single(500000)), 'under-0.6m');
});
t('payload contains only whitelisted keys and no exact figures', () => {
  const p = M.analyticsPayload({ budget: single(1321234), bedroom: 3, shortlistAvailable: false, shortlistCount: 0, basis: 'test', stale: false, placement: 'empty' });
  Object.keys(p).forEach((k) => assert.ok(M.ANALYTICS_KEYS.includes(k), k));
  assert.ok(!JSON.stringify(p).includes('1321234') && !JSON.stringify(p).includes('1.32'));
});

console.log('Handoff in');
t('valid handoff accepted; garbage rejected', () => {
  const mem = {}; const st = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
  assert.strictEqual(M.readHandoff(st), null);
  M.writeHandoff(st, { v: 1, budget: { low: 1, high: 1 } }); assert.ok(M.readHandoff(st));
  st.setItem(M.HANDOFF_KEY, '{bad'); assert.strictEqual(M.readHandoff(st), null);
  M.writeHandoff(st, { v: 1, budget: { low: 5, high: 2 } }); assert.strictEqual(M.readHandoff(st), null);
});


console.log('Diagnostics');
t('dropped rows are reported with their sheet row number and reason', () => {
  const iss = [];
  M.normaliseBands(M.parseCSV('region,status,age_band,bedroom,p25,p75,as_of\nXXX,Resale,x,3,1,2,2026-10-01\nOCR,Resale,x,,1,2,2026-10-01\nOCR,Resale,x,3,2,1,2026-10-01\nOCR,Resale,x,3,1,2,10/01/2026'), iss);
  assert.strictEqual(iss.filter((i) => i.level === 'error').length, 3);
  assert.deepStrictEqual(iss.map((i) => i.row), [2, 3, 4, 5]);
  assert.ok(/as_of/.test(iss[3].msg));
});
t('shortlist problems are reported (no reason, inverted prices, missing bedroom)', () => {
  const iss = [];
  M.normaliseShortlist(M.parseCSV('entry_id,project,bedroom,budget_min,budget_max,indicative_low,indicative_high,reason\nA1,P,,1,2,1,2,r\nA2,P,3,5,2,1,2,\nA3,P,3,1,2,9,3,r'), iss);
  assert.ok(iss.some((i) => /A1/.test(i.msg) && /bedroom/.test(i.msg)));
  assert.ok(iss.some((i) => /A2/.test(i.msg) && /budget_min/.test(i.msg)));
  assert.ok(iss.some((i) => /A2/.test(i.msg) && /reason/.test(i.msg)));
  assert.ok(iss.some((i) => /A3/.test(i.msg) && /indicative_low/.test(i.msg)));
});
t('diagnose: held, review due, stale, expired, cross-check', () => {
  const H = dataset('held'), St = dataset('stale');
  const rh = M.diagnose({ bands: H.bands, shortlist: H.shortlist, settings: H.settings, today: TODAY });
  assert.ok(rh.issues.some((i) => /T01 is HELD/.test(i.msg))); assert.ok(rh.issues.some((i) => /T04 is due for review/.test(i.msg)));
  const rs = M.diagnose({ bands: St.bands, shortlist: St.shortlist, settings: St.settings, today: TODAY });
  assert.ok(rs.issues.some((i) => /stale/.test(i.msg))); assert.ok(rs.issues.some((i) => /expired/.test(i.msg) && i.level === 'error'));
  const far = D.shortlist.map((x) => Object.assign({}, x, x.entryId === 'T01' ? { indicativeLow: 400000, indicativeHigh: 450000 } : {}));
  assert.ok(M.diagnose({ bands: D.bands, shortlist: far, settings: D.settings, today: TODAY }).issues.some((i) => /far outside/.test(i.msg)));
});
t('diagnose: coverage map shows where visitors would see no shortlist', () => {
  const r = M.diagnose({ bands: D.bands, shortlist: D.shortlist, settings: D.settings, today: TODAY });
  const cell = (bed, band) => r.coverage.find((c) => c.bedroom === bed && c.band === band).count;
  assert.ok(cell(3, '$1.20m–$1.40m') >= 2); assert.strictEqual(cell(4, '$800k–$1.00m'), 0);
});
t('diagnose: entry with no matching market band is flagged', () => {
  const e = D.shortlist.map((x) => Object.assign({}, x, x.entryId === 'T05' ? { region: 'RCR', ageBand: '25+' } : {}));
  assert.ok(M.diagnose({ bands: D.bands, shortlist: e, settings: D.settings, today: TODAY }).issues.some((i) => /T05: no market band/.test(i.msg)));
});
t('shipped test data has no data errors', () => {
  ['default', 'none'].forEach((sc) => { const iss = []; M.normaliseBands(M.parseCSV(read(sc, 'bands.csv')), iss); M.normaliseShortlist(M.parseCSV(read(sc, 'shortlist.csv')), iss); assert.deepStrictEqual(iss.filter((i) => i.level === 'error'), []); });
});
t('lease copy makes only the CPF-Board-backed claim, nothing about banks', () => {
  const a = M.bands({ bands: D.bands, settings: D.settings, budget: { low: 1400000, high: 1700000 }, bedroom: 3, today: TODAY });
  const l = M.tradeoffs({ analysis: a, bedroom: 3, budget: { low: 1400000, high: 1700000 }, handoff: { maxAge: 47 } }).find((y) => y.id === 'lease');
  assert.ok(/age 95/.test(l.b.text) && !/bank loans/.test(l.b.text));
});

console.log('Loader');
t('test mode loads bundled files; production falls back to (empty) snapshot', async () => {});
(async () => {
  const f = (u) => Promise.resolve({ ok: true, text: () => Promise.resolve(fs.readFileSync(path.join(__dirname, '../../..', u.replace(/^(\.\.\/)+/, '')), 'utf8')) });
  const cfg = { mode: 'test', testBase: '../../data/market/test/', snapshotBase: '../../data/market/snapshot/', sheet: {} };
  const a = await M.load(cfg, f); assert.strictEqual(a.basis, 'test'); assert.ok(a.bands.length > 20); assert.strictEqual(a.attempts.length, 3); assert.ok(a.attempts.every((x) => x.ok));
  const b = await M.load(Object.assign({}, cfg, { mode: 'production' }), f); assert.strictEqual(b.basis, 'snapshot'); assert.strictEqual(b.bands.length, 0);
  const bad = () => Promise.reject(new Error('offline'));
  const c = await M.load(Object.assign({}, cfg, { mode: 'production', sheet: { bands: 'x', shortlist: 'y' } }), (u) => (/^(x|y)$/.test(u) ? bad() : f(u)));
  assert.strictEqual(c.basis, 'snapshot'); assert.ok(c.attempts.some((x) => !x.ok));
  pass += 2; console.log('  ok   loader: test mode, production→snapshot, sheet failure→snapshot');
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL loader ' + e.message); process.exit(1); });
