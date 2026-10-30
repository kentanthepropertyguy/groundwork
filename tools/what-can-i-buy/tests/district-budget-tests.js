// node tools/what-can-i-buy/tests/district-budget-tests.js   R3c (30 Oct 2026): Budget Search by postal district ("D19" in Where?).
// A district is the developments whose RECORDED district is that one (FIND's district rule): no centre point, no radius. Every other filter still applies,
// a radius place (road, MRT, address…) works as before, and the district definition is the site's one (gw-nav.js), never copied here.
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '../../..');
const F = require(path.join(root, 'assets/js/kpt-find.js')), D = require(path.join(root, 'assets/js/kpt-discover.js'));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const row = (bin, n, act, last, q1, q3) => [bin, n, act, last, q1, Math.round((q1 + q3) / 2), q3];
const P = (id, o) => Object.assign({ id, name: id.toUpperCase(), street: 'ST ' + id, d: '15', seg: 'RCR', tg: 1, tl: '99 yrs from 2015', m: 0, new: [], resale: [] }, o);
const mk = (ps) => F.prepare({ v: 1, kind: 'kpt-find-index', latestMonth: '2026-09', window: { from: '2025-10', to: '2026-09', label: 'x' }, bin: 100, minCell: 3, projects: ps });
const R = (id, d, q1, q3, extra) => P(id, Object.assign({ d, resale: [row(1000, 5, 3, 202609, q1, q3)] }, extra || {}));
const ids = (r) => r.items.map((i) => i.id).sort();

console.log('The engine (kpt-discover.js)');
t('clean(): a district is "01"–"28" only; anything else is no district', () => {
  assert.strictEqual(D.clean({ budget: 2e6, district: '19' }).district, '19');
  ['29', '00', '9', 'D19', '', null, 7].forEach((x) => assert.strictEqual(D.clean({ budget: 2e6, district: x }).district, null, String(x)));
});
const IX = mk([R('a19', '19', 1.5e6, 1.9e6), R('b19', '19', 1.6e6, 1.95e6, { tg: 4, tl: 'Freehold' }), R('c20', '20', 1.5e6, 1.9e6), R('d15', '15', 1.4e6, 1.8e6), R('e19', '19', 2.4e6, 2.9e6)]);
t('District 19: only developments whose recorded district is 19 (no centre point, no radius)', () => {
  const r = D.search(IX, { budget: 2e6, district: '19' }, {});
  assert.deepStrictEqual(ids(r), ['a19', 'b19']); assert.ok(r.items.every((i) => i.district === '19' && i.dist === undefined));
});
t('the budget still applies within the district (e19 is above it)', () => assert.ok(ids(D.search(IX, { budget: 2e6, district: '19' }, {})).indexOf('e19') < 0));
t('every other filter still applies (tenure)', () => assert.deepStrictEqual(ids(D.search(IX, { budget: 2e6, district: '19', tenure: 'free' }, {})), ['b19']));
t('a radius place wins: with near set, the district is ignored (never both)', () => {
  const near = { dist: { c20: 300 }, pos: { a19: 1, b19: 1, c20: 1, d15: 1, e19: 1 }, radius: 1000, label: 'X' };
  assert.strictEqual(D.clean({ budget: 2e6, district: '19', near }).district, null);
  assert.deepStrictEqual(ids(D.search(IX, { budget: 2e6, district: '19', near }, {})), ['c20']);
});
t('alternatives offer "Look across all of Singapore", which drops the district', () => {
  const a = D.alternatives(IX, { budget: 2e6, district: '20' }, {});
  const all = a.find((x) => x.id === 'place'); assert.ok(all && all.count === D.search(IX, { budget: 2e6 }, {}).counts.projects, JSON.stringify(a));
});

