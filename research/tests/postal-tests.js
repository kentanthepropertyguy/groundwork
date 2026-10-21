// node research/tests/postal-tests.js
// The shared postal-code module (assets/js/gw-postal.js), used by the Map, What Can My Budget Buy? and Property values & market prices.
// Uses real OneMap answers saved in fixtures/onemap-postal.json: these tests never call OneMap.
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../..'), J = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const GP = require('../../assets/js/gw-postal.js'), fix = require('./fixtures/onemap-postal.json').answers;
let pass = 0, fail = 0; const q = []; const t = (n, f) => q.push([n, f]);
const stub = (log, mode) => (url) => {
  const m = /searchVal=(\d+)/.exec(url); log && log.push(url);
  if (mode === 'reject') return Promise.reject(new Error('offline'));
  if (mode === '500') return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
  if (mode === 'junk') return Promise.resolve({ ok: true, json: () => Promise.resolve({ nonsense: true }) });
  return Promise.resolve({ ok: true, json: () => Promise.resolve(fix[m[1]] || { found: 0, totalNumPages: 0, pageNum: 1, results: [] }) });
};
const reg = J('data/registry/index.json').rows, hdbIdx = J('data/value/hdb/index.json'), streets = J('data/value/hdb/streets.json');
const addr = (c, i = 0) => { const r = fix[c].results[i]; return { building: r.BUILDING === 'NIL' ? '' : r.BUILDING, road: r.ROAD_NAME, blk: r.BLK_NO === 'NIL' ? '' : r.BLK_NO }; };

