#!/usr/bin/env node
// Fixture tests: the catalogue rules on the bundled 27 Oct 2026 inputs. No machine paths, no network, no environment variables.
// Claude C's r3 fixture tests (29 must pass), run on the site's own gw-catalogue.js and data/projects/launch-roster.json.
// node research/tests/catalogue/fixture-tests.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = __dirname, SITE = path.join(__dirname, '..', '..', '..'), C = require(path.join(SITE, 'assets/js/gw-catalogue.js')), RO = require('./roster.js');
const rd = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));
const IN = (f) => rd('fixtures', 'inputs', f);
const inventory = IN('inventory-20261027.json'), roster = JSON.parse(fs.readFileSync(path.join(SITE, 'data', 'projects', 'launch-roster.json'), 'utf8')), classes = IN('classes-20261029.json').classes;
const microsites = {}; IN('featured-20261029.json').featured.forEach((x) => { microsites[x.id] = x.href; });
const at = (iso) => C.build({ inventory, roster, classes, microsites, now: Date.parse(iso) });
const M = at('2026-10-29T08:00:00Z'), by = {}; M.forEach((r) => { by[r.slug] = r; });
let pass = 0, fail = 0; const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ' - ' + e.message); } };
const norm = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((o, k) => { o[k] = norm(v[k]); return o; }, {}) : Array.isArray(v) ? v.map(norm) : v);
const eq = (a, b) => { const x = JSON.stringify(norm(a)), y = JSON.stringify(norm(b)); if (x !== y) throw new Error(x + ' != ' + y); };
const cnt = (f) => { const o = {}; M.forEach((r) => { const m = C.matches(r, f); if (m) o[m.tier] = (o[m.tier] || 0) + 1; }); return o; };
const states = (X) => { const s = {}; X.forEach((r) => { s[r.state] = (s[r.state] || 0) + 1; }); return s; };

console.log('\nStates and freshness');
t('29 Oct: 78 listed, 10 none shown, 1 under review, 1 prices hidden (Arina East, not in the 27 Oct read)', () => eq(states(M), { listed: 78, none_shown: 10, under_review: 1, prices_hidden: 1 }));
t('Arina East stays in the catalogue, without prices, with its last check (7 Oct)', () => { const r = by['arina-east-residences']; eq([r.state, r.types.length, r.lastChecked], ['prices_hidden', 0, '2026-10-07']); });
t('freshness: current to day 14, older to day 60, then hidden; future and invalid dates hidden', () => { const a = '2026-10-27T05:20:33.429Z', b = Date.parse(a), D = 864e5;
  eq([C.freshness(a, b), C.freshness(a, b + 14 * D), C.freshness(a, b + 14 * D + 1), C.freshness(a, b + 60 * D), C.freshness(a, b + 60 * D + 1), C.freshness(a, b - 2 * 3600e3), C.freshness('x', b)],
     ['current', 'current', 'older', 'older', 'hidden', 'hidden', 'hidden']); });
t('15 Nov (day 19): prices still shown, marked older; 26 Dec (day 60): still shown; 27 Dec: every project listed without prices', () => {
  const N = at('2026-11-15T05:00:00Z'); eq(states(N), { listed: 78, none_shown: 10, under_review: 1, prices_hidden: 1 }); eq(N.filter((r) => r.freshness === 'older').length, 89);
  eq(states(at('2026-12-26T05:00:00Z')).listed, 78); eq(states(at('2026-12-27T06:00:00Z')), { prices_hidden: 90 }); eq(at('2026-12-27T06:00:00Z').every((r) => r.types.length === 0), true); });
t('no sold-out state exists in V1', () => { if (M.some((r) => /sold/i.test(r.state))) throw new Error('found'); });

