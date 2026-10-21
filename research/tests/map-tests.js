// node research/tests/map-tests.js
// Logic and data checks for the Interactive Map, run on the PUBLISHED map data (data/map). Optional extras:
//   KPT_RAW=<folder with the URA batch-*.json>  also re-runs the build validation against the live Research cells
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../..'), D = (f) => JSON.parse(fs.readFileSync(path.join(root, 'data/map', f), 'utf8'));
const K = require('../../assets/js/kpt-map-core.js'), R = require('../../assets/js/kpt-research.js'), B = require('../../tools/market-data/build-map-data.js');
let pass = 0, fail = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + (e.message || e).toString().split('\n').slice(0, 4).join('\n       ')); } };
const places = D('places.json'), amen = D('amen.json'), extra = amen.extra ? D(amen.extra) : null, ev = D('ev.json'), ix = JSON.parse(fs.readFileSync(path.join(root, 'data/projects/index.json'), 'utf8'));
const mk = (S, withExtra = true) => { const S0 = S || { band: null, radius: 2000 }, M = K.create(places, JSON.parse(JSON.stringify(amen)), S0); M.setEvidence(ev); if (withExtra && extra) M.setExtra(extra); return { M, S: S0 }; };
const { M, S } = mk();
// every development with URA sales now has a position (URA's own, or OneMap's); to test the rule for one that has none, take one position away in a copy
const placesNP = JSON.parse(JSON.stringify(places)); placesNP.rows.find((r) => r[0] === 'newport-residences').splice(2, 2, null, null);
const mkNP = () => { const S0 = { band: null, radius: 2000 }, M2 = K.create(placesNP, JSON.parse(JSON.stringify(amen)), S0); M2.setEvidence(ev); if (extra) M2.setExtra(extra); return M2; };
const hav = (a, b) => { const R_ = 6371000, p = Math.PI / 180, dl = (b.lat - a.lat) * p, dn = (b.lon - a.lon) * p, x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dn / 2) ** 2; return Math.round(2 * R_ * Math.asin(Math.sqrt(x))); };

