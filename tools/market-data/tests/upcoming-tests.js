// node tools/market-data/tests/upcoming-tests.js — the new-launch and GLS-site register (data/map/upcoming.json) and the builder behind it.
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../..'), B = require('../build-upcoming.js');
let pass = 0, fail = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + String(e.message || e).split('\n').slice(0, 4).join('\n       ')); } };
const J = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const U = J('data/map/upcoming.json'), places = J('data/map/places.json'), reg = J('data/registry/index.json'), regRows = reg.rows || reg;
const by = (id) => U.items.find((i) => i.id === id);

console.log('Register data');
t('every item has a unique id and name, a kind and a stage', () => {
  const ids = new Set(), names = new Set();
  U.items.forEach((i) => { assert.ok(i.id && i.name && /^(launch|gls)$/.test(i.kind) && i.stage, i.id); assert.ok(!ids.has(i.id) && !names.has(i.name.toLowerCase()), 'repeat ' + i.id); ids.add(i.id); names.add(i.name.toLowerCase()); });
});
t('a placed item has a numeric position inside Singapore, with the source of that position stated', () => {
  U.items.filter((i) => i.lat != null).forEach((i) => { assert.ok(typeof i.lat === 'number' && typeof i.lon === 'number', i.id); assert.ok(i.lat > 1.15 && i.lat < 1.48 && i.lon > 103.6 && i.lon < 104.1, i.id + ' outside Singapore'); assert.ok(i.posSrc, i.id + ' has no position source'); });
});
t('an item with no verified position carries no coordinates at all and says why', () => {
  const un = U.items.filter((i) => i.lat == null); assert.ok(un.length >= 1);
  un.forEach((i) => { assert.ok(i.lon == null && i.posNote, i.id); assert.ok(!('lat' in i && i.lat !== undefined && i.lat !== null)); });
});
t('the named cases are present: Thomson Reserve (placed), One Chuan Grove (placed, name flagged as reported), Hougang Central (not placed)', () => {
  assert.ok(by('thomson-reserve').lat != null && by('thomson-reserve').kind === 'launch');
  const o = by('one-chuan-grove'); assert.ok(o.lat != null && o.kind === 'gls' && o.nameStatus === 'reported');
  const h = by('hougang-central'); assert.ok(h && h.lat == null && h.posNote);
});
t('no price, transaction, sales or availability field anywhere in the register', () => {
  assert.ok(JSON.stringify(U).search(/"(price|psf|p12|s12|t12|sales|units|available|asking|launchPrice|transactions)"/i) < 0);
});
t('a launch or site never repeats a development with URA sales (by id or by name)', () => {
  const ids = new Set(places.rows.map((r) => r[0])), nm = new Set(places.rows.map((r) => r[1].toLowerCase()));
  U.items.forEach((i) => { assert.ok(!ids.has(i.id) && !nm.has(i.name.toLowerCase()), i.id); });
});
t('a Research link points at a real register entry; a microsite link is an https address', () => {
  const regIds = new Set(regRows.map((r) => r[0]));
  U.items.forEach((i) => { if (i.rs) assert.ok(regIds.has(i.rs), i.id + ' → ' + i.rs); if (i.ms) assert.ok(/^https:\/\//.test(i.ms), i.id); });
  assert.ok(by('thomson-reserve').rs && by('thomson-reserve').ms && by('hougang-central').rs);
});
t('every item lists at least one source with a label and an https address', () => {
  U.items.forEach((i) => { const s = i.src || []; assert.ok(s.length >= 1, i.id + ' has no source'); s.forEach((x) => { assert.ok(x.label && /^https:\/\//.test(x.url), i.id); }); });
});
t('an automatic GLS site carries no marketing name and says it is a GLS site', () => {
  U.items.filter((i) => /^gls-\d{6}-/.test(i.id)).forEach((i) => { assert.strictEqual(i.kind, 'gls'); assert.ok(/GLS site$/.test(i.name), i.name); });
});

console.log('Builder');
t('inside() and interior(): a point in a hole is outside; the interior point of a polygon is inside it', () => {
  const g = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
  assert.ok(B.inside(2, 2, g) && !B.inside(5, 5, g) && !B.inside(11, 5, g)); const p = B.interior(g); assert.ok(B.inside(p.lon, p.lat, g), JSON.stringify(p));
  const L = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 2], [2, 2], [2, 10], [0, 10], [0, 0]]] }; const q = B.interior(L); assert.ok(B.inside(q.lon, q.lat, L), 'a concave site still gets a point inside it');
});
t('joinCo / cleanCo: company names are tidied for reading', () => {
  assert.strictEqual(B.joinCo('Alpha Land Pte. Ltd., Beta Holdings Pte Ltd and Gamma (Singapore) Pte Ltd'), 'Alpha Land, Beta Holdings and Gamma');
  assert.strictEqual(B.cleanCo('Sing Holdings Limited'), 'Sing Holdings');
});
t('siteKey identifies a URA record by award date and location', () => {
  assert.strictEqual(B.siteKey({ properties: { DATE_AWARD: '20250717', LOCATION: 'Chuan Grove' } }), '20250717|Chuan Grove');
});
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
