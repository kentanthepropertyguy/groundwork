// node tools/market-data/tests/project-tests.js — SYNTHETIC records only (never real transactions).
const assert = require('assert'), fs = require('fs'), path = require('path');
const B = require('../build-project-stats.js'), P = require('../../../assets/js/kpt-project.js'), S = require('./synth-projects.js');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8')), pcReal = JSON.parse(fs.readFileSync(path.join(__dirname, '../project-config.json'), 'utf8'));
const pc = Object.assign({}, pcReal, { exclude: [{ name: 'RESIDENTIAL APARTMENTS', reason: 't' }], hold: [{ name: 'LAKEVIEW ESTATE', reason: 't' }] });
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
const R = B.build(S.fixture(), cfg, pc, '2026-10-05');
const proj = (name) => { const id = P.slugify(name); return R.details[P.shardName(P.shardOf(id, pc.shards))].projects[id]; };
const row = (name) => { const F = P.fieldMap(R.index.fields), r = R.index.rows.find((x) => x[F.name] === name); return r && P.rowObject(R.index, R.index.rows.indexOf(r)); };
const M = R.manifest, WIN = (w) => M.windows.indexOf(w);
const cellsOf = (name) => P.cells(proj(name), M);
const near = (a, b, e) => assert.ok(Math.abs(a - b) <= (e || 1), a + ' vs ' + b);

console.log('Aggregation correctness');
t('ALPHA total count, sale split and months', () => { const a = proj('ALPHA'); assert.strictEqual(a.n, 5); assert.deepStrictEqual(a.sale, { new: 0, sub: 0, resale: 5 }); assert.strictEqual(a.first, '2021-09'); assert.strictEqual(a.last, '2026-09'); assert.strictEqual(a.active, 5); });
t('ALPHA price and approximate PSF quantiles match hand calculation', () => {
  const a = proj('ALPHA'); assert.deepStrictEqual(a.dist.resale.price, [1000000, 1100000, 1200000, 1300000, 1400000]);
  assert.deepStrictEqual(a.dist.resale.psf, [1000000, 1100000, 1200000, 1300000, 1400000].map((p) => Math.round(S.PSF(p, 100))));
  assert.deepStrictEqual(a.dist.resale.sqft, [1076, 1076, 1076, 1076, 1076]);
});
t('quantile method is linear interpolation (4 values)', () => { const r = B.build([1, 2, 3, 4].map((i) => S.tx('Q', { price: String(1e6 * i) })), cfg, pc, 'x'); const q = r.details[P.shardName(P.shardOf('q', 64))].projects.q.dist.resale.price; assert.deepStrictEqual(q, [1e6, 1.75e6, 2.5e6, 3.25e6, 4e6]); });
t('identical rows are KEPT, not de-duplicated', () => { assert.strictEqual(proj('TWINS').n, 3); assert.strictEqual(cellsOf('TWINS').window.find((c) => c.win === WIN('all')).n, 3); });
t('monthly volume is sparse, per sale type, relative to monthStart', () => { const a = proj('ALPHA'); const dec = P.monthly(a, M).resale; assert.strictEqual(dec.length, 5); assert.deepStrictEqual(dec[0], { month: '2021-09', n: 1 }); assert.deepStrictEqual(dec[dec.length - 1], { month: '2026-09', n: 1 }); });
t('manifest records latest month, boundary month and counts', () => { assert.strictEqual(M.latestMonth, '2026-09'); assert.strictEqual(M.monthStart, '2021-09'); assert.ok(M.boundaryNote); assert.strictEqual(M.counts.projects, R.index.rows.length); });

console.log('Windows (trailing, cumulative, never silently widened)');
t('ALPHA cell counts by window: 12m=2 (ages 0 and 8), 24m=3 (age 12 joins), 36m=3, all=5', () => {
  const c = cellsOf('ALPHA').window.filter((x) => x.bin === 1000);
  const n = (w) => (c.find((x) => x.win === WIN(w)) || { n: 0 }).n;
  assert.deepStrictEqual([n(12), n(24), n(36), n('all')], [2, 3, 3, 5]);
});
t('window cell keeps its own active months, top month and last month', () => { const x = cellsOf('ALPHA').window.find((c) => c.win === WIN(12)); assert.deepStrictEqual([x.n, x.act, x.top, x.last], [2, 2, 1, 202609]); });
t('disjoint periods: period 0 has 2, period 1 has 1 (age 12), earlier stub has the 2021 deal', () => {
  const p = proj('ALPHA').periods.resale; assert.strictEqual(p[0][0], 2); assert.strictEqual(p[1][0], 1); assert.strictEqual(p[M.periods.length - 1][0], 1);
  assert.strictEqual(P.history(proj('ALPHA'), 'resale', M).reduce((a, h) => a + h.n, 0), 5);
});
t('period cells add up to the sale count', () => { assert.strictEqual(cellsOf('ALPHA').period.reduce((a, c) => a + c.n, 0), 5); });

