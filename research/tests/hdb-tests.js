// node research/tests/hdb-tests.js
// HDB resale research and the Map's HDB layer: the data (block positions), the shared search that sends a postal code to the right place,
// the research address, and the evidence. Nothing here is a second valuation: the evidence is compared with Property values' own functions (gw-value.js).
// Uses real OneMap answers saved in fixtures/onemap-postal.json: these tests never call OneMap.
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../..'), J = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const GP = require('../../assets/js/gw-postal.js'), GV = require('../../assets/js/gw-value.js'), GH = require('../../assets/js/gw-hdb.js'), R = require('../../assets/js/kpt-research.js');
const K = require('../../assets/js/kpt-map-core.js'), N = require('../../assets/js/gw-nav.js'), F = require('../../tools/market-data/fetch-onemap-hdb.js'), fix = require('./fixtures/onemap-postal.json').answers;
let pass = 0, fail = 0; const q = []; const t = (n, f) => q.push([n, f]);

const I = J('data/value/hdb/index.json'), HM = J('data/map/hdb.json'), src = J('tools/market-data/sources/onemap-hdb.json');
const town = {}; I.towns.forEach((x) => { const T = J('data/value/hdb/t/' + x.id + '.json'); T.id = x.id; town[x.id] = T; });
const files = (u) => { const m = /data\/(.+?)(\?|$)/.exec(u); const f = path.join(root, 'data', m[1]); return fs.existsSync(f) ? Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(f, 'utf8'))) }) : Promise.resolve({ ok: false, status: 404 }); };
const D = { reg: J('data/registry/index.json').rows, up: J('data/map/upcoming.json').items, hdb: J('data/value/hdb/streets.json'), landed: J('data/value/landed/index.json') };
const addr = (c, i = 0) => { const r = fix[c].results[i]; return { building: r.BUILDING === 'NIL' ? '' : r.BUILDING, road: r.ROAD_NAME, blk: r.BLK_NO === 'NIL' ? '' : r.BLK_NO }; };
const blocks = []; I.towns.forEach((x) => { const T = town[x.id], seen = new Set(); T.rows.forEach((r) => { const k = r[1] + '|' + r[2]; if (!seen.has(k)) { seen.add(k); blocks.push({ town: x.id, T, block: r[1], s: r[2], street: T.streets[r[2]] }); } }); });
const total = (T, block, s) => T.rows.filter((r) => r[1] === block && r[2] === s).length;

