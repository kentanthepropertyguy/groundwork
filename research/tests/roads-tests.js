// Roads in search: one road list (the street positions behind the nearby landed sales) used by the shared search, Research, Browse and the Map.
// Run from the site folder:  node research/tests/roads-tests.js
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert');
const root = path.resolve(__dirname, '..', '..'), L = path.join(root, 'data/value/landed/'), rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const GWN = require(path.join(root, 'assets/js/gw-nav.js')), K = require(path.join(root, 'assets/js/kpt-map-core.js'));
const G = rd(L + 'geo.json'), MO = rd(L + 'geo-more.json'), I = rd(L + 'index.json'), ev = rd(path.join(root, 'data/map/ev.json'));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').slice(0, 3).join('\n       ')); } };
const list = GWN.roadList(G, MO), keys = (a) => a.map((r) => GWN.roadKey(r));

console.log('The road list and its matching (shared search, Research, Browse)');
t('every street URA records landed sales on is in the list (but the 3 OneMap could not place), plus the streets without a sale', () => {
  const have = new Set(list.map((r) => r.n)); const missing = I.streets.filter((s) => !have.has(GWN.norm(s[0]).replace(/\s+/g, ' ')));
  assert.ok(missing.length <= G.unplaced + 3, 'missing ' + missing.length); assert.ok(list.length > 3000);
});
t('Springwood Crescent is found by full name, short form and with a house number, and is in Queenstown', () => {
  ['Springwood Crescent', 'springwood cres', '12 Springwood Crescent', 'SPRINGWOOD CRESCENT'].forEach((q) => assert.deepStrictEqual(keys(GWN.matchRoads(list, q, 3)), ['Springwood Crescent (Queenstown)'], q));
});
t('part of a name lists the matching roads, whole-name matches first, roads with landed sales before roads without', () => {
  assert.strictEqual(GWN.matchRoads(list, 'springwood', 6).length, 5); assert.ok(keys(GWN.matchRoads(list, 'springwood', 6)).every((k) => /^Springwood /.test(k)));
  const kings = GWN.matchRoads(list, 'kings', 4); assert.ok(kings[0].landed && /King/.test(kings[0].title));
});
t('abbreviations and a leading Saint: "rd", "st anne"', () => { assert.ok(keys(GWN.matchRoads(list, 'alnwick rd', 3)).includes('Alnwick Road (Serangoon)')); assert.ok(GWN.matchRoads(list, 'st anne', 3).some((r) => /Anne/.test(r.title))); });
t('nothing matches by accident: generic words alone, house numbers, two letters, nonsense', () => {
  ['road', 'street', 'jalan', 'the', '12', 'sp', '', 'zzzzqq', 'bukit', 'north'].forEach((q) => assert.deepStrictEqual(GWN.matchRoads(list, q, 3), [], q));
});
t('a development name is not turned into a road', () => { assert.deepStrictEqual(GWN.matchRoads(list, 'jadescape', 3), []); });
t('titles are tidy ("King\'s Road", "St. Anne\'s Wood") and every road has a position inside Singapore', () => {
  assert.ok(list.some((r) => r.title === "King's Road") && list.some((r) => r.title === "St. Anne's Wood"));
  list.forEach((r) => { assert.ok(r.lat > 1.15 && r.lat < 1.50 && r.lon > 103.60 && r.lon < 104.10, r.title); });
});
t('a road leads to the landed answer and to the Map by a name chosen from the list, never typed text', () => {
  const r = GWN.matchRoads(list, 'springwood crescent', 1)[0];
  assert.strictEqual(GWN.roadLandedHref('../', r), '../journey/worth/#landed:Springwood%20Crescent');
  assert.strictEqual(GWN.roadMapHref('../', r), '../research/map/#pl=road%3ASpringwood%20Crescent%20(Queenstown)');
});

