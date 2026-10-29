#!/usr/bin/env node
// Fixture tests: the catalogue rules on the bundled 27 Oct 2026 inputs. No machine paths, no network, no environment variables.
// Claude C's r4.2 fixture tests (46 must pass), run on the site's own assets/js/gw-catalogue.js, data/projects/launch-roster.json and catalogue-classes.json.
// node research/tests/catalogue/fixture-tests.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = __dirname, SITE = path.join(__dirname, '..', '..', '..'), C = require(path.join(SITE, 'assets/js/gw-catalogue.js')), RO = require('./roster.js'), CAT = require('./catalogue.js');
const rd = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));
const IN = (f) => rd('fixtures', 'inputs', f);
const inventory = IN('inventory-20261027.json'), list = JSON.parse(fs.readFileSync(path.join(SITE, 'data/projects/launch-roster.json'), 'utf8')), reviewed = JSON.parse(fs.readFileSync(path.join(SITE, 'data/projects/catalogue-classes.json'), 'utf8')), classes = C.classMap(IN('registry-classes-20261029.json'), reviewed);
// The private history roster is never in the repository: the tests rebuild it from the two approved public files, exactly as the toolkit seeded it.
const r07 = RO.update(null, IN('inventory-20261007.json'), (s, p) => loc(s, p), {}).doc, history = RO.update(r07, inventory, (s, p) => loc(s, p), {}).doc;
const microsites = {}; IN('featured-20261029.json').featured.forEach((x) => { microsites[x.id] = x.href; });
const at = (iso, o) => C.build(Object.assign({ inventory, list, classes, microsites, now: Date.parse(iso) }, o || {}));
const M = at('2026-10-29T08:00:00Z'), by = {}; M.forEach((r) => { by[r.slug] = r; });
let pass = 0, fail = 0; const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ' - ' + e.message); } };
const norm = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((o, k) => { o[k] = norm(v[k]); return o; }, {}) : Array.isArray(v) ? v.map(norm) : v);
const ok = (c, m) => { if (!c) throw new Error(m || 'expected true'); };
const eq = (a, b) => { const x = JSON.stringify(norm(a)), y = JSON.stringify(norm(b)); if (x !== y) throw new Error(x + ' != ' + y); };
const cnt = (f) => { const o = {}; M.forEach((r) => { const m = C.matches(r, f); if (m) o[m.tier] = (o[m.tier] || 0) + 1; }); return o; };
const states = (X) => { const s = {}; X.forEach((r) => { s[r.state] = (s[r.state] || 0) + 1; }); return s; };

console.log('\nStates and freshness');
t('29 Oct: 79 shown (78 listed, 1 under review); nothing with "no units" or missing from the 27 Oct read is shown', () => eq(states(M), { listed: 78, under_review: 1 }));
t('the 10 developments whose 27 Oct check showed no units, and Arina East (not in the 27 Oct read), are not shown and not in the active list', () => {
  const gone = ['altura', 'arina-east-residences', 'aurelle-of-tampines', 'grange-1866', 'koon-seng-house', 'lyndenwoods', 'pinetree-hill', 'skye-at-holland', 'tembusu-grand', 'the-continuum', 'the-lakegarden-residences'];
  gone.forEach((g) => { if (by[g] || list.projects.some((r) => r.slug === g)) throw new Error(g + ' shown'); }); gone.forEach((g) => { if (!history.projects.some((r) => r.slug === g)) throw new Error(g + ' lost from history'); });
  const all = C.explain({ inventory, list: history, now: Date.parse('2026-10-29T08:00:00Z') }).excluded; eq(all.map((x) => x.slug).sort(), gone); });
t('freshness: current to day 14, older to day 60, then hidden; future and invalid dates hidden', () => { const a = '2026-10-27T05:20:33.429Z', b = Date.parse(a), D = 864e5;
  eq([C.freshness(a, b), C.freshness(a, b + 14 * D), C.freshness(a, b + 14 * D + 1), C.freshness(a, b + 60 * D), C.freshness(a, b + 60 * D + 1), C.freshness(a, b - 2 * 3600e3), C.freshness('x', b)],
     ['current', 'current', 'older', 'older', 'hidden', 'hidden', 'hidden']); });