console.log('data: block positions for the Map layer');
t('every HDB block in the resale files is accounted for: located, or listed as not located', () => {
  assert.strictEqual(HM.coverage.blocks, blocks.length); assert.strictEqual(HM.rows.length, HM.coverage.located); assert.strictEqual(HM.coverage.located + HM.coverage.unresolved, HM.coverage.blocks);
  assert.strictEqual(src.coverage.blocks, blocks.length); assert.strictEqual(src.unresolved.length, src.coverage.unresolved); assert.strictEqual(src.coverage.located, HM.coverage.located);
  assert.ok(HM.coverage.located / HM.coverage.blocks > 0.99, 'coverage ' + HM.coverage.located + '/' + HM.coverage.blocks);
});
t('a position is only OneMap’s own for that block: same block number, same road, a six-digit postal code, inside Singapore', () => {
  const ok = { BLK_NO: '155', ROAD_NAME: 'BISHAN STREET 13', POSTAL: '570155', LATITUDE: '1.346', LONGITUDE: '103.855' };
  assert.deepStrictEqual(F.keep('155', 'BISHAN ST 13', [ok]), [1.346, 103.855, '570155']);
  assert.strictEqual(F.keep('156', 'BISHAN ST 13', [ok]), null, 'another block is never used');
  assert.strictEqual(F.keep('155', 'BISHAN ST 12', [ok]), null, 'another road is never used');
  assert.strictEqual(F.keep('155', 'BISHAN ST 13', [Object.assign({}, ok, { POSTAL: 'NIL' })]), null);
  assert.strictEqual(F.keep('155', 'BISHAN ST 13', [Object.assign({}, ok, { LATITUDE: '0', LONGITUDE: '0' })]), null);
  assert.strictEqual(F.keep('155', 'BISHAN ST 13', []), null); assert.strictEqual(F.keep('155', 'BISHAN ST 13', undefined), null);
  assert.deepStrictEqual(F.keep('155', "BISHAN ST 13", [Object.assign({}, ok, { BLK_NO: '155' })]).length, 3);
});
t('the published positions match the saved OneMap records, sit in Singapore, and each belongs to a real block with the right count', () => {
  const seen = new Set();
  HM.rows.forEach((r) => {
    const tn = HM.towns[r[2]], st = HM.streets[r[1]], key = tn + '|' + st + '|' + r[0]; assert.ok(!seen.has(key), 'duplicate ' + key); seen.add(key);
    const T = town[tn]; assert.ok(T, tn); const s = T.streets.indexOf(st); assert.ok(s >= 0, st);
    assert.ok(r[3] > 1.15 && r[3] < 1.48 && r[4] > 103.6 && r[4] < 104.1, key);
    assert.strictEqual(r[5], total(T, r[0], s), 'resale count of ' + key);
    const o = src.rows[tn][st][r[0]]; assert.ok(o && /^\d{6}$/.test(o[2]), key); assert.ok(Math.abs(o[0] - r[3]) < 1e-5 && Math.abs(o[1] - r[4]) < 1e-5, key);
  });
});
t('a block that could not be placed is left out, never guessed: it has no row, and the research still works for it', () => {
  src.unresolved.forEach(([tn, st, b]) => { assert.ok(!HM.rows.some((r) => HM.towns[r[2]] === tn && HM.streets[r[1]] === st && r[0] === b), tn + st + b); assert.ok(blocks.some((x) => x.town === tn && x.street === st && x.block === b), 'it is a real block'); });
  const un = src.unresolved[0]; if (un) { const T = town[un[0]], s = T.streets.indexOf(un[1]); const d = GV.hdbComps(T, un[2], s, T.rows.find((r) => r[1] === un[2] && r[2] === s)[3]); assert.ok(d.n > 0); assert.strictEqual(GH.locate(HM, un[0], un[1], un[2]), null); }
});

console.log('shared search: a postal code goes where it belongs');
const kind = (c) => GP.classify(addr(c), D);
t('HDB postal code -> its block (town, block and street as the resale records spell them)', () => {
  assert.strictEqual(kind('570155').k, 'hdb');
  return GP.hdbBlock(addr('570155'), kind('570155').towns, root + '/', files).then((h) => { assert.deepStrictEqual([h.town, h.block, h.street, h.found], ['bishan', '155', 'BISHAN ST 13', true]); assert.strictEqual(GP.hdbHash(h), '#/hdb/bishan/155/bishan-st-13'); });
});
t('an HDB address whose block has no resales on record is still found by its street, and says so', () => GP.hdbBlock({ blk: '999', road: 'BISHAN STREET 13' }, ['bishan'], root + '/', files).then((h) => { assert.deepStrictEqual([h.town, h.block, h.street, h.found], ['bishan', '999', 'BISHAN ST 13', false]); assert.strictEqual(GP.hdbHash(h), '#/hdb/bishan/999/bishan-st-13'); }));
t('condo, EC, cluster, landed, a new launch and a plain place each go to their own research', () => {
  assert.deepStrictEqual([kind('575749').k, kind('575749').name], ['dev', 'Jadescape']);
  assert.deepStrictEqual([kind('579819').k, kind('579819').cls], ['dev', 'ec']); assert.deepStrictEqual([kind('359419').k, kind('359419').cls], ['dev', 'cluster']);
  assert.strictEqual(kind('459919').k, 'landed'); assert.ok(['dev', 'up'].includes(kind('579600').k), 'a registered project, launched or not');
  const plain = Object.keys(fix).filter((c) => fix[c].results && fix[c].results[0] && !['dev', 'up', 'hdb', 'landed'].includes(kind(c).k)); plain.forEach((c) => assert.strictEqual(kind(c).k, 'place'));
});
t('every saved OneMap address is sorted into exactly one kind, and a development name beats an HDB road', () => {
  Object.keys(fix).forEach((c) => { const r = fix[c].results; if (!r || !r[0]) return; assert.ok(['dev', 'up', 'hdb', 'landed', 'place'].includes(kind(c).k), c); });
  assert.strictEqual(kind('570101').k, 'hdb', 'a building name on an HDB block (Bishan View) does not take it away from HDB'); assert.ok(addr('570101').building);
});
t('HDB roads read as a buyer writes them', () => {
  assert.strictEqual(GP.streetName('BISHAN ST 13'), 'Bishan Street 13'); assert.strictEqual(GP.streetName('ANG MO KIO AVE 6'), 'Ang Mo Kio Avenue 6'); assert.strictEqual(GP.streetName("C'WEALTH CRES"), "Commonwealth Crescent"); assert.strictEqual(GP.streetName('ST. GEORGE\'S LANE'), "St. George's Lane");
});
t('"The" is optional in names: the site search finds the same development with or without it', () => {
  const ix = J('data/projects/index.json'), a = N.matchDevs(ix, 'jadescape', 6), b = N.matchDevs(ix, 'the jadescape', 6); assert.ok(a.length && b.length && a[0].id === b[0].id);
});

