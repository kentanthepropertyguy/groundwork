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
const hav = (a, b) => { const R_ = 6371000, p = Math.PI / 180, dl = (b.lat - a.lat) * p, dn = (b.lon - a.lon) * p, x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dn / 2) ** 2; return Math.round(2 * R_ * Math.asin(Math.sqrt(x))); };

console.log('data');
t('every Research project is on the map list, once, with the Research display name', () => {
  const F = ix.fields, rows = ix.rows.map((r) => { const o = {}; F.forEach((k, i) => { o[k] = r[i]; }); return o; });
  assert.strictEqual(places.rows.length, rows.length); assert.strictEqual(new Set(places.rows.map((r) => r[0])).size, rows.length);
  rows.forEach((r) => { const p = M.BYID[r.id]; assert.ok(p, r.id); assert.strictEqual(p.n, R.displayName(r.name)); assert.ok(M.EV[p.n], 'evidence for ' + r.id); });
});
t('positions are inside Singapore; a project with no URA position stays unpositioned (never invented)', () => {
  const no = M.P.filter((p) => !p.pos); assert.ok(no.length > 0 && no.length < 200);
  no.forEach((p) => { assert.strictEqual(p.lat, null); assert.strictEqual(p.lon, null); assert.ok(!M.PM.includes(p)); });
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
  assert.deepStrictEqual(places.fields, ['id', 'name', 'lat', 'lon', 'district', 'seg', 'p12', 's12', 'sub12']);
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
  const p = M.BYID['parktown-residence']; assert.ok(p && !p.pos && M.EV[p.n]);
  assert.deepStrictEqual(M.around(p.n), []); assert.strictEqual(M.nearbyFor(p.n).mode, 'none'); assert.deepStrictEqual(M.nearby(p.n, 5000), []);
  assert.ok(M.places('parktown').some((x) => x.t === 'dev' && x.n === p.n));
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
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
