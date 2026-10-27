// node tools/what-can-i-buy/tests/discover-tests.js   DISCOVER V1: Budget Search rules (maximum budget, typical vs some sales, bedrooms never inferred, optional 5%), shipped data, and the page's wiring and privacy.
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '../../..');
const F = require(path.join(root, 'assets/js/kpt-find.js')), D = require(path.join(root, 'assets/js/kpt-discover.js'));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const H = 3600000, NOW = Date.parse('2026-10-06T10:00:00Z'), iso = (ms) => new Date(ms).toISOString();
// rows: [bin,n,act,last,q1,med,q3]; latest month 2026-09
const row = (bin, n, act, last, q1, q3) => [bin, n, act, last, q1, Math.round((q1 + q3) / 2), q3];
const P = (id, o) => Object.assign({ id, name: id.toUpperCase(), street: 'ST ' + id, d: '15', seg: 'RCR', tg: 1, tl: '99 yrs from 2015', m: 0, new: [], resale: [] }, o);
const mk = (ps) => F.prepare({ v: 1, kind: 'kpt-find-index', latestMonth: '2026-09', window: { from: '2025-10', to: '2026-09', label: 'x' }, bin: 100, minCell: 3, projects: ps });
const R = (id, q1, q3, extra) => P(id, Object.assign({ resale: [row(1000, 5, 3, 202609, q1, q3)] }, extra || {}));
const run = (ps, rq, ctx) => D.search(mk(ps), Object.assign({ budget: 2000000 }, rq), ctx || {});
const ids = (r) => r.items.map((i) => i.id).sort();
const DOC = (projects, at) => ({ v: 2, kind: 'kpt-huttons-public-inventory', tool: 'phase2-2', source: 'x', checkedAt: at || iso(NOW - 2 * H), projects });
const IP = (slug, types, extra) => Object.assign({ slug, name: slug.toUpperCase(), checkedAt: iso(NOW - 2 * H), status: 'ok', byBedrooms: types }, extra || {});
const TY = (b, bands) => ({ bedrooms: b, label: b + ' bedrooms', ceiling: 9e6, bands });
const inv = (ps) => F.prepareInventory(DOC(ps), NOW);

console.log('Budget is a maximum, and the tiers say what the evidence is');
t('typical = middle half within the maximum; some = only the lower part; above = not listed', () => {
  const r = run([R('a', 1500000, 1900000), R('b', 1700000, 2300000), R('c', 2100000, 2500000)], {});
  assert.deepStrictEqual(ids(r), ['a', 'b']);
  assert.strictEqual(r.items.find((i) => i.id === 'a').tier, 'typical'); assert.strictEqual(r.items.find((i) => i.id === 'b').tier, 'some');
  assert.strictEqual(r.counts.typical, 1); assert.strictEqual(r.counts.some, 1); assert.strictEqual(r.counts.projects, 2);
});
t('typical items are listed before some items', () => { const r = run([R('b', 1700000, 2300000), R('a', 1500000, 1900000)], {}); assert.deepStrictEqual(r.items.map((i) => i.id), ['a', 'b']); });
t('the maximum is inclusive at both tests (q3 = budget is typical, q1 = budget is some)', () => {
  const r = run([R('a', 1500000, 2000000), R('b', 2000000, 2400000), R('c', 2000001, 2400000)], {});
  assert.deepStrictEqual(ids(r), ['a', 'b']); assert.strictEqual(r.items.find((i) => i.id === 'a').tier, 'typical'); assert.strictEqual(r.items.find((i) => i.id === 'b').tier, 'some');
});
t('evidence rules: 2 sales, a last sale over 6 months old, or a band that sold in only one month are not listed', () => {
  const few = P('f', { resale: [row(1000, 2, 2, 202609, 1500000, 1800000)] });
  const old = P('o', { resale: [row(1000, 6, 3, 202602, 1500000, 1800000)] });
  const one = P('m', { resale: [row(1000, 6, 1, 202609, 1500000, 1800000)] });
  const ok = P('k', { resale: [row(1000, 3, 2, 202604, 1500000, 1800000)] });
  assert.deepStrictEqual(ids(run([few, old, one, ok], {})), ['k']);
});
t('minimum size uses the band centre: a 900 sq ft minimum keeps the 850-950 band and drops 800-900', () => {
  const at = (bin) => P('s', { resale: [row(bin, 5, 3, 202609, 1500000, 1800000)] });
  assert.strictEqual(run([at(850)], { minSize: 900 }).items.length, 1); assert.strictEqual(run([at(800)], { minSize: 900 }).items.length, 0);
});
t('tenure: freehold only keeps freehold and 900+ year leases; lease keeps the rest', () => {
  const ps = [R('f', 1500000, 1800000, { tg: 4, tl: 'Freehold' }), R('l', 1500000, 1800000)];
  assert.deepStrictEqual(ids(run(ps, { tenure: 'free' })), ['f']); assert.deepStrictEqual(ids(run(ps, { tenure: 'lease' })), ['l']); assert.deepStrictEqual(ids(run(ps, {})), ['f', 'l']);
});

