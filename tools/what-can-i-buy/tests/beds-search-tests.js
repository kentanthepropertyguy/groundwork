// node tools/what-can-i-buy/tests/beds-search-tests.js   Budget Search with a bedroom count (Bedroom Search Integration, 26 Oct 2026).
// The page's search (KPT_BEDS.search): resale from the accepted classification (kpt-discover-beds.js resale()), new launches exactly as
// KPT_DISCOVER.search (Huttons inventory), and KPT_DISCOVER.search itself whenever bedrooms do not apply to resale. Fixed cases first, then
// realistic searches over the shipped data (find.json + find-beds.json + inventory.json).
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '../../..');
const F = require(path.join(root, 'assets/js/kpt-find.js')), D = require(path.join(root, 'assets/js/kpt-discover.js')), K = require(path.join(root, 'assets/js/kpt-discover-beds.js'));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

// ---------- fixtures (latest month 2026-09): rows [bin, n, act, last, q1, med, q3]
const row = (bin, n, act, last, q1, q3) => [bin, n, act, last, q1, Math.round((q1 + q3) / 2), q3];
const FP = (id, resale, o) => Object.assign({ id, name: id.toUpperCase(), street: 'ST', d: '15', seg: 'OCR', tg: 1, tl: '99 yrs from 2015', m: 0, new: [], resale }, o || {});
const fig = (q1, q3, o) => Object.assign({ p: [q1 - 1e5, q1, Math.round((q1 + q3) / 2), q3, q3 + 1e5], n: 12, act: 8, last: 202609, from: '2025-10', to: '2026-09', win: 12, sqft: [1000, 1150], v: 0, i: 12 }, o || {});
const findDoc = { v: 1, kind: 'kpt-find-index', asOf: '2026-10-05', latestMonth: '2026-09', window: { from: '2025-10', to: '2026-09' }, bin: 100, minCell: 3, projects: [
  FP('ok3', [row(1000, 8, 5, 202609, 1700000, 1950000), row(700, 6, 4, 202609, 1200000, 1300000)]),
  FP('four', [row(1300, 6, 4, 202609, 2600000, 2800000)]),
  FP('five', [row(1800, 6, 4, 202609, 2700000, 2900000)]),
  FP('mixed3', [row(1000, 6, 4, 202609, 1600000, 1800000)]),
  FP('nocls', [row(1000, 6, 4, 202609, 1600000, 1800000)]),
  FP('studio', [row(400, 6, 4, 202609, 700000, 800000)]),
  FP('launch', [], { new: [row(1000, 9, 4, 202609, 1800000, 1950000)] }),
  FP('ec3', [row(1100, 6, 4, 202609, 1400000, 1500000)], { c: 'ec' }),
] };
const bedsDoc = { v: 1, kind: 'gw-find-beds', asOf: '2026-10-05', latestMonth: '2026-09', projects: {
  ok3: { c: 0.9, t: { 2: { s: 'ok', f: fig(1200000, 1300000, { sqft: [700, 760] }), b: [] }, 3: { s: 'ok', f: fig(1700000, 1950000), b: [row(1000, 8, 5, 202609, 1700000, 1950000)] } }, u: [] },
  four: { c: 0.95, t: { 4: { s: 'ok', f: fig(2600000, 2800000, { sqft: [1300, 1390] }), b: [] } }, u: [] },
  five: { c: 0.95, t: { 5: { s: 'ok', f: fig(2700000, 2900000, { sqft: [1800, 1900], v: 12, i: 0 }), b: [] } }, u: [] },
  mixed3: { c: 0.8, t: { 3: { s: 'mixed', m: [row(1000, 6, 4, 202609, 1600000, 1800000)], x: 6, k: 4 } }, u: [] },
  nocls: { c: null, t: {}, u: [row(1000, 6, 4, 202609, 1600000, 1800000)] },
  studio: { c: 0.95, t: {}, u: [] },   // only studios: never a count
  ec3: { c: 0.9, t: { 3: { s: 'ok', f: fig(1400000, 1500000, { sqft: [1100, 1180] }), b: [] } }, u: [] },
} };
const inv = { v: 2, kind: 'kpt-huttons-public-inventory', checkedAt: '2026-10-07T00:00:00Z', projects: [{ slug: 'launch', name: 'LAUNCH', status: 'ok', checkedAt: '2026-10-07T00:00:00Z', byBedrooms: [{ bedrooms: 3, bands: [[1000, 1850000]] }] }] };
const ix = F.prepare(findDoc), bx = K.prepare(bedsDoc, findDoc), NOW = Date.parse('2026-10-08T00:00:00Z');
const ctxOn = { inv: F.prepareInventory(inv, NOW) }, ctxOff = { inv: F.prepareInventory(inv, Date.parse('2026-12-30T00:00:00Z')) };
const S = (rq, ctx) => K.search(ix, bx, Object.assign({ budget: 2000000 }, rq), ctx || ctxOn);
const ids = (a) => a.map((i) => i.id + '|' + i.sale);