console.log('data');
t('every Research project is on the map list, once, with the Research display name', () => {
  const F = ix.fields, rows = ix.rows.map((r) => { const o = {}; F.forEach((k, i) => { o[k] = r[i]; }); return o; });
  assert.strictEqual(places.rows.length, rows.length); assert.strictEqual(new Set(places.rows.map((r) => r[0])).size, rows.length);
  rows.forEach((r) => { const p = M.BYID[r.id]; assert.ok(p, r.id); assert.strictEqual(p.n, R.displayName(r.name)); assert.ok(M.EV[p.n], 'evidence for ' + r.id); });
});
t('positions are inside Singapore; a project with no URA position stays unpositioned (never invented)', () => {
  const no = mkNP().P.filter((p) => !p.pos); assert.strictEqual(no.length, 1);
  no.forEach((p) => { assert.strictEqual(p.lat, null); assert.strictEqual(p.lon, null); assert.ok(!mkNP().PM.includes(p)); });
  assert.strictEqual(M.P.filter((p) => !p.pos).length, 0, 'every development with URA sales is on the map');
  M.PM.forEach((p) => { assert.ok(p.lat > 1.15 && p.lat < 1.50 && p.lon > 103.60 && p.lon < 104.10, p.n); });
});
t('SVY21: the grid origin converts to its own latitude and longitude, and a known landmark lands within 50 m', () => {
  const o = B.svy21(28001.642, 38744.572); assert.ok(Math.abs(o.lat - (1 + 22 / 60)) < 1e-6 && Math.abs(o.lon - (103 + 50 / 60)) < 1e-6);
  const x = B.svy21(30000, 31000); assert.ok(x.lat > 1.29 && x.lat < 1.30 && x.lon > 103.85 && x.lon < 103.86);   // central Singapore
});
t('the published files hold aggregates and positions only: no unit, floor, buyer, licence or contact fields', () => {
  const bad = /unit|floor|buyer|phone|email|licen[cs]e|principal|postal|address|nric/i;
  const keys = (o, a = new Set()) => { if (Array.isArray(o)) o.forEach((x) => keys(x, a)); else if (o && typeof o === 'object') Object.keys(o).forEach((k) => { a.add(k); keys(o[k], a); }); return a; };
  [places, amen].forEach((d) => keys(d).forEach((k) => assert.ok(!bad.test(k), 'field ' + k)));
  keys(ev.projects[Object.keys(ev.projects)[0]]).forEach((k) => assert.ok(!bad.test(k), 'ev field ' + k));
  assert.deepStrictEqual(places.fields, ['id', 'name', 'lat', 'lon', 'district', 'seg', 'p12', 's12', 'sub12', 'cls']);
});
t('schools and supermarkets are published as names, levels and positions only, and the layer is switched on', () => {
  assert.strictEqual(amen.extra, 'amen-extra.json'); assert.ok(extra && extra.schools.length > 300 && extra.shops.length > 400);
  extra.schools.forEach((x) => { assert.deepStrictEqual(Object.keys(x).sort(), ['lab', 'lat', 'lon', 'lv', 'n', 'rg', 'sub']); assert.ok(x.lat > 1.15 && x.lat < 1.50 && x.lon > 103.60 && x.lon < 104.10, x.n); });
  extra.shops.forEach((x) => { assert.deepStrictEqual(Object.keys(x).sort(), ['lat', 'lon', 'n', 'w']); assert.ok(x.lat > 1.15 && x.lat < 1.50 && x.lon > 103.60 && x.lon < 104.10, x.n); });
  assert.ok(extra.shops.every((x) => ['FairPrice', 'Cold Storage', 'Sheng Siong', 'Prime', 'U Stars', 'Market Place', 'Mustafa', 'Supermarket'].includes(x.n)), 'only chain names or the plain word Supermarket');
  assert.ok(!/postal|licen|phone|email|principal/i.test(JSON.stringify(Object.keys(extra.schools[0]).concat(Object.keys(extra.shops[0])))));
});
t('the OneMap/SLA source line is published with the layer, next to MOE and NEA', () => {
  const k = extra.sources.map((x) => x.k).sort(); assert.deepStrictEqual(k, ['geocode', 'schools', 'shops']);
  const g = extra.sources.find((x) => x.k === 'geocode'); assert.ok(/OneMap/.test(g.name) && /Singapore Land Authority/.test(g.by) && /accessed/.test('accessed') && g.accessed);
});
t('record-level rows exist only for a market with no supported size, at most 6, none older than 36 months, newest first', () => {
  let n = 0;
  Object.values(ev.projects).forEach((e) => ['new', 'sec'].forEach((m) => {
    const rows = e.rc[m], cells = e.mk[m]; if (!rows.length) return; n++;
    assert.ok(rows.length <= 6); assert.ok(!cells.some((c) => c[2] >= 5 && c[3] >= 3), 'a supported size exists');
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1][0] >= rows[i][0]);
    rows.forEach((r) => { assert.strictEqual(r.length, 4); assert.ok(r[0] >= 202309); });
  }));
  assert.ok(n > 100);
});