console.log('The optional 5% over the maximum is a separate group');
t('over-budget developments are never in the main list, and are returned apart', () => {
  const r = run([R('a', 1500000, 1900000), R('x', 2050000, 2300000)], {});
  assert.deepStrictEqual(ids(r), ['a']); assert.deepStrictEqual(r.over.map((i) => i.id), ['x']); assert.strictEqual(r.over[0].tier, 'over'); assert.strictEqual(r.counts.over, 1);
});
t('5% is a hard edge: 5% over is included, a dollar more is not', () => {
  const r = run([R('x', 2100000, 2300000), R('y', 2100001, 2300000)], {});
  assert.deepStrictEqual(r.over.map((i) => i.id), ['x']);
});
t('a development already in the main list never repeats in the over group', () => { const r = run([R('a', 1500000, 1900000)], {}); assert.strictEqual(r.over.length, 0); assert.strictEqual(r.counts.over, 0); });

console.log('Property type and sale type');
t('type defaults to any; condo, EC and cluster are matched apart and never pooled in sections', () => {
  const ps = [R('c', 1500000, 1800000), R('e', 1500000, 1800000, { c: 'ec' }), R('k', 1500000, 1800000, { c: 'cluster' })];
  assert.strictEqual(D.clean({ budget: 1e6 }).type, 'any'); assert.strictEqual(run(ps, {}).items.length, 3);
  assert.deepStrictEqual(ids(run(ps, { type: 'ec' })), ['e']); assert.deepStrictEqual(D.sections(run(ps, {}).items).map((s) => s.cls), ['condo', 'ec', 'cluster']);
});
t('resale and new launch are separate groups; the sale type filter works', () => {
  const p = P('b', { resale: [row(1000, 5, 3, 202609, 1500000, 1800000)], new: [row(1000, 5, 3, 202609, 1500000, 1800000)] });
  const either = run([p], {}); assert.deepStrictEqual(either.items.map((i) => i.sale).sort(), ['new', 'resale']);
  assert.deepStrictEqual(run([p], { sale: 'new' }).items.map((i) => i.sale), ['new']); assert.deepStrictEqual(run([p], { sale: 'resale' }).items.map((i) => i.sale), ['resale']);
});