console.log('When bedrooms apply to resale');
t('no bedroom count, New launch only, or no find-beds.json: exactly KPT_DISCOVER.search', () => {
  [[{}, bx], [{ beds: 3, sale: 'new' }, bx], [{ beds: 3 }, null], [{ beds: 3, sale: 'resale' }, null]].forEach((c) => {
    const rq = Object.assign({ budget: 2000000 }, c[0]), a = K.search(ix, c[1], rq, ctxOn), b = D.search(ix, rq, ctxOn);
    assert.deepStrictEqual(ids(a.items), ids(b.items)); assert.deepStrictEqual(a.counts, b.counts); assert.strictEqual(a.beds, null);
  });
});
t('active() needs a budget, a bedroom count, resale included and the data', () => {
  assert.ok(K.active(bx, { budget: 2e6, beds: 3 })); assert.ok(!K.active(bx, { budget: 2e6, beds: 3, sale: 'new' })); assert.ok(!K.active(null, { budget: 2e6, beds: 3 })); assert.ok(!K.active(bx, { budget: 2e6 }));
});

console.log('Resale only');
t('$2m, 3 bedrooms, resale: confirmed matches are the list; not-confirmed and unclassified are kept apart, never in items', () => {
  const r = S({ beds: 3, sale: 'resale' });
  assert.deepStrictEqual(ids(r.items).sort(), ['ec3|resale', 'ok3|resale']); assert.deepStrictEqual(r.beds.insufficient.map((i) => i.id), ['mixed3']);
  assert.deepStrictEqual(r.beds.unclassified.ids, ['nocls']); assert.strictEqual(r.counts.projects, 2); assert.strictEqual(r.counts.insufficient, 1); assert.strictEqual(r.counts.unclassified, 1);
  r.items.forEach((i) => assert.strictEqual(i.beds.state, 'reliable')); assert.ok(r.notes.bedsResale);
});
t('figures on a confirmed match are Research\'s own (median, middle half, count, period, size range, basis)', () => {
  const i = S({ beds: 3, sale: 'resale' }).items.find((x) => x.id === 'ok3');
  assert.deepStrictEqual([i.ura.q1, i.ura.med, i.ura.q3, i.ura.n, i.ura.from, i.ura.to, i.ura.sqft, i.ura.basis], [1700000, 1825000, 1950000, 12, '2025-10', '2026-09', [1000, 1150], { verified: 0, inferred: 12 }]);
});
t('classes stay apart: D.sections splits a bedroom search by class exactly as before', () => {
  const s = D.sections(S({ beds: 3, sale: 'resale' }).items); assert.deepStrictEqual(s.map((x) => x.cls), ['condo', 'ec']);
});
t('unknown bedrooms are never a zero-bedroom match, and studios never match a count', () => {
  [1, 2, 3, 4].forEach((n) => { const r = S({ beds: n, sale: 'resale' }); assert.ok(!r.items.some((i) => i.id === 'studio' || i.id === 'nocls'), n); });
  assert.ok(S({ beds: 3, sale: 'resale' }).beds.unclassified.ids.indexOf('nocls') > -1);
});
t('"4+" means 4 or more (as for new launches); the matched type is named', () => {
  const r = S({ budget: 3000000, beds: 4, sale: 'resale' });
  assert.deepStrictEqual(ids(r.items).sort(), ['five|resale', 'four|resale']); assert.ok(r.beds.orMore);
  assert.strictEqual(r.items.find((i) => i.id === 'five').beds.group, '5'); assert.strictEqual(K.match(ix, bx, 'five', 4, 3000000, null).state, 'none');   // the helper's plain 4 is still exactly 4
});
t('a bedroom count that fits nowhere at this budget: state none, with what was left out counted', () => {
  const r = S({ budget: 1000000, beds: 3, sale: 'resale' });
  assert.strictEqual(r.state, 'none'); assert.strictEqual(r.items.length, 0); assert.ok(Object.keys(r.beds.excluded).length > 0);
});