console.log('Size and floor buckets');
t('92 sqm lands in the 900 band and 93 sqm in the 1000 band (100 sqft bins)', () => { const bins = cellsOf('EDGE').window.filter((c) => c.win === WIN('all')).map((c) => c.bin).sort((a, b) => a - b); assert.deepStrictEqual(bins, [900, 1000]); });
t('floor cells use URA bands only; unknown floor is counted, not binned', () => {
  const a = proj('ALPHA'); assert.strictEqual(a.floorUnknown, 1);
  const f = cellsOf('ALPHA').floor; assert.strictEqual(f.reduce((s, c) => s + c.n, 0), 4);
  assert.deepStrictEqual(Array.from(new Set(f.map((c) => M.floorBands[c.win]))).sort(), ['01-05', '06-10', '11-15']);
  assert.ok(M.floorBands.every((b) => /^B?\d+-\d+$/.test(b)), 'only native URA bands');
});

console.log('Project index, lookup and name handling');
t('index row carries name, street, district, region, tenure, counts and dates', () => { const r = row('ALPHA'); assert.strictEqual(r.street, 'ALPHA RD'); assert.strictEqual(r.district, '20'); assert.strictEqual(r.seg, 'RCR'); assert.strictEqual(r.n, 5); assert.strictEqual(r.first, '2021-09'); assert.strictEqual(r.resale, 5); assert.strictEqual(r.new, 0); });
t('new / sub-sale / resale availability', () => { const r = row('BETA'); assert.deepStrictEqual([r.new, r.sub, r.resale], [2, 1, 0]); });
t('search: case, punctuation, whitespace and partial words', () => {
  const s = (q) => P.search(R.index, R.search, q).map((x) => x.name);
  assert.ok(s('alpha').includes('ALPHA')); assert.ok(s('  ALPHA  ').includes('ALPHA')); assert.ok(s('alp').includes('ALPHA'));
  assert.deepStrictEqual(s('chuan-vista').sort(), ['CHUAN VISTA', 'CHUAN VISTA II']); assert.ok(s('chuanvista').includes('CHUAN VISTA')); assert.deepStrictEqual(s('zzzz'), []);
});
t('exact normalised match ranks first', () => assert.strictEqual(P.search(R.index, R.search, 'chuan vista')[0].name, 'CHUAN VISTA'));
t('Chuan Vista and Chuan Vista II are NOT merged', () => { assert.ok(proj('CHUAN VISTA')); assert.ok(proj('CHUAN VISTA II')); assert.notStrictEqual(proj('CHUAN VISTA').id, proj('CHUAN VISTA II').id); assert.strictEqual(proj('CHUAN VISTA').n, 1); });
t('id collision fails the build instead of merging', () => assert.throws(() => B.build([S.tx('A & B', {}), S.tx('A AND B', {})], cfg, pc, 'x'), /collision/));
t('slug and normalisation', () => { assert.strictEqual(P.slugify('THE PEAK @ CAIRNHILL II'), 'the-peak-at-cairnhill-ii'); assert.strictEqual(P.slugify("D'LEEDON"), 'd-leedon'); assert.strictEqual(P.normaliseName('  Verdé  Joo-Chiat '), 'VERDE JOO CHIAT'); });
t('shard hash is stable, in range, and every project is stored in its own shard', () => {
  assert.strictEqual(P.shardOf('thomson-grand', 64), P.shardOf('thomson-grand', 64));
  R.index.rows.forEach((r) => { const id = r[0]; assert.ok(r[15] >= 0 && r[15] < 64); assert.ok(R.details[P.shardName(r[15])].projects[id]); });
});
t('createStore loads the right files through an injected fetch', () => {
  const calls = []; const st = P.createStore('data/projects/', (u) => { calls.push(u); return Promise.resolve({ projects: { alpha: { id: 'alpha' } } }); });
  return st.project('alpha', { shards: 64 }).then((p) => { assert.strictEqual(p.id, 'alpha'); assert.ok(/^data\/projects\/detail\/s\d\d\.json$/.test(calls[0])); });
});