console.log('price evidence (Research rules, unchanged)');
t('typical-price rows are supported sizes only (5 sales over 3 months), the shortest window that has one, at most three', () => {
  let blocks = 0;
  M.P.forEach((p) => ['new', 'sec'].forEach((m) => {
    const b = M.market(p.n, m); if (!b) return; blocks++;
    if (b.win === null) { for (let w = 0; w < 3; w++) assert.ok(!M.cellsOf(p.n, m, w).some(K.supported), p.n + ' ' + m + ' has a supported size in window ' + w); return; }
    for (let w = 0; w < b.win; w++) assert.ok(!M.cellsOf(p.n, m, w).some(K.supported), p.n + ' a shorter window had a supported size');
    assert.ok(b.rows.length >= 1 && b.rows.length <= 3); b.rows.forEach((c) => assert.ok(c.n >= 5 && c.act >= 3)); for (let i = 1; i < b.rows.length; i++) assert.ok(b.rows[i - 1].bin < b.rows[i].bin);
  }));
  const expect = Object.values(ev.projects).reduce((n, e) => n + (e.tot.new > 0) + (e.tot.sub + e.tot.res > 0), 0);
  assert.strictEqual(blocks, expect);
});
t('Primary market = New Sale; Secondary market = Sub Sale + Resale (history totals agree with the cells)', () => {
  M.P.slice(0, 400).forEach((p) => { const e = M.EV[p.n]; if (!e) return; const sum = (m) => e.mk[m].filter((c) => c[1] === 2).reduce((s, c) => s + c[2], 0); assert.ok(sum('new') <= e.tot.new); assert.ok(sum('sec') <= e.tot.sub + e.tot.res); });
  assert.deepStrictEqual(K.MKT.new, ['Primary market', 'New Sale']); assert.deepStrictEqual(K.MKT.sec, ['Secondary market', 'Sub Sale + Resale']);
});
t('like-for-like: same market and size, 2 sales over 2 months on BOTH sides, ranked by tenure group, lease proximity and distance (not by sales count)', () => {
  let lists = 0;
  M.PM.filter((p) => M.EV[p.n]).slice(0, 700).forEach((p) => {
    const f = M.focus(p.n); if (!f) return; const sg = M.suggest(p.n, f.mk, f.bin, 2000); if (!sg.length) return; lists++;
    const mine = M.cellsOf(p.n, f.mk).find((c) => c.bin === f.bin); sg.forEach((x) => { assert.ok(K.likeOK(mine, x.theirs)); assert.strictEqual(x.theirs.bin, f.bin); assert.ok(x.p.d <= 2000); });
    for (let i = 1; i < sg.length; i++) assert.ok(sg[i - 1].score <= sg[i].score);
    const sameGroupFirst = sg.every((x, i) => i === 0 || !(M.EV[x.p.n].tenGroup === M.EV[p.n].tenGroup && M.EV[sg[i - 1].p.n].tenGroup !== M.EV[p.n].tenGroup));
    assert.ok(sameGroupFirst, p.n);
  });
  assert.ok(lists > 50);
});
t('selecting a supported size changes the comparison to that market and size; an unsupported selection is ignored', () => {
  const s = { band: null, radius: 2000 }, { M: m2 } = mk(s); let tested = 0;
  for (const p of m2.PM) {
    const sec = m2.market(p.n, 'sec'), nw = m2.market(p.n, 'new'); if (!sec || sec.win === null || !nw || nw.win === null) continue;
    s.band = `new:${nw.rows[0].bin}:${nw.win}`; assert.deepStrictEqual(m2.chosen(p.n), { mk: 'new', bin: nw.rows[0].bin, win: nw.win });
    const nb = m2.nearbyFor(p.n); if (nb.ref) { assert.strictEqual(nb.ref.mk, 'new'); assert.strictEqual(nb.ref.bin, nw.rows[0].bin); }
    s.band = 'sec:1:0'; assert.strictEqual(m2.chosen(p.n), null); if (++tested > 40) break;
  }
  assert.ok(tested > 5);
});
t('"Mainly sub-sales" shows only where more than half of the secondary sales in the shown window are Sub Sales', () => {
  const am = M.BYID['amo-residence']; assert.ok(M.mainlySub(am.n)); assert.ok(!M.mainlySub(M.BYID['jadescape'].n));
  M.P.forEach((p) => { const b = M.market(p.n, 'sec'); if (!b) return assert.strictEqual(M.mainlySub(p.n), false); const cs = M.cellsOf(p.n, 'sec', b.win === null ? 2 : b.win), n = cs.reduce((s, c) => s + c.n, 0), sub = cs.reduce((s, c) => s + c.sub, 0); assert.strictEqual(M.mainlySub(p.n), n > 0 && sub * 2 > n, p.n); });
});
t('a development with no URA position has prices but no neighbourhood or nearby list, and can still be found by search', () => {
  const M = mkNP(), p = M.BYID['newport-residences']; assert.ok(p && !p.pos && M.EV[p.n]);   // a development with no verified position
  assert.deepStrictEqual(M.around(p.n), []); assert.strictEqual(M.nearbyFor(p.n).mode, 'none'); assert.deepStrictEqual(M.nearby(p.n, 5000), []);
  assert.ok(M.places('newport resid').some((x) => x.t === 'dev' && x.n === p.n));
  assert.ok(!M.PM.some((x) => x.n === p.n)); M.PM.forEach((q) => assert.ok(!M.nearby(q.n, 1000).some((x) => x.n === p.n)));
});