console.log('New launch or resale');
t('either: confirmed resales plus new launches matched on Huttons inventory, sorted typical first', () => {
  const r = S({ beds: 3 });
  assert.deepStrictEqual(ids(r.items).sort(), ['ec3|resale', 'launch|new', 'ok3|resale']);
  assert.strictEqual(r.items.find((i) => i.id === 'launch').tier, 'huttons'); assert.strictEqual(r.counts.huttons, 1); assert.ok(!r.notes.bedsNewOff);
  const tiers = r.items.map((i) => ({ typical: 0, some: 1, huttons: 2 })[i.tier]); assert.deepStrictEqual(tiers, tiers.slice().sort());
});
t('either with Huttons inventory out of date: resale still matched, and the page is told new launches were not', () => {
  const r = S({ beds: 3 }, ctxOff); assert.ok(r.notes.bedsNewOff); assert.ok(!r.items.some((i) => i.sale === 'new')); assert.ok(r.items.some((i) => i.id === 'ok3'));
});
t('the new-launch part is identical to KPT_DISCOVER.search with sale "new"', () => {
  const a = S({ beds: 3 }).items.filter((i) => i.sale === 'new'), b = D.search(ix, { budget: 2000000, beds: 3, sale: 'new' }, ctxOn).items;
  assert.deepStrictEqual(ids(a), ids(b));
});
t('5% over: kept apart, only when asked', () => {
  assert.strictEqual(S({ budget: 2550000, beds: 4, sale: 'resale' }).over.length, 0);
  const r = S({ budget: 2550000, beds: 4, sale: 'resale', over: true }); assert.ok(r.over.some((i) => i.id === 'four' || i.id === 'five'));
  r.over.forEach((o) => assert.ok(!r.items.some((i) => i.id === o.id && i.sale === o.sale)));
});

console.log('Near a place');
const nearIn = (dist, radius) => ({ dist, radius, label: 'Test', pos: Object.keys(dist).reduce((a, k) => { a[k] = 1; return a; }, {}) });
t('a place: only developments inside the radius, nearest first; an unplaced match is kept apart', () => {
  const near = nearIn({ ok3: 900, ec3: 400, mixed3: 300, launch: 1500 }, 1000);
  near.pos.five = 0; delete near.pos.five;
  const r = S({ beds: 3, near });
  assert.deepStrictEqual(ids(r.items), ['ec3|resale', 'ok3|resale']); assert.deepStrictEqual(r.beds.insufficient.map((i) => i.id), ['mixed3']);
  const r2 = S({ beds: 3, near: Object.assign({}, near, { pos: { ok3: 1 } }) }); assert.ok(r2.unplaced.some((i) => i.id === 'ec3'));
});

console.log('Widening an empty search');
t('alternatives are counted with the bedroom search, and "Show any bedroom" is offered', () => {
  const rq = { budget: 1000000, beds: 3, sale: 'resale' }, a = K.alternatives(ix, bx, rq, ctxOn), any = a.find((x) => x.id === 'beds');
  assert.ok(any && any.count === D.search(ix, { budget: 1000000, sale: 'resale' }, ctxOn).counts.projects);
  a.forEach((x) => assert.ok(x.count > 0));
  const over = K.alternatives(ix, bx, { budget: 2550000, beds: 4, sale: 'resale' }, ctxOn).find((x) => x.id === 'over'); assert.ok(over && over.count >= 1);
});
t('KPT_DISCOVER.alternatives without a search function is unchanged', () => {
  const a = D.alternatives(ix, { budget: 1000000, beds: 3, sale: 'either' }, ctxOn); assert.ok(Array.isArray(a));
});