console.log('\nTypes and prices');
t('Turquoise under review (its only type is a misclassified studio); Skies Miltonia keeps its 4-bed', () => { eq([by.turquoise.state, by.turquoise.held], ['under_review', [{ bedrooms: 0, why: 'studio-size' }]]); eq(by['skies-miltonia'].types.map((x) => x.bedrooms), [4]); });
t('Newport 4-bed kept and flagged; highest price hidden; 12,900 sq ft listing in the broad 3,000+ category', () => { const x = by['newport-residences'].types.find((y) => y.bedrooms === 4); eq([x.from, x.upper, x.bands, x.review], [8250000, null, [{ start: 2000, end: 2100, from: 8250000 }, { start: 3000, end: null, from: 103650000 }], ['psf:12900']]); });
t('Cape Royale 3-bed: highest hidden, 7 size bands', () => { const x = by['cape-royale'].types.find((y) => y.bedrooms === 3); eq([x.from, x.upper, x.bands.length], [3450000, null, 7]); });
t('TMW Maxwell 1-bed: wide range shown; 21 Anderson 2-bed: "about"', () => { const a = by['tmw-maxwell'].types[0], b = by['21-anderson'].types[0]; eq([a.from, a.upper, a.wide, b.about], [1300000, 2350000, true, true]); });
t('4 highest prices hidden, 8 wide ranges', () => eq([M.reduce((n, r) => n + r.types.filter((x) => x.upper == null).length, 0), M.reduce((n, r) => n + r.types.filter((x) => x.wide).length, 0)], [4, 8]));
t('every price is on the $50k grid', () => M.forEach((r) => r.types.forEach((x) => [x.from, x.upper].concat(x.bands.map((b) => b.from)).forEach((v) => { if (v != null && v % 50000) throw new Error(r.slug + ' ' + v); }))));

console.log('\nBudget (maximum only) and over-budget sections');
t('tier boundaries', () => eq([C.tier(1.3e6, 1.35e6, 0), C.tier(1.3e6, 1.3e6, 0), C.tier(1.3e6, 1.2e6, 0), C.tier(1.3e6, 1.2e6, 0.10), C.tier(1.3e6, 1.18e6, 0.10), C.tier(1.3e6, 1.18e6, 0.15), C.tier(1.3e6, 1.1e6, 0.15)], ['within', 'around', null, 'over10', null, 'over15', null]));
t('up to $2m', () => eq(cnt({ max: 2e6, allowance: 0.15 }), { within: 47, around: 1, over10: 2, over15: 1 }));
t('up to $1.5m', () => eq(cnt({ max: 1.5e6, allowance: 0.15 }), { within: 25, around: 5, over10: 7, over15: 2 }));
t('3-bed up to $3m', () => eq(cnt({ beds: 3, max: 3e6, allowance: 0.15 }), { within: 31, around: 1, over10: 6, over15: 2 }));
t('2-bed up to $2.5m', () => eq(cnt({ beds: 2, max: 2.5e6, allowance: 0.15 }), { within: 35, around: 1, over10: 2 }));
t('OCR up to $2m without the over-budget sections', () => eq(cnt({ regions: ['OCR'], max: 2e6, allowance: 0 }), { within: 14, around: 1 }));
t('no minimum-budget filter exists (a "min" field is ignored)', () => eq(cnt({ max: 2e6, min: 1.9e6, allowance: 0.15 }), cnt({ max: 2e6, allowance: 0.15 })));

console.log('\nSize and bedroom consistency');
t('freehold or 999-year 4-bed: 23 (22 freehold + The Shorefront, 999 years)', () => eq(cnt({ beds: 4, tenure: ['freehold'] }), { within: 23 }));
t('1,000-1,100 sq ft: 29; studio: none', () => { eq(cnt({ sizeMin: 1000, sizeMax: 1100 }), { within: 29 }); eq(cnt({ beds: 0 }), {}); });
t('with a size filter, "from" uses only that type\'s matched bands and the highest price is withheld unless every band matched', () => {
  const m = C.matches(by['tmw-maxwell'], { beds: 1, sizeMin: 400, sizeMax: 599 }); eq(m.types, [{ bedrooms: 1, from: 1300000, upper: null, bands: [{ start: 400, end: 500, from: 1300000 }, { start: 500, end: 600, from: 1500000 }] }]);
  const all = C.matches(by['tmw-maxwell'], { beds: 1, sizeMin: 400, sizeMax: 900 }); eq(all.types[0].upper, 2350000); });
