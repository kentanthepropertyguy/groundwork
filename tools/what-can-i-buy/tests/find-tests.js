// node tools/what-can-i-buy/tests/find-tests.js   FIND V1 rules, ranking, fallbacks, wording, privacy, links, and the shipped data.
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '../../..');
const F = require(path.join(root, 'assets/js/kpt-find.js'));
const T = F.T;
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

// ---- synthetic index. latest month = 2026-09. rows: [bin,n,act,last,q1,med,q3]
const P = (id, name, street, d, tg, sale, rows) => ({ id, name, street, d, seg: 'OCR', tg, tl: tg === 4 ? 'Freehold' : '99 yrs from 2015', m: 0, new: sale === 'new' ? rows : [], resale: sale === 'resale' ? rows : [] });
const mk = (ps) => F.prepare({ v: 1, kind: 'kpt-find-index', latestMonth: '2026-09', window: { from: '2025-10', to: '2026-09', label: '2025-10 to 2026-09' }, bin: 100, minCell: 3, projects: ps });
const row = (bin, n, act, last, q1, q3) => [bin, n, act, last, q1, Math.round((q1 + q3) / 2), q3];
const SZ = { lo: 900, hi: 1100, source: 'explicit', line: 'x' };
const run = (ix, o) => F.shortlist(ix, Object.assign({ budget: 1800000, openTo: 'resale', size: SZ, districts: [], text: '', freehold: false, answers: { where: 'flexible', size: 'not-sure', priorities: [] }, typical: null }, o));
const ids = (r) => r.groups.reduce((a, g) => a.concat(g.cards.map((c) => c.id)), []);
const R1 = (id, n, extra) => P(id, id.toUpperCase(), 'ST ' + id, '15', 4, 'resale', [row(1000, n, 3, 202609, 1700000, 1900000)]);

console.log('Eligibility rules');
t('sale counts: 2 excluded, 3 Limited, 5 Good', () => {
  const r = run(mk([R1('a', 2), R1('b', 3), R1('c', 4), R1('d', 5)]));
  assert.deepStrictEqual(ids(r).sort(), ['b', 'c', 'd']); const s = {}; r.groups[0].cards.forEach((c) => { s[c.id] = c.strength; });
  assert.strictEqual(s.b, 'limited'); assert.strictEqual(s.c, 'limited'); assert.strictEqual(s.d, 'good');
});
t('sales are summed across matching rows (2+1 qualifies; one row of 2 does not)', () => {
  const p = P('x', 'X', 'S', '15', 4, 'resale', [row(900, 3, 3, 202609, 1700000, 1900000), row(1000, 3, 2, 202609, 1700000, 1900000)]);
  assert.deepStrictEqual(ids(run(mk([p]))), ['x']);
});
t('budget window edges: ±10% inclusive overlap, just outside excluded', () => {
  const mkq = (q1, q3) => P('e', 'E', 'S', '15', 4, 'resale', [row(1000, 5, 3, 202609, q1, q3)]);
  assert.strictEqual(ids(run(mk([mkq(1980000, 2100000)]))).length, 1);   // q1 = B*1.10
  assert.strictEqual(ids(run(mk([mkq(1980001, 2100000)]))).length, 0);
  assert.strictEqual(ids(run(mk([mkq(1500000, 1620000)]))).length, 1);   // q3 = B*0.90
  assert.strictEqual(ids(run(mk([mkq(1500000, 1619999)]))).length, 0);
});
t('size window uses the band midpoint, lower inclusive, upper exclusive', () => {
  const at = (bin) => P('s', 'S', 'S', '15', 4, 'resale', [row(bin, 5, 3, 202609, 1700000, 1900000)]);
  assert.strictEqual(ids(run(mk([at(850)]))).length, 1);   // midpoint 900
  assert.strictEqual(ids(run(mk([at(800)]))).length, 0);   // midpoint 850
  assert.strictEqual(ids(run(mk([at(1050)]))).length, 0);  // midpoint 1100 is the exclusive edge
  assert.strictEqual(ids(run(mk([at(1000)]))).length, 1);
});
t('recency: latest sale within 6 months of the data (Mar 2026 in, Feb 2026 out)', () => {
  const lt = (l) => P('r', 'R', 'S', '15', 4, 'resale', [row(1000, 5, 3, l, 1700000, 1900000)]);
  assert.strictEqual(ids(run(mk([lt(202603)]))).length, 1); assert.strictEqual(ids(run(mk([lt(202602)]))).length, 0);
});
t('active months: at least one matching row needs 2 or more', () => {
  const one = P('m', 'M', 'S', '15', 4, 'resale', [row(1000, 5, 1, 202609, 1700000, 1900000)]);
  assert.strictEqual(ids(run(mk([one]))).length, 0);
  const two = P('m', 'M', 'S', '15', 4, 'resale', [row(900, 3, 1, 202609, 1700000, 1900000), row(1000, 3, 2, 202609, 1700000, 1900000)]);
  assert.strictEqual(ids(run(mk([two]))).length, 1);
});
t('a non-matching row does not contribute sales or active months', () => {
  const p = P('n', 'N', 'S', '15', 4, 'resale', [row(1000, 2, 2, 202609, 1700000, 1900000), row(1000 + 100, 9, 5, 202609, 1700000, 1900000)]);
  assert.strictEqual(ids(run(mk([p]))).length, 0);
});
t('sale types are never mixed: resale buyer sees no new-sale rows', () => {
  const p = P('w', 'W', 'S', '15', 4, 'new', [row(1000, 9, 3, 202609, 1700000, 1900000)]);
  assert.strictEqual(ids(run(mk([p]), { openTo: 'resale' })).length, 0); assert.strictEqual(ids(run(mk([p]), { openTo: 'new' })).length, 1);
});

