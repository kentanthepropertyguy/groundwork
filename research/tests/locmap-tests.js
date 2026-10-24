// "Location & amenities" inside a Research report (assets/js/gw-locmap.js): the Map's own basemap, data and helpers.
// Run: node research/tests/locmap-tests.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const R = (p) => path.join(__dirname, '../..', p);
const L = require(R('assets/js/gw-locmap.js')), K = require(R('assets/js/kpt-map-core.js'));
const places = JSON.parse(fs.readFileSync(R('data/map/places.json'), 'utf8'));
const amen = JSON.parse(fs.readFileSync(R('data/map/amen.json'), 'utf8')), extra = JSON.parse(fs.readFileSync(R('data/map/amen-extra.json'), 'utf8'));
let pass = 0; const t = (name, fn) => { fn(); pass++; console.log('  ok  ' + name); };

t('the same basemap and attribution as the standalone Map (no second provider)', () => {
  const v = fs.readFileSync(R('assets/js/kpt-map-view.js'), 'utf8');
  const tiles = v.match(/const TILES = '([^']+)'/)[1], attr = v.match(/const ATTR = '((?:[^'\\]|\\.)*)'/)[1].replace(/\\'/g, "'");
  assert.strictEqual(L.TILES, tiles); assert.strictEqual(L.ATTR, attr);
  const src = fs.readFileSync(R('assets/js/gw-locmap.js'), 'utf8');
  assert.ok(!/googleapis|mapbox|maptiler|here\.com|api_key|apikey|token=/i.test(src), 'no other map provider or key');
});
t('a development\'s position comes from places.json', () => {
  const p = L.position(places, 'jadescape'); assert.ok(p && p.lat > 1.2 && p.lat < 1.5 && p.lon > 103.6 && p.lon < 104.1);
  assert.strictEqual(L.position(places, 'no-such-development'), null);
});
t('what is nearby: each kind sorted nearest first and inside 1.5 km', () => {
  const N = L.near(K, L.position(places, 'jadescape'), amen, extra);
  ['mrt', 'school', 'food', 'park'].forEach((k) => { N[k].forEach((x, i) => { assert.ok(x.d <= L.RADIUS); if (i) assert.ok(x.d >= N[k][i - 1].d); }); });
  assert.ok(N.mrt.length && /Marymount/.test(N.mrt[0].name), N.mrt[0] && N.mrt[0].name);
});
t('a station is as near as its nearest exit', () => {
  const s = { lat: 1.30, lon: 103.80, ex: [[1.3001, 103.8001], [1.31, 103.81]] }, here = { lat: 1.3001, lon: 103.8001 };
  assert.ok(L.distTo(K, here, s) < 1);
});
t('the summary says nearest and counts, with straight-line distances only', () => {
  const N = L.near(K, L.position(places, 'jadescape'), amen, extra), S = L.summary(K, N);
  assert.ok(S.length >= 2 && S[0].t === 'Nearest station');
  S.forEach((l) => assert.ok(!/walk|minute|min\b/i.test(l.t + l.v), l.v));
  const src = fs.readFileSync(R('assets/js/gw-locmap.js'), 'utf8');
  assert.ok(src.includes('Straight-line distances from the development’s position on the map, not walking routes.'));
});
t('the report has the section, the shortcut and the full-Map link; the map loads only when needed', () => {
  const lg = fs.readFileSync(R('assets/js/kpt-lg.js'), 'utf8'), page = fs.readFileSync(R('research/index.html'), 'utf8');
  assert.ok(lg.includes('id="lgLoc"') && lg.includes('Location &amp; amenities') && lg.includes('data-gwl-full>Explore the full Map ›'));
  assert.ok(page.includes('data-lg-loc-go') && page.includes('GW_LOC.mount('));
  assert.ok(!/<script[^>]+leaflet\.js/.test(page) && !/<link[^>]+leaflet\.css/.test(page), 'Leaflet is not loaded up front');
  const src = fs.readFileSync(R('assets/js/gw-locmap.js'), 'utf8');
  assert.ok(src.includes('IntersectionObserver') && src.includes('scrollWheelZoom: false'));
});
console.log('locmap-tests: ' + pass + ' passed');