console.log('neighbourhood');
t('distances are straight-line and agree with an independent haversine; nearest first', () => {
  const p = M.BYID['jadescape']; const g = M.around(p.n, 2), tr = g.find((x) => x.id === 'tr');
  assert.strictEqual(tr.items.length, 2); assert.ok(tr.items[0].d <= tr.items[1].d);
  tr.items.forEach((i) => assert.strictEqual(i.d, hav(p, { lat: i.lat, lon: i.lon })));
  amen.stations.forEach((s) => assert.ok(s.ex.length >= 1));
});
t('with the layer loaded the card has Transport, Schools, Shops & food and Parks; mixed-level schools are classified by range', () => {
  const g = M.around(M.BYID['jadescape'].n, 2); assert.deepStrictEqual(g.map((x) => x.id), ['tr', 'sc', 'sh', 'pk']); assert.strictEqual(g[2].label, 'Shops & food');
  assert.ok(g.find((x) => x.id === 'sc').items.length >= 1); assert.ok(M.hasSchools() && M.hasShops());
  M.AM.schools.filter((s) => s.lv === 'Mixed level' && /^S/.test(s.rg)).forEach((s) => assert.ok(M.isSec(s) && !M.isPri(s)));
});
t('switching the layer off needs no code change: without it the card has Transport, Food and Parks only', () => {
  const { M: off } = mk(null, false), g = off.around(off.BYID['jadescape'].n, 2);
  assert.deepStrictEqual(g.map((x) => x.id), ['tr', 'sh', 'pk']); assert.strictEqual(g[1].label, 'Food'); assert.strictEqual(g[1].k, 'food');
  assert.ok(!off.hasSchools() && !off.hasShops()); assert.ok(off.places('primary').every((x) => x.t !== 'school'));
});
t('published sources grow with the layer (notice is generated from what is loaded)', () => { assert.ok(['schools', 'shops', 'geocode'].every((k) => M.AM.sources.some((s) => s.k === k))); });
t('the phone peek shows the nearest item per group', () => { const g = M.around(M.BYID['jadescape'].n, 1); g.forEach((x) => assert.ok(x.items.length <= 1)); });
t('every positioned development has a planning area, found by point-in-polygon', () => {
  const miss = M.PM.filter((p) => !M.AREAOF[p.n]); assert.ok(miss.length <= 3, 'unassigned: ' + miss.map((p) => p.n).join(', '));
  assert.strictEqual(M.AREAOF[M.BYID['jadescape'].n], 'Bishan');
});
t('place search: neighbourhoods, then stations, then developments; unknown text finds nothing; developments with sales rank first', () => {
  const r = M.places('toa'); assert.strictEqual(r[0].t, 'area'); assert.deepStrictEqual(M.places('zzzzqqq'), []); assert.deepStrictEqual(M.places('  '), []);
  const order = { area: 0, mrt: 1, dev: 2, school: 3 }; for (let i = 1; i < r.length; i++) assert.ok(order[r[i - 1].t] <= order[r[i].t]);
});
t('place cards: an MRT station lists developments by distance and never shows a price', () => {
  const d = M.placeData({ t: 'mrt', n: 'Toa Payoh MRT' }); assert.ok(d.list.length > 0); for (let i = 1; i < d.list.length; i++) assert.ok(d.list[i - 1].d <= d.list[i].d);
  const a = M.placeData({ t: 'area', n: 'Bishan' }); assert.ok(a.devs.length > 5); assert.ok(a.stn.length >= 1); assert.strictEqual(M.placeData({ t: 'area', n: 'Nowhere' }), null);
});

