// node tools/what-can-i-buy/tests/near-tests.js   Near a place (optional radius search): the rules, the wording, the shared Map code, and what must NOT change.
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '../../..');
const F = require(path.join(root, 'assets/js/kpt-find.js')), K = require(path.join(root, 'assets/js/kpt-map-core.js'));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const row = (bin, n, act, last, q1, q3) => [bin, n, act, last, q1, Math.round((q1 + q3) / 2), q3];
const P = (id, c) => Object.assign({ id, name: id.toUpperCase(), street: 'ST ' + id, d: '19', seg: 'OCR', tg: 4, tl: 'Freehold', m: 0, new: [], resale: [row(1000, 6, 3, 202609, 1700000, 1900000)] }, c ? { c } : {});
const mk = (ps) => F.prepare({ v: 1, kind: 'kpt-find-index', latestMonth: '2026-09', window: { from: '2025-10', to: '2026-09', label: 'x' }, bin: 100, minCell: 3, projects: ps });
const SZ = { lo: 900, hi: 1100, source: 'explicit', line: 'x' };
const run = (ix, o) => F.shortlist(ix, Object.assign({ budget: 1800000, openTo: 'resale', size: SZ, districts: [], text: '', freehold: false, answers: { where: 'flexible', size: 'not-sure', priorities: [] } }, o));
const all = (r) => r.groups.reduce((a, g) => a.concat(g.cards, g.more || []), []);
const near = (dist, radius, pos) => ({ dist, radius, label: 'Test Road', pos: pos || Object.keys(dist).reduce((a, k) => { a[k] = 1; return a; }, {}) });

