// node tools/market-data/tests/run-tests.js — uses SYNTHETIC records only (never real transactions).
const assert = require('assert'), fs = require('fs'), path = require('path');
const B = require('../build-bands.js'), U = require('../fetch-ura.js');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8'));
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
const sqm = (sqft) => String(sqft / 10.7639);
// n evenly spaced prices lo..hi → P25 and P75 are known exactly
function grid(n, lo, hi, over) {
  return Array.from({ length: n }, (_, i) => Object.assign({
    project: 'SYNTH', marketSegment: 'OCR', contractDate: '0626', area: sqm(980), price: String(Math.round(lo + (i * (hi - lo)) / (n - 1))),
    propertyType: 'Condominium', typeOfArea: 'Strata', tenure: '99 yrs lease commencing from 2008', typeOfSale: '3', noOfUnits: '1', district: '19',
  }, over || {}));
}
const run = (recs) => B.build(recs, cfg, '2026-10-05');

t('quantile: linear interpolation', () => { assert.strictEqual(B.quantile([1, 2, 3, 4, 5], 0.25), 2); assert.strictEqual(B.quantile([10, 20], 0.5), 15); });
t('known distribution → known P25/P75, size and n', () => {
  const r = run(grid(101, 1000000, 1600000));
  assert.strictEqual(r.rows.length, 1);
  const x = r.rows[0];
  assert.strictEqual(x.p25, 1150000); assert.strictEqual(x.p75, 1450000); assert.strictEqual(x.n_txns, 101);
  assert.strictEqual(x.region, 'OCR'); assert.strictEqual(x.status, 'Resale');
  assert.strictEqual(x.age_band, '10–25');   // lease 2008, reference year 2026 → 18 yrs
  assert.ok(Math.abs(x.sqft_low - 980) <= 10);
});
t('age bands from lease start', () => {
  const mk = (yr) => run(grid(40, 1e6, 1.2e6, { tenure: '99 yrs lease commencing from ' + yr })).rows[0].age_band;
  assert.strictEqual(mk(2020), '0–10'); assert.strictEqual(mk(2005), '10–25'); assert.strictEqual(mk(2001), '25+'); 
});
t('new sale → age band "–"', () => {
  const r = run(grid(40, 1.6e6, 2.0e6, { typeOfSale: '1' }));
  assert.strictEqual(r.rows[0].status, 'New'); assert.strictEqual(r.rows[0].age_band, '–');
});
t('no bedroom inference: different sizes stay in one group, size range reported', () => {
  const r = run(grid(30, 1e6, 1.2e6, { area: sqm(650) }).concat(grid(30, 1e6, 1.2e6, { area: sqm(1300) })));
  assert.strictEqual(r.rows.length, 1); assert.ok(!('bedroom' in r.rows[0]));
  assert.ok(r.rows[0].sqft_low >= 640 && r.rows[0].sqft_high <= 1310 && r.rows[0].sqft_high > r.rows[0].sqft_low);
});
t('freehold / 999-yr resale is its own group with no age; share reported', () => {
  const r = run(grid(40, 1e6, 1.2e6).concat(grid(35, 2e6, 2.4e6, { tenure: 'Freehold' }), grid(31, 2e6, 2.4e6, { tenure: '999 yrs lease commencing from 1885' })));
  const g = r.rows.filter((x) => x.age_band === 'Freehold / 999-yr');
  assert.strictEqual(g.length, 1); assert.strictEqual(g[0].n_txns, 66);
  assert.strictEqual(r.report.resale.OCR.free, 66); assert.strictEqual(r.report.resale.OCR.all, 106);
  assert.ok(/66 of 106 \(62%\)/.test(B.reportText(r.report, cfg)));
});
t('freehold new sale is not given a freehold group (age stays "–")', () => {
  const r = run(grid(40, 1.6e6, 2e6, { typeOfSale: '1', tenure: 'Freehold' }));
  assert.strictEqual(r.rows[0].age_band, '–');
});
t('exclusions are counted, not silently dropped', () => {
  const recs = grid(40, 1e6, 1.2e6).concat(
    grid(5, 1e6, 1e6, { typeOfSale: '2' }), grid(4, 1e6, 1e6, { propertyType: 'Executive Condominium' }),
    grid(3, 1e6, 1e6, { tenure: 'Freehold' }), grid(2, 1e6, 1e6, { tenure: '999 yrs lease commencing from 1885' }),
    grid(6, 1e6, 1e6, { noOfUnits: '2' }), grid(2, 1e6, 1e6, { typeOfArea: 'Land' }), grid(7, 1e6, 1e6, { contractDate: '0624' }));
  const r = run(recs);
  assert.strictEqual(r.report.used, 45);
  assert.strictEqual(r.report.excluded['sub-sale'], 5); assert.strictEqual(r.report.excluded['multi-unit caveat'], 6);
  assert.ok(Object.keys(r.report.excluded).some((k) => /outside 12-month window/.test(k)));
});
t('segments below minN are omitted and listed', () => {
  const r = run(grid(29, 1e6, 1.2e6));
  assert.strictEqual(r.rows.length, 0); assert.ok(/n=29/.test(r.report.omittedLowN[0]));
});
t('window is relative to the latest contract month', () => {
  const r = run(grid(40, 1e6, 1.2e6).concat(grid(40, 5e6, 6e6, { contractDate: '0525' })));
  assert.strictEqual(r.rows.length, 1); assert.strictEqual(r.report.windowEnd, '2026-06');
});
t('CSV output has the Sheet columns, in order', () => {
  const csv = B.toCSV(run(grid(40, 1e6, 1.2e6)).rows).split('\n')[0];
  assert.strictEqual(csv, 'region,status,age_band,p25,p75,sqft_low,sqft_high,n_txns,period,as_of,basis');
});
t('fetcher: token then four batches, with the documented headers', async () => {});
(async () => {
  const calls = [];
  const fake = async (url, o) => { calls.push({ url, h: o.headers }); return { status: 200, text: async () => JSON.stringify(/insertNewToken/.test(url) ? { Status: 'Success', Result: 'TKN' } : { Status: 'Success', Result: [] }), json: async () => (/insertNewToken/.test(url) ? { Status: 'Success', Result: 'TKN' } : { Status: 'Success', Result: [] }) }; };
  const files = await U.fetchAll({ fetch: fake, accessKey: 'KEY' });
  assert.strictEqual(files.length, 4); assert.strictEqual(calls.length, 5);
  assert.strictEqual(calls[0].h.AccessKey, 'KEY'); assert.strictEqual(calls[1].h.Token, 'TKN'); assert.ok(/batch=4/.test(calls[4].url));
  await assert.rejects(() => U.fetchAll({ fetch: fake, accessKey: '' }), /not set/);
  pass++; console.log('  ok   fetcher flow (mocked; not run against the live API)');
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL ' + e.message); process.exit(1); });