console.log('Catch-all and scope exclusions');
t('reviewed catch-all name is excluded', () => { assert.strictEqual(row('RESIDENTIAL APARTMENTS'), undefined); assert.strictEqual(R.report.excludedNames['RESIDENTIAL APARTMENTS'], 1); });
t('held name is kept OUT and reported', () => { assert.strictEqual(row('LAKEVIEW ESTATE'), undefined); assert.strictEqual(R.report.heldNames['LAKEVIEW ESTATE'], 1); });
t('exclusion is exact-name only (no pattern matching)', () => { const r = B.build([S.tx('SOMETHING ESTATE', {}), S.tx('RESIDENTIAL APARTMENTS PLUS', {})], cfg, pc, 'x'); assert.strictEqual(r.manifest.counts.projects, 2); });
t('real config exclusion list has no wildcard characters', () => pcReal.exclude.concat(pcReal.hold).forEach((e) => assert.ok(!/[*?\[\]\\^$|]/.test(e.name), e.name)));
t('EC, landed, strata-landed, multi-unit, bad date and missing price rows are out', () => {
  ['ECPROJECT', 'LANDEDX', 'STRATALANDED', 'BULK', 'BADDATE', 'NOPRICE'].forEach((n) => assert.strictEqual(row(n), undefined, n));
});
t('stale exclusion entries produce a warning, not a failure', () => { const r = B.build([S.tx('X', {})], cfg, Object.assign({}, pc, { exclude: [{ name: 'NOT IN DATA', reason: 't' }] }), 'x'); assert.ok(r.warnings.some((w) => w.code === 'stale-list-entry')); assert.strictEqual(r.manifest.counts.projects, 1); });

console.log('Tenure');
t('dominant tenure, label and age group (start year 2010, reference 2026 => 10–25)', () => { const a = proj('ALPHA'); assert.strictEqual(a.tenure.label, '99 yrs from 2010'); assert.strictEqual(M.tenureGroups[a.tenure.group], '10–25'); assert.strictEqual(a.tenure.mixed, false); });
t('mixed freehold + leasehold: dominant kept, mixed flag set, variants retained', () => { const m = proj('MIXED'); assert.strictEqual(m.tenure.label, 'Freehold'); assert.strictEqual(m.tenure.mixed, true); assert.deepStrictEqual(m.tenure.variants, [['Freehold', 2], ['99 yrs from 1995', 1]]); assert.strictEqual(row('MIXED').mixed, 1); });
t('"99 years leasehold" (no start year) is parsed, not treated as freehold', () => { const b = proj('BETA'); assert.strictEqual(b.tenure.kind, 'LEASE'); assert.strictEqual(b.tenure.leaseYears, 99); assert.strictEqual(b.tenure.commenceYear, null); assert.strictEqual(M.tenureGroups[b.tenure.group], '–'); });
t('"99 years lease commencing from" variant is parsed with its year', () => { const x = proj('LEASE2YEARS'); assert.strictEqual(x.tenure.commenceYear, 2023); assert.strictEqual(M.tenureGroups[x.tenure.group], '0–10'); });
t('lease over 110 years groups with Freehold / 999-yr', () => assert.strictEqual(M.tenureGroups[proj('LONGLEASE').tenure.group], 'Freehold / 999-yr'));
t('parseTenure recognises the real variants', () => { assert.strictEqual(B.parseTenure('Freehold').kind, 'FH'); assert.strictEqual(B.parseTenure('999 years leasehold').years, 999); assert.strictEqual(B.parseTenure('???').kind, 'UNKNOWN'); });

console.log('Approximate PSF');
t('PSF is price / (sqm x 10.7639), rounded, and flagged approximate in the manifest', () => { assert.strictEqual(proj('BETA').dist.new.psf[0], Math.round(S.PSF(2000000, 80))); assert.ok(/approximate/i.test(M.psfNote)); });
t('n = 1 cell keeps its PSF information and explicit evidence fields', () => { const c = cellsOf('ARR').window.find((x) => x.win === WIN(12)); assert.deepStrictEqual([c.n, c.act, c.top, c.last], [1, 1, 1, 202609]); assert.strictEqual(c.min, c.max); assert.strictEqual(c.med, Math.round(S.PSF(1900000, 100))); });