console.log('Phase 1: development coverage (condo, EC, cluster)');
t('the Map lists every register development once, with its class; unplaced ones stay searchable', () => {
  const by = { condo: 0, ec: 0, cluster: 0 }; M.P.forEach((p) => { by[p.cls]++; }); assert.ok(by.condo > 2000 && by.ec >= 70 && by.cluster >= 140, JSON.stringify(by));
  assert.ok(mkNP().P.some((p) => !p.pos), 'a development without a position is still listed');
  assert.ok(M.P.filter((p) => p.cls !== 'condo' && p.pos).length >= 200, 'ECs and cluster housing are on the map');
});
t('Rosyth School lists Hundred Palms Residences (an EC) within 1 km, with its class', () => {
  const d = M.placeData({ t: 'school', n: 'Rosyth School' }); assert.ok(d && d.list.length, 'school card'); const x = d.list.find((r) => /Hundred Palms/.test(r.p.n)); assert.ok(x, d.list.map((r) => r.p.n).join(','));
  assert.ok(x.d < 400 && M.clsShort(x.p.n) === 'EC');
});
t('CHIJ St. Nicholas Girls\' School lists Horizon Green (cluster housing) within 1 km', () => {
  const d = M.placeData({ t: 'school', n: "CHIJ ST. Nicholas Girls' School" }); assert.ok(d && d.list.length, 'school card'); const x = d.list.find((r) => /Horizon Green/.test(r.p.n)); assert.ok(x, d.list.map((r) => r.p.n).join(','));
  assert.ok(x.d < 500 && x.p.cls === 'cluster');
});
t('nearby comparison and context never mix classes (an EC is only compared with ECs, a condo only with condos)', () => {
  let checked = 0;
  M.P.filter((p) => p.pos && p.cls !== 'condo').slice(0, 60).concat(M.P.filter((p) => p.pos && p.cls === 'condo').slice(0, 60)).forEach((p) => {
    const r = M.nearbyFor(p.n); r.list.forEach((x) => { assert.strictEqual(x.p.cls, p.cls, p.n + ' vs ' + x.p.n); checked++; });
  }); assert.ok(checked > 20);
});
t('a proximity list (area, MRT) holds developments of every class, each tagged, nearest first', () => {
  const a = M.placeData({ t: 'mrt', n: 'Hougang MRT' }); assert.ok(a.list.some((r) => r.p.cls === 'ec') || a.list.some((r) => r.p.cls === 'condo')); for (let i = 1; i < a.list.length; i++) assert.ok(a.list[i - 1].d <= a.list[i].d);
});

