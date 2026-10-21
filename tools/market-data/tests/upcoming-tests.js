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
  U.items.forEach((i) => { assert.ok(i.id && i.name && /^(launch|gls|project)$/.test(i.kind) && i.stage, i.id); assert.ok(!ids.has(i.id) && !names.has(i.name.toLowerCase()), 'repeat ' + i.id); ids.add(i.id); names.add(i.name.toLowerCase()); });
});
t('a placed item has a numeric position inside Singapore, with the source of that position stated', () => {
  U.items.filter((i) => i.lat != null).forEach((i) => { assert.ok(typeof i.lat === 'number' && typeof i.lon === 'number', i.id); assert.ok(i.lat > 1.15 && i.lat < 1.48 && i.lon > 103.6 && i.lon < 104.1, i.id + ' outside Singapore'); assert.ok(i.posSrc, i.id + ' has no position source'); });
});
t('an item with no verified position (none today) carries no coordinates at all and says why', () => {
  const un = U.items.filter((i) => i.lat == null);
  un.forEach((i) => { assert.ok(i.lon == null && i.posNote, i.id); assert.ok(!('lat' in i && i.lat !== undefined && i.lat !== null)); });
});
t('the named cases are present: Thomson Reserve, One Chuan Grove (name flagged as reported), Chencharu Close and Hougang Central (HDB sites on verified parcels), The Serra Residences', () => {
  assert.ok(by('thomson-reserve').lat != null && by('thomson-reserve').kind === 'launch');
  const o = by('one-chuan-grove'); assert.ok(o.lat != null && o.kind === 'gls' && o.nameStatus === 'reported');
  const h = by('hougang-central'); assert.ok(h && h.lat != null && h.agency === 'HDB' && /Master Plan 2025/.test(h.posSrc), 'Hougang Central is placed on its verified parcel');
  const c = by('chencharu-close'); assert.ok(c && c.kind === 'gls' && c.agency === 'HDB' && /Master Plan 2025/.test(c.posSrc) && c.aliases.includes('Chencharu Central'), 'Chencharu Close');
  assert.ok(Math.abs(c.lat - 1.41613) < 0.002 && Math.abs(c.lon - 103.82884) < 0.002, 'Chencharu Close is in Yishun, by Khatib');
  const s = by('the-serra-residences'); assert.ok(s && s.kind === 'launch' && s.stage === 'launched' && s.lat != null && s.aliases.includes('Serra Residences'));
  assert.ok(!s.ms && !s.rs, 'Serra needs no Ken microsite or Research page to be a complete entry'); assert.ok(s.facts.some((f) => f[0] === 'Developer'));
});
t('a project is one entry with stable ids: no name or alias is carried by two entries', () => {
  const seen = {}; U.items.forEach((i) => [i.name].concat(i.aliases || []).forEach((n) => { const k = n.toLowerCase().replace(/[^a-z0-9]/g, ''); assert.ok(!seen[k] || seen[k] === i.id, n + ' is on ' + seen[k] + ' and ' + i.id); seen[k] = i.id; }));
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
t('an automatic site is either unnamed (and says it is a GLS site) or a named project OneMap lists under construction inside it', () => {
  U.items.filter((i) => /^gls-\d{6}-/.test(i.id)).forEach((i) => { if (i.unnamed) { assert.strictEqual(i.kind, 'gls'); assert.ok(/GLS site/.test(i.name), i.name); } else { assert.strictEqual(i.kind, 'project'); assert.ok((i.aliases || []).some((a) => /GLS site$/.test(a)), i.id + ' keeps the site name as an alias'); } });
});
t('HDB agency is only ever HDB; every other site is URA\'s', () => { U.items.forEach((i) => assert.ok(!i.agency || i.agency === 'HDB', i.id)); });
t('every development with URA sales that URA gives no position has one from OneMap (two by a hand-made link that cites its source)', () => {
  const none = places.rows.filter((r) => r[2] == null).map((r) => r[0]); assert.deepStrictEqual(none, [], 'every development with sales has a position');
  const L = J('tools/market-data/sources/position-links.json').links; Object.keys(L).forEach((k) => { assert.ok(L[k].source && /^https:/.test(L[k].source.url) && L[k].why && L[k].postals.length, k); });
  const r = places.rows.find((x) => x[0] === 'the-reserve-residences'); assert.ok(r[2] > 1.335 && r[2] < 1.345 && r[3] > 103.772 && r[3] < 103.782, 'Jalan Anak Bukit');
});

console.log('Builder');
const BP = require('../build-positions.js'), FN = require('../fetch-onemap-names.js');
t('build-positions: a development is placed at the middle of OneMap records of the same name, in its own district', () => {
  const places = { rows: [['a', 'Alpha Heights', null, null, '10'], ['b', 'Beta', null, null, '10'], ['c', 'Gamma', null, null, '10'], ['d', 'Delta', 1.3, 103.8, '10']] };
  const uc = { rows: [{ b: 'ALPHA HEIGHTS (U/C)', p: '259000', la: 1.3, lo: 103.8 }, { b: 'ALPHA HEIGHTS (U/C)', p: '259001', la: 1.302, lo: 103.802 }, { b: 'BETA (U/C)', p: '520000', la: 1.35, lo: 103.9 }] };
  const names = { rows: { c: { rows: [{ b: 'GAMMA', p: '259100', la: 1.31, lo: 103.81 }, { b: 'GAMMA', p: '259101', la: 1.311, lo: 103.811 }] } } };
  const r = BP.apply(places, uc, names); assert.deepStrictEqual(r.placed.map((x) => x[0]), ['a', 'c']); assert.ok(Math.abs(places.rows[0][2] - 1.301) < 1e-4);
  assert.strictEqual(places.rows[1][2], null, 'Beta: OneMap says a different district, so it is not used'); assert.ok(r.skipped.some((x) => /Beta/.test(x)));
});
t('build-positions: records more than 600 m apart may be two places, so none is used', () => {
  const places = { rows: [['a', 'Alpha', null, null, '10']] }; const names = { rows: { a: { rows: [{ b: 'ALPHA', p: '259000', la: 1.30, lo: 103.80 }, { b: 'ALPHA', p: '259001', la: 1.32, lo: 103.80 }] } } };
  const r = BP.apply(places, { rows: [] }, names); assert.strictEqual(r.placed.length, 0); assert.strictEqual(places.rows[0][2], null); assert.ok(r.skipped.length === 1);
});
t('fetch-onemap-names: only records with the same name AND the same road count', () => {
  const rec = (b, r) => ({ BUILDING: b, ROAD_NAME: r, BLK_NO: '1', POSTAL: '123456', LATITUDE: '1.3', LONGITUDE: '103.8' });
  const k = FN.keep('Thomson Plaza', 'MARIGOLD DRIVE', [rec('THOMSON PLAZA', 'MARIGOLD DRIVE'), rec('THOMSON PLAZA', 'UPPER THOMSON ROAD'), rec('THOMSON PLAZA TOWER', 'MARIGOLD DRIVE'), rec('The Thomson Plaza', 'Marigold Drive')]);
  assert.strictEqual(k.length, 1, JSON.stringify(k)); assert.deepStrictEqual(FN.keep('Duet @ Emily', 'MOUNT EMILY ROAD', [rec('DUET @ EMILY', 'MOUNT EMILY ROAD')]).length, 1);
});
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