console.log('Bedrooms are never inferred');
const NEWP = P('n', { new: [row(1000, 8, 3, 202609, 2500000, 3000000)] });
const RESP = R('r', 1500000, 1800000);
t('resale is never filtered by bedrooms, and the result says so', () => {
  const r = run([RESP], { beds: 2, sale: 'resale' }, { inv: inv([]) });
  assert.deepStrictEqual(ids(r), ['r']); assert.strictEqual(r.notes.bedsResaleOnly, true);
  assert.deepStrictEqual(ids(run([RESP], { sale: 'resale' })), ['r']);
});
t('a new launch is matched by bedrooms only from Huttons inventory, on its price floor', () => {
  const i = inv([IP('n', [TY(2, [[900, 1800000], [1000, 2100000]]), TY(3, [[1100, 2900000]])])]);
  const two = run([NEWP], { beds: 2, sale: 'new' }, { inv: i }); assert.deepStrictEqual(ids(two), ['n']); assert.strictEqual(two.items[0].tier, 'huttons'); assert.strictEqual(two.items[0].inv.from, 1800000); assert.deepStrictEqual(two.items[0].inv.types.map((x) => x.bedrooms), [2]);
  assert.strictEqual(run([NEWP], { beds: 3, sale: 'new' }, { inv: i }).items.length, 0);   // the 3-bedroom floor is over the maximum, whatever URA's prices say
});
t('the URA price test is not used for a bedroom search: URA prices within budget do not make a 3-bedroom match', () => {
  const cheapUra = P('n', { new: [row(1000, 8, 3, 202609, 1500000, 1800000)] });
  const i = inv([IP('n', [TY(3, [[1100, 2900000]])])]);
  assert.strictEqual(run([cheapUra], { beds: 3, sale: 'new' }, { inv: i }).items.length, 0);
});
t('with both sale types and a bedroom choice, resale stays unfiltered and the note says bedrooms apply to new launches only', () => {
  const i = inv([IP('n', [TY(2, [[900, 1800000]])])]);
  const r = run([NEWP, RESP], { beds: 2 }, { inv: i }); assert.deepStrictEqual(ids(r), ['n', 'r']); assert.strictEqual(r.notes.bedsNewOnly, true);
});
t('without fresh inventory a bedroom search lists no new launch and inventoryUsable is false', () => {
  assert.strictEqual(D.inventoryUsable(null), false);
  const stale = F.prepareInventory(DOC([IP('n', [TY(2, [[900, 1800000]])], { checkedAt: iso(NOW - 22 * 24 * H) })], iso(NOW - 22 * 24 * H)), NOW);   // V3.10: past the 21-day window
  assert.strictEqual(D.inventoryUsable(stale), false); assert.strictEqual(run([NEWP], { beds: 2, sale: 'new' }, { inv: stale }).items.length, 0);
  assert.strictEqual(D.inventoryUsable(inv([IP('n', [TY(2, [[900, 1800000]])])])), true);
});
t('4 means four bedrooms or more', () => {
  const i = inv([IP('n', [TY(5, [[1800, 1900000]])])]); assert.strictEqual(run([NEWP], { beds: 4, sale: 'new' }, { inv: i }).items.length, 1);
});

console.log('Where: distance and places the Map cannot place');
t('only developments inside the chosen radius are listed, nearest first', () => {
  const ps = [R('a', 1500000, 1800000), R('b', 1500000, 1800000), R('c', 1500000, 1800000)];
  const near = { dist: { a: 900, b: 300, c: 4000 }, pos: { a: 1, b: 1, c: 1 }, radius: 1000, label: 'X' };
  assert.deepStrictEqual(run(ps, { near }).items.map((i) => i.id), ['b', 'a']);
});
t('a development with no map position is kept apart, not guessed', () => {
  const near = { dist: { a: 300 }, pos: { a: 1 }, radius: 1000, label: 'X' };
  const r = run([R('a', 1500000, 1800000), R('z', 1500000, 1800000)], { near }); assert.deepStrictEqual(ids(r), ['a']); assert.deepStrictEqual(r.unplaced.map((i) => i.id), ['z']);
});
t('an unusable radius is ignored rather than breaking the search', () => { assert.strictEqual(D.clean({ budget: 1e6, near: { dist: {}, pos: {}, radius: 777 } }).near, null); });

console.log('Inputs and states');
t('budget outside $300k to $20m is invalid; no index is nodata; empty results are "none"', () => {
  assert.strictEqual(run([R('a', 1, 2)], { budget: 100000 }).state, 'invalid'); assert.strictEqual(D.search(null, { budget: 1e6 }, {}).state, 'nodata');
  assert.strictEqual(run([R('a', 3000000, 3500000)], {}).state, 'none');
});
t('alternatives are offered only when they add developments, and are never applied for the buyer', () => {
  const ps = [R('a', 3000000, 3500000), R('b', 1500000, 1800000, { c: 'ec' })];
  const alt = D.alternatives(mk(ps), { budget: 1000000, type: 'condo', over: false }, {});
  assert.ok(alt.every((x) => x.count > 0)); assert.ok(alt.length <= 4);
  assert.strictEqual(run(ps, { budget: 1000000, type: 'condo' }).items.length, 0);
});
t('deterministic', () => { const ps = [R('a', 1500000, 1800000), R('b', 1700000, 2300000)]; assert.deepStrictEqual(JSON.stringify(run(ps, {})), JSON.stringify(run(ps, {}))); });