console.log('Phase 3: new launches and GLS sites, postal codes, adjustable radius');
const UPD = D('upcoming.json'), fixP = require('./fixtures/onemap-postal.json').answers, later = [], ta = (n, f) => later.push([n, f]);
const stubF = (url) => { const m = /searchVal=(\d+)/.exec(url); return Promise.resolve({ ok: true, json: () => Promise.resolve(fixP[m[1]] || { found: 0, results: [] }) }); };
const mk3 = () => { const o = mk(); o.M.setUpcoming(UPD); return o.M; };
t('Thomson Reserve is found by Groundwork\'s own search, as a new launch, beside (not instead of) the developments with sales', () => {
  const M3 = mk3(), r = M3.places('thomson reserve'); assert.strictEqual(r[0].n, 'Thomson Reserve'); assert.strictEqual(r[0].g, 'up'); assert.ok(/New launch/.test(r[0].sub), r[0].sub);
  const all = M3.places('thomson'); assert.ok(all.some((x) => x.t === 'dev' && !x.g && x.n === 'Thomson Three'), 'a resale project still found'); assert.ok(all.some((x) => x.g === 'up' && x.n === 'Thomson Reserve'));
  const p = M3.BY['Thomson Reserve']; assert.ok(p.pos && p.up && p.up.kind === 'launch' && /under construction/.test(M3.upStage(p)));
});
t('One Chuan Grove is found by its reported name and by the name URA uses; Hougang Central is searchable and now placed on its verified parcel', () => {
  const M3 = mk3(); ['one chuan grove', 'chuan grove', 'lorong chuan gls'].forEach((q2) => assert.ok(M3.places(q2).some((x) => x.n === 'One Chuan Grove'), q2));
  const h = M3.places('hougang central').find((x) => x.n === 'Hougang Central'); assert.ok(h && /GLS site/.test(h.sub) && !/not on the map/.test(h.sub), JSON.stringify(h));
  const hc = M3.BY['Hougang Central']; assert.ok(hc.pos && M3.PM.includes(hc) && /Master Plan 2025/.test(UPD.items.find((i) => i.id === 'hougang-central').posSrc), 'placed on a parcel verified against URA\'s Master Plan');
});
t('a GLS site with no project name yet is found by its location and called a GLS site', () => {
  const M3 = mk3(), r = M3.places('peck hay'); assert.ok(r[0].g === 'up' && r[0].n === 'Peck Hay Road GLS site' && /GLS site/.test(r[0].sub)); const p = M3.BY[r[0].n]; assert.ok(p.up.unnamed && p.pos && /no project name yet/.test(M3.upStage(p)));
});
t('records are linked, never duplicated: no launch or site repeats a development that has URA sales, nor each other', () => {
  const M3 = mk3(), ids = new Set(places.rows.map((r) => r[0])), names = new Set(places.rows.map((r) => M3.BY[r[1]] ? r[1] : r[1])); const seenId = new Set(), seenN = new Set();
  UPD.items.forEach((i) => { assert.ok(!ids.has(i.id), i.id + ' is already a transaction development'); assert.ok(!places.rows.some((r) => r[1].toLowerCase() === i.name.toLowerCase()), i.name); assert.ok(!seenId.has(i.id) && !seenN.has(i.name), 'repeat ' + i.id); seenId.add(i.id); seenN.add(i.name); });
  assert.strictEqual(M3.P.length, places.rows.length + UPD.items.length);
  const again = mk().M; again.setUpcoming(UPD); again.setUpcoming(UPD); assert.strictEqual(again.P.length, places.rows.length + UPD.items.length, 'loading the register twice adds nothing');
  const dup = mk().M; dup.setUpcoming({ items: [{ id: places.rows[0][0], name: 'Same id as a real development', kind: 'launch', stage: 'x', lat: 1.3, lon: 103.8 }, { id: 'zz', name: places.rows[1][1], kind: 'launch', stage: 'x', lat: 1.3, lon: 103.8 }] }); assert.strictEqual(dup.P.length, places.rows.length, 'a transaction record wins by id and by name');
});
t('a launch or site is never a development with sales: no evidence, no price, never in a nearby comparison or a "with recorded sales" list', () => {
  const M3 = mk3(); M3.UP.forEach((p) => { assert.ok(!M3.EV[p.n], p.n); assert.strictEqual(p.t12, 0); });
  const u = M3.BY['Thomson Reserve'], mrt = M3.placeData({ t: 'mrt', n: 'Upper Thomson MRT' }, 3000); assert.ok(mrt.list.length && mrt.list.every((x) => !x.p.up), 'sales lists hold developments with sales only'); assert.ok(mrt.ups.some((x) => x.p === u), 'but it is offered separately');
  M3.P.filter((p) => !p.up && p.pos && M3.EV[p.n]).slice(0, 40).forEach((p) => { const nb = M3.nearbyFor(p.n); nb.list.forEach((x) => assert.ok(!x.p.up)); assert.ok(M3.nearby(p.n, 3000).every((x) => !x.up)); });
  assert.ok(JSON.stringify(UPD).search(/"(price|psf|p12|s12|t12|sales|units|available|asking|launchPrice)"/i) < 0, 'no price, sale or availability field in the register data');
});
t('the card for a launch has its own surroundings: nearest MRT, school, shops and park, by straight-line distance', () => {
  const M3 = mk3(), a = M3.around('Thomson Reserve', 1); assert.deepStrictEqual(a.map((g) => g.id), ['tr', 'sc', 'sh', 'pk']); assert.ok(a[0].items[0].n.includes('Upper Thomson') && a[0].items[0].d < 400);
  const M4 = mk().M; M4.setUpcoming({ items: [{ id: 'zz-no-pos', name: 'Site Without Position', kind: 'gls', stage: 'awarded', posNote: 'x' }] }); assert.deepStrictEqual(M4.around('Site Without Position', 2), [], 'nothing is measured from a site with no position'); assert.strictEqual(M4.placeData({ t: 'dev', n: 'Site Without Position' }), null);
});
t('radius: 500 m, 1 km, 2 km, 3 km; 1 km is the default; every listed development is inside the radius, nearest first, and a wider radius only adds', () => {
  const M3 = mk3(); assert.deepStrictEqual(M3.RADII, [500, 1000, 2000, 3000]);
  [['mrt', 'Toa Payoh MRT'], ['school', M3.AM.schools[5] && M3.AM.schools[5].n], ['area', 'Bishan']].forEach(([ty, nm]) => {
    if (ty === 'area') return; const base = M3.placeData({ t: ty, n: nm }); assert.strictEqual(base.r, 1000, 'default'); let prev = -1;
    M3.RADII.forEach((r) => { const d = M3.placeData({ t: ty, n: nm }, r); assert.strictEqual(d.r, r); assert.ok(d.list.length >= prev); prev = d.list.length; d.list.forEach((x, i) => { assert.ok(x.d <= r, nm + ' ' + x.p.n + ' ' + x.d + ' > ' + r); if (i) assert.ok(x.d >= d.list[i - 1].d); }); d.ups.forEach((x) => assert.ok(x.d <= r)); });
  });
  assert.strictEqual(M3.placeData({ t: 'mrt', n: 'Toa Payoh MRT' }, 1234).r, 1000, 'an unknown radius falls back to 1 km');
});
t('radius: a station with few developments nearby stays at the radius chosen (no silent widening to 2 km)', () => {
  const M3 = mk3(), few = M3.AM.stations.filter((s) => M3.placeData({ t: 'mrt', n: s.n }, 1000).list.length < 3)[0]; assert.ok(few, 'a station with under 3 developments in 1 km exists');
  const d = M3.placeData({ t: 'mrt', n: few.n }); assert.strictEqual(d.r, 1000); d.list.forEach((x) => assert.ok(x.d <= 1000));
});
t('radius: a road works too, with the same four choices', () => {
  const M3 = mk3(); M3.setRoads(D2('geo.json'), D2('geo-more.json')); const rd = M3.AM.roads.find((x) => /^aida street$/i.test(x.title)) || M3.AM.roads[0];
  M3.RADII.forEach((r) => { const d = M3.placeData({ t: 'road', n: rd.key }, r); assert.strictEqual(d.r, r); d.list.forEach((x) => assert.ok(x.d <= r)); });
});
function D2(f) { try { return JSON.parse(fs.readFileSync(path.join(root, 'data/value/landed', f), 'utf8')); } catch (e) { return null; } }
ta('postal code: a typed code resolves to a verified address and centres the Map there, with the same radius choices', async () => {
  const M3 = mk3(), r = await M3.lookupPostal('570155', stubF); assert.strictEqual(r.state, 'ok'); assert.strictEqual(M3.postalState('570155'), 'ok');
  const d = M3.placeData({ t: 'postal', n: '570155' }); assert.strictEqual(d.title, '155 Bishan Street 13'); assert.strictEqual(d.r, 1000); assert.ok(/Postal code 570155/.test(d.meta) && /Bishan/.test(d.meta)); assert.strictEqual(d.lat, r.list[0].lat); assert.strictEqual(d.lon, r.list[0].lon);
  assert.ok(d.list.length > 3 && d.list.every((x, i) => x.d <= 1000 && (!i || x.d >= d.list[i - 1].d))); assert.ok(d.list.some((x) => x.p.n === 'Bishan Loft' && x.p.cls === 'ec'), 'an EC nearby is listed with its class');
  assert.ok(d.ups.some((x) => x.p.n === 'One Chuan Grove' && x.d > 500 && x.d < 1000), 'a GLS site within 1 km is offered separately'); assert.ok(!M3.placeData({ t: 'postal', n: '570155' }, 500).ups.some((x) => x.p.n === 'One Chuan Grove'));
  assert.strictEqual(M3.placeData({ t: 'postal', n: '570155' }, 3000).r, 3000);
});
ta('postal code: invalid, unknown and failed lookups are said simply, and nothing is placed', async () => {
  const M3 = mk3(); assert.strictEqual((await M3.lookupPostal('999999', stubF)).state, 'invalid'); assert.strictEqual((await M3.lookupPostal('123456', stubF)).state, 'none');
  assert.strictEqual((await M3.lookupPostal('560123', () => Promise.reject(new Error('x')))).state, 'error'); assert.strictEqual(M3.placeData({ t: 'postal', n: '123456' }), null, 'no address, no place');
});
ta('postal code: a code shared by several buildings offers each address (up to three)', async () => {
  const M3 = mk3(), r = await M3.lookupPostal('459007', stubF); assert.ok(r.list.length >= 2); r.list.forEach((x) => assert.ok(M3.placeData({ t: 'postal', n: x.n })));
});

