// node tools/market-data/tests/coverage-tests.js — the coverage metadata that must follow the register on every refresh.
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../../..'), C = require('../build-coverage.js'), RC = require('../build-registry-classes.js');
const cfg = require('../config.json'), pc = require('../project-config.json');
let pass = 0, fail = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + String(e.message).split('\n').slice(0, 3).join('\n       ')); } };
const J = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const tx = (project, o) => Object.assign({ project, propertyType: 'Executive Condominium', typeOfArea: 'Strata', noOfUnits: '1' }, o);

console.log('Not-covered names (synthetic)');
t('EC and cluster names with strata sales and no register row are listed; names in the register are not', () => {
  const r = C.notCovered([tx('IN REGISTER'), tx('GONE EC'), tx('GONE CLUSTER', { propertyType: 'Strata Terrace' }), tx('GONE EC')], cfg, pc, ['IN REGISTER']);
  assert.deepStrictEqual(r, { ec: ['GONE EC'], cluster: ['GONE CLUSTER'] });
});
t('condos, non-strata landed homes and reviewed exclude/hold names are never listed', () => {
  const ex = pc.exclude[0] ? pc.exclude[0].name : null, ho = pc.hold[0] ? pc.hold[0].name : null;
  const rows = [tx('A CONDO', { propertyType: 'Condominium' }), tx('LANDED ST', { propertyType: 'Terrace', typeOfArea: 'Land' }), tx('NOT STRATA EC', { typeOfArea: 'Land' })];
  if (ex) rows.push(tx(ex)); if (ho) rows.push(tx(ho));
  assert.deepStrictEqual(C.notCovered(rows, cfg, pc, []), { ec: [], cluster: [] });
});
t('a name repaired by nameFixes is matched on its repaired name (no phantom entry for a corrupted spelling)', () => {
  const fixes = Object.entries(pc.nameFixes || {}).filter(([k]) => k !== '_note'); if (!fixes.length) return;
  const [bad, good] = fixes[0]; assert.deepStrictEqual(C.notCovered([tx(bad)], cfg, pc, [good]), { ec: [], cluster: [] });
});
t('the list is sorted and has no duplicates', () => {
  const r = C.notCovered(['B', 'A', 'B', 'C'].map((n) => tx(n)), cfg, pc, []); assert.deepStrictEqual(r.ec, ['A', 'B', 'C']);
});

console.log('Writers (synthetic)');
t('applyNotCovered replaces only the list, keeps the rest of the page, and is repeatable', () => {
  const html = '<head><script>window.GW_NOT_COVERED = {"ec":["OLD"],"cluster":[]};</script><p>x</p>', a = C.applyNotCovered(html, { ec: [], cluster: ['KEW LODGE'] });
  assert.ok(a.includes('{"ec":[],"cluster":["KEW LODGE"]};</script><p>x</p>')); assert.strictEqual(C.applyNotCovered(a, { ec: [], cluster: ['KEW LODGE'] }), a);
  assert.throws(() => C.applyNotCovered('<html></html>', { ec: [], cluster: [] }), /no window\.GW_NOT_COVERED/);
});
t('applyMeta sets only the different-class wording and is repeatable', () => {
  const m = { v: 1, policy: { support: { minResaleTransactions: 30, unsupportedReasons: { 'same-project': 's', 'different-class': 'old' } } }, other: [1] }, a = C.applyMeta(JSON.stringify(m, null, 1) + '\n'), o = JSON.parse(a);
  assert.strictEqual(o.policy.support.unsupportedReasons['different-class'], C.DIFFERENT_CLASS_REASON); assert.strictEqual(o.policy.support.unsupportedReasons['same-project'], 's'); assert.deepStrictEqual(o.other, [1]); assert.strictEqual(C.applyMeta(a), a);
});

console.log('Shipped files follow the register');
const ix = J('data/projects/index.json'), F = {}; ix.fields.forEach((f, i) => { F[f] = i; });
t('every register development has a registry row carrying its class, and the registry is up to date with the register', () => {
  const reg = J('data/registry/index.json'), res = RC.update(ix, reg); assert.strictEqual(JSON.stringify(res.doc), JSON.stringify(reg), 'run build-registry-classes.js');
  const ri = reg.fields.indexOf('id'), rc = reg.fields.indexOf('cls'), byId = new Map(reg.rows.map((r) => [r[ri], r]));
  ix.rows.forEach((r) => { const g = byId.get(r[F.id]); assert.ok(g, 'registry row for ' + r[F.id]); assert.strictEqual(g[rc] || 'condo', r[F.cls] || 'condo', r[F.id]); });
});
t('registry meta.json carries the shared different-class wording', () => assert.strictEqual(J('data/registry/meta.json').policy.support.unsupportedReasons['different-class'], C.DIFFERENT_CLASS_REASON));
t('the Research page not-covered list holds no name that is in the register, and every name is an EC or cluster development', () => {
  const html = fs.readFileSync(path.join(root, 'research/index.html'), 'utf8'), m = html.match(C.NOT_COVERED_RE); assert.ok(m, 'GW_NOT_COVERED line'); const L = JSON.parse(m[1]);
  const names = new Set(ix.rows.map((r) => r[F.name])); L.ec.concat(L.cluster).forEach((n) => assert.ok(!names.has(n), n + ' is in the register but listed as not covered'));
  assert.deepStrictEqual(Object.keys(L).sort(), ['cluster', 'ec']);
});
t('the Map, FIND and suggestions cover the register: same developments, same classes', () => {
  const pl = J('data/map/places.json'), cl = pl.fields.indexOf('cls'), pid = new Map(pl.rows.map((r) => [r[0], r[cl] || 'condo']));
  assert.strictEqual(pl.rows.length, ix.rows.length); ix.rows.forEach((r) => assert.strictEqual(pid.get(r[F.id]), r[F.cls] || 'condo', r[F.id]));
  const fd = J('data/projects/find.json'), reg = new Map(ix.rows.map((r) => [r[F.id], r[F.cls] || 'condo'])); fd.projects.forEach((p) => assert.strictEqual(p.c || 'condo', reg.get(p.id), p.id));
  const sg = J('data/research/suggest.json'); Object.entries(sg.p).forEach(([id, list]) => list.forEach((x) => assert.strictEqual(reg.get(x[0]), reg.get(id), id + ' -> ' + x[0])));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