t('no newer check (refreshes paused): 15 Nov prices marked older; 26 Dec still shown; 27 Dec prices hidden until the next refresh', () => {
  const N = at('2026-11-15T05:00:00Z'); eq(states(N), { listed: 78, under_review: 1 }); eq(N.filter((r) => r.freshness === 'older').length, 79);
  eq(states(at('2026-12-26T05:00:00Z')).listed, 78); eq(states(at('2026-12-27T06:00:00Z')), { prices_hidden: 79 }); eq(at('2026-12-27T06:00:00Z').every((r) => r.types.length === 0), true); });
t('a v1 roster (the full history) is read with the same rule: still 79, never "none shown" or a missing project', () => eq(states(at('2026-10-29T08:00:00Z', { list: history })), { listed: 78, under_review: 1 }));
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
t('location-only filters list every shown development', () => eq(Object.values(cnt({ regions: ['RCR'] })).reduce((a, b) => a + b, 0), M.filter((r) => r.region === 'RCR').length));

console.log('\nThe removal rule on the real 27 Oct data (simulated 10 Nov reads)');
// A made-up 10 Nov public file from the real 27 Oct one: Cape Royale's 3-bed and Newport's 3,000+ band gone, TMW Maxwell absent, 21 Anderson "no units".
const A1 = '2026-11-10T05:00:00.000Z', NOV = Date.parse('2026-11-10T08:00:00Z');
const nov = (() => { const d = JSON.parse(JSON.stringify(inventory)); d.checkedAt = A1;
  d.projects = d.projects.filter((p) => p.slug !== 'tmw-maxwell').map((p) => Object.assign(p, { checkedAt: A1 }));
  const cr = d.projects.find((p) => p.slug === 'cape-royale'); cr.byBedrooms = cr.byBedrooms.filter((t) => t.bedrooms !== 3);
  const nb = d.projects.find((p) => p.slug === 'newport-residences').byBedrooms.find((t) => t.bedrooms === 4); nb.bands = nb.bands.filter((b) => b[0] < 3000);
  const an = d.projects.find((p) => p.slug === '21-anderson'); an.status = 'zero_returned'; an.byBedrooms = [];
  return d; })();
const novCarried = (() => { const d = JSON.parse(JSON.stringify(nov)); d.projects.push(inventory.projects.find((p) => p.slug === 'tmw-maxwell')); d.projects.sort((a, b) => (a.slug < b.slug ? -1 : 1)); return d; })();   // the toolkit carries an absent project for FIND
const novList = (complete) => CAT.directory({ doc: novCarried, history, verdict: { complete, readsTrusted: true }, inRead: new Set(nov.projects.map((p) => p.slug)), unusable: new Set(), now: NOV, retentionDays: 60 });
t('a bedroom type and a price band missing from the newest complete read are no longer shown', () => {
  const m = {}; C.build({ inventory: novCarried, list: novList(true).doc, now: NOV }).forEach((r) => { m[r.slug] = r; });
  ok(!m['cape-royale'].types.some((t) => t.bedrooms === 3), 'Cape Royale 3-bed gone'); ok(!m['newport-residences'].types.find((t) => t.bedrooms === 4).bands.some((b) => b.start >= 3000), 'Newport 3,000+ band gone');
  eq(C.matches(m['newport-residences'], { beds: 4, sizeMin: 3000 }), null); });
t('complete read: an absent development and one with no units leave the active list (kept in the history, never "sold")', () => {
  const d = novList(true); eq(d.removed.map((x) => [x.slug, x.why]).filter((x) => ['tmw-maxwell', '21-anderson'].indexOf(x[0]) >= 0), [['21-anderson', 'no units shown in this read'], ['tmw-maxwell', 'not in this complete read']]);
  const shown = C.build({ inventory: novCarried, list: d.doc, now: NOV }).map((r) => r.slug); ok(shown.indexOf('tmw-maxwell') < 0 && shown.indexOf('21-anderson') < 0); eq(shown.length, 77);
  ok(!/sold/i.test(RO.text(d.doc))); eq(CAT.checkDirectory(d.doc, { inv: novCarried, history, text: RO.text(d.doc) }).errors, []); });