console.log('The Map');
const places = rd(path.join(root, 'data/map/places.json')), amen = rd(path.join(root, 'data/map/amen.json'));
const S = { band: null, radius: 2000 }, M = K.create(places, JSON.parse(JSON.stringify(amen)), S); M.setEvidence(ev); M.setRoads(G, MO);
t('the Map search offers roads after neighbourhoods, stations, developments and schools, and says Road', () => {
  const p = M.places('springwood crescent'); assert.deepStrictEqual(p.map((x) => [x.t, x.n]), [['road', 'Springwood Crescent (Queenstown)']]); assert.strictEqual(p[0].label, 'Springwood Crescent'); assert.strictEqual(p[0].sub, 'Road · Queenstown');
  assert.ok(M.places('queenstown')[0].t === 'area'); assert.ok(M.places('bartley').some((x) => x.t === 'dev'));
});
t('before the road files load the search simply has no roads; generic words never list roads', () => {
  const M0 = K.create(places, JSON.parse(JSON.stringify(amen)), S); assert.strictEqual(M0.places('springwood crescent').length, 0); assert.strictEqual(M0.hasRoads(), false);
  assert.ok(!M.places('road').some((x) => x.t === 'road')); assert.ok(!M.places('jalan').some((x) => x.t === 'road'));
});
t('a road place: its own position, developments by distance (never a price for the road), approximate, no sale', () => {
  const d = M.placeData({ t: 'road', n: 'Springwood Crescent (Queenstown)' });
  assert.ok(d && d.t === 'road' && d.title === 'Springwood Crescent' && d.meta === 'Road · Queenstown'); assert.ok(Math.abs(d.lat - 1.2784) < 1e-3 && Math.abs(d.lon - 103.7912) < 1e-3);
  assert.ok(d.list.length > 0 && d.list.every((x, i, a) => i === 0 || a[i - 1].d <= x.d)); assert.ok(!/price|sold/i.test(JSON.stringify({ title: d.title, meta: d.meta, s: d.s })));
});
t('every road in the list opens its own place by the address the links use, and a street with sales also by district', () => {
  list.forEach((r) => { const d = M.placeData({ t: 'road', n: GWN.roadKey(r) }); assert.ok(d && d.title === r.title, r.title); });
  const a = M.placeData({ t: 'road', n: 'Alnwick Road (D28)' }); assert.ok(a && a.title === 'Alnwick Road'); assert.strictEqual(M.placeData({ t: 'road', n: 'Alnwick Road' }).title, 'Alnwick Road');
  assert.strictEqual(M.placeData({ t: 'road', n: 'No Such Road (Queenstown)' }), null);
});
t('the Map and the shared search agree on every road: same name, area and position', () => {
  const a = list.map((r) => GWN.roadKey(r) + '|' + r.lat + '|' + r.lon).sort(), b = list.map((r) => { const d = M.placeData({ t: 'road', n: GWN.roadKey(r) }); return d.road.key + '|' + d.lat + '|' + d.lon; }).sort();
  assert.deepStrictEqual(a, b);
});

console.log('Page wiring');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex').slice(0, 10);
const walk = (d, o = []) => { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { if (e.name === 'node_modules' || e.name === '.git') return; const p = path.join(d, e.name); e.isDirectory() ? walk(p, o) : /\.html$/.test(e.name) && o.push(p); }); return o; };
t('every page that loads the shared search script points at its current version (so the road search reaches every visitor)', () => {
  const cur = sha('assets/js/gw-nav.js'); let n = 0;
  walk(root).forEach((f) => { const m = /gw-nav\.js\?v=([0-9a-f]+)/.exec(fs.readFileSync(f, 'utf8')); if (m) { n++; assert.strictEqual(m[1], cur, path.relative(root, f)); } });
  assert.ok(n >= 20, 'pages ' + n);
});
t('the Browse address redirects into Research, and the Map scripts carry new versions', () => {
  assert.ok(/research\/#\/browse/.test(fs.readFileSync(path.join(root, 'projects/index.html'), 'utf8')));
  const m = fs.readFileSync(path.join(root, 'research/map/index.html'), 'utf8'); ['core', 'view', 'app'].forEach((x) => assert.ok(new RegExp('kpt-map-' + x + '\\.js\\?v=2026-10-\\d+\\.\\d+').test(m), x));
});
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