t('a budget is tested against the matched band of the chosen bedroom type only', () => {
  // TMW Maxwell 1-bed 800-900 band is from $2.25m: a $1.5m budget for 1-bed at 800-899 sq ft must not match through the cheaper 400-500 band
  eq(C.matches(by['tmw-maxwell'], { beds: 1, sizeMin: 800, sizeMax: 899, max: 1.5e6, allowance: 0.15 }), null);
  eq(C.matches(by['tmw-maxwell'], { beds: 1, sizeMin: 800, sizeMax: 899, max: 2.3e6, allowance: 0 }).types[0].from, 2250000); });
t('3,000+ sq ft is one broad category: any range reaching 3,000 matches it; a range below does not', () => {
  const nb = by['newport-residences'];
  eq(C.matches(nb, { beds: 4, sizeMin: 3000 }).types[0].bands, [{ start: 3000, end: null, from: 103650000 }]);
  eq(C.matches(nb, { beds: 4, sizeMin: 2800, sizeMax: 3200 }).types[0].bands.length, 1);
  eq(C.matches(nb, { beds: 4, sizeMin: 2200, sizeMax: 2900 }), null); });
t('location-only filters list every state (prices hidden and none shown included)', () => eq(Object.values(cnt({ regions: ['RCR'] })).reduce((a, b) => a + b, 0), M.filter((r) => r.region === 'RCR').length));

console.log('\nRoster, names and privacy');
t('the roster was built append-only from the two approved files and passes its own check', () => { const r1 = RO.update(null, IN('inventory-20261007.json'), (s, p) => loc(s, p), {}).doc;
  eq(RO.check(roster, { prev: r1, inv: inventory, text: fs.readFileSync(path.join(SITE, 'data/projects/launch-roster.json'), 'utf8') }).errors, []); });
t('roster dates: 79 listed 27 Oct, 9 never listed, Grange 1866 last listed 7 Oct, Arina East last checked 7 Oct', () => { const c = {}; roster.projects.forEach((p) => { const k = p.lastChecked + '/' + p.lastListed; c[k] = (c[k] || 0) + 1; });
  eq(c, { '2026-10-27/2026-10-27': 79, '2026-10-27/null': 9, '2026-10-27/2026-10-07': 1, '2026-10-07/2026-10-07': 1 }); });
t('normal title casing (verified brand exceptions: none recorded yet)', () => { const n = {}; roster.projects.forEach((p) => { n[p.slug] = p.displayName; }); eq([n['21-anderson'], n['8-at-bt'], n['j-den'], n['tmw-maxwell'], n['eden-residences-at-capitol'], n['w-residences-marina-view-singapore']], ['21 Anderson', '8@BT', "J'Den", 'Tmw Maxwell', 'Eden Residences at Capitol', 'W Residences Marina View']); });
t('no internal provider name, counts or unit details in the roster or the model', () => { const s = JSON.stringify(roster) + JSON.stringify(M); if (/huttons|available|units|"count"|stack|#\d/i.test(s)) throw new Error('found'); });
t('location facts and district names for all 90; EC tags; Lucerne Grand keeps its featured link', () => { eq(M.filter((r) => !r.district || !r.region || !r.tenure || !r.districtName).length, 0);
  eq(M.filter((r) => r.classTag).map((r) => r.slug).sort(), ['altura', 'aurelle-of-tampines', 'coastal-cabana', 'north-gaia']); eq(by['lucerne-grand'].microsite, 'https://lucernegrand.kentanthepropertyguy.com/'); });
function loc(s, p) { const f = IN('find-locations-20261005.json').projects.find((x) => x.id === s); return p.district ? { district: p.district, region: p.region, tenure: p.tenure, tenureGroup: p.tenureGroup, street: p.street || null, locSource: 'reviewed' } : f ? { district: f.d, region: f.seg, tenure: f.tl, tenureGroup: f.tg, street: f.street || null, locSource: 'ura' } : null; }

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exitCode = fail ? 1 : 0;