console.log('Ranking and caps');
t('order: strength, fit (inside, above, below), sales, recency, name', () => {
  const mkp = (id, n, q1, q3, last) => P(id, id.toUpperCase(), 'ST ' + id, '15', 4, 'resale', [row(1000, n, 3, last, q1, q3)]);
  const r = run(mk([mkp('lim', 4, 1700000, 1900000, 202609), mkp('below', 9, 1900000, 2200000, 202609), mkp('above', 9, 1500000, 1700000, 202609), mkp('inM', 6, 1700000, 1900000, 202607), mkp('inN', 6, 1700000, 1900000, 202609), mkp('inA', 6, 1700000, 1900000, 202609)]));
  assert.deepStrictEqual(ids(r), ['ina', 'inn', 'inm', 'above', 'below'].map((x) => x === 'ina' ? 'inA' : x === 'inn' ? 'inN' : x === 'inm' ? 'inM' : x));
});
t('ranking is deterministic (reversed input gives the same list)', () => {
  const ps = ['a', 'b', 'c', 'd', 'e', 'f'].map((x, i) => R1(x, 5 + (i % 2)));
  assert.deepStrictEqual(ids(run(mk(ps))), ids(run(mk(ps.slice().reverse()))));
});
t('at most 2 per street, and at most 5 shown', () => {
  const ps = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x) => Object.assign(R1(x, 6), { street: 'SAME ROAD' }));
  assert.strictEqual(ids(run(mk(ps))).length, 2);
  const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x) => R1(x, 6)); const r = run(mk(many)); assert.strictEqual(r.shown, 5); assert.strictEqual(r.total, 7);
});
t('both: 3 resale + 2 new; gaps are filled from the other group', () => {
  const rs = ['r1', 'r2', 'r3', 'r4'].map((x) => R1(x, 6)), ns = ['n1', 'n2', 'n3'].map((x) => P(x, x.toUpperCase(), 'NS ' + x, '15', 4, 'new', [row(1000, 6, 3, 202609, 1700000, 1900000)]));
  let r = run(mk(rs.concat(ns)), { openTo: 'both' }); assert.deepStrictEqual(r.groups.map((g) => g.sale + g.cards.length), ['resale3', 'new2']);
  r = run(mk(rs.slice(0, 1).concat(ns)), { openTo: 'both' }); assert.deepStrictEqual(r.groups.map((g) => g.sale + g.cards.length), ['resale1', 'new3']);
  r = run(mk(rs.concat(ns.slice(0, 1))), { openTo: 'both' }); assert.deepStrictEqual(r.groups.map((g) => g.sale + g.cards.length), ['resale4', 'new1']);
});

