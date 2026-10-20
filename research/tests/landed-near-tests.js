// Nearby landed sales: the street positions, the choice of relevant sales, and what the answer says.
// Run from the site folder:  node research/tests/landed-near-tests.js
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert');
const root = path.resolve(__dirname, '..', '..'), L = path.join(root, 'data/value/landed/');
const N = require(path.join(root, 'assets/js/gw-landed-near.js')), V = require(path.join(root, 'assets/js/gw-value.js'));
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const I = rd(L + 'index.json'), G = rd(L + 'geo.json'), M = rd(L + 'geo-more.json'), AM = rd(path.join(root, 'data/map/amen.json'));
const F = {}; fs.readdirSync(L + 'd').forEach((f) => { F[f.replace('.json', '')] = rd(L + 'd/' + f); });
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').slice(0, 3).join('\n       ')); } };
const filesFor = (c) => { const f = {}; N.districtsOf(c).forEach((d) => { f[d] = F[d]; }); return f; };
const near = (loc, type, extra) => { const c = N.candidates(G, loc, 2500, loc.exclude); return N.select(c, filesFor(c), Object.assign({ type, latest: I.latestMonth }, extra || {})); };

console.log('Engine (synthetic streets and sales)');
// streets on a line east of the target: A 100 m, B 500 m, C 1,200 m, D 1,800 m, all district 05
const lat0 = 1.28, lon0 = 103.79, mE = (m) => m / (111320 * Math.cos(lat0 * Math.PI / 180));
const sg = { streets: [['AAA ROAD', '05', lat0, lon0 + mE(100)], ['BBB ROAD', '05', lat0, lon0 + mE(500)], ['CCC ROAD', '05', lat0, lon0 + mE(1200)], ['DDD ROAD', '05', lat0, lon0 + mE(1800)], ['TARGET WALK', '05', lat0, lon0]] };
const rows = (arr) => ({ streets: ['AAA ROAD', 'BBB ROAD', 'CCC ROAD', 'DDD ROAD', 'TARGET WALK'], rows: arr });
const LATEST = 202609, here = { lat: lat0, lon: lon0 };
const cands = (ex) => N.candidates(sg, here, 2500, ex);
t('distance is metres on the ground', () => { assert.ok(Math.abs(N.dist(here, { lat: lat0, lon: lon0 + mE(500) }) - 500) < 2); });
t('candidates are nearest first and leave out the searched street', () => { const c = cands({ name: 'TARGET WALK', district: '05' }); assert.deepStrictEqual(c.map((x) => x.name), ['AAA ROAD', 'BBB ROAD', 'CCC ROAD', 'DDD ROAD']); assert.ok(c[0].m < c[1].m && c[1].m < c[2].m); });
t('five close sales in the last 3 years: first step, nothing widened', () => {
  const D = rows([[202606, 0, 'T', 2000, 4e6, 'FH', 3], [202604, 0, 'T', 2100, 4.2e6, 'FH', 3], [202601, 1, 'T', 1900, 3.9e6, 'FH', 3], [202511, 1, 'T', 2200, 4.4e6, 'FH', 3], [202510, 0, 'T', 1800, 3.7e6, 'FH', 3]]);
  const r = N.select(cands(), { '05': D }, { type: 'T', latest: LATEST }); assert.strictEqual(r.state, 'ok'); assert.strictEqual(r.step, 0); assert.strictEqual(r.widened, false); assert.strictEqual(r.n, 5);
});
t('too few close: widens one step at a time and says what the first step held', () => {
  const D = rows([[202606, 0, 'T', 2000, 4e6, 'FH', 3], [202604, 0, 'T', 2100, 4.2e6, 'FH', 3], [202601, 2, 'T', 1900, 3.9e6, 'FH', 3], [202511, 2, 'T', 2200, 4.4e6, 'FH', 3], [202510, 2, 'T', 1800, 3.7e6, 'FH', 3]]);
  const r = N.select(cands(), { '05': D }, { type: 'T', latest: LATEST }); assert.strictEqual(r.step, 2); assert.strictEqual(r.tier.m, 1500); assert.deepStrictEqual([r.first.n, r.first.tier.m], [2, 600]); assert.strictEqual(r.widened, true);
});
t('the radius really is 1.5 km at step 3 (a street 1.8 km away needs the last step)', () => {
  const D = rows([[202606, 3, 'T', 2000, 4e6, 'FH', 3], [202604, 3, 'T', 2100, 4.2e6, 'FH', 3], [202601, 3, 'T', 1900, 3.9e6, 'FH', 3], [202511, 3, 'T', 2200, 4.4e6, 'FH', 3], [202510, 3, 'T', 1800, 3.7e6, 'FH', 3]]);
  const r = N.select(cands(), { '05': D }, { type: 'T', latest: LATEST }); assert.strictEqual(r.step, 3); assert.strictEqual(r.tier.m, 2500);
});
t('recency: a sale 4 years old is used only from the 5-year steps', () => {
  const old = [[202209, 0, 'T', 2000, 4e6, 'FH', 3], [202210, 0, 'T', 2000, 4e6, 'FH', 3], [202211, 0, 'T', 2000, 4e6, 'FH', 3], [202212, 0, 'T', 2000, 4e6, 'FH', 3], [202301, 0, 'T', 2000, 4e6, 'FH', 3]];
  const r = N.select(cands(), { '05': rows(old) }, { type: 'T', latest: LATEST }); assert.strictEqual(r.step, 2); assert.strictEqual(r.tier.months, 60);
});
t('a terrace is never compared with a semi-detached, and strata houses are kept apart', () => {
  const D = rows([[202606, 0, 'S', 3000, 6e6, 'FH', 3], [202605, 0, 'ST', 1500, 2e6, 'FH', 3], [202604, 0, 'T', 2000, 4e6, 'FH', 3]]);
  const r = N.select(cands(), { '05': D }, { type: 'T', latest: LATEST }); assert.ok(r.rows.every((x) => x.type === 'T')); assert.strictEqual(r.n, 1);
  const s = N.select(cands(), { '05': D }, { type: 'ST', latest: LATEST }); assert.strictEqual(s.strata, true); assert.ok(s.rows.every((x) => x.type === 'ST'));
});
t('fewer than 3 even at the widest step: "none"; 3 or 4: "limited"; the rows are still real sales', () => {
  const D2 = rows([[202606, 0, 'T', 2000, 4e6, 'FH', 3], [202605, 1, 'T', 2000, 4e6, 'FH', 3]]);
  assert.strictEqual(N.select(cands(), { '05': D2 }, { type: 'T', latest: LATEST }).state, 'none');
  const D4 = rows([[202606, 0, 'T', 2000, 4e6, 'FH', 3], [202605, 1, 'T', 2000, 4e6, 'FH', 3], [202604, 1, 'T', 2000, 4e6, 'FH', 3], [202603, 2, 'T', 2000, 4e6, 'FH', 3]]);
  const r = N.select(cands(), { '05': D4 }, { type: 'T', latest: LATEST }); assert.strictEqual(r.state, 'limited'); assert.strictEqual(r.n, 4);
});
t('tenure and land size narrow the sales only while enough remain', () => {
  const mk = (n, tn, land) => Array.from({ length: n }, (_, i) => [202606 - i, 0, 'T', land, 4e6, tn, 3]);
  const D = rows(mk(6, 'FH', 2000).concat(mk(2, '99|1990', 2000)));
  const fh = N.select(cands(), { '05': D }, { type: 'T', latest: LATEST, tenure: 'fh' }); assert.strictEqual(fh.n, 6); assert.strictEqual(fh.narrowed, true);
  const lh = N.select(cands(), { '05': D }, { type: 'T', latest: LATEST, tenure: 'lh' }); assert.ok(lh.n >= 6 || lh.state !== 'ok', 'a 2-sale leasehold set is not offered as the answer');
  const big = N.select(cands(), { '05': rows(mk(6, 'FH', 2000).concat(mk(6, 'FH', 5000))) }, { type: 'T', latest: LATEST, land: 2100 }); assert.ok(big.rows.every((x) => Math.abs(x.land - 2100) <= 2100 * N.LAND_BAND)); assert.strictEqual(big.n, 6);
});
t('freehold and 900+ year leases are one group; shorter leases another', () => { assert.strictEqual(N.tenureClass('FH'), 'fh'); assert.strictEqual(N.tenureClass('956|1928'), 'fh'); assert.strictEqual(N.tenureClass('99|2018'), 'lh'); });
t('every returned sale is a real row of the source file (nothing invented)', () => {
  const D = rows([[202606, 0, 'T', 2000, 4e6, 'FH', 3], [202605, 1, 'T', 2100, 4.1e6, 'FH', 3], [202604, 1, 'T', 2200, 4.2e6, 'FH', 3], [202603, 1, 'T', 1900, 3.9e6, 'FH', 3], [202602, 1, 'T', 2000, 4e6, '99|1990', 3]]);
  const r = N.select(cands(), { '05': D }, { type: 'T', latest: LATEST });
  r.rows.forEach((x) => assert.ok(D.rows.some((d) => d[0] === x.ym && d[3] === x.land && d[4] === x.price && d[2] === x.type)));
});