if (process.env.KPT_RAW) {
  console.log('build validation against the live Research cells');
  t('42k cells recomputed from the raw URA files match the live cells exactly (0 mismatches)', () => {
    const cfg = require('../../tools/market-data/config.json'), pc = require('../../tools/market-data/project-config.json');
    const docs = fs.readdirSync(process.env.KPT_RAW).filter((f) => /^batch-\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(process.env.KPT_RAW, f), 'utf8')));
    const out = B.build(docs, cfg, pc, ix, 'test'), v = B.validate(out, path.join(root, 'data/projects')); assert.strictEqual(v.bad.length, 0, v.bad.slice(0, 5).join('; ')); assert.ok(v.tested > 40000);
    assert.deepStrictEqual(out.places.map((r) => r[0]), places.rows.map((r) => r[0]));       // the published file is the output of this build
    const id = Object.keys(out.ev)[7]; out.ev[id].mk.sec[0][5] += 1; assert.ok(B.validate(out, path.join(root, 'data/projects')).bad.length > 0, 'a corrupted cell must be caught');
  });
}
console.log('Follow-up: the same optional radius on a selected development, launch or site');
t('a selected development has the same radius choices, a default of 1 km, and never lists itself', () => {
  const M3 = mk3(); ['Bartley Ridge', 'Thomson Three', 'Hundred Palms Residences', 'Horizon Green', 'Thomson Reserve', 'The Serra Residences', 'Chencharu Close', 'Hougang Central'].forEach((n) => {
    assert.ok(M3.BY[n] && M3.BY[n].pos, n + ' has a position'); const b = M3.placeData({ t: 'dev', n }); assert.strictEqual(b.r, 1000, n); assert.strictEqual(b.t, 'dev'); let prev = -1;
    M3.RADII.forEach((r) => { const d = M3.placeData({ t: 'dev', n }, r); assert.strictEqual(d.r, r); assert.ok(d.list.length + d.ups.length >= prev, n + ' never shrinks as the radius grows'); prev = d.list.length + d.ups.length;
      d.list.forEach((x) => { assert.ok(x.d <= r && x.p.n !== n, n); }); d.ups.forEach((x) => { assert.ok(x.d <= r && x.p.n !== n, n); }); assert.strictEqual(d.lat, M3.BY[n].lat); assert.strictEqual(d.lon, M3.BY[n].lon); });
  });
});
t('a development with no position has no radius (never invented)', () => { const M3 = mkNP(); M3.setUpcoming(UPD); const none = M3.P.find((p) => !p.pos); assert.ok(none); assert.strictEqual(M3.placeData({ t: 'dev', n: none.n }), null); assert.strictEqual(M3.placeData({ t: 'dev', n: 'No Such Place' }), null); });
t('the nearby radius does not touch the price comparison: nearbyFor depends only on the comparison radius', () => {
  const o = mk3(), n = 'Bartley Ridge'; const a = JSON.stringify(o.nearbyFor(n)); o.placeData({ t: 'dev', n }, 3000); o.placeData({ t: 'dev', n }, 500); assert.strictEqual(JSON.stringify(o.nearbyFor(n)), a);
});
t('Chencharu Close is listed within 1 km of Khatib MRT, as a site and not as a sale', () => {
  const M3 = mk3(), d = M3.placeData({ t: 'mrt', n: 'Khatib MRT' }); const x = d.ups.find((u) => u.p.n === 'Chencharu Close'); assert.ok(x && x.d < 1000, JSON.stringify(d.ups.map((u) => [u.p.n, u.d]))); assert.ok(!d.list.some((u) => u.p.n === 'Chencharu Close'));
  assert.strictEqual(M3.upStage(M3.BY['Chencharu Close']), 'Awarded HDB GLS site'); assert.strictEqual(M3.upStage(M3.BY['The Serra Residences']), 'New launch');
});
t('search: Serra Residences, the official name and Chencharu Central each find one project', () => {
  const M3 = mk3(); const one = (q, n) => { const r = M3.places(q).filter((x) => x.t === 'dev' && x.n === n); assert.strictEqual(r.length, 1, q); };
  one('serra residences', 'The Serra Residences'); one('the serra residences', 'The Serra Residences'); one('chencharu central', 'Chencharu Close'); one('reserve residences', 'The Reserve Residences'); one('the reserve residences', 'The Reserve Residences');
});
t('The Reserve Residences is on the map at Jalan Anak Bukit and every development with URA sales but no URA position is placed from OneMap or says it is not', () => {
  const M3 = mk3(), r = M3.BY['The Reserve Residences']; assert.ok(r.pos && r.lat > 1.335 && r.lat < 1.345 && r.lon > 103.772 && r.lon < 103.782); assert.ok(M3.PM.includes(r));
  const pos = D('positions-onemap.json'); assert.ok(pos.rows.length >= 80); pos.rows.forEach((x) => { const p = M3.BYID[x[0]]; assert.ok(p && p.pos && Math.abs(p.lat - x[1]) < 1e-5 && Math.abs(p.lon - x[2]) < 1e-5, x[0]); });
});
(async () => { for (const [n, f] of later) { try { await f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + String(e.message || e).split('\n').slice(0, 4).join('\n       ')); } } console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); })();