t('a six-digit number is a postal code, with or without "Singapore"; anything else is not', () => {
  ['570155', ' 570155 ', 'Singapore 570155', 'singapore570155', 'S570155', 'S(570155)', 'S 570155'].forEach((x) => assert.strictEqual(GP.code(x), '570155', x));
  ['57015', '5701555', '57-0155', '570 155', 'abc', '', null, 'Jadescape 570155'].forEach((x) => assert.strictEqual(GP.code(x), null, String(x)));
});
t('postal sectors run 01 to 82', () => { ['010000', '570155', '820000'].forEach((c) => assert.ok(GP.valid(c), c)); ['000001', '830000', '999999'].forEach((c) => assert.ok(!GP.valid(c), c)); });
t('one set of messages for every page: loading, none, invalid, error', () => {
  assert.ok(/Looking up 570155/.test(GP.msg('loading', '570155'))); assert.ok(/No address found for postal code 123456/.test(GP.msg('none', '123456'))); assert.ok(/not a Singapore postal code/.test(GP.msg('invalid', '999999'))); assert.ok(/could not be looked up/.test(GP.msg('error', '570155')));
});
t('road names meet in the middle: OneMap spells them out, HDB abbreviates them', () => {
  const same = [['BISHAN STREET 13', 'BISHAN ST 13'], ['ANG MO KIO AVENUE 6', 'ANG MO KIO AVE 6'], ['COMMONWEALTH CRESCENT', "C'WEALTH CRES"], ["SAINT GEORGE'S ROAD", "ST. GEORGE'S RD"], ['LORONG 4 TOA PAYOH', 'LOR 4 TOA PAYOH'], ['BEDOK NORTH AVENUE 1', 'BEDOK NTH AVE 1'], ['BUKIT BATOK WEST AVENUE 2', 'BT BATOK WEST AVE 2']];
  same.forEach(([a, b]) => assert.strictEqual(GP.roadKey(a), GP.roadKey(b), a + ' / ' + b));
  assert.notStrictEqual(GP.roadKey('BISHAN STREET 13'), GP.roadKey('BISHAN STREET 12')); assert.notStrictEqual(GP.roadKey('SHUNFU ROAD'), GP.roadKey('SHUNFU DRIVE'));
});
t('development names meet in the middle: no "(U/C)", punctuation or leading "The"', () => {
  assert.strictEqual(GP.nameKey('THOMSON RESERVE (U/C)'), GP.nameKey('Thomson Reserve')); assert.strictEqual(GP.nameKey('THE CHUAN'), GP.nameKey('The Chuan')); assert.strictEqual(GP.nameKey("D'LEEDON"), GP.nameKey('d leedon')); assert.notStrictEqual(GP.nameKey('Thomson Three'), GP.nameKey('Thomson Grand'));
});
t('the HDB road index is complete and current: every road in every town file maps to its town', () => {
  let n = 0; hdbIdx.towns.forEach((tw) => { J('data/value/hdb/t/' + tw.id + '.json').streets.forEach((s) => { const towns = GP.hdbTowns({ road: s }, streets); assert.ok(towns.includes(tw.id), s + ' -> ' + tw.id); n++; }); });
  assert.ok(n > 500); assert.strictEqual(streets.sourceVersion, hdbIdx.sourceVersion, 'streets.json is built from the current HDB files: run tools/market-data/build-hdb-streets.js');
});
t('real HDB addresses resolve to their town through OneMap spelling', () => {
  assert.deepStrictEqual(GP.hdbTowns(addr('570155'), streets), ['bishan']); assert.deepStrictEqual(GP.hdbTowns(addr('400001'), streets), ['geylang']); assert.deepStrictEqual(GP.hdbTowns(addr('560123'), streets), ['ang-mo-kio']); assert.deepStrictEqual(GP.hdbTowns(addr('310080'), streets), ['toa-payoh']);
  assert.deepStrictEqual(GP.hdbTowns({ road: 'NOT A REAL ROAD' }, streets), []);
});
t('a block with a resale resolves to its own block in the town file', () => {
  const T = J('data/value/hdb/t/bishan.json'), a = addr('570155'), k = GP.roadKey(a.road), m = T.blocks.filter((x) => x[0] === a.blk && GP.roadKey(T.streets[x[1]]) === k);
  assert.strictEqual(m.length, 1); assert.strictEqual(T.streets[m[0][1]], 'BISHAN ST 13');
});
t('developments: exact name, EC, cluster housing, a launch under construction, and a near name only on the same road', () => {
  const id = (c) => { const m = GP.devMatch(addr(c), reg); return m.kind + ':' + m.list.map((r) => r[0]).join(','); };
  assert.strictEqual(id('575749'), 'exact:jadescape'); assert.strictEqual(id('579819'), 'exact:bishan-loft'); assert.strictEqual(id('359419'), 'exact:dunsfold-18'); assert.strictEqual(id('579600'), 'exact:thomson-reserve'); assert.strictEqual(id('649646'), 'exact:lucerne-grand');
  assert.strictEqual(id('459007'), 'near:united-mansion');
  const a = addr('459007'); a.road = 'SOME OTHER ROAD'; assert.strictEqual(GP.devMatch(a, reg).kind, 'none', 'a near name on another road is not a match');
});
t('an estate name, an HDB block or a bare road is not a development', () => { ['459919', '570101', '400001', '570155'].forEach((c) => assert.strictEqual(GP.devMatch(addr(c), reg).kind, 'none', c)); });
t('the same name on two roads is told apart by the road; with no road to go on, both are offered', () => {
  const rows = [['a-1', 'Sunrise Gardens', 'ALPHA ROAD', '10', 'OCR', 'Freehold', '', 'BASIC', null, 1, '', 0, [], null, 'condo'], ['a-2', 'SUNRISE GARDENS', 'BETA ROAD', '11', 'OCR', 'Freehold', '', 'BASIC', null, 1, '', 0, [], null, 'condo']];
  assert.deepStrictEqual(GP.devMatch({ building: 'SUNRISE GARDENS', road: 'BETA ROAD' }, rows).list.map((r) => r[0]), ['a-2']);
  assert.deepStrictEqual(GP.devMatch({ building: 'SUNRISE GARDENS', road: 'GAMMA ROAD' }, rows).list.map((r) => r[0]), ['a-1', 'a-2']);
});
t('a development register name can also be found by an alias', () => {
  const rows = [['x-1', 'Opera Estate Condo', 'ZED ROAD', '15', 'RCR', 'Freehold', '', 'BASIC', null, 1, '', 0, ['Rivelle'], null, 'condo']];
  assert.strictEqual(GP.devMatch({ building: 'RIVELLE', road: 'ZED ROAD' }, rows).list[0][0], 'x-1');
});
t('lookup: a valid code is sent to OneMap alone, and resolves to a titled address with a position', async () => {
  const log = [], r = await GP.lookup('570155', stub(log));
  assert.strictEqual(r.state, 'ok'); assert.strictEqual(r.list.length, 1); const a = r.list[0];
  assert.strictEqual(a.title, '155 Bishan Street 13'); assert.strictEqual(a.code, '570155'); assert.ok(a.lat > 1.3 && a.lat < 1.4 && a.lon > 103.8 && a.lon < 103.9); assert.strictEqual(a.blk, '155'); assert.strictEqual(a.road, 'BISHAN STREET 13');
  assert.strictEqual(log.length, 1); assert.ok(/searchVal=570155$/.test(log[0]) && log[0].startsWith('https://www.onemap.gov.sg/'), log[0]);
  assert.strictEqual(GP.state('570155'), 'ok'); assert.strictEqual(GP.PC['570155'], a);
});
t('lookup: a development gives its building and title; an address with several buildings gives each, with distinct keys', async () => {
  const j = await GP.lookup('575749', stub()); assert.strictEqual(j.list[0].building, 'JADESCAPE'); assert.strictEqual(j.list[0].title, '16 Shunfu Road'); assert.ok(/Jadescape/.test(j.list[0].sub));
  const u = await GP.lookup('459007', stub()); assert.ok(u.list.length >= 2 && u.list.length <= 3); assert.strictEqual(new Set(u.list.map((x) => x.n)).size, u.list.length); u.list.forEach((x) => assert.ok(GP.PC[x.n] === x));
});
t('lookup: an invalid sector makes no request; an unknown valid code is "none"', async () => {
  const log = []; const i = await GP.lookup('999999', stub(log)); assert.strictEqual(i.state, 'invalid'); assert.strictEqual(log.length, 0);
  const n = await GP.lookup('123456', stub(log)); assert.strictEqual(n.state, 'none'); assert.deepStrictEqual(n.list, []); assert.strictEqual(GP.state('123456'), 'none');
});
t('lookup: a failure (offline, HTTP error, junk) is "error", is not remembered, and a later try can succeed', async () => {
  for (const mode of ['reject', '500', 'junk']) { const r = await GP.lookup('560123', stub(null, mode)); assert.strictEqual(r.state, 'error', mode); assert.strictEqual(GP.state('560123'), 'error'); }
  const ok = await GP.lookup('560123', stub()); assert.strictEqual(ok.state, 'ok'); assert.strictEqual(ok.list[0].road, 'ANG MO KIO AVENUE 6');
});
t('lookup: a code that resolved is answered from memory (one request per code)', async () => {
  const log = []; await GP.lookup('310080', stub(log)); await GP.lookup('310080', stub(log)); assert.strictEqual(log.length, 1);
});
t('lookup: only the six digits typed are sent, never anything else', async () => {
  const log = []; await GP.lookup(GP.code('Singapore 570101'), stub(log)); assert.ok(log.every((u) => /searchVal=570101$/.test(u)));
});
t('368060 (a condo) and 545688 (an EC) resolve to their developments; the site search sends them to Research', async () => {
  const GP2 = require('../../assets/js/gw-postal.js'); const a = (await GP2.lookup('368060', stub())).list[0], b = (await GP2.lookup('545688', stub())).list[0];
  assert.strictEqual(GP2.devMatch(a, reg, []).list[0][0], 'bartley-ridge'); assert.strictEqual(GP2.devMatch(b, reg, []).list[0][0], 'hundred-palms-residences');
  const row = reg.find((r) => r[0] === 'hundred-palms-residences'); assert.strictEqual(row[14], 'ec');
});
t('the site search (gw-nav.js) reads a postal code exactly as the shared module does, and loads the module version that is on disk', () => {
  const nav = fs.readFileSync(path.join(root, 'assets/js/gw-nav.js'), 'utf8'), m = /const PC_RE = (\/.*\/i);/.exec(nav); assert.ok(m, 'PC_RE');
  const re = eval(m[1]); ['570155', ' 570155 ', 'Singapore 570155', 'S570155', 'S(570155)', 'S 570155', '57015', '5701555', '570 155', 'Jadescape 570155', 'stamp duty'].forEach((x) => assert.strictEqual(re.exec(x) ? re.exec(x)[1] : null, GP.code(x), x));
  const v = /gw-postal\.js\?v=([0-9a-f]{10})'/.exec(nav); assert.ok(v, 'the nav names the postal module with a version');
  assert.strictEqual(v[1], require('crypto').createHash('sha256').update(fs.readFileSync(path.join(root, 'assets/js/gw-postal.js'))).digest('hex').slice(0, 10), 'gw-nav.js carries an old gw-postal.js version: set it to the first 10 characters of the file\'s sha256, then re-hash gw-nav.js');
});
(async () => {
  for (const [n, f] of q) { try { await f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + String(e.message || e).split('\n').slice(0, 4).join('\n       ')); } }
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