t('incomplete read: the absent development keeps its 27 Oct listing, dated and marked older; nothing is removed on absence', () => {
  const d = novList(false); eq(d.keptDated.map((x) => x.slug), ['tmw-maxwell']);
  const r = C.build({ inventory: novCarried, list: d.doc, now: NOV }).find((x) => x.slug === 'tmw-maxwell'); eq([r.state, r.lastChecked, r.freshness], ['listed', '2026-10-27T05:20:33.429Z', 'older']);   // 14 days and 3 hours after its own check
  eq(C.build({ inventory: novCarried, list: d.doc, now: Date.parse('2026-12-27T06:00:00Z') }).find((x) => x.slug === 'tmw-maxwell').state, 'prices_hidden'); });
t('a development that comes back is listed again from the history (same name and dates kept)', () => {
  const back = JSON.parse(JSON.stringify(inventory)); const d = CAT.directory({ doc: back, history, verdict: { complete: true }, inRead: new Set(back.projects.map((p) => p.slug)), unusable: new Set(), now: Date.parse('2026-10-29T08:00:00Z'), retentionDays: 60 });
  eq(d.doc.projects.length, 79); eq(d.doc.projects.find((r) => r.slug === 'tmw-maxwell'), history.projects.find((r) => r.slug === 'tmw-maxwell')); });

console.log('\nr4.1 corrections on the real data');
t('after 60 days prices are hidden, and the development stays until a reliable complete refresh confirms it is gone', () => {
  // 30 Dec refresh: TMW Maxwell's 27 Oct listing is over 60 days old, so the file no longer carries it
  const DEC = Date.parse('2026-12-30T08:00:00Z'), dec = JSON.parse(JSON.stringify(inventory)); dec.checkedAt = '2026-12-30T05:00:00.000Z';
  dec.projects = dec.projects.filter((p) => p.slug !== 'tmw-maxwell').map((p) => Object.assign(p, { checkedAt: dec.checkedAt }));
  const run = (complete) => CAT.directory({ doc: dec, history, verdict: { complete, readsTrusted: true }, inRead: new Set(dec.projects.map((p) => p.slug)), unusable: new Set(), liveActive: list, now: DEC, retentionDays: 60 });
  let d = run(false); ok(d.doc.projects.some((r) => r.slug === 'tmw-maxwell'), 'kept on an incomplete refresh'); eq(CAT.checkDirectory(d.doc, { inv: dec, history, now: DEC }).errors, []);
  const r = C.build({ inventory: dec, list: d.doc, now: DEC }).find((x) => x.slug === 'tmw-maxwell'); eq([r.state, r.types.length, r.lastChecked], ['prices_hidden', 0, '2026-10-27']);
  d = run(true); ok(!d.doc.projects.some((x) => x.slug === 'tmw-maxwell'), 'removed only by the complete refresh'); eq(d.removed.find((x) => x.slug === 'tmw-maxwell').why, 'not in this complete read'); });
t('an active entry without an inventory record is shown without prices only after 60 days; otherwise it is never shown', () => {
  const e = C.explain({ inventory: { projects: [] }, list: { projects: [list.projects.find((r) => r.slug === 'tmw-maxwell')] }, now: Date.parse('2026-11-20T00:00:00Z') });
  eq([e.shown.length, e.excluded[0].why], [0, 'not in the inventory file']);
  eq(C.build({ inventory: { projects: [] }, list: { projects: [list.projects.find((r) => r.slug === 'tmw-maxwell')] }, now: Date.parse('2026-12-27T00:00:00Z') })[0].state, 'prices_hidden'); });