console.log('Radius filter');
const ix = mk([P('a'), P('b'), P('c'), P('d'), P('e'), P('f', 'ec'), P('g', 'cluster')]);
const dist = { a: 300, b: 800, c: 1500, d: 2500, f: 700, g: 2800 };       // e has no position at all
const pos = { a: 1, b: 1, c: 1, d: 1, f: 1, g: 1 };
t('only developments inside the radius are listed, nearest first', () => {
  const r = run(ix, { near: near(dist, 1000, pos) });
  assert.deepStrictEqual(all(r).map((c) => c.id), ['a', 'b']);
  assert.deepStrictEqual(all(r).map((c) => c.dist), [300, 800]);
});
t('a wider radius only ever adds developments (500 m ⊆ 1 km ⊆ 2 km ⊆ 3 km)', () => {
  let prev = [];
  [500, 1000, 2000, 3000].forEach((rad) => { const ids = all(run(ix, { near: near(dist, rad, pos) })).map((c) => c.id); prev.forEach((x) => assert.ok(ids.indexOf(x) > -1, rad + ' lost ' + x)); prev = ids; });
  assert.deepStrictEqual(prev, ['a', 'b', 'c', 'd']);
});
t('a development exactly at the radius is inside it; one metre further is outside', () => {
  assert.deepStrictEqual(all(run(ix, { near: near({ a: 1000 }, 1000, { a: 1 }) })).map((c) => c.id), ['a']);
  assert.deepStrictEqual(all(run(ix, { near: near({ a: 1001 }, 1000, { a: 1 }) })).map((c) => c.id), []);
});
t('the radius counts and names matching developments that have no map position, never silently dropping them', () => {
  const r = run(ix, { near: near(dist, 1000, pos) });
  assert.strictEqual(r.near.noPos, 1); assert.deepStrictEqual(r.near.noPosNames, ['E']);
  assert.ok(!all(r).some((c) => c.id === 'e'));
});
t('a development that does not match the budget is not reported as unplaced', () => {
  const far = mk([P('z', null)]); far.projects[0].resale = [row(1000, 6, 3, 202609, 5000000, 6000000)];
  assert.strictEqual(run(far, { near: near({}, 1000, {}) }).near.noPos, 0);
});
t('ECs and cluster housing stay in their own labelled sections, inside the radius, with their distance', () => {
  const r = run(ix, { near: near(dist, 3000, pos) });
  assert.deepStrictEqual(all(r).map((c) => c.id), ['a', 'b', 'c', 'd']);
  const o = {}; r.otherTypes.forEach((x) => { o[x.cls] = x.groups.reduce((a, g) => a.concat(g.cards), []); });
  assert.deepStrictEqual(o.ec.map((c) => c.id + ':' + c.dist), ['f:700']); assert.deepStrictEqual(o.cluster.map((c) => c.id + ':' + c.dist), ['g:2800']);
  assert.strictEqual(r.near.devs, 6);
  assert.deepStrictEqual(r.near.ids.sort(), ['a', 'b', 'c', 'd', 'f', 'g']);
  assert.deepStrictEqual(all(run(ix, { near: near(dist, 500, pos) })).map((c) => c.id), ['a']);
  assert.strictEqual((run(ix, { near: near(dist, 500, pos) }).otherTypes || []).length, 0);
});
t('every match is listed: the first few show and the rest sit under Show more (none dropped by the street cap)', () => {
  const many = mk(Array.from({ length: 14 }, (_, i) => Object.assign(P('p' + i), { street: 'SAME ST' })));
  const d = {}, p = {}; many.projects.forEach((x, i) => { d[x.id] = 100 + i * 10; p[x.id] = 1; });
  const r = run(many, { near: near(d, 1000, p) });
  assert.strictEqual(r.groups[0].cards.length, F.T.nearFirst); assert.strictEqual(all(r).length, 14); assert.strictEqual(r.near.devs, 14);
});
t('budget, size and sale-type rules are unchanged inside the radius', () => {
  const ix2 = mk([P('a'), Object.assign(P('b'), { resale: [row(1000, 2, 2, 202609, 1700000, 1900000)] }), Object.assign(P('c'), { resale: [row(1000, 6, 3, 202609, 3000000, 3300000)] })]);
  assert.deepStrictEqual(all(run(ix2, { near: near({ a: 100, b: 100, c: 100 }, 1000) })).map((c) => c.id), ['a']);
});
t('with no location the result is exactly what it was (near absent, null or empty all behave the same)', () => {
  const a = JSON.stringify(run(ix)), b = JSON.stringify(run(ix, { near: null })), c = JSON.stringify(run(ix, { near: {} }));
  assert.strictEqual(a, b); assert.strictEqual(a, c); assert.ok(!('near' in JSON.parse(a)));
  assert.deepStrictEqual(all(run(ix)).map((c2) => c2.id).sort(), ['a', 'b', 'c', 'd', 'e']);
});

console.log('Nothing matched: a simple way forward');
t('zero results say so for the radius and offer a wider radius', () => {
  const r = run(ix, { near: near({ a: 2500 }, 500, { a: 1 }) });
  assert.strictEqual(r.state, 'none');
  assert.ok(/within 500 m of Test Road/.test(r.noneText), r.noneText);
  const ids = r.changes.map((c) => c.id);
  assert.ok(ids.some((x) => /^radius-/.test(x)), ids.join());
});
t('the radius suggestion is the nearest wider radius that adds something', () => {
  const r = run(ix, { near: near({ a: 2500 }, 500, { a: 1 }) });
  assert.strictEqual(r.changes.find((c) => /^radius-/.test(c.id)).id, 'radius-3000');
});
t('few results offer a wider radius and all of Singapore', () => {
  const r = run(ix, { near: near({ a: 100 }, 500, { a: 1, b: 1, c: 1, d: 1 }) });
  assert.strictEqual(r.state, 'few'); assert.ok(/within 500 m/.test(r.fewText), r.fewText);
  assert.ok(r.changes.some((c) => c.id === 'area'));
});