console.log('the address of one block\'s research');
t('the address holds public facts only: town, block, street and flat type', () => {
  const h = GP.hdbHash({ town: 'bishan', block: '155', street: 'BISHAN ST 13', flatType: '5 ROOM' }); assert.strictEqual(h, '#/hdb/bishan/155/bishan-st-13/5-room'); assert.ok(!/\d{6}/.test(h) && !/postal|price|budget|\$/i.test(h));
  assert.deepStrictEqual(R.parseHash(h), { view: 'hdb', town: 'bishan', block: '155', street: 'bishan-st-13', type: '5-room' });
  assert.deepStrictEqual(R.parseHash('#/hdb/bishan/155/bishan-st-13'), { view: 'hdb', town: 'bishan', block: '155', street: 'bishan-st-13', type: null });
  assert.strictEqual(R.buildHash(R.parseHash(h)), h);
});
t('a bad or hand-edited address falls back to the Research start, never to a broken page', () => {
  ['#/hdb', '#/hdb/bishan', '#/hdb/bishan/155', '#/hdb/<script>/155/x', '#/hdb/bishan/abc/bishan-st-13', '#/hdb/bishan/155/bishan st 13', '#/hdb/570155/155/x'].forEach((h) => assert.notStrictEqual(R.parseHash(h).view, 'hdb', h));
  assert.strictEqual(R.parseHash('#/hdb/bishan/155/bishan-st-13/' + 'x'.repeat(40)).type, null);
});
t('every block in the data has a valid address', () => { blocks.forEach((b) => { const p = R.parseHash(GP.hdbHash({ town: b.town, block: b.block, street: b.street })); assert.strictEqual(p.view, 'hdb', b.town + b.block + b.street); assert.strictEqual(p.block, b.block.toUpperCase()); assert.ok(GH.findStreet(b.T, p.street) >= 0, 'street found again: ' + b.street); }); });