console.log('Street positions (OneMap, built offline)');
t('geo.json places nearly every street that has sales, and counts the rest', () => {
  assert.strictEqual(G.placed + G.unplaced, I.streets.length);
  assert.ok(G.placed / I.streets.length >= 0.99, 'placed ' + G.placed + ' of ' + I.streets.length);
  assert.ok(G.unplacedSales / G.sales < 0.01, 'sales on unplaced streets ' + G.unplacedSales);
});
t('every placed street is a street in the sales index, in that district, with a plausible Singapore position', () => {
  const key = new Set(I.streets.map((s) => s[0] + '|' + s[1])); const seen = new Set();
  G.streets.forEach((s) => { assert.ok(key.has(s[0] + '|' + s[1]), s[0]); assert.ok(!seen.has(s[0] + '|' + s[1]), 'duplicate ' + s[0]); seen.add(s[0] + '|' + s[1]); assert.ok(s[2] > 1.15 && s[2] < 1.48 && s[3] > 103.6 && s[3] < 104.1, s[0]); });
});
t('planning areas named in the files are ones the Map knows (so the map link lands)', () => {
  const ok = new Set(AM.areas.map((a) => a.n)); G.streets.concat(M.streets.map((s) => [s[0], '', s[1], s[2], s[3]])).forEach((s) => { if (s[4]) assert.ok(ok.has(s[4]), s[4]); });
});
t('the files carry the OneMap source line and no sale or house detail', () => { assert.ok(/OneMap/.test(G.source) && /OneMap/.test(M.source)); assert.ok(!JSON.stringify(G).match(/price|psf/i)); });
t('streets are one point each: no house-level positions', () => { G.streets.forEach((s) => assert.strictEqual(s.length, 5)); });