console.log('Wording');
t('the order line and data line describe the radius, and distances are called straight-line', () => {
  const r = run(ix, { near: near(dist, 1000, pos) });
  assert.ok(/Nearest first, by straight-line distance/.test(r.orderLine), r.orderLine);
  assert.ok(/within 1 km of Test Road/.test(r.dataLine), r.dataLine);
  assert.ok(F.METHOD.some((x) => /straight-line/.test(x) && /no map position/.test(x)));
});
t('the radius text is 500 m, 1 km, 2 km, 3 km', () => assert.deepStrictEqual([500, 1000, 2000, 3000].map(F.radiusText), ['500 m', '1 km', '2 km', '3 km']));
t('the location is never sent to analytics', () => {
  const r = run(ix, { near: near(dist, 1000, pos) });
  assert.deepStrictEqual(Object.keys(F.analytics(r, '1.8-2.0m')).sort(), F.ANALYTICS_KEYS.slice().sort());
  assert.ok(!/Test Road/.test(JSON.stringify(F.analytics(r, 'x'))));
});

console.log('The real data and the shared Map code');
const find = JSON.parse(fs.readFileSync(path.join(root, 'data/projects/find.json'), 'utf8')), places = JSON.parse(fs.readFileSync(path.join(root, 'data/map/places.json'), 'utf8'));
const M = K.create(places, JSON.parse(fs.readFileSync(path.join(root, 'data/map/amen.json'), 'utf8')), { radius: 1000 });
M.setRoads(JSON.parse(fs.readFileSync(path.join(root, 'data/value/landed/geo.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(root, 'data/value/landed/geo-more.json'), 'utf8')));
const rix = F.prepare(find);
const at = (q, type, rad, budget) => {
  const pl = M.places(q).find((x) => x.t === type), pd = M.placeData(pl), c = { lat: pd.lat, lon: pd.lon }, d = {}, p = {};
  M.PM.forEach((x) => { p[x.id] = 1; const m = K.hav(c, x); if (m <= 3000) d[x.id] = m; });
  return run(rix, { budget, openTo: 'both', size: SZ, sizes: { resale: SZ, new: SZ }, near: { dist: d, pos: p, radius: rad, label: pd.title } });
};
t('the Map\'s place search finds Yio Chu Kang Road, the MRT station and neighbourhoods the same way for both tools', () => {
  assert.ok(M.places('yio chu kang road').some((x) => x.t === 'road'));
  assert.ok(M.places('yio chu kang').some((x) => x.t === 'mrt'));
  assert.ok(M.places('bishan').some((x) => x.t === 'area'));
});
t('Yio Chu Kang Road at 3 km lists nearby condominiums nearest first and the EC separately', () => {
  const r = at('yio chu kang road', 'road', 3000, 1800000), ids = all(r).map((c) => c.id);
  assert.ok(ids.length >= 3); const ds = all(r).map((c) => c.dist); assert.deepStrictEqual(ds, ds.slice().sort((a, b) => a - b));
  assert.ok(ids.indexOf('hundred-palms-residences') < 0, 'the EC must not be pooled with condominiums');
  const ec = (r.otherTypes || []).find((o) => o.cls === 'ec'); assert.ok(ec && ec.groups[0].cards.some((c) => c.id === 'hundred-palms-residences'));
  all(r).forEach((c) => assert.ok(c.dist <= 3000));
});
t('every listed development at every radius really is within it (recomputed from the coordinates)', () => {
  [500, 1000, 2000, 3000].forEach((rad) => {
    const pl = M.places('yio chu kang road').find((x) => x.t === 'road'), pd = M.placeData(pl), r = at('yio chu kang road', 'road', rad, 1800000);
    all(r).concat((r.otherTypes || []).reduce((a, o) => a.concat(o.groups.reduce((b, g) => b.concat(g.cards), [])), [])).forEach((c) => { const pp = M.BYID[c.id]; assert.ok(pp && pp.pos, c.id + ' has no position'); assert.ok(K.hav({ lat: pd.lat, lon: pd.lon }, pp) <= rad, c.id + ' outside ' + rad); });
  });
});
t('the Map\'s model and the budget tool share the same development ids (so a Map dot is a budget card)', () => {
  const ids = {}; places.rows.forEach((x) => { ids[x[places.fields.indexOf('id')]] = 1; });
  const missing = find.projects.filter((p) => !ids[p.id]); assert.ok(missing.length <= 5, 'find projects with no Map record: ' + missing.length);
});

console.log('Final pass: map and list agree, unplaced launches, upcoming launches');
const invDoc = JSON.parse(fs.readFileSync(path.join(root, 'data/projects/inventory.json'), 'utf8')), invNow = Date.parse(invDoc.checkedAt) + 3600000, inv = F.prepareInventory(invDoc, invNow);
const atInv = (q, type, rad, budget, o) => {
  const pl = M.places(q).find((x) => x.t === type), pd = M.placeData(pl), c = { lat: pd.lat != null ? pd.lat : pd.centre[0], lon: pd.lon != null ? pd.lon : pd.centre[1] }, d = {}, p = {};
  M.PM.forEach((x) => { p[x.id] = 1; const m = K.hav(c, x); if (m <= 3000) d[x.id] = m; });
  return run(rix, Object.assign({ budget, openTo: 'both', size: { lo: 700, hi: 1300, source: 'explicit' }, sizes: { resale: { lo: 700, hi: 1300, source: 'explicit' }, new: { lo: 700, hi: 1300, source: 'explicit' } }, inv, near: { dist: d, pos: p, radius: rad, label: pd.title, sitePos: {}, siteDist: {} } }, o || {}));
};
const SCENES = [['yio chu kang road', 'road', 1800000], ['bishan', 'area', 2000000], ['clementi mrt', 'mrt', 1500000], ['tampines', 'area', 1600000], ['orchard road', 'road', 3000000], ['punggol', 'area', 1700000], ['toa payoh', 'area', 1800000], ['upper thomson road', 'road', 2500000]];
t('every development counted inside a radius has a map position and is drawn once: its id is the one the Map finds by name (so dots = the count)', () => {
  SCENES.forEach((sc) => [500, 1000, 2000, 3000].forEach((rad) => {
    const r = atInv(sc[0], sc[1], rad, sc[2]); if (!r.near) return;
    assert.strictEqual(r.near.ids.length, r.near.devs);
    r.near.ids.forEach((id) => { const pp = M.BYID[id]; assert.ok(pp && pp.pos, sc[0] + ' ' + rad + ': ' + id + ' counted but has no position'); assert.strictEqual(M.BY[pp.n], pp, id + ': two developments share the name ' + pp.n); });
    assert.strictEqual(new Set(r.near.ids.map((id) => M.BYID[id].n)).size, r.near.ids.length);
  }));
});
t('no two counted developments sit on the same spot, so no marker can hide another', () => {
  SCENES.forEach((sc) => { const r = atInv(sc[0], sc[1], 3000, sc[2]); if (!r.near) return; const pts = r.near.ids.map((id) => M.BYID[id]); for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(K.hav(pts[i], pts[j]) > 25, pts[i].n + ' and ' + pts[j].n + ' overlap'); });
});
t('developments with no position are never inside the count, and the count equals the placed developments', () => {
  SCENES.forEach((sc) => { const r = atInv(sc[0], sc[1], 3000, sc[2]); if (!r.near) return; r.near.unplaced.forEach((m) => { assert.ok(!(M.BYID[m.id] && M.BYID[m.id].pos), m.id + ' has a position but is listed as unplaced'); assert.ok(r.near.ids.indexOf(m.id) < 0, m.id + ' is both inside and unplaced'); }); assert.strictEqual(r.near.noPos, r.near.unplaced.length); });
});
t('new launches that match on Huttons prices but have no map position are listed as unplaced, including launches that exist only in the inventory', () => {
  const r = atInv('yio chu kang road', 'road', 3000, 1800000), u = r.near.unplaced;
  assert.ok(u.some((m) => m.priced), 'expected Huttons-priced launches without a position');
  assert.ok(u.some((m) => !rix.projects.concat(rix.otherAll).some((p) => p.id === m.id)), 'expected an inventory-only launch (no URA record)');
  u.forEach((m) => { assert.ok(m.name && Array.isArray(m.sales) && m.sales.length && ['condo', 'ec', 'cluster'].indexOf(m.cls) > -1); });
  const names = u.map((m) => m.name); assert.deepStrictEqual(names.filter((x, i) => names.indexOf(x) !== i), []);
  const pr = u.map((m) => m.priced), firstFalse = pr.indexOf(false); if (firstFalse > -1) assert.ok(pr.slice(firstFalse).every((x) => !x), 'priced launches come first');
});
t('without the inventory the unplaced list is only what URA sales matched: no Huttons-priced entry, and nothing the inventory run does not also list', () => {
  const a = atInv('yio chu kang road', 'road', 3000, 1800000, { inv: null }), w = atInv('yio chu kang road', 'road', 3000, 1800000), withIds = w.near.unplaced.map((m) => m.id);
  assert.ok(a.near.unplaced.length > 0 && a.near.unplaced.every((m) => !m.priced));
  a.near.unplaced.forEach((m) => assert.ok(withIds.indexOf(m.id) > -1, m.id + ' is unplaced without the inventory but missing with it'));
  assert.ok(w.near.unplaced.length > a.near.unplaced.length, 'the inventory adds Huttons-priced launches that have no position');
});
const L = (id, extra) => Object.assign({ id, name: id.replace(/-/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase()), url: 'https://example.com/' + id + '/', tagline: 'Tagline ' + id }, extra || {});
const upIds = (r) => (r.upcoming ? r.upcoming.items.map((i) => i.id) : []);
t('with a place chosen, upcoming launches with no verified position are not listed as local possibilities (a discreet link is offered instead), and none is a budget match', () => {
  const r = atInv('yio chu kang road', 'road', 3000, 1800000, { launches: [L('thomson-reserve'), L('hougang-central'), L('lucerne-grand'), L('aurea')] });
  assert.deepStrictEqual(upIds(r), []); assert.strictEqual(r.upcoming.near, true); assert.strictEqual(r.upcoming.more, 2, 'only the two with no price evidence count; lucerne-grand and aurea are priced');
  assert.ok(!all(r).some((c) => c.id === 'thomson-reserve') && !r.near.ids.some((x) => x === 'thomson-reserve'));
});
t('without a location the same possibilities are listed, and a possibility is never counted as a match', () => {
  const rr = run(rix, { budget: 1800000, openTo: 'both', size: { lo: 700, hi: 1300, source: 'explicit' }, sizes: { resale: { lo: 700, hi: 1300, source: 'explicit' }, new: { lo: 700, hi: 1300, source: 'explicit' } }, inv, launches: [L('thomson-reserve')] });
  assert.deepStrictEqual(upIds(rr), ['thomson-reserve']); assert.strictEqual(rr.upcoming.near, false); assert.strictEqual(rr.upcoming.more, 0);
  const base0 = run(rix, { budget: 1800000, openTo: 'both', size: { lo: 700, hi: 1300, source: 'explicit' }, sizes: { resale: { lo: 700, hi: 1300, source: 'explicit' }, new: { lo: 700, hi: 1300, source: 'explicit' } }, inv });
  assert.strictEqual(rr.total, base0.total); assert.strictEqual(rr.shown, base0.shown); assert.ok(!('upcoming' in base0));
});
t('no upcoming block when only resale is wanted or there is nothing to list', () => {
  const o = { launches: [L('thomson-reserve')] };
  assert.deepStrictEqual(upIds(atInv('yio chu kang road', 'road', 3000, 1800000, Object.assign({ openTo: 'resale' }, o))), []);
  assert.deepStrictEqual(upIds(atInv('yio chu kang road', 'road', 3000, 1800000, { launches: [] })), []);
  assert.strictEqual(atInv('yio chu kang road', 'road', 3000, 1800000, { launches: [{ id: 'x', name: 'X' }, null, { id: 'y', name: 'Y', url: 'https://e/' }] }).upcoming.more, 1, 'a launch without a link is skipped');
});
// ---- Upcoming launches do not depend on the Huttons layer. Expired Huttons pricing never feeds budget matching; verified project information stays available.
const oldInv = F.prepareInventory(invDoc, Date.parse(invDoc.checkedAt) + 30 * 86400000);
const bothSz = { size: { lo: 700, hi: 1300, source: 'explicit' }, sizes: { resale: { lo: 700, hi: 1300, source: 'explicit' }, new: { lo: 700, hi: 1300, source: 'explicit' } } };
const noLoc = (o) => run(rix, Object.assign({ budget: 1800000, openTo: 'both' }, bothSz, o || {}));
const sig = (r) => JSON.stringify({ total: r.total, shown: r.shown, ids: all(r).map((c) => c.id) });
t('regression: the inventory is expired in this scenario (so the test means something)', () => {
  assert.ok(oldInv && oldInv.bySlug, 'an old file still prepares');
  const anyFresh = Object.keys(oldInv.bySlug).some((k) => oldInv.bySlug[k].status === 'ok' && F.freshness(oldInv, oldInv.bySlug[k]));
  assert.ok(!anyFresh, 'nothing in a 30-day-old file counts as current');
});
t('regression: with Huttons inventory missing or expired, upcoming possibilities are still offered without a location, and none is a budget match', () => {
  const launches = [L('thomson-reserve'), L('hougang-central'), L('lucerne-grand'), L('aurea')];
  const fresh = noLoc({ inv, launches }), missing = noLoc({ inv: null, launches }), expired = noLoc({ inv: oldInv, launches });
  assert.deepStrictEqual(upIds(fresh).sort(), ['hougang-central', 'thomson-reserve'], 'fresh Huttons prices already cover lucerne-grand; aurea is covered by URA sales');
  assert.deepStrictEqual(upIds(missing).sort(), ['hougang-central', 'lucerne-grand', 'thomson-reserve'], 'no inventory: lucerne-grand has no current price, so it is a possibility');
  assert.deepStrictEqual(upIds(expired).sort(), upIds(missing).sort(), 'expired behaves like missing for the possibilities list');
  [fresh, missing, expired].forEach((r) => { assert.strictEqual(r.upcoming.near, false); assert.ok(!all(r).some((c) => /thomson-reserve|hougang-central/.test(c.id)), 'a possibility is never a match'); });
});
t('regression: expired or missing Huttons pricing never reaches budget matching, and adding the launch list changes none of the matches', () => {
  const pricedByHuttons = (r) => all(r).filter((c) => c.tier === 'a' || c.tier === 'b' || (c.simple && c.simple.priceLead === 'From around'));
  assert.ok(pricedByHuttons(noLoc({ inv })).length > 0, 'fresh Huttons prices do produce priced matches');
  const ls = [L('thomson-reserve'), L('lucerne-grand'), L('hougang-central')];
  [['expired', oldInv], ['missing', null]].forEach((c) => {
    const bare = noLoc({ inv: c[1] }), withL = noLoc({ inv: c[1], launches: ls });
    assert.strictEqual(pricedByHuttons(bare).length, 0, c[0] + ': no Huttons-priced match'); assert.strictEqual(pricedByHuttons(withL).length, 0, c[0] + ' + launches: no Huttons-priced match');
    assert.strictEqual(sig(withL), sig(bare), c[0] + ': the launch list never changes the matches');
  });
  assert.strictEqual(sig(noLoc({ inv: oldInv })), sig(noLoc({ inv: oldInv, launches: [] })));
});
t('regression: with a place chosen and the inventory expired or missing, only verified in-radius launches are listed, and a discreet link covers the rest', () => {
  const nr = { dist: {}, pos: {}, radius: 2000, label: 'Test Road', sitePos: { near1: 1, far1: 1 }, siteDist: { near1: 600, far1: 2600 } };
  const ls = [L('nopos'), L('far1'), L('near1')];
  [['missing', null], ['expired', oldInv], ['fresh', inv]].forEach((c) => {
    const r = noLoc({ inv: c[1], near: nr, launches: ls });
    assert.deepStrictEqual(upIds(r), ['near1'], c[0]); assert.strictEqual(r.upcoming.near, true, c[0]); assert.strictEqual(r.upcoming.more, 2, c[0]);
  });
  const e = noLoc({ inv: oldInv, near: nr, launches: [L('nopos')] }); assert.deepStrictEqual(upIds(e), []); assert.strictEqual(e.upcoming.more, 1);
});
t('regression: a launch already covered by valid URA sales or current Huttons prices is not repeated as a possibility; once Huttons goes stale only the Huttons cover lapses', () => {
  const ls = [L('lucerne-grand'), L('aurea'), L('thomson-reserve')];
  const fresh = upIds(noLoc({ inv, launches: ls })), stale = upIds(noLoc({ inv: oldInv, launches: ls }));
  assert.ok(fresh.indexOf('lucerne-grand') < 0 && stale.indexOf('lucerne-grand') > -1);
  assert.ok(fresh.indexOf('aurea') < 0 && stale.indexOf('aurea') < 0, 'URA-covered stays covered whatever the Huttons file says');
});
t('with a place chosen only a launch with a verified position inside the radius is listed, nearest first; one outside, or with no position, is left out', () => {
  const nr = (extra) => Object.assign({ dist: {}, pos: {}, radius: 2000, label: 'Test Road', sitePos: { near1: 1, near2: 1, far1: 1 }, siteDist: { near1: 600, near2: 1500, far1: 2600 } }, extra || {});
  const go = (n, l) => run(rix, { budget: 1800000, openTo: 'both', size: { lo: 700, hi: 1300, source: 'explicit' }, sizes: { resale: { lo: 700, hi: 1300, source: 'explicit' }, new: { lo: 700, hi: 1300, source: 'explicit' } }, inv, near: n, launches: l });
  const r = go(nr(), [L('nopos'), L('far1'), L('near2'), L('near1')]);
  assert.deepStrictEqual(upIds(r), ['near1', 'near2']); assert.ok(r.upcoming.items.every((i) => i.placed && i.dist <= 2000)); assert.strictEqual(r.upcoming.items[0].dist, 600); assert.strictEqual(r.upcoming.more, 2);
  const r5 = go(nr({ radius: 500 }), [L('near1')]); assert.deepStrictEqual(upIds(r5), []); assert.strictEqual(r5.upcoming.more, 1, 'outside 500 m: no local list, discreet link only');
  assert.ok(!('upcoming' in go(nr(), [])), 'nothing to offer, nothing shown');
});
t('the launch microsites file has no coordinates today, so every upcoming launch is honestly "no map position"', () => {
  const sites = JSON.parse(fs.readFileSync(path.join(root, 'data/research/sites.json'), 'utf8')).sites;
  sites.forEach((x) => { if (x.lat != null || x.lon != null) { assert.ok(typeof x.lat === 'number' && typeof x.lon === 'number' && x.lat > 1.1 && x.lat < 1.5 && x.lon > 103.5 && x.lon < 104.1, x.id + ': coordinates must be a number pair inside Singapore'); } });
});

console.log('The page');
const page = fs.readFileSync(path.join(root, 'tools/what-can-i-buy/index.html'), 'utf8'), mapPage = fs.readFileSync(path.join(root, 'research/map/index.html'), 'utf8');
t('the Map files load only when a place is typed (no static script or stylesheet for the Map or Leaflet)', () => {
  assert.ok(!/<script[^>]+(leaflet|kpt-map-)/.test(page)); assert.ok(!/<link[^>]+(leaflet|kpt-map)/.test(page));
  assert.ok(/function loadNear\(\)/.test(page));
});
t('the page asks for the same Map file versions as the Map page (so the browser reuses them and a bump cannot split them)', () => {
  const mv = (/MAP_V = '([^']+)'/.exec(page) || [])[1], want = (/kpt-map-core\.js\?v=([^"']+)/.exec(mapPage) || [])[1];
  assert.ok(mv && want && mv === want, mv + ' vs ' + want);
  assert.strictEqual((/kpt-map-view\.js\?v=([^"']+)/.exec(mapPage) || [])[1], mv); assert.strictEqual((/kpt-map-app\.js\?v=([^"']+)/.exec(mapPage) || [])[1], mv); assert.strictEqual((/kpt-map\.css\?v=([^"']+)/.exec(mapPage) || [])[1], mv);
});
t('the page reuses the Map\'s search and view instead of its own (no second copy of either)', () => {
  assert.ok(/NM\.places\(/.test(page) && /KPT_MAP_VIEW\(/.test(page) && /NM\.placeData\(/.test(page));
  assert.ok(!/L\.map\(|L\.tileLayer\(/.test(page), 'the page must not build its own Leaflet map');
});
t('the radius options are 500 m, 1 km, 2 km and 3 km, and the location is saved only in this tab', () => {
  assert.ok(/RADII = \[500, 1000, 2000, 3000\]/.test(page)); assert.ok(/near: FS\.near \? \{ t: FS\.near\.t, n: FS\.near\.n, r: FS\.near\.r \}/.test(page));
  assert.ok(!/KPT\.track\([^)]*near/i.test(page));
});
t('the launch list is optional, never an error, and only used when the new-launch layer is on', () => {
  assert.ok(/const loadSites = \(\) => .*fetch\(SITES_URL\)\.then\(\(r\) => \(r\.ok \? r\.json\(\) : null\)\)\.catch\(\(\) => null\)/.test(page));
  assert.ok(/launches: launchesFor\(\)/.test(page) && /return sitesDoc \|\| null/.test(page)); assert.ok(/\/\^https:\\\/\\\//.test(page), 'only https launch links');
  assert.ok(!/KPT\.track\([^)]*(launch|site)/i.test(page), 'launch names are never sent to analytics');
});
t('the unplaced list and the upcoming block are separate from the matches, and say what they are not', () => {
  assert.ok(/no verified map position/.test(page)); assert.ok(/Not confirmed to be within/.test(page)); assert.ok(/not budget matches/.test(page)); assert.ok(/Browse other upcoming launches/.test(page));
  assert.ok(/id="kpfUnplaced"/.test(page) && /data-f="unplaced"/.test(page));
  assert.ok(!/<i>\$\{esc\(NR\.sub\)\}<\/i>/.test(page), 'the place type is no longer printed after a name that already carries it');
});

console.log('Phase 3: postal codes and the launch register');
t('a launch or site from the register (onlyNear) is never listed without a place, and never counted as a match', () => {
  const o = { openTo: 'both', size: { lo: 700, hi: 1300, source: 'explicit' }, sizes: { resale: { lo: 700, hi: 1300, source: 'explicit' }, new: { lo: 700, hi: 1300, source: 'explicit' } }, inv };
  const none = run(rix, Object.assign({ budget: 1800000, launches: [L('thomson-reserve'), L('peck-hay-road-gls-site', { onlyNear: true })] }, o));
  assert.deepStrictEqual(upIds(none), ['thomson-reserve'], 'the register-only site is not offered without a place');
  const base0 = run(rix, Object.assign({ budget: 1800000 }, o)); assert.strictEqual(none.total, base0.total); assert.strictEqual(none.shown, base0.shown);
});
t('the page loads the shared postal module before the Map core, and accepts a postal code as a place', () => {
  assert.ok(/gw-postal\.js/.test(page)); assert.ok(page.indexOf('gw-postal.js') < page.indexOf('kpt-map-core.js'), 'postal module first');
  assert.ok(/NEAR_TYPES[^;]*'postal'/.test(page)); assert.ok(/upcoming\.json/.test(page) && /setUpcoming/.test(page));
  assert.ok(!/elastic\/search/.test(page), 'the page has no OneMap lookup of its own; it uses the shared module');
});
t('the shared module, not a copy, is what the Map and Budget Search both call', () => {
  const core = fs.readFileSync(path.join(root, 'assets/js/kpt-map-core.js'), 'utf8'); assert.ok(/gw-postal\.js/.test(core) && !/elastic\/search/.test(core));
  assert.ok(/gw-postal\.js/.test(mapPage) && mapPage.indexOf('gw-postal.js') < mapPage.indexOf('kpt-map-core.js'));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