console.log('evidence: the same numbers as Property values, with block evidence kept apart from street evidence');
const flat = (b, ty) => ({ town: b.T, block: b.block, s: b.s, ty, d: GV.hdbComps(b.T, b.block, b.s, ty) });
t('Blk 155 Bishan Street 13: block evidence for 5-room, street evidence (not the block) for 3-room', () => {
  const T = town.bishan, s = T.streets.indexOf('BISHAN ST 13'), ft = (x) => I.types.indexOf(x);
  const five = GV.hdbComps(T, '155', s, ft('5 ROOM')), three = GV.hdbComps(T, '155', s, ft('3 ROOM'));
  assert.strictEqual(five.level, 'block'); assert.ok(five.n >= 3); assert.notStrictEqual(three.level, 'block');
  const a = GH.evidenceHtml(five, { flatType: '5 ROOM', street: 'BISHAN ST 13', I }), b = GH.evidenceHtml(three, { flatType: '3 ROOM', street: 'BISHAN ST 13', I });
  assert.ok(a.includes('in this block') && a.includes(GV.money(five.lo)) && a.includes(GV.money(five.hi))); assert.ok(/None in this block|Only \d+ in this block/.test(b) && b.includes('Bishan Street 13'));
  [a, b].forEach((h) => assert.ok(h.includes('not current listings or an official HDB valuation')));
});
t('the figures on the Map and in Research are Property values\' own, for every block and flat type (all towns)', () => {
  let n = 0;
  blocks.forEach((b, i) => {
    if (i % 7) return; GV.hdbTypes(b.T, b.block, b.s).all.forEach((ty) => {
      const d = GV.hdbComps(b.T, b.block, b.s, ty), e = GH.evidence(d, I), h = GH.evidenceHtml(d, { flatType: I.types[ty], street: b.street, I });
      assert.strictEqual(e.level, d.level); assert.strictEqual(e.n, d.n); assert.strictEqual(e.lo, d.lo); assert.strictEqual(e.hi, d.hi);
      if (d.lo !== undefined) { assert.ok(h.includes(GV.money(d.lo)) && h.includes(GV.money(d.hi)), 'map evidence'); const full = GV.hdbResult(d, { town: b.town, block: b.block, street: b.street, flatType: I.types[ty] }, b.T, I, '../', { view: true }); assert.ok(full.includes(GV.money(d.lo)) && full.includes(GV.money(d.hi)), 'research'); }
      else { const shown = h.match(/\$\d[\d,]*\d/g) || [], recorded = new Set((d.rows || []).map((r) => GV.money(r[9]))); shown.forEach((m) => assert.ok(recorded.has(m), 'a price that is not a recorded sale: ' + m + ' in ' + b.street + ' ' + b.block)); }
      n++;
    });
  });
  assert.ok(n > 1000, n + ' cases');
});
t('sparse and no-sales cases are stated plainly: no range from too few sales, no invented price', () => {
  let thin = 0, none = 0, street = 0;
  blocks.forEach((b, i) => { if (i % 3) return; GV.hdbTypes(b.T, b.block, b.s).all.forEach((ty) => {
    const d = GV.hdbComps(b.T, b.block, b.s, ty), h = GH.evidenceHtml(d, { flatType: I.types[ty], street: b.street, I });
    if (d.level === 'thin') { thin++; assert.ok(/too few for a range/.test(h) && !/hev-m/.test(h)); }
    if (d.level === 'none') { none++; assert.ok(/No resales on/.test(h)); assert.ok(!/\$\d/.test(h)); }
    if (d.level === 'street') { street++; assert.ok(/so \d+ resales? on/.test(h)); }
  }); });
  assert.ok(thin && street, 'both situations exist in the data: thin ' + thin + ', street ' + street);
  const none0 = GV.hdbComps(town.bishan, '155', town.bishan.streets.indexOf('BISHAN ST 13'), I.types.indexOf('2 ROOM')); if (none0.level === 'none') assert.ok(/No resales on/.test(GH.evidenceHtml(none0, { flatType: '2 ROOM', street: 'BISHAN ST 13', I })));
});
t('nearby blocks: each row is that block\'s own resales, within the radius, nearest first, never the block itself', () => {
  const T = town.bishan, s = T.streets.indexOf('BISHAN ST 13'), me = GH.locate(HM, 'bishan', 'BISHAN ST 13', '155'), ty = I.types.indexOf('5 ROOM'); assert.ok(me);
  const cands = GH.candidates(HM, me, 2000, 'bishan|BISHAN ST 13|155'); assert.ok(cands.length > 20 && cands.every((c) => c.m <= 2000 && !(c.block === '155' && c.street === 'BISHAN ST 13')));
  const f = {}; GH.townsOf(cands).forEach((id) => { f[id] = town[id]; });
  const comps = GH.nearComps(cands, f, ty), pick = GH.pickRadius(comps, cands); assert.ok(pick.rows.length >= 4 && pick.rows.length <= 8, 'rows ' + pick.rows.length);
  pick.rows.forEach((r, i) => { assert.strictEqual(r.d.level, 'block'); assert.ok(r.d.n >= GV.HDB_MIN_BLOCK); const d2 = GV.hdbComps(f[r.town], r.block, f[r.town].streets.indexOf(r.street), ty); assert.strictEqual(r.d.lo, d2.lo); assert.strictEqual(r.d.hi, d2.hi); assert.ok(r.m <= pick.radius); if (i) assert.ok(r.m >= pick.rows[i - 1].m); });
  const h = GH.nearbyHtml({ kind: 'near', rows: pick.rows, radius: pick.radius, widened: pick.widened, skipped: pick.skipped }, { flatType: '5 ROOM', block: '155', street: 'BISHAN ST 13' });
  assert.ok(/own resales/.test(h) && /Distances are between block positions from OneMap/.test(h)); pick.rows.forEach((r) => assert.ok(h.includes('#/hdb/' + r.town + '/' + r.block.toLowerCase() + '/')));
});
t('a block with no verified position compares the other blocks on its street, and says so', () => {
  const un = src.unresolved[0]; if (!un) return;
  const T = town[un[0]], s = T.streets.indexOf(un[1]), ty = T.rows.find((r) => r[1] === un[2] && r[2] === s)[3], rows = GH.streetComps(T, s, ty, un[2]);
  rows.forEach((r) => { assert.strictEqual(r.street, un[1]); assert.notStrictEqual(r.block, un[2]); assert.strictEqual(r.d.level, 'block'); });
  const h = GH.nearbyHtml({ kind: 'street', rows }, { flatType: I.types[ty], block: un[2], street: un[1] }); assert.ok(rows.length ? /no verified position yet/.test(h) : /No nearby block has enough/.test(h), 'said plainly either way');
});