t('missing or invalid extraction-mode information never authorises a removal (real 27 Oct read)', () => {
  const vOf = (mode) => { const s = { stopped: null, projects: Array.from({ length: 99 }, (x, i) => ({ projectId: String(i), status: 'ok', units: 3 })) }; if (mode !== undefined) s.mode = mode; return CAT.readVerdict(s, s, {}, { thresholds: { incompleteProjectsPct: 10, incompleteUnitsStopPct: 50 } }); };
  eq([vOf('merged').complete, vOf(undefined).complete, vOf('').complete, vOf('cards').complete], [true, false, false, false]); });
t('the contract fails if any current listing is missing from the active list', () => {
  const x = JSON.parse(JSON.stringify(list)); x.projects = x.projects.filter((r) => r.slug !== 'cape-royale');
  ok(CAT.checkDirectory(x, { inv: inventory, now: Date.parse('2026-10-29T08:00:00Z') }).errors.some((e) => /cape-royale has a current listing but is missing/.test(e))); });

console.log('\nr4.2 Property Type filter');
const pt = (ptype, extra) => M.filter((r) => C.matches(r, Object.assign({ ptype }, extra || {}))).map((r) => r.slug);
t('every one of the 79 shown developments is classified: 77 Condo & Apartment, 2 EC (Coastal Cabana, North Gaia), no cluster housing', () => {
  eq(M.filter((r) => !r.cls).map((r) => r.slug), []); eq([pt('all').length, pt('condo').length, pt('ec').length], [79, 77, 2]); eq(pt('ec'), ['coastal-cabana', 'north-gaia']);
  eq(M.filter((r) => r.cls === 'cluster').length, 0); });
t('the registry (URA) decides; the reviewed file fills only the 6 developments the registry does not hold', () => {
  const regOnly = C.classMap(IN('registry-classes-20261029.json'), null), act = list.projects.map((r) => r.slug);
  eq(act.filter((s) => !regOnly[s]).sort(), Object.keys(reviewed.classes).sort());
  const clash = C.classMap(IN('registry-classes-20261029.json'), { classes: { 'north-gaia': { cls: 'condo' } } }); eq(clash['north-gaia'], 'ec'); });
t('an unclassified development is shown under All Residential only, never under a specific type', () => {
  const X = C.build({ inventory, list, classes: C.classMap(IN('registry-classes-20261029.json'), null), now: Date.parse('2026-10-29T08:00:00Z') });
  const n = (p) => X.filter((r) => C.matches(r, { ptype: p })).length; eq([n('all'), n('condo'), n('ec')], [79, 71, 2]);
  ok(X.find((r) => r.slug === 'lucerne-grand').cls === null); });
t('Property Type combines with every other filter (AND), e.g. EC up to $2m, EC 4-bed', () => {
  eq(pt('ec', { max: 2e6, allowance: 0 }), M.filter((r) => r.cls === 'ec' && C.matches(r, { max: 2e6, allowance: 0 })).map((r) => r.slug));
  eq(pt('condo', { beds: 3, max: 3e6, allowance: 0.15 }).length + pt('ec', { beds: 3, max: 3e6, allowance: 0.15 }).length, Object.values(cnt({ beds: 3, max: 3e6, allowance: 0.15 })).reduce((a, b) => a + b, 0)); });
t('the reviewed file is public-safe: classes and bases only, no prices, counts or provider name', () => {
  const s = JSON.stringify(reviewed); const m = /huttons|price|\$|\bunits?\b|available|sold/i.exec(s); if (m) throw new Error('found ' + m[0]);
  Object.values(reviewed.classes).forEach((e) => { if (['condo', 'ec'].indexOf(e.cls) < 0 || !e.basis) throw new Error('bad entry'); }); });

console.log('\nr4.2 Maximum budget: commas while typing');
t('typing 2000000 shows 2,000,000; the value stays 2000000 and the matches are identical', () => {
  eq(C.typingFormat('2000000', 7), { text: '2,000,000', caret: 9, value: 2000000 });
  eq(cnt({ max: C.typingFormat('2000000').value, allowance: 0.15 }), cnt({ max: 2e6, allowance: 0.15 })); });