console.log('On the real data: District N = all of Singapore narrowed to N, for every filter combination');
{
  const ix = F.prepare(JSON.parse(fs.readFileSync(path.join(root, 'data/projects/find.json'), 'utf8')));
  const combos = [{}, { type: 'condo' }, { type: 'ec' }, { sale: 'resale' }, { tenure: 'free' }, { tenure: 'lease' }, { minSize: 1000 }, { over: true }, { type: 'condo', tenure: 'lease', minSize: 800 }];
  ['01', '09', '15', '19', '23', '28'].forEach((d) => combos.forEach((c) => {
    t(`D${d} ${JSON.stringify(c)}`, () => {
      const rq = Object.assign({ budget: 2500000, sale: 'resale' }, c), all = D.search(ix, rq, {}), one = D.search(ix, Object.assign({ district: d }, rq), {});
      const want = all.items.filter((i) => i.district === d).map((i) => i.id + '|' + i.sale).sort(), got = one.items.map((i) => i.id + '|' + i.sale).sort();
      assert.deepStrictEqual(got, want); assert.ok(one.items.every((i) => i.district === d));
    });
  }));
  t('District 19 resale up to $2.5m is not empty, and smaller than all of Singapore', () => {
    const a = D.search(ix, { budget: 2500000, sale: 'resale' }, {}).counts.projects, b = D.search(ix, { budget: 2500000, sale: 'resale', district: '19' }, {}).counts.projects;
    assert.ok(b > 10 && b < a, b + ' / ' + a);
  });
}

console.log('The page (kpt-discover-ui.js)');
{
  const ui = fs.readFileSync(path.join(root, 'assets/js/kpt-discover-ui.js'), 'utf8');
  t('Where? offers the Map search\'s district result (the site\'s one definition), beside the radius places', () => assert.ok(/PICK_TYPES = NEAR_TYPES\.concat\(\['district'\]\)/.test(ui) && /NM\.places\(t\)\.filter\(\(x\) => PICK_TYPES\.indexOf/.test(ui)));
  t('no copy of the district names or the matching rule here', () => assert.ok(!/'19': 'Hougang/.test(ui) && !/postal\\s\+district/.test(ui) && !/Hougang/.test(fs.readFileSync(path.join(root, 'assets/js/kpt-discover.js'), 'utf8'))));
  t('a district never gets a centre point, distances or a radius; it is sent as req.district', () => {
    assert.ok(/if \(isDist\(n\)\) \{ const pd = NM\.placeData\(\{ t: 'district', n: n\.n \}\); return pd \? \{ key: 'district\|' \+ n\.n, label: pd\.title, sub: 'Postal district', district: pd\.d \} : null; \}/.test(ui));
    assert.ok(/const nearInput = \(\) => \(S\.near && !isDist\(S\.near\)/.test(ui) && /near: nearInput\(\), district: districtInput\(\)/.test(ui));
  });
  t('kept in the saved search (Back/Forward, returning to the form) and restored as a district', () => assert.ok(/near: S\.near \? \{ t: S\.near\.t, n: S\.near\.n, r: S\.near\.r \}/.test(ui) && /if \(near && isDist\(near\) && \/\^\\d\{1,2\}\$\/\.test\(String\(near\.n\)\) && \+near\.n >= 1 && \+near\.n <= 28\)/.test(ui)));
  t('no distance chips, nearest-first sort or radius launches for a district; the Map\'s district view is linked', () => assert.ok(/const radChips = \(\) => \(S\.near && !isDist\(S\.near\)/.test(ui) && /sortNow = \(\) => \(S\.sort && \(S\.sort !== 'near' \|\| nearInput\(\)\)/.test(ui) && /isDist\(S\.near\) \|\| res\.req\.sale === 'resale'\) return ''/.test(ui) && /research\/map\/#pl=district:/.test(ui)));
  t('analytics: still only "a place is chosen" (true/false), never which district', () => {
    const calls = ui.match(/KPT\.track\([^;]*\)/g) || []; assert.ok(calls.length && calls.every((c) => !/district|S\.near\.n|NR\.label/.test(c)), calls.join('\n'));
  });
}
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exitCode = fail ? 1 : 0;