console.log('Shipped data');
const ix = F.prepare(JSON.parse(fs.readFileSync(path.join(root, 'data/projects/find.json'), 'utf8')));
t('real data at $2.0m: every typical item has q3 <= budget, every some item has q1 <= budget < q3, every over item needs the 5%', () => {
  const r = D.search(ix, { budget: 2000000, type: 'any' }, {}); assert.strictEqual(r.state, 'ok'); assert.ok(r.counts.projects > 50);
  r.items.forEach((i) => { assert.ok(i.ura, i.name); if (i.tier === 'typical') assert.ok(i.ura.q3 <= 2000000); else { assert.strictEqual(i.tier, 'some'); assert.ok(i.ura.q1 <= 2000000 && i.ura.q3 > 2000000); } });
  const o = D.search(ix, { budget: 2000000 }, {}).over; o.forEach((i) => { assert.ok(i.ura.q1 > 2000000 && i.ura.q1 <= 2100000); });
});
t('real data: no resale item ever carries inventory, and a higher budget never loses a development', () => {
  const a = D.search(ix, { budget: 1500000 }, {}), b = D.search(ix, { budget: 2500000 }, {});
  a.items.forEach((i) => { if (i.sale === 'resale') assert.strictEqual(i.inv, null); });
  const bi = new Set(b.items.map((i) => i.id + i.sale)); a.items.forEach((i) => assert.ok(bi.has(i.id + i.sale), i.name));
});
t('real data: every EC and cluster item is labelled with its own class', () => {
  D.search(ix, { budget: 2500000 }, {}).items.forEach((i) => assert.ok(['condo', 'ec', 'cluster'].indexOf(i.cls) > -1));
  assert.ok(D.search(ix, { budget: 1800000, type: 'ec' }, {}).items.every((i) => i.cls === 'ec'));
});

console.log('Page wiring and privacy');
const page = fs.readFileSync(path.join(root, 'tools/what-can-i-buy/index.html'), 'utf8'), ui = fs.readFileSync(path.join(root, 'assets/js/kpt-discover-ui.js'), 'utf8'), shim = fs.readFileSync(path.join(root, 'buy/index.html'), 'utf8');
t('the page loads the shared modules, with no questionnaire and no "workable" screen', () => {
  ['kpt-find.js', 'kpt-discover.js', 'kpt-discover-ui.js', 'kpt-discover.css'].forEach((f) => assert.ok(page.indexOf(f) > -1, f));
  assert.ok(!/budget is workable|Your budget is workable/i.test(page + ui));
});
t('property type defaults to Any and bedrooms are described as new-launch only', () => {
  assert.ok(/type: 'any'/.test(ui) || /type:'any'/.test(ui)); assert.ok(/new launch/i.test(ui) && /bedroom/i.test(ui));
});
t('the headline describes past sales, never current availability', () => {
  const m = ui.match(/function headline\(res\) \{[\s\S]*?\n  \}/); assert.ok(m, 'headline found');
  assert.ok(/recent sales/.test(m[0])); assert.ok(!/available|for sale|you can buy/i.test(m[0]));
});
t('budget, place text and requirements never reach analytics, links or storage outside this tab', () => {
  assert.ok(!/localStorage/.test(ui)); const ev = ui.match(/track\('find_shown'[^)]*\)/)[0]; assert.ok(/budget_band/.test(ev) && !/budget:/.test(ev) && !/place/.test(ev));
  assert.ok(!/location\.(search|hash)\s*=/.test(ui)); assert.ok(!/history\.(push|replace)State\([^)]*budget/i.test(ui));
});
t('/buy/ passes its link and this tab on to Budget Search, and still works without JavaScript', () => {
  assert.ok(/location\.replace\('\.\.\/tools\/what-can-i-buy\/' \+ location\.search \+ location\.hash\)/.test(shim)); assert.ok(/http-equiv="refresh"[^>]*what-can-i-buy/.test(shim)); assert.ok(/<a href="\.\.\/tools\/what-can-i-buy\/">/.test(shim));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