console.log('Like-for-like comparison and insufficient evidence');
t('PEE vs QUE: no shared band in 12m; first match is the 24-month window and says so', () => {
  const r = P.compare(proj('PEE'), proj('QUE'), M), x = r.bySale.resale;
  assert.strictEqual(x.windows[WIN(12)].like.length, 0); assert.strictEqual(x.firstWindowWithMatch, WIN(24)); assert.strictEqual(x.windows[WIN(24)].label, 'last 24 months');
  const c = x.windows[WIN(24)].like[0]; assert.strictEqual(c.bin, 1000); assert.deepStrictEqual([c.overlap.nA, c.overlap.nB], [2, 1]); assert.strictEqual(c.overlap.lastMonthB, 202509);
  assert.strictEqual(r.noLikeForLikeEvidence, false);
});
t('windows are reported separately, never merged into one result', () => {
  const x = P.compare(proj('PEE'), proj('QUE'), M).bySale.resale; assert.strictEqual(x.windows.length, M.windows.length);
  assert.deepStrictEqual(x.windows.map((w) => w.label), ['last 12 months', 'last 24 months', 'last 36 months', 'full history']);
  assert.strictEqual(x.windows[WIN(12)].like.length, 0); assert.ok(x.windows[WIN('all')].like.length >= 1);
});
t('overlap evidence fields are present on every pair', () => { const c = P.compare(proj('ALPHA'), proj('PEE'), M).bySale.resale.windows[WIN('all')].like[0]; ['nA', 'nB', 'nMin', 'activeMonthsA', 'activeMonthsB', 'lastMonthA', 'lastMonthB'].forEach((k) => assert.ok(k in c.overlap, k)); assert.ok(c.a.psf && c.b.psf); });
t('no shared sale type returns explicit insufficient evidence', () => { const r = P.compare(proj('ARR'), proj('PEE'), M); assert.strictEqual(r.noLikeForLikeEvidence, true); assert.deepStrictEqual(r.saleTypesShared, []); assert.ok(/no shared sale type/.test(r.reasons[0])); });
t('same sale type but no overlapping sizes returns explicit reasons', () => { const r = P.compare(proj('PEE'), proj('ESS'), M); assert.strictEqual(r.noLikeForLikeEvidence, true); assert.ok(r.bySale.resale.reasons.some((x) => /no overlapping unit sizes/.test(x))); assert.strictEqual(r.bySale.resale.firstWindowWithMatch, null); });
t('adjacent size bands are labelled adjacent and never counted as a like-for-like match', () => {
  const r = P.compare(proj('EDGE'), proj('QUE'), M).bySale.resale, w = r.windows[WIN('all')];
  assert.ok(w.like.every((c) => !c.adjacent)); assert.ok(w.adjacent.every((c) => c.adjacent === true));
});
t('floor-controlled evidence is full-history only and says so', () => { const r = P.compare(proj('ALPHA'), proj('PEE'), M).bySale.resale; r.floor.forEach((f) => assert.strictEqual(f.window, 'full history')); assert.ok(r.floor.length >= 1); });

console.log('Peer context');
t('peer files exist per district and region and are marked as context', () => {
  const keys = Object.keys(R.peers); assert.ok(keys.includes('peers/d20.json')); assert.ok(keys.includes('peers/rcr.json'));
  const c = P.peerCells(R.peers['peers/d20.json'], { sale: 3, win: WIN('all') }, M); assert.ok(c.length); assert.ok(c.every((x) => x.kind === 'context' && x.includesProject === true));
});
t('peer cell n equals the sum of project transactions in the cell (all sizes, resale, all history, any tenure group)', () => {
  const d20 = R.peers['peers/d20.json'], c = P.peerCells(d20, { sale: 3, win: WIN('all'), bin: -1 }, M), sum = c.reduce((a, x) => a + x.n, 0);
  const expected = Object.values(R.details).reduce((a, d) => a + Object.values(d.projects).filter((p) => p.district === '20').reduce((s, p) => s + (p.sale.resale || 0), 0), 0);
  assert.strictEqual(sum, expected);
});
t('peer cells are keyed by tenure group and carry concentration and evidence fields', () => { const c = P.peerCells(R.peers['peers/rcr.json'], { sale: 3, win: WIN('all'), bin: -1 }, M); assert.ok(new Set(c.map((x) => x.tenureGroup)).size >= 2); c.forEach((x) => { assert.ok(x.projects >= 1 && x.topProjectShare > 0 && x.activeMonths >= 1 && x.lastMonth); }); });

console.log('No bedroom inference / no forecasts');
const keysOf = (o, k0) => (o && typeof o === 'object' ? (Array.isArray(o) ? [] : (k0 === 'projects' ? [] : Object.keys(o))).concat(...Object.entries(o).map(([k, v]) => keysOf(v, k))) : []);
t('no generated field name mentions bedrooms, appreciation, yield, forecast, prediction or school', () => {
  const all = keysOf(R.manifest).concat(R.index.fields, Object.values(R.details).flatMap((d) => keysOf(d)), Object.values(R.peers).flatMap((d) => d.fields));
  assert.ok(all.length > 50); all.forEach((k) => assert.ok(!/bed|apprec|yield|forecast|predict|school/i.test(k), 'field: ' + k));
});
t('policy statements are shipped in the manifest', () => assert.ok(M.policy.some((p) => /No bedrooms/.test(p)) && M.policy.some((p) => /appreciation/.test(p))));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