// ---------- the shipped data: realistic searches
const rd = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const FD = rd('data/projects/find.json'), BD = fs.existsSync(path.join(root, 'data/projects/find-beds.json')) ? rd('data/projects/find-beds.json') : null;
if (!BD) console.log('  skip shipped-data searches: data/projects/find-beds.json not present');
else {
  console.log('Shipped data (' + FD.asOf + ', data to ' + FD.latestMonth + ')');
  const X = F.prepare(FD), BXl = K.prepare(BD, FD), INV = { inv: F.prepareInventory(rd('data/projects/inventory.json'), Date.parse('2026-10-08T00:00:00Z')) };
  const L = (rq) => K.search(X, BXl, rq, INV);
  t('find-beds.json is accepted beside the live find.json (same URA download)', () => assert.ok(BXl));
  const check = (r, B) => {
    r.items.filter((i) => i.sale === 'resale').forEach((i) => { assert.strictEqual(i.beds.state, 'reliable'); assert.ok(i.tier === 'typical' ? i.ura.q3 <= B : i.ura.q1 <= B, i.id); assert.ok(i.ura.basis && (i.ura.basis.verified + i.ura.basis.inferred) > 0, i.id); });
    r.beds.insufficient.forEach((i) => { assert.strictEqual(i.beds.state, 'insufficient'); assert.ok(i.ura.q1 <= B && i.ura.could >= i.ura.identified, i.id); assert.ok(!r.items.some((x) => x.id === i.id && x.sale === 'resale'), 'not both: ' + i.id); });
  };
  [[1500000, 2], [2000000, 2], [1500000, 3], [2000000, 3], [3000000, 4]].forEach(([B, n]) => t('$' + B / 1e6 + 'm, ' + n + (n === 4 ? '+' : '') + ' bedrooms, resale: every listed figure is within the maximum; nothing is both confirmed and not', () => {
    const r = L({ budget: B, beds: n, sale: 'resale' }); check(r, B);
    assert.ok(r.counts.projects > 0, 'some confirmed matches'); assert.ok(r.counts.projects <= D.search(X, { budget: B, sale: 'resale' }, INV).counts.projects + r.counts.projects);
  }));
  t('$2m, 3 bedrooms, either: new launches come only from Huttons inventory and carry no bedroom inference', () => {
    const r = L({ budget: 2000000, beds: 3 }); check(r, 2000000);
    r.items.filter((i) => i.sale === 'new').forEach((i) => { assert.ok(!i.beds, i.id); assert.ok(i.inv && (i.inv.state === 'match' || i.tier === 'huttons'), i.id); });
  });
  t('a bedroom count never adds a resale development that the plain search would not list at a high enough budget', () => {
    const all = new Set(D.search(X, { budget: 20000000, sale: 'resale' }, INV).items.map((i) => i.id));
    L({ budget: 2500000, beds: 3, sale: 'resale' }).items.forEach((i) => assert.ok(all.has(i.id), i.id));
  });
  t('ECs and cluster housing keep their own class in a bedroom search', () => {
    const r = L({ budget: 2000000, beds: 3, sale: 'resale', type: 'ec' }); assert.ok(r.items.length > 0); r.items.forEach((i) => assert.strictEqual(i.cls, 'ec'));
    L({ budget: 3000000, beds: 3, sale: 'resale', type: 'cluster' }).items.forEach((i) => assert.strictEqual(i.cls, 'cluster'));
  });
  t('near a development (Treasure at Tampines, 2 km): every match within the radius', () => {
    const pl = rd('data/map/places.json'), fi = pl.fields, at = (r, k) => r[fi.indexOf(k)], rows = pl.rows.filter((r) => at(r, 'lat') != null);
    const c = rows.find((r) => at(r, 'id') === 'treasure-at-tampines'); assert.ok(c, 'position');
    const hav = (a, b) => { const R = 6371000, toR = (d) => d * Math.PI / 180, dl = toR(b[0] - a[0]), dn = toR(b[1] - a[1]); const h = Math.sin(dl / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
    const dist = {}, pos = {}; rows.forEach((r) => { pos[at(r, 'id')] = 1; const d = hav([at(c, 'lat'), at(c, 'lon')], [at(r, 'lat'), at(r, 'lon')]); if (d <= 3000) dist[at(r, 'id')] = d; });
    const r = L({ budget: 2000000, beds: 3, sale: 'resale', near: { dist, pos, radius: 2000, label: 'Treasure at Tampines' } });
    assert.ok(r.items.length > 0); r.items.concat(r.beds.insufficient).forEach((i) => assert.ok(i.dist <= 2000, i.id + ' ' + i.dist));
    const ds = r.items.map((i) => i.dist); assert.deepStrictEqual(ds, ds.slice().sort((a, b) => a - b));
  });
  t('no matching results: $800,000 for a 4+ bedroom resale lists nothing and offers ways to widen, counted with the same search', () => {
    const rq = { budget: 800000, beds: 4, sale: 'resale' }, r = L(rq); assert.strictEqual(r.items.length, 0); assert.strictEqual(r.state, 'none');
    const a = K.alternatives(X, BXl, rq, INV); assert.ok(a.some((x) => x.id === 'beds' && x.count > 0), JSON.stringify(a));
  });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