console.log('Springwood Crescent, and a buyer with S$5-6M for a terrace');
const sw = M.streets.filter((s) => s[0] === 'SPRINGWOOD CRESCENT')[0], SW = { name: sw[0], lat: sw[1], lon: sw[2], area: sw[3] };
t('Springwood Crescent has no landed sale of its own, and can be placed', () => { assert.ok(!I.streets.some((s) => s[0] === 'SPRINGWOOD CRESCENT')); assert.strictEqual(SW.area, 'Queenstown'); });
t('terraces: enough sales within 600 m in the last 3 years, so nothing is widened', () => { const r = near(SW, 'T'); assert.strictEqual(r.state, 'ok'); assert.strictEqual(r.step, 0); assert.ok(r.n >= 10 && r.streets >= 3, r.n + ' sales on ' + r.streets); assert.ok(r.rows.every((x) => x.m <= 600)); });
t('the headline figures are exactly the min and max of the sales listed', () => {
  const r = near(SW, 'T'), p = r.rows.map((x) => x.price), f = r.rows.map((x) => x.psf);
  assert.strictEqual(r.price[0], Math.min.apply(null, p)); assert.strictEqual(r.price[1], Math.max.apply(null, p)); assert.strictEqual(r.psf[0], Math.min.apply(null, f)); assert.strictEqual(r.psf[1], Math.max.apply(null, f));
});
t('every listed sale matches the URA file it came from', () => {
  near(SW, 'T').rows.forEach((x) => { const D = F[x.district], si = D.streets.indexOf(x.street); assert.ok(D.rows.some((d) => d[0] === x.ym && d[1] === si && d[2] === 'T' && d[3] === x.land && d[4] === x.price && d[5] === x.tenure)); });
});
t('S$5-6M terraces exist among them: the listed prices let the buyer see which sales are relevant', () => { const r = near(SW, 'T'); const inBand = r.rows.filter((x) => x.price >= 5e6 && x.price <= 6e6); assert.ok(inBand.length >= 2, 'in band ' + inBand.length); assert.ok(inBand.every((x) => x.land > 1600), 'those at $5-6M have land of 1,600 sq ft or more'); });
t('with 8+ sales the middle group is said: edges are real sale prices, equal numbers left out at each end; fewer than 8 say nothing', () => {
  const r = near(SW, 'T'); assert.ok(r.n >= N.MID_MIN && r.mid, 'mid'); const P = r.rows.filter((x) => x.tc === 'fh').map((x) => x.price).sort((a, b) => a - b), k = Math.floor((P.length + 1) / 4);
  assert.strictEqual(r.mid.price[0], P[k]); assert.strictEqual(r.mid.price[1], P[P.length - 1 - k]); assert.strictEqual(r.mid.n, P.length - 2 * k); assert.ok(r.mid.price[0] >= r.price[0] && r.mid.price[1] <= r.price[1]);
  const few = near(SW, 'S'); assert.ok(few.n < N.MID_MIN ? few.mid === null : true);
  assert.ok(/data-vx-mid/.test(V.nearbyHtml(r, SW, 'T', I, { r: '../../', geo: G })));
});
t('middle group wording: ranked by price, says how many are left out, and the psf range is of those same sales', () => {
  const r = near(SW, 'T'), P = r.rows.filter((x) => x.tc === 'fh').sort((a, b) => a.price - b.price), k = (r.mid.of - r.mid.n) / 2, M = P.slice(k, P.length - k);
  assert.deepStrictEqual(r.mid.psf, [Math.min.apply(null, M.map((x) => x.psf)), Math.max.apply(null, M.map((x) => x.psf))]);
  const h = V.nearbyHtml(r, SW, 'T', I, { r: '../../', geo: G }), m = /data-vx-mid>([^]*?)<\/p>/.exec(h)[1];
  assert.ok(m.indexOf('Ranked by sale price') === 0 && m.indexOf('leaving out the ' + k + ' lowest and ' + k + ' highest prices') > 0 && m.indexOf('Those same ' + r.mid.n + ' sales were') > 0, m);
});
t('map link names the road and describes what the Map shows (the road, MRT, schools, condo prices); it says landed sales are not on it', () => {
  const h = V.nearbyHtml(near(SW, 'T'), SW, 'T', I, { r: '../../', geo: G }), a = /<a class="gw-vx-next"[^>]*data-gw-go="map">([^]*?)<\/a>/.exec(h)[1];
  assert.ok(/See Springwood Crescent on the map/.test(a) && /Landed sales are not on the map/.test(a) && !/nearby condos sold/.test(a), a);
  assert.ok(/href="\.\.\/\.\.\/research\/map\/#pl=road%3ASpringwood%20Crescent%20\(Queenstown\)"/.test(h), 'goes to the road, by name and area');
});
const E = rd(L + 'estates.json').estates;
t('estate names: URA files the Springwood estate on Jalan Mat Jambol, and a street that starts with the estate name is told so', () => {
  assert.ok(E.some((e) => e[0] === 'SPRINGWOOD' && e[1] === 'JALAN MAT JAMBOL' && e[2] === '05'));
  const c = N.candidates(G, SW, 2500, SW.exclude), est = N.estatesFor(E, 'SPRINGWOOD CRESCENT', c);
  assert.strictEqual(est.length, 1); assert.deepStrictEqual([est[0].estate, est[0].street], ['SPRINGWOOD', 'JALAN MAT JAMBOL']); assert.ok(est[0].m < 600);
  const r = near(SW, 'T'), h = V.nearbyHtml(r, SW, 'T', I, { r: '../../', geo: G, estates: est }), m = /data-vx-estate>([^]*?)<\/p>/.exec(h)[1];
  assert.ok(/estate name <b>Springwood<\/b>, on <b>Jalan Mat Jambol<\/b>/.test(m) && /can’t tell which, if any, were on Springwood Crescent/.test(m) && /Jalan Mat Jambol’s sales are in the list above/.test(m), m);
  assert.ok(!/data-vx-estate/.test(V.nearbyHtml(r, SW, 'T', I, { r: '../../', geo: G })), 'no note without an estate');
});
t('estate names never match by accident: another street, a longer first word, the estate name alone', () => {
  const c = N.candidates(G, SW, 2500, SW.exclude);
  assert.strictEqual(N.estatesFor(E, 'SPRINGLEAF CRESCENT', c).length, 0); assert.strictEqual(N.estatesFor(E, 'SPRINGWOODS CRESCENT', c).length, 0); assert.strictEqual(N.estatesFor(E, 'SPRINGWOOD', c).length, 0);
  assert.strictEqual(N.estatesFor(E, 'SPRINGWOOD CRESCENT', c.filter((x) => x.name !== 'JALAN MAT JAMBOL')).length, 0, 'only when URA files the estate on a street found nearby');
});
t('estates.json holds only names, streets and districts that exist in the landed sales (no counts, no prices)', () => {
  const S = new Set(I.streets.map((x) => x[0] + '|' + x[1])); assert.ok(E.length > 300 && E.every((e) => e.length === 3 && S.has(e[1] + '|' + e[2])));
});
t('semi-detached widens only when the close ring is thin, and says so (first step held fewer than 5)', () => { const r = near(SW, 'S'); assert.ok(r.first.n >= 0); if (r.step > 0) assert.ok(r.first.n < N.MIN_N); });
t('detached: widened to the widest step, never mixed with other types', () => { const r = near(SW, 'D'); assert.ok(r.rows.every((x) => x.type === 'D')); assert.ok(r.widened); });
t('house types offered are only those that have sales around', () => { const r = near(SW, 'T'); Object.keys(r.types).forEach((k) => assert.ok(r.types[k] > 0)); assert.strictEqual(N.defaultType(r.types), 'T'); });