console.log('Filters');
t('district filter applies; freehold filter keeps tenure group 4 only', () => {
  const a = Object.assign(R1('a', 6), { d: '20' }), b = Object.assign(R1('b', 6), { d: '15' }), c = Object.assign(R1('c', 6), { tg: 1, tl: '99 yrs' });
  const ix = mk([a, b, c]);
  assert.deepStrictEqual(ids(run(ix, { districts: ['20'] })), ['a']);
  assert.deepStrictEqual(ids(run(ix, { freehold: true })).sort(), ['a', 'b']); assert.strictEqual(ids(run(ix, {})).length, 3);
});
t('typed text suggests districts, matches whole words, and is never applied silently', () => {
  assert.ok(F.matchDistricts('Thomson').length > 0); assert.deepStrictEqual(F.matchDistricts('xyzzy'), []);
  const a = Object.assign(R1('a', 6), { d: '20' }); const ix = mk([a, R1('b', 6)]);
  assert.strictEqual(F.matchDistricts('Thom').length, 0);   // whole words only
  assert.strictEqual(run(ix, { text: '' }).total, 2);
});
t('district table is exactly D01–D28', () => {
  assert.deepStrictEqual(Object.keys(F.DISTRICT_AREAS).sort(), Array.from({ length: 28 }, (_, i) => String(i + 1).padStart(2, '0')));
});

console.log('Size');
t('explicit size wins; otherwise inferred and disclosed; bedrooms never convert', () => {
  const step = { private: { routes: { 'OCR|Resale|10–25': { n: [40, 9, 1, 1800000, 1, 1013, 1187] } }, total: { n: [50, 1, 1, 1, 1, 900, 1300] } } };
  const e = F.sizeWindow({ from: 800, to: 1000 }, step, 'resale'); assert.strictEqual(e.source, 'explicit'); assert.deepStrictEqual([e.lo, e.hi], [800, 1000]);
  const i = F.sizeWindow(null, step, 'resale'); assert.strictEqual(i.source, 'inferred'); assert.ok(/don’t convert bedrooms/.test(i.line)); assert.deepStrictEqual([i.lo, i.hi], [1010, 1190]);
  assert.strictEqual(F.sizeWindow({ from: 1000, to: 900 }, step, 'resale').source, 'inferred');
  assert.strictEqual(F.sizeWindow(null, null, 'resale'), null);
});
t('a bedroom answer changes nothing in the list; it is only disclosed', () => {
  const ix = mk([R1('a', 6), R1('b', 6)]);
  const a = run(ix, { answers: { where: 'flexible', size: '3', priorities: [] } }), b = run(ix, {});
  assert.deepStrictEqual(ids(a), ids(b)); assert.ok(a.unsupported.some((u) => u.id === 'bedrooms'));
});