t('every keystroke keeps the value equal to the digits typed, and the caret after the same digit', () => {
  let txt = '', c = 0; '2500000'.split('').forEach((d) => { const r = C.typingFormat(txt.slice(0, c) + d + txt.slice(c), c + 1); txt = r.text; c = r.caret; });
  eq([txt, c], ['2,500,000', 9]);
  eq(C.typingFormat('2,0000,000', 6), { text: '20,000,000', caret: 6, value: 20000000 });   // a digit typed in the middle
  eq(C.typingFormat('2000,000', 1), { text: '2,000,000', caret: 1, value: 2000000 });   // backspace over a comma: digits unchanged
  eq(C.typingFormat('2,00,000', 3), { text: '200,000', caret: 2, value: 200000 }); });   // a digit deleted
t('pasted "$2,000,000", empty, leading zeros and letters', () => {
  eq(C.typingFormat('$2,000,000').value, 2000000); eq(C.typingFormat('', 0), { text: '', caret: 0, value: null });
  eq(C.typingFormat('0012', 4), { text: '12', caret: 2, value: 12 }); eq(C.typingFormat('2m', 2).text, '2'); });

console.log('\nActive list, history, names and privacy');
t('the history (90 developments, append-only from the two approved files) passes its own check; SHA-256 equals the toolkit seed', () => {
  eq(RO.check(history, { prev: r07, inv: inventory, text: RO.text(history) }).errors, []); eq(history.projects.length, 90);
  eq(require('crypto').createHash('sha256').update(RO.text(history)).digest('hex'), '7c51e71c359c0ca970ce4f2d4efaf1ece7371a27e1cd644034b8885097a3dfa1'); });
t('the active list is exactly the toolkit\'s directory for the complete 27 Oct read and passes its contract', () => {
  const d = CAT.directory({ doc: inventory, history, verdict: { complete: true, readsTrusted: true }, inRead: new Set(inventory.projects.map((p) => p.slug)), unusable: new Set(), now: Date.parse('2026-10-29T04:00:00Z'), retentionDays: 60 });
  const txt = fs.readFileSync(path.join(SITE, 'data/projects/launch-roster.json'), 'utf8'); eq(RO.text(d.doc), txt);
  eq(CAT.checkDirectory(list, { inv: inventory, history, text: txt }).errors, []); eq([list.v, list.scope, list.projects.length], [2, 'active', 79]); });
t('normal title casing (verified brand exceptions: none recorded yet)', () => { const n = {}; list.projects.forEach((p) => { n[p.slug] = p.displayName; }); eq([n['21-anderson'], n['8-at-bt'], n['j-den'], n['tmw-maxwell'], n['eden-residences-at-capitol'], n['w-residences-marina-view-singapore']], ['21 Anderson', '8@BT', "J'Den", 'Tmw Maxwell', 'Eden Residences at Capitol', 'W Residences Marina View']); });
t('no internal provider name, counts or unit details in the active list, the history or the model', () => { const s = JSON.stringify(list) + JSON.stringify(history) + JSON.stringify(M); if (/huttons|available|units|"count"|stack|#\d/i.test(s)) throw new Error('found'); });
t('location facts and district names for all 79 shown; EC tags (Altura and Aurelle return once they show units); Lucerne Grand keeps its featured link', () => { eq(M.filter((r) => !r.district || !r.region || !r.tenure || !r.districtName).length, 0);
  eq(M.filter((r) => r.classTag).map((r) => r.slug).sort(), ['coastal-cabana', 'north-gaia']); eq(by['lucerne-grand'].microsite, 'https://lucernegrand.kentanthepropertyguy.com/'); });
function loc(s, p) { const f = IN('find-locations-20261005.json').projects.find((x) => x.id === s); return p.district ? { district: p.district, region: p.region, tenure: p.tenure, tenureGroup: p.tenureGroup, street: p.street || null, locSource: 'reviewed' } : f ? { district: f.d, region: f.seg, tenure: f.tl, tenureGroup: f.tg, street: f.street || null, locSource: 'ura' } : null; }

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exitCode = fail ? 1 : 0;