console.log('A street with plenty of sales, and one with too few (unchanged and new behaviour)');
const alnwick = I.streets.filter((s) => s[0] === 'ALNWICK ROAD')[0], AD = F[alnwick[1]], ai = AD.streets.indexOf('ALNWICK ROAD');
t('Alnwick Road: the street answers for itself; its own answer is the existing one (3-year window, 3+ sales)', () => {
  const d = V.landedComps(AD, ai, 'T', I.latestMonth, I.firstMonth); assert.ok(d.n >= 3 && d.win === 'recent', d.n + ' ' + d.win);
});
t('a street with 1-2 sales still gets the neighbours; the nearby answer excludes the street itself', () => {
  const me = G.streets.filter((s) => s[0] === 'JUBILEE ROAD')[0], loc = { name: me[0], lat: me[2], lon: me[3], area: me[4], exclude: { name: me[0], district: me[1] } };
  const r = near(loc, 'S'); assert.ok(r.rows.every((x) => x.street !== 'JUBILEE ROAD')); assert.ok(r.n >= 3);
});
t('the unsold streets OneMap knows can be found by name (a typed street with no sale)', () => { assert.ok(M.streets.length > 500); assert.ok(M.streets.every((s) => s.length === 4 && typeof s[0] === 'string')); });

console.log('What the answer says');
const res = near(SW, 'T'), html = V.nearbyHtml(res, SW, 'T', I, { r: '../../', geo: G });
t('says what was found, for which house type, within what distance and period', () => { assert.ok(/\d+ terrace sales within 600 m in the last 3 years/.test(html)); assert.ok(/Near Springwood Crescent · Queenstown · Terrace/.test(html)); });
t('keeps approximate facts apart from verified ones: distances are "about", street positions are one point', () => { assert.ok(/about \d+ m/.test(html)); assert.ok(/distances are approximate/.test(html)); assert.ok(/not a house/.test(html) && /OneMap/.test(html)); });
t('lists price, land size, tenure and land psf for each sale', () => { assert.ok(/psf/.test(html) && /Freehold/.test(html) && /Land sq ft/i.test(html)); });
t('never claims a value, an estimate or a forecast', () => { assert.ok(!/\b(valuation|valued at|worth about|estimated value|will be worth|forecast)\b/i.test(html.replace(/Why we don’t put one figure[\s\S]*?<\/ul>/, ''))); });
t('links to the road on the existing Map and to Ken', () => { assert.ok(html.indexOf('href="../../research/map/#pl=road%3ASpringwood%20Crescent%20(Queenstown)"') > 0); assert.ok(/data-gw-wa="worth-landed-street"/.test(html)); });
t('a widened answer says so, with what the first step held', () => { const h = V.nearbyHtml(near(SW, 'D'), SW, 'D', I, { r: '../../', geo: G }); assert.ok(/data-vx-widened/.test(h) && /so we looked wider/.test(h)); });
t('too few sales: no ranges, no price, a plain limit and Ken first', () => {
  const none = N.select([], {}, { type: 'T', latest: I.latestMonth }), h = V.nearbyHtml(none, SW, 'T', I, { r: '../../', geo: G });
  assert.strictEqual(none.state, 'none'); assert.ok(/Too few terrace sales nearby to compare/.test(h)); assert.ok(!/gw-vx-figs/.test(h) && !/<table/.test(h)); assert.ok(/Ask Ken about this street/.test(h));
});
t('a thin answer carries the warning and no pretence of a street price', () => {
  const lim = { state: 'limited', step: 3, tier: N.TIERS[3], first: { n: 0, tier: N.TIERS[0] }, rows: res.rows.slice(0, 3), n: 3, streets: 2, widened: true, groups: { fh: { n: 3, price: [4e6, 5e6], psf: [1500, 2500] } }, strata: false };
  const h = V.nearbyHtml(lim, SW, 'T', I, { r: '../../', geo: G }); assert.ok(/data-vx-limited/.test(h) && /rough guide/.test(h));
});
t('a minority tenure group is named, not given its own range, so freehold and leasehold are not mixed', () => {
  const mixed = Object.assign({}, res, { groups: { fh: { n: 8, price: [4e6, 5e6], psf: [1500, 2500] }, lh: { n: 1, price: [2.2e6, 2.2e6], psf: [1000, 1000] } } });
  const h = V.nearbyHtml(mixed, SW, 'T', I, { r: '../../', geo: G }); assert.ok(/data-vx-tenure-note/.test(h) && /1 shorter lease sale/.test(h)); assert.strictEqual((h.match(/<div><span>/g) || []).length, 2);
});
t('the existing no-sales wording is unchanged for a street that cannot be placed', () => { const h = V.noSalesHtml('Zzyzx Close', I, []); assert.ok(/No landed sales recorded on “Zzyzx Close”/.test(h)); });

console.log('Page wiring');
const page = fs.readFileSync(path.join(root, 'journey/worth/index.html'), 'utf8'), h10 = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex').slice(0, 10);
t('the page loads the nearby engine before the page script, with each file\'s current version', () => {
  const a = page.indexOf('gw-landed-near.js'), b = page.indexOf('gw-value.js'); assert.ok(a > 0 && b > a);
  assert.ok(page.indexOf('gw-landed-near.js?v=' + h10('assets/js/gw-landed-near.js')) > 0, 'engine version'); assert.ok(page.indexOf('gw-value.js?v=' + h10('assets/js/gw-value.js')) > 0, 'page script version');
});
t('no new analytics keys: the nearby answer reports only tool, window, count and house type', () => { const src = fs.readFileSync(path.join(root, 'assets/js/gw-value.js'), 'utf8'); const m = src.match(/window: 'nearby'[^}]*}/g) || []; assert.ok(m.length === 2 && m.every((x) => /count: res\.n, home_type:/.test(x))); });
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