console.log('Fallbacks');
t('1–2 matches: shown, with counted change options', () => {
  const ps = [R1('a', 6), Object.assign(P('z', 'Z', 'ZS', '15', 4, 'resale', [row(1200, 6, 3, 202609, 1700000, 1900000)]))];
  const r = run(mk(ps), { size: { lo: 1100, hi: 1300, source: 'explicit', line: '' } }); assert.strictEqual(r.state, 'few'); assert.strictEqual(r.total, 1);
  const sz = r.changes.find((c) => c.id === 'size'); assert.ok(!sz || sz.count > 1);
  const r2 = run(mk([R1('a', 6), R1('b', 6), Object.assign(R1('c', 6), { d: '20' })]), { districts: ['20'] }); assert.strictEqual(r2.state, 'few');
  const ar = r2.changes.find((c) => c.id === 'area'); assert.strictEqual(ar.count, 3);
});
t('0 matches: message and nearest working budget in $50k steps up to +50%', () => {
  const ps = ['a', 'b', 'c'].map((x) => P(x, x.toUpperCase(), 'S' + x, '15', 4, 'resale', [row(1000, 6, 3, 202609, 2400000, 2600000)]));
  const r = run(mk(ps), { budget: 2000000 }); assert.strictEqual(r.state, 'none'); assert.strictEqual(r.shown, 0); assert.ok(r.noneText);
  assert.strictEqual(r.reference.budget, 2200000);
  const far = run(mk(ps), { budget: 1000000 }); assert.strictEqual(far.reference, null);
});
t('index failure: prepare() returns null for empty, corrupt or wrong-kind data', () => {
  [null, undefined, {}, { kind: 'x' }, { v: 1, kind: 'kpt-find-index', projects: 'x', latestMonth: '2026-09' }, { v: 2, kind: 'kpt-find-index', projects: [], latestMonth: '2026-09' }].forEach((d) => assert.strictEqual(F.prepare(d), null));
});
t('page: data failure leaves the section absent (renderFind clears findRoot)', () => {
  const html = fs.readFileSync(path.join(root, 'tools/what-can-i-buy/index.html'), 'utf8');
  assert.ok(/if \(!findIx\) \{ root\.innerHTML = ''; return; \}/.test(html)); assert.ok(/\.catch\(\(\) => \(findIx = null\)\)/.test(html));
});

console.log('Unsupported answers');
t('every unsupported answer is listed and appended to every card', () => {
  const ix = mk([R1('a', 6), R1('b', 6)]);
  const r = run(ix, { answers: { where: 'school', size: '2', priorities: ['schools', 'location', 'investment', 'monthly', 'facilities', 'newer', 'space'] } });
  assert.deepStrictEqual(r.unsupported.map((u) => u.id), ['school', 'schools', 'location', 'investment', 'monthly', 'facilities', 'newer', 'space', 'bedrooms']);
  r.groups[0].cards.forEach((c) => { ['school', 'investment', 'monthly', 'facilities'].forEach((w) => assert.ok(c.notEvaluated.toLowerCase().indexOf(w) > -1, w)); });
  ['family', 'work'].forEach((w) => assert.ok(run(ix, { answers: { where: w, size: 'not-sure', priorities: [] } }).unsupported.some((u) => u.id === w)));
  assert.strictEqual(run(ix, {}).unsupported.length, 0);
});