console.log('the Map model: HDB blocks are positions only');
const places = J('data/map/places.json'), amen = J('data/map/amen.json'), ev = J('data/map/ev.json');
const mk = () => { const S = { band: null, radius: 2000 }, M = K.create(places, JSON.parse(JSON.stringify(amen)), S); M.setEvidence(ev); M.setHdb(HM); return M; };
t('search by block and street finds the block; place data carries its own position, never a price', () => {
  const M = mk(), r = M.hdbSearch('155 bishan', 4); assert.ok(r.length && r[0].label === 'Blk 155 Bishan Street 13' && r[0].t === 'hdb');
  const d = M.placeData({ t: 'hdb', n: r[0].n }, 1000); assert.strictEqual(d.title, 'Blk 155 Bishan Street 13'); assert.ok(/^HDB flat/.test(d.meta)); assert.ok(d.lat > 1.3 && d.lat < 1.4);
  assert.ok(!/\$|price/i.test(JSON.stringify(Object.assign({}, d, { list: null, ups: null })).replace(/"lab":"[^"]*"/, '')), 'no price in the place data');
  assert.strictEqual(M.placeData({ t: 'hdb', n: 'bishan/999/nowhere' }, 1000), null, 'an unknown block is not drawn');
});
t('the developments around a block are the same ones the Map shows around any point', () => {
  const M = mk(), key = M.hdbSearch('155 bishan', 1)[0].n, d = M.placeData({ t: 'hdb', n: key }, 1000), h = M.HDBM.byKey[key];
  const hv = (a, b) => { const p = Math.PI / 180, dl = (b.lat - a.lat) * p, dn = (b.lon - a.lon) * p, x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dn / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(x)); };
  const want = M.PM.filter((p) => M.EV[p.n] && hv(h, p) <= 1000).map((p) => p.n).sort(); assert.deepStrictEqual(d.list.map((x) => x.p.n).sort(), want); assert.ok(d.list.length > 3);
  const m2 = K.create(places, JSON.parse(JSON.stringify(amen)), { band: null, radius: 2000 }); assert.strictEqual(m2.HDBM, null, 'without the HDB file the model is the one it was'); assert.deepStrictEqual(m2.hdbSearch('155 bishan', 4), []);
});

(async () => {
  for (const [n, f] of q) { try { await f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + (e.message || e).toString().split('\n').slice(0, 5).join('\n       ')); } }
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