console.log('Wording, links, privacy');
const grid = [];
[600000, 900000, 1300000, 1800000, 2500000, 4000000].forEach((b) => [[500, 700], [900, 1100], [1200, 1600], [2000, 3000]].forEach((s) => ['new', 'resale', 'both'].forEach((o) => [[], ['20'], ['15', '09']].forEach((d) => grid.push([b, s, o, d])))));
const realDoc = fs.existsSync(path.join(root, 'data/projects/find.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'data/projects/find.json'), 'utf8')) : null;
t('shipped find.json prepares', () => { assert.ok(realDoc); assert.ok(F.prepare(realDoc)); });
const ixr = realDoc && F.prepare(realDoc);
const BANNED = /\b(best|recommend(ed|s|ation)?s?|available|affordable|undervalued|bargain|cheap|bedrooms?)\b/i;
t('grid of ' + grid.length + ' inputs never throws; wording is clean', () => {
  grid.forEach((g) => {
    const r = F.shortlist(ixr, { budget: g[0], openTo: g[2], size: { lo: g[1][0], hi: g[1][1], source: 'explicit', line: '' }, districts: g[3], text: '', freehold: false, answers: { where: 'flexible', size: 'not-sure', priorities: [] } });
    assert.ok(['list', 'few', 'none'].indexOf(r.state) > -1); assert.ok(r.shown <= 5);
    const stripNE = r.groups.map((g) => g.cards.map((c) => Object.assign({}, c, { notEvaluated: '' })));
    const txt = JSON.stringify([stripNE, r.fewText, r.noneText, r.reference, r.changes, r.orderLine, r.dataLine]).replace(/not a recommendation[^"]*/gi, '');
    assert.ok(!BANNED.test(txt.replace(/[^"]*doesn’t[^"]*bedroom[^"]*/gi, '')), g.join('|') + ' ' + (txt.match(BANNED) || [])[0]);
    r.groups.forEach((gr) => gr.cards.forEach((c) => { assert.ok(/^\.\.\/\.\.\/research\/index\.html#\/p\/[a-z0-9-]+\/(new|resale)$/.test(c.link), c.link); assert.ok(/^Research .+ →$/.test(c.linkText)); assert.ok(/^Typical prices for these: \$\d\.\d\d?m?/.test(c.prices) || /^Typical prices for these: \$/.test(c.prices)); assert.ok(!/cell|P25|P75|quartile|k ≥/i.test(JSON.stringify(c))); }));
  });
});
t('cards use the Research name format and link carries no size', () => {
  const r = F.shortlist(ixr, { budget: 1800000, openTo: 'resale', size: SZ, districts: [], answers: {} }); const c = r.groups[0].cards[0];
  assert.ok(c.link.indexOf('?') < 0 && c.link.indexOf('sqft') < 0); assert.ok(/^\$\d\.\d\dm–\$\d\.\d\dm/.test(c.prices.replace('Typical prices for these: ', '')));
});
t('methodology holds the technical meaning; “Typical prices” is explained as the middle half', () => {
  const m = F.METHOD.join(' '); assert.ok(/middle half/.test(m)); assert.ok(/not a recommendation/.test(m)); assert.ok(/at least 3/.test(m)); assert.ok(/6 months/.test(m));
});
t('analytics are bucketed: only the five allowed keys, no names, text or exact figures', () => {
  const r = F.shortlist(ixr, { budget: 1834567, openTo: 'both', size: SZ, districts: ['20'], text: 'secret road', answers: {} });
  const a = F.analytics(r, '1.8-2.0m'); assert.deepStrictEqual(Object.keys(a).sort(), F.ANALYTICS_KEYS.slice().sort());
  const s = JSON.stringify(a); assert.ok(!/secret|1834567|1,834/.test(s)); assert.ok(['0', '1-2', '3-4', '5+'].indexOf(a.result_bucket) > -1);
});
t('page tracks only find_shown and find_research_click (project_id only); typed text never reaches analytics or WhatsApp', () => {
  const html = fs.readFileSync(path.join(root, 'tools/what-can-i-buy/index.html'), 'utf8');
  const tr = html.match(/KPT\.track\('find_[a-z_]+'[^)]*\)/g); assert.deepStrictEqual(tr.sort(), ["KPT.track('find_research_click', { project_id: t.dataset.id })", "KPT.track('find_shown', pl)"].sort());
  assert.ok(!/waLink\([^)]*FS\./.test(html));
});
t('displayName parity with Research across every project name', () => {
  const RS = require(path.join(root, 'assets/js/kpt-research.js')); assert.strictEqual(typeof RS.displayName, 'function');
  realDoc.projects.forEach((p) => { assert.strictEqual(F.displayName(p.name), RS.displayName(p.name), p.name); assert.strictEqual(F.displayName(p.street), RS.displayName(p.street), p.street); });
});

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
